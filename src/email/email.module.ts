import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ContactService } from './contact.service';
import { DigestService } from './digest.service';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module'; // Assuming common module path

@Module({
  imports: [ConfigModule, CommonModule],
  providers: [EmailService, ContactService, DigestService],
  exports: [EmailService, ContactService, DigestService],
})
export class EmailModule { }
