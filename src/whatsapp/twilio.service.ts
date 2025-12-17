import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import axios from 'axios';

@Injectable()
export class TwilioService {
    private readonly logger = new Logger(TwilioService.name);
    private client: Twilio;
    private fromNumber: string;

    constructor(private configService: ConfigService) {
        const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
        this.fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER') || '';

        if (accountSid && authToken) {
            this.client = new Twilio(accountSid, authToken);
            this.logger.log('Twilio client initialized');
        } else {
            this.logger.warn('Twilio credentials not configured - messages will be logged only');
        }
    }

    /**
     * Send a WhatsApp message via Twilio
     */
    async sendMessage(to: string, message: string): Promise<void> {
        // Ensure number is in WhatsApp format
        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const whatsappFrom = this.fromNumber.startsWith('whatsapp:')
            ? this.fromNumber
            : `whatsapp:${this.fromNumber}`;

        if (!this.client) {
            this.logger.log(`[MOCK] Would send to ${whatsappTo}: ${message.substring(0, 100)}...`);
            return;
        }

        try {
            const result = await this.client.messages.create({
                body: message,
                from: whatsappFrom,
                to: whatsappTo,
            });

            this.logger.log(`Message sent successfully: ${result.sid}`);
        } catch (error) {
            this.logger.error(`Failed to send WhatsApp message to ${whatsappTo}:`, error);
            throw error;
        }
    }

    /**
     * Send a WhatsApp message with media
     */
    async sendMessageWithMedia(
        to: string,
        message: string,
        mediaUrl: string,
    ): Promise<void> {
        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const whatsappFrom = this.fromNumber.startsWith('whatsapp:')
            ? this.fromNumber
            : `whatsapp:${this.fromNumber}`;

        if (!this.client) {
            this.logger.log(`[MOCK] Would send media to ${whatsappTo}: ${mediaUrl}`);
            return;
        }

        try {
            const result = await this.client.messages.create({
                body: message,
                from: whatsappFrom,
                to: whatsappTo,
                mediaUrl: [mediaUrl],
            });

            this.logger.log(`Media message sent successfully: ${result.sid}`);
        } catch (error) {
            this.logger.error(`Failed to send WhatsApp media message:`, error);
            throw error;
        }
    }

    /**
     * Download media from Twilio
     */
    async downloadMedia(mediaUrl: string): Promise<Buffer> {
        try {
            const response = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                headers: {
                    Authorization: `Basic ${Buffer.from(
                        `${this.configService.get('TWILIO_ACCOUNT_SID')}:${this.configService.get('TWILIO_AUTH_TOKEN')}`,
                    ).toString('base64')}`,
                },
            });
            return Buffer.from(response.data);
        } catch (error) {
            this.logger.error(`Failed to download media from ${mediaUrl}:`, error);
            throw error;
        }
    }
}
