import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        @InjectQueue('email-polling') private emailPollingQueue: Queue,
    ) { }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async scheduleEmailPolling() {
        this.logger.log('Scheduling email polling job');
        await this.emailPollingQueue.add('poll-emails', {}, {
            removeOnComplete: true,
            removeOnFail: true,
        });
    }
}
