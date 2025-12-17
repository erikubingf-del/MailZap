import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { TwilioService } from '../whatsapp/twilio.service';

@Injectable()
export class DigestService {
    private readonly logger = new Logger(DigestService.name);

    constructor(
        private prisma: PrismaService,
        private llmService: LlmService,
        private twilioService: TwilioService, // Using TwilioService directly to avoid circular dependency if any
    ) { }

    async generateAndSendDigest(userId: number, categoryId: number) {
        try {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user) return;

            const category = await (this.prisma as any).emailCategory.findUnique({ where: { id: categoryId } });
            if (!category) return;

            // Fetch unnotified emails for this category
            const emails = await (this.prisma as any).emailMetadata.findMany({
                where: {
                    userId,
                    categoryId,
                    notified: false,
                },
                orderBy: { date: 'asc' },
            });

            if (emails.length === 0) {
                this.logger.log(`No unnotified emails for user ${userId} in category ${category.name}`);
                return;
            }

            this.logger.log(`Generating digest for user ${userId}, category ${category.name} (${emails.length} emails)`);

            // Generate digest
            const digest = await this.llmService.generateDigest(emails);

            // Send via WhatsApp
            const message = `*${category.displayName} Digest* 📨\n\n${digest}`;
            await this.twilioService.sendMessage(user.whatsappNumber, message);

            // Mark emails as notified
            await (this.prisma as any).emailMetadata.updateMany({
                where: {
                    id: { in: emails.map(e => e.id) },
                },
                data: {
                    notified: true,
                    notifiedAt: new Date(),
                },
            });

            this.logger.log(`Digest sent to user ${userId} for category ${category.name}`);
        } catch (error) {
            this.logger.error(`Failed to generate/send digest for user ${userId}:`, error);
        }
    }
}
