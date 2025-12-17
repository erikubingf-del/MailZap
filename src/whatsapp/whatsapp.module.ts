import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { TwilioService } from './twilio.service';
import { CategoryModule } from '../category/category.module';
import { LlmModule } from '../llm/llm.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [CategoryModule, LlmModule, EmailModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, TwilioService],
})
export class WhatsappModule { }
