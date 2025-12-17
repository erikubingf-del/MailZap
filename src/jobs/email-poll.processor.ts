import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { CategoryService } from '../category/category.service';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Processor('email-polling')
export class EmailPollingProcessor extends WorkerHost {
    private readonly logger = new Logger(EmailPollingProcessor.name);

    constructor(
        private emailService: EmailService,
        private categoryService: CategoryService,
        private llmService: LlmService,
        private prisma: PrismaService,
        @InjectQueue('notification-dispatch') private notificationQueue: Queue,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing email polling job ${job.id}`);

        // Get all users with connected email accounts
        const users = await this.prisma.user.findMany({
            where: {
                emailAccounts: {
                    some: {},
                },
            },
            include: {
                emailAccounts: true,
            },
        });

        for (const user of users) {
            try {
                await this.pollUserEmails(user.id);
            } catch (error) {
                this.logger.error(`Failed to poll emails for user ${user.id}`, error);
            }
        }
    }

    private async pollUserEmails(userId: number) {
        // Fetch recent emails with details
        const emails = await this.emailService.fetchNewEmails(userId, 10);

        for (const email of emails) {
            // Check if already processed
            const existing = await this.prisma.emailMetadata.findFirst({
                where: { emailProviderId: email.id },
            });

            if (existing) continue;

            // Categorize
            const categorization = await this.categoryService.categorizeEmail(
                userId,
                {
                    from: email.from,
                    subject: email.subject,
                    snippet: email.snippet,
                }
            );

            // Get category ID
            const category = await this.categoryService.getCategoryByName(categorization.categoryName);

            // Save metadata
            const savedEmail = await this.prisma.emailMetadata.create({
                data: {
                    userId,
                    emailProviderId: email.id,
                    threadId: email.threadId,
                    from: email.from,
                    to: [], // We don't have 'to' in the list response, would need full details
                    subject: email.subject,
                    date: new Date(parseInt(email.internalDate)),
                    categoryId: category ? category.id : null,
                    isUrgent: categorization.isUrgent,
                    summary: '',
                },
            });

            if (category) {
                // Queue notification
                await this.notificationQueue.add('dispatch-notification', {
                    emailId: savedEmail.id,
                    userId,
                    categoryId: category.id,
                    isUrgent: categorization.isUrgent,
                });
            }
        }
    }
}
