import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailPollingProcessor } from './email-poll.processor';
import { NotificationDispatchProcessor } from './notification-dispatch.processor';
import { DailyDigestJob } from './daily-digest.job';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CategoryModule } from '../category/category.module';
import { LlmModule } from '../llm/llm.module';
import { CommonModule } from '../common/common.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';

@Module({
    imports: [
        ConfigModule,
        ScheduleModule.forRoot(),
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                connection: {
                    host: configService.get('REDIS_HOST', 'localhost'),
                    port: configService.get('REDIS_PORT', 6379),
                },
            }),
            inject: [ConfigService],
        }),
        BullModule.registerQueue(
            { name: 'email-polling' },
            { name: 'notification-dispatch' },
        ),
        EmailModule,
        WhatsappModule,
        CategoryModule,
        LlmModule,
        CommonModule,
    ],
    providers: [EmailPollingProcessor, NotificationDispatchProcessor, DailyDigestJob, SchedulerService],
    exports: [BullModule],
})
export class JobsModule { }
