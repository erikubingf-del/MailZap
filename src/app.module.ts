import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { LlmModule } from './llm/llm.module';
import { CategoryModule } from './category/category.module';
import { JobsModule } from './jobs/jobs.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WhatsappModule,
    EmailModule,
    AuthModule,
    CommonModule,
    LlmModule,
    CategoryModule,
    JobsModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
