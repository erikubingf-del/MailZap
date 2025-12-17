import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('webhook')
export class WhatsappController {
    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly configService: ConfigService,
    ) { }

    @Get()
    verifyWebhook(@Query() query: any, @Res() res: any) {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        const verifyToken = this.configService.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('Webhook verified!');
            return res.status(HttpStatus.OK).send(challenge);
        } else {
            return res.status(HttpStatus.FORBIDDEN).send();
        }
    }

    @Post()
    async handleMessage(@Body() body: any, @Res() res: any) {
        // Return 200 OK immediately to acknowledge receipt
        res.status(HttpStatus.OK).send('EVENT_RECEIVED');

        // Process in background
        await this.whatsappService.processWebhook(body);
    }
}
