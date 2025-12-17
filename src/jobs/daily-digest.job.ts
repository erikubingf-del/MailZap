import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { DigestService } from '../email/digest.service';

@Injectable()
export class DailyDigestJob {
    private readonly logger = new Logger(DailyDigestJob.name);

    constructor(
        private prisma: PrismaService,
        private digestService: DigestService,
    ) { }

    // Run every 15 minutes to check for scheduled digests
    @Cron('0 */15 * * * *')
    async handleCron() {
        this.logger.log('Checking for scheduled daily digests...');

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Format current time as HH:MM
        const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

        // Find all schedules matching current time
        // We need to check both time1 and time2
        // Since Prisma doesn't support complex OR on related fields easily in findMany with raw SQL for time comparison,
        // we might fetch schedules that *could* match or just fetch all and filter in memory if dataset is small.
        // For scalability, we should use a raw query or better filtering.
        // Given MVP, let's fetch all schedules that have a time set and filter in memory.

        const schedules = await (this.prisma as any).notificationSchedule.findMany({
            where: {
                OR: [
                    { time1: timeString },
                    { time2: timeString },
                ]
            }
        });

        this.logger.log(`Found ${schedules.length} schedules matching ${timeString}`);

        for (const schedule of schedules) {
            // Check delivery mode
            if (schedule.deliveryMode === 'immediate') continue;

            // Check weekly day if applicable
            if (schedule.deliveryMode === 'batched_weekly') {
                if (schedule.weeklyDay !== now.getDay()) continue;
                if (schedule.weeklyTime !== timeString) continue;
            }

            // Trigger digest
            await this.digestService.generateAndSendDigest(schedule.userId, schedule.categoryId);
        }
    }
}
