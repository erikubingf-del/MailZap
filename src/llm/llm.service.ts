import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface EmailClassification {
    category: 'banks' | 'apps' | 'promotions' | 'work' | 'personal';
    confidence: number;
    isUrgent: boolean;
    summary: string;
    reasoning?: string;
}

export interface WritingStyle {
    tone: 'formal' | 'semi-formal' | 'casual';
    avgParagraphLength: number;
    usesGreeting: boolean;
    greetingStyle: string;
    usesSignature: boolean;
    signatureStyle: string;
    formalityScore: number;
}

@Injectable()
export class LlmService {
    private readonly logger = new Logger(LlmService.name);
    private openai: OpenAI;
    private fromNumber: string; // Added fromNumber property

    constructor(private configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('OPENAI_API_KEY'),
        });
        this.fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER') || ''; // Initialized fromNumber
    }

    /**
     * Classify an email into one of the 5 categories
     */
    async classifyEmail(
        from: string,
        subject: string,
        snippet: string,
    ): Promise<EmailClassification> {
        try {
            const prompt = `You are an email classification assistant. Classify this email into ONE of these categories:

Categories:
- banks: Bills, expenses, promotional offers from financial institutions
- apps: Purchase confirmations, crypto transfers, app notifications
- promotions: Campaign ads, time-sensitive deals (Black Friday, flash sales)
- work: Professional correspondence, work-related emails
- personal: Passport renewals, legal matters, hotel/flight confirmations, personal appointments

Email details:
From: ${from}
Subject: ${subject}
Preview: ${snippet}

Respond in JSON format:
{
  "category": "one of: banks|apps|promotions|work|personal",
  "confidence": 0.0-1.0,
  "isUrgent": true/false,
  "summary": "one-line summary of the email",
  "reasoning": "brief explanation of why this category"
}`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                temperature: 0.3,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No content in response');
            const result = JSON.parse(content);
            this.logger.log(`Classified email from ${from}: ${result.category}`);
            return result;
        } catch (error) {
            this.logger.error('Failed to classify email:', error);
            // Fallback to promotions if classification fails
            return {
                category: 'promotions',
                confidence: 0.5,
                isUrgent: false,
                summary: subject,
            };
        }
    }

    /**
     * Analyze writing style from sample texts
     */
    async analyzeWritingStyle(samples: string[]): Promise<WritingStyle> {
        try {
            const prompt = `Analyze the writing style from these email/message samples:

${samples.map((s, i) => `Sample ${i + 1}:\n${s}\n`).join('\n')}

Respond in JSON format:
{
  "tone": "formal|semi-formal|casual",
  "avgParagraphLength": number (average words per paragraph),
  "usesGreeting": true/false,
  "greetingStyle": "Hi|Hello|Dear|Hey|etc" (most common),
  "usesSignature": true/false,
  "signatureStyle": "Best|Regards|Cheers|Thanks|etc" (most common),
  "formalityScore": 0.0-1.0 (0=very casual, 1=very formal)
}`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                temperature: 0.3,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No content in response');
            const result = JSON.parse(content);
            this.logger.log(`Analyzed writing style: ${result.tone}`);
            return result;
        } catch (error) {
            this.logger.error('Failed to analyze writing style:', error);
            // Return defaults
            return {
                tone: 'semi-formal',
                avgParagraphLength: 50,
                usesGreeting: true,
                greetingStyle: 'Hi',
                usesSignature: true,
                signatureStyle: 'Best',
                formalityScore: 0.6,
            };
        }
    }

    /**
     * Generate an email draft in the user's style
     */
    async generateEmailDraft(
        instruction: string,
        style: WritingStyle,
        context?: string,
    ): Promise<{ subject: string; body: string }> {
        try {
            const styleGuide = `
Writing Style:
- Tone: ${style.tone}
- Greeting: ${style.usesGreeting ? style.greetingStyle : 'No greeting'}
- Signature: ${style.usesSignature ? style.signatureStyle : 'No signature'}
- Formality: ${style.formalityScore > 0.7 ? 'Formal' : style.formalityScore > 0.4 ? 'Semi-formal' : 'Casual'}
- Paragraph length: ~${style.avgParagraphLength} words
`;

            const prompt = `You are writing an email for the user. Follow their writing style exactly.

${styleGuide}

${context ? `Context: ${context}\n` : ''}
User instruction: ${instruction}

Respond in JSON format:
{
  "subject": "appropriate subject line",
  "body": "email body only"
}`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                temperature: 0.7,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No content in response');

            const result = JSON.parse(content);
            return {
                subject: result.subject || 'New Email',
                body: result.body || content,
            };
        } catch (error) {
            this.logger.error('Failed to generate email draft:', error);
            throw error;
        }
    }

    /**
     * Revise an email draft based on feedback
     */
    async reviseEmailDraft(
        originalDraft: string,
        feedback: string,
        style: WritingStyle,
    ): Promise<string> {
        try {
            const prompt = `You are revising an email draft based on user feedback.

Original draft:
${originalDraft}

User feedback: ${feedback}

Revise the email incorporating the feedback while maintaining the writing style:
- Tone: ${style.tone}
- Formality: ${style.formalityScore > 0.7 ? 'Formal' : 'Semi-formal'}

Provide only the revised email body.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No content in response');
            return content.trim();
        } catch (error) {
            this.logger.error('Failed to revise email draft:', error);
            throw error;
        }
    }

    /**
     * Generate a digest summary for a list of emails
     */
    async generateDigest(emails: any[]): Promise<string> {
        try {
            if (emails.length === 0) return 'No emails to summarize.';

            const emailSummaries = emails.map(e =>
                `- From: ${e.from}, Subject: ${e.subject}, Summary: ${e.summary || 'No summary'}`
            ).join('\n');

            const prompt = `Create a concise daily digest for the following emails. Group them logically if possible. Use emojis.
            
Emails:
${emailSummaries}

Format:
*Daily Digest 📅*

[Category Name if applicable]
• *Sender*: Summary of the email
...

End with a brief encouraging closing.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
            });

            return response.choices[0]?.message?.content || 'Failed to generate digest.';
        } catch (error) {
            this.logger.error('Failed to generate digest:', error);
            return 'Sorry, I could not generate your digest at this time.';
        }
    }
    /**
     * Transcribe audio to text using Whisper
     */
    async transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
        try {
            const file = new File([audioBuffer as any], filename, { type: 'audio/ogg' });

            const response = await this.openai.audio.transcriptions.create({
                file,
                model: 'whisper-1',
                language: 'pt', // Portuguese
            });

            this.logger.log(`Transcribed audio: ${response.text.substring(0, 50)}...`);
            return response.text;
        } catch (error) {
            this.logger.error('Failed to transcribe audio:', error);
            throw error;
        }
    }

    /**
     * Generate a suggested reply to an email
     */
    async generateReply(
        originalEmail: { from: string; subject: string; body: string },
        style: WritingStyle,
        context?: string,
    ): Promise<string> {
        try {
            const prompt = `Generate a reply to this email in the user's writing style.

Original email:
From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Body: ${originalEmail.body}

${context ? `Additional context: ${context}\n` : ''}

Writing style:
- Tone: ${style.tone}
- Greeting: ${style.greetingStyle}
- Signature: ${style.signatureStyle}
- Formality: ${style.formalityScore > 0.7 ? 'Formal' : 'Semi-formal'}

Write a professional, helpful reply that addresses the email appropriately.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No content in response');
            return content.trim();
        } catch (error) {
            this.logger.error('Failed to generate reply:', error);
            throw error;
        }
    }

    /**
     * Learn categorization rules from a batch of emails
     */
    async learnCategorizationPatterns(
        emails: Array<{ from: string; subject: string; category: string }>,
    ): Promise<Array<{ ruleType: string; pattern: string; categoryName: string; confidence: number }>> {
        try {
            const prompt = `Analyze these categorized emails and extract categorization rules.

${emails.map((e, i) => `${i + 1}. From: ${e.from}, Subject: ${e.subject} → Category: ${e.category}`).join('\n')}

Extract patterns like:
- sender_domain: emails from @domain.com go to category X
- sender_email: emails from specific@email.com go to category Y
- subject_keyword: emails with keyword "invoice" go to category Z

Respond in JSON format:
{
  "rules": [
    {
      "ruleType": "sender_domain|sender_email|subject_keyword",
      "pattern": "the pattern to match",
      "categoryName": "banks|apps|promotions|work|personal",
      "confidence": 0.0-1.0
    }
  ]
}`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                temperature: 0.3,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No content in response');
            const result = JSON.parse(content);
            this.logger.log(`Learned ${result.rules.length} categorization rules`);
            return result.rules;
        } catch (error) {
            this.logger.error('Failed to learn categorization patterns:', error);
            return [];
        }
    }
}
