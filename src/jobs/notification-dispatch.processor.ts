import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TwilioService } from '../whatsapp/twilio.service';

@Processor('notification-dispatch')
export class NotificationDispatchProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationDispatchProcessor.name);

    constructor(
        private prisma: PrismaService,
        private twilioService: TwilioService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { emailId, userId, categoryId, isUrgent } = job.data;
        this.logger.log(`Processing notification for email ${emailId}`);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { preferences: true },
        });

        if (!user || !user.whatsappNumber) return;

        const email = await this.prisma.emailMetadata.findUnique({
            where: { id: emailId },
            include: { category: true },
        });

        if (!email) return;

        // Check schedule
        const schedule = await this.prisma.notificationSchedule.findUnique({
            where: { userId_categoryId: { userId, categoryId } },
        });

        const shouldSendNow = isUrgent || !schedule || schedule.deliveryMode === 'immediate';

        if (shouldSendNow && email.category) {
            const message = `📧 *New Email from ${email.category.name}*
From: ${email.from}
Subject: ${email.subject}

${email.summary}

Reply "Read" to mark as read or "Reply" to respond.`;

            await this.twilioService.sendMessage(user.whatsappNumber, message);
        } else {
            // Batched delivery logic would go here
            // For MVP, we'll just log that it's queued for batch
            this.logger.log(`Email ${emailId} queued for batch delivery`);
        }
    }
}
