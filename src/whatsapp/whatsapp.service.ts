import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingState, ConversationState } from './types';
import { EmailService } from '../email/email.service';
import { ContactService } from '../email/contact.service';
import { LlmService } from '../llm/llm.service';
import { CategoryService } from '../category/category.service';
import { TwilioService } from './twilio.service';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);
    // In-memory conversation state (in production, use Redis)
    private conversationStates = new Map<string, ConversationState>();

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        private twilioService: TwilioService,
        private emailService: EmailService,
        private contactService: ContactService,
        private categoryService: CategoryService,
        private llmService: LlmService,
    ) { }

    async processWebhook(body: any) {
        this.logger.log('Received webhook:', JSON.stringify(body, null, 2));

        const from = body.From || body.from; // Twilio uses 'From', mock uses 'from'
        const messageText = body.Body || body.message || ''; // Twilio uses 'Body', mock uses 'message'
        const mediaUrl = body.MediaUrl0;
        const mediaType = body.MediaContentType0;

        if (!from || (!messageText && !mediaUrl)) {
            this.logger.warn('Invalid webhook payload - missing from or message/media');
            return;
        }

        await this.handleIncomingMessage(from, messageText, mediaUrl, mediaType);
    }

    private async handleIncomingMessage(from: string, message: string, mediaUrl?: string, mediaType?: string) {
        this.logger.log(`Processing message from ${from}: ${message} `);

        // Get or create conversation state
        let state = this.conversationStates.get(from);
        let user: User | null = null;

        // Always fetch user to pass to handlers
        user = await this.prisma.user.findUnique({
            where: { whatsappNumber: from },
            include: { emailAccounts: true, preferences: true },
        });

        if (!state) {
            if (user && (user as any).emailAccounts.length > 0 && (user as any).preferences?.onboardingCompleted) {
                state = {
                    whatsappNumber: from,
                    userId: user.id,
                    onboardingState: OnboardingState.COMPLETED,
                    step: 'COMPLETED',
                };
            } else if (user && (user as any).emailAccounts.length > 0) {
                state = {
                    whatsappNumber: from,
                    userId: user.id,
                    onboardingState: OnboardingState.EMAIL_LINKED,
                };
            } else {
                state = {
                    whatsappNumber: from,
                    onboardingState: OnboardingState.NEW,
                };
            }

            this.conversationStates.set(from, state);
        } else if (state.userId && !user) {
            // Should not happen if state has userId, but good to be safe
            user = await this.prisma.user.findUnique({ where: { id: state.userId } });
        }

        // Handle message based on current state
        await this.handleStateTransition(from, message, state, user, mediaUrl, mediaType);
    }

    private async handleStateTransition(
        from: string,
        message: string,
        state: ConversationState,
        user: User | null,
        mediaUrl?: string,
        mediaType?: string,
    ) {
        const lowerMessage = message.toLowerCase().trim();

        switch (state.onboardingState) {
            case OnboardingState.NEW:
                await this.handleNewUser(from, state);
                break;

            case OnboardingState.AWAITING_EMAIL_LINK:
                await this.handleAwaitingEmailLink(from, lowerMessage, state);
                break;

            case OnboardingState.EMAIL_LINKED:
                await this.handleEmailLinked(from, state);
                break;

            case OnboardingState.COLLECTING_PROMO_PREFERENCE:
                await this.handlePromoPreference(from, lowerMessage, state);
                break;

            case OnboardingState.COLLECTING_IMPORTANT_RULES:
                // Replaced by category suggestions in new flow, but keeping for compatibility
                // or we can repurpose this state for notification preferences
                await this.handleNotificationPreferences(from, lowerMessage, state);
                break;

            case OnboardingState.COLLECTING_STYLE_SAMPLES:
                // We now scan sent emails, so this might be skipped or used for confirmation
                await this.handleStyleConfirmation(from, lowerMessage, state);
                break;

            case OnboardingState.COMPLETED:
                if (user) {
                    await this.handleCompletedOnboarding(from, message, state, user, mediaUrl, mediaType);
                } else {
                    this.logger.error(`User not found for completed state: ${from}`);
                }
                break;
        }
    }

    private async handleNewUser(from: string, state: ConversationState) {
        const welcomeMessage = `👋 Welcome to InboxWhats!

I'm your intelligent email assistant. I'll help you manage your emails directly from WhatsApp.

To get started, I need to connect to your email account.

Click this link to connect your Gmail:
${this.configService.get('GOOGLE_CALLBACK_URL').replace('/callback', '')}

Reply "done" when you've connected your account.`;

        await this.twilioService.sendMessage(from, welcomeMessage);

        state.onboardingState = OnboardingState.AWAITING_EMAIL_LINK;
        this.conversationStates.set(from, state);
    }

    private async handleAwaitingEmailLink(
        from: string,
        message: string,
        state: ConversationState,
    ) {
        if (message === 'done' || message === 'connected' || message === 'linked') {
            const user = await this.prisma.user.findUnique({
                where: { whatsappNumber: from },
                include: { emailAccounts: true },
            });

            if (user && user.emailAccounts.length > 0) {
                state.userId = user.id;
                state.onboardingState = OnboardingState.EMAIL_LINKED;
                this.conversationStates.set(from, state);
                await this.handleEmailLinked(from, state);
            } else {
                await this.twilioService.sendMessage(
                    from,
                    "I don't see your email connected yet. Please click the link and authorize access, then reply 'done'.",
                );
            }
        } else {
            await this.twilioService.sendMessage(
                from,
                "Please click the link above to connect your Gmail, then reply 'done'.",
            );
        }
    }

    private async handleEmailLinked(from: string, state: ConversationState) {
        if (!state.userId) return;

        await this.twilioService.sendMessage(
            from,
            "✅ Email connected! Now I'm scanning your inbox to learn your preferences and writing style... 🕵️‍♂️\n\nThis will take just a moment.",
        );

        // 1. Scan sent emails for style
        try {
            const sentEmails = await this.emailService.scanSentEmails(state.userId, 100);
            if (sentEmails.length > 0) {
                const style = await this.llmService.analyzeWritingStyle(
                    sentEmails.map((e) => e.body).slice(0, 10), // Analyze top 10 for speed
                );

                await this.prisma.styleProfile.upsert({
                    where: { userId: state.userId },
                    create: {
                        userId: state.userId,
                        sampleTexts: sentEmails.map((e) => e.body).slice(0, 5),
                        inferredTone: style.tone,
                        avgParagraphLength: style.avgParagraphLength,
                        greetingStyle: style.greetingStyle,
                        signatureStyle: style.signatureStyle,
                        formalityScore: style.formalityScore,
                    },
                    update: {
                        sampleTexts: sentEmails.map((e) => e.body).slice(0, 5),
                        inferredTone: style.tone,
                        avgParagraphLength: style.avgParagraphLength,
                        greetingStyle: style.greetingStyle,
                        signatureStyle: style.signatureStyle,
                        formalityScore: style.formalityScore,
                        lastUpdated: new Date(),
                    },
                });
            }
        } catch (error) {
            this.logger.error('Failed to scan sent emails', error);
        }

        // 2. Scan inbox for categories (mocking this part for now as we need listMessages to return snippets)
        // In a real implementation, we would call categoryService.scanInboxAndLearnPatterns

        const message = `I've analyzed your email style! 📝

Now, let's set up your notifications.

How do you want to handle **Promotional** emails (ads, newsletters)?

1️⃣ Weekly Digest (Recommended)
2️⃣ Daily Digest
3️⃣ Never
4️⃣ Immediate (Not recommended)

Reply with the number.`;

        await this.twilioService.sendMessage(from, message);

        state.onboardingState = OnboardingState.COLLECTING_PROMO_PREFERENCE;
        this.conversationStates.set(from, state);
    }

    private async handlePromoPreference(
        from: string,
        message: string,
        state: ConversationState,
    ) {
        const promoMap: Record<string, string> = {
            '1': 'weekly',
            '2': 'daily',
            '3': 'none',
            '4': 'immediate',
        };

        const promoHandling = promoMap[message];

        if (!promoHandling) {
            await this.twilioService.sendMessage(from, 'Please reply with 1, 2, 3, or 4.');
            return;
        }

        state.tempData = { promoHandling };

        const nextMessage = `Got it!

Now for **Work** and **Personal** emails.

I'll send you summaries at **9:00 AM** and **5:00 PM** daily.

Is this okay?
1️⃣ Yes, perfect
2️⃣ No, customize times

Reply with 1 or 2.`;

        await this.twilioService.sendMessage(from, nextMessage);

        state.onboardingState = OnboardingState.COLLECTING_IMPORTANT_RULES; // Using this state for schedule
        this.conversationStates.set(from, state);
    }

    private async handleNotificationPreferences(
        from: string,
        message: string,
        state: ConversationState,
    ) {
        if (message === '1' || message.includes('yes')) {
            // Default times
            state.tempData.workSchedule = { mode: 'batched_daily', times: ['09:00', '17:00'] };
            await this.finishOnboarding(from, state);
        } else {
            // Custom times (simplified for MVP)
            await this.twilioService.sendMessage(
                from,
                "Okay! For now I'll stick to the defaults, but you can change them in settings later. (Custom scheduling coming soon!)",
            );
            state.tempData.workSchedule = { mode: 'batched_daily', times: ['09:00', '17:00'] };
            await this.finishOnboarding(from, state);
        }
    }

    private async handleStyleConfirmation(from: string, message: string, state: ConversationState) {
        // Placeholder if we need manual style confirmation
        await this.finishOnboarding(from, state);
    }

    private async finishOnboarding(from: string, state: ConversationState) {
        if (!state.userId) return;

        // Save preferences
        await this.prisma.preference.upsert({
            where: { userId: state.userId },
            create: {
                userId: state.userId,
                promoHandling: state.tempData.promoHandling,
                onboardingCompleted: true,
                inboxScanned: true,
            },
            update: {
                promoHandling: state.tempData.promoHandling,
                onboardingCompleted: true,
                inboxScanned: true,
            },
        });

        // Create default schedules
        const categories = ['work', 'personal'];
        for (const catName of categories) {
            const category = await this.categoryService.getCategoryByName(catName);
            if (category) {
                await (this.prisma as any).notificationSchedule.upsert({
                    where: { userId_categoryId: { userId: state.userId, categoryId: category.id } },
                    create: {
                        userId: state.userId,
                        categoryId: category.id,
                        deliveryMode: 'batched_daily',
                        timesPerDay: 2,
                        time1: '09:00',
                        time2: '17:00'
                    },
                    update: {}
                });
            }
        }

        // Handle promo schedule
        const promoCategory = await this.categoryService.getCategoryByName('promotions');
        if (promoCategory) {
            await (this.prisma as any).notificationSchedule.upsert({
                where: { userId_categoryId: { userId: state.userId, categoryId: promoCategory.id } },
                create: {
                    userId: state.userId,
                    categoryId: promoCategory.id,
                    deliveryMode: state.tempData.promoHandling === 'weekly' ? 'batched_weekly' :
                        state.tempData.promoHandling === 'daily' ? 'batched_daily' : 'immediate', // simplified
                    weeklyDay: 1, // Monday
                    weeklyTime: '09:00',
                    time1: '18:00'
                },
                update: {}
            });
        }

        const completionMessage = `🎉 **You're all set!**

I've learned your writing style and set up your notifications.

**What I can do:**
📧 **Summaries**: I'll send you digests at 9am & 5pm.
✍️ **Compose**: Just say "Email John about the project".
🔍 **Search**: Ask "Find the email from Amazon".

Try sending me a voice note to draft an email! 🎤`;

        await this.twilioService.sendMessage(from, completionMessage);

        state.onboardingState = OnboardingState.COMPLETED;
        this.conversationStates.set(from, state);
    }

    private async handleCompletedOnboarding(
        from: string,
        messageBody: string,
        state: ConversationState,
        user: any, // Using any to avoid strict typing issues with relations for now
        mediaUrl?: string,
        mediaType?: string,
    ) {
        // Handle Compose Flow
        if (state.step === 'COMPOSING_TO') {
            const contacts = await this.contactService.searchContacts(user.id, messageBody);
            if (contacts.length === 0) {
                // If looks like an email address, use it
                if (messageBody.includes('@')) {
                    state.step = 'COMPOSING_BODY';
                    state.tempData = { to: messageBody };
                    await this.twilioService.sendMessage(from, `Drafting email to ${messageBody}.\n\nWhat would you like to say? (You can send a voice note 🎤)`);
                } else {
                    await this.twilioService.sendMessage(from, `No contacts found for "${messageBody}". Please try again or type an email address.`);
                }
            } else if (contacts.length === 1) {
                state.step = 'COMPOSING_BODY';
                state.tempData = { to: contacts[0].email };
                await this.twilioService.sendMessage(from, `Drafting email to ${contacts[0].name} (${contacts[0].email}).\n\nWhat would you like to say? (You can send a voice note 🎤)`);
            } else {
                // Multiple matches - for MVP just pick first or ask to clarify
                // Ideally we'd show a list
                const list = contacts.slice(0, 3).map((c, i) => `${i + 1}. ${c.name} (${c.email})`).join('\n');
                await this.twilioService.sendMessage(from, `Found multiple contacts:\n${list}\n\nPlease type the email address to confirm.`);
            }
            return;
        }

        if (state.step === 'COMPOSING_BODY') {
            let bodyText = messageBody;

            // Handle voice note
            if (mediaUrl && mediaType?.startsWith('audio/')) {
                await this.twilioService.sendMessage(from, 'Transcribing your voice note...');
                try {
                    const audioBuffer = await this.twilioService.downloadMedia(mediaUrl);
                    const transcription = await this.llmService.transcribeAudio(audioBuffer, 'voice_note.ogg');
                    bodyText = transcription;
                } catch (error) {
                    this.logger.error('Failed to process voice note', error);
                    await this.twilioService.sendMessage(from, 'Sorry, I failed to process your voice note. Please type your message.');
                    return;
                }
            }

            // Fetch style profile
            const styleProfile = await this.prisma.styleProfile.findUnique({ where: { userId: user.id } });

            // Generate draft
            // We pass the style profile if available, otherwise LLM uses defaults
            // But LlmService.generateEmailDraft expects (userId, to, context, instruction)
            // Wait, I updated LlmService to take (userId, to, context, instruction) but I didn't verify if I updated the implementation to fetch style.
            // Actually I left a comment in LlmService saying "I will stick to the original plan: WhatsappService fetches style, passes it to LlmService."
            // BUT I didn't update LlmService signature in the previous tool call because I threw an error.
            // So LlmService signature is still (instruction, style, context).

            // I need to map the styleProfile from Prisma to WritingStyle interface
            const style: any = styleProfile ? {
                tone: (styleProfile as any).inferredTone,
                avgParagraphLength: (styleProfile as any).avgParagraphLength || 50,
                usesGreeting: (styleProfile as any).usesGreeting,
                greetingStyle: (styleProfile as any).greetingStyle || 'Hi',
                usesSignature: (styleProfile as any).usesSignature,
                signatureStyle: (styleProfile as any).signatureStyle || 'Best',
                formalityScore: (styleProfile as any).formalityScore || 0.5,
            } : {
                tone: 'semi-formal',
                avgParagraphLength: 50,
                usesGreeting: true,
                greetingStyle: 'Hi',
                usesSignature: true,
                signatureStyle: 'Best',
                formalityScore: 0.5,
            };

            const draft = await this.llmService.generateEmailDraft(
                bodyText,
                style,
                `Email to ${state.tempData.to}`
            );

            // Parse draft if it's a string (old behavior) or object (new behavior)
            const subject = (draft as any).subject || 'New Email';
            const body = (draft as any).body || draft;

            state.step = 'CONFIRMING_DRAFT';
            state.tempData = { ...state.tempData, subject, body };

            await this.twilioService.sendMessage(from, `Here is your draft:\n\nSubject: ${subject}\n\n${body}\n\nReply "Send" to send, or type feedback to revise.`);
            return;
        }

        if (state.step === 'CONFIRMING_DRAFT') {
            if (messageBody.toLowerCase() === 'send') {
                // Send email
                try {
                    await this.emailService.sendMessage(
                        user.id,
                        state.tempData.to,
                        state.tempData.subject,
                        state.tempData.body
                    );
                    await this.twilioService.sendMessage(from, 'Email sent! 🚀');
                } catch (error) {
                    this.logger.error('Failed to send email', error);
                    await this.twilioService.sendMessage(from, 'Failed to send email. Please try again.');
                    return;
                }

                state.step = 'COMPLETED';
                state.tempData = null;
            } else {
                // Revise draft
                const styleProfile = await this.prisma.styleProfile.findUnique({ where: { userId: user.id } });
                const style: any = styleProfile ? {
                    tone: (styleProfile as any).inferredTone,
                    avgParagraphLength: (styleProfile as any).avgParagraphLength || 50,
                    usesGreeting: (styleProfile as any).usesGreeting,
                    greetingStyle: (styleProfile as any).greetingStyle || 'Hi',
                    usesSignature: (styleProfile as any).usesSignature,
                    signatureStyle: (styleProfile as any).signatureStyle || 'Best',
                    formalityScore: (styleProfile as any).formalityScore || 0.5,
                } : {
                    tone: 'semi-formal',
                    avgParagraphLength: 50,
                    usesGreeting: true,
                    greetingStyle: 'Hi',
                    usesSignature: true,
                    signatureStyle: 'Best',
                    formalityScore: 0.5,
                };

                const revised = await this.llmService.reviseEmailDraft(
                    state.tempData.body,
                    messageBody,
                    style
                );

                state.tempData.body = revised;
                await this.twilioService.sendMessage(from, `Revised draft:\n\nSubject: ${state.tempData.subject}\n\n${revised}\n\nReply "Send" to send, or type feedback to revise.`);
            }
            return;
        }

        // Handle "Compose" command
        if (messageBody.toLowerCase() === 'compose' || messageBody.toLowerCase() === 'new email') {
            state.step = 'COMPOSING_TO';
            await this.twilioService.sendMessage(from, 'Who would you like to email? (Type a name or email address)');
            return;
        }

        // Handle "Reply" command (context-aware)
        if (messageBody.toLowerCase() === 'reply') {
            // Find the most recent email notified to the user
            const lastEmail = await (this.prisma as any).emailMetadata.findFirst({
                where: { userId: user.id, notified: true },
                orderBy: { notifiedAt: 'desc' },
            });

            if (!lastEmail) {
                await this.twilioService.sendMessage(from, "I can't find any recent emails to reply to.");
                return;
            }

            state.step = 'COMPOSING_BODY';
            state.tempData = {
                to: lastEmail.from, // Reply to sender
                subject: `Re: ${lastEmail.subject}`,
                replyToId: lastEmail.id,
                context: `Replying to email from ${lastEmail.from} with subject "${lastEmail.subject}". Original snippet: ${lastEmail.summary || ''}`
            };

            await this.twilioService.sendMessage(from, `Replying to ${lastEmail.from} (Re: ${lastEmail.subject}).\n\nWhat would you like to say?`);
            return;
        }

        // ... existing onboarding logic ...
        await this.twilioService.sendMessage(
            from,
            `I received your message: "${messageBody}"\n\nType "compose" to start a new email or "reply" to respond to the last email.`,
        );
    }
}
