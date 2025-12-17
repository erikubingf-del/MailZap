import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) { }

    /**
     * Get an authenticated Gmail client for a user
     */
    private async getAuthenticatedClient(userId: number): Promise<OAuth2Client> {
        const emailAccount = await this.prisma.emailAccount.findFirst({
            where: { userId, provider: 'gmail' },
        });

        if (!emailAccount) {
            throw new Error('No Gmail account linked for this user');
        }

        const oauth2Client = new google.auth.OAuth2(
            this.configService.get<string>('GOOGLE_CLIENT_ID'),
            this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
            this.configService.get<string>('GOOGLE_CALLBACK_URL'),
        );

        oauth2Client.setCredentials({
            access_token: emailAccount.oauthAccessToken,
            refresh_token: emailAccount.oauthRefreshToken,
        });

        // Handle token refresh
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                try {
                    await this.prisma.emailAccount.update({
                        where: { id: emailAccount.id },
                        data: {
                            oauthAccessToken: tokens.access_token,
                            tokenExpiry: tokens.expiry_date
                                ? new Date(tokens.expiry_date)
                                : emailAccount.tokenExpiry,
                        },
                    });
                } catch (error) {
                    this.logger.error(`Failed to update tokens for user ${userId}:`, error);
                }
            }
        });

        return oauth2Client;
    }

    private async handleAuthError(userId: number, error: any) {
        if (error.message?.includes('invalid_grant') || error.response?.data?.error === 'invalid_grant') {
            this.logger.error(`Auth revoked for user ${userId}. Needs re-authentication.`);
            // In a real app, we would trigger a notification to the user here
            // e.g., this.whatsappService.sendAuthRequest(userId);
            // For now, we just log it.
        }
        throw error;
    }

    /**
     * List recent messages from Gmail
     */
    /**
   * Scan sent emails for style analysis
   */
    async scanSentEmails(userId: number, limit: number = 100): Promise<Array<{ from: string; to: string; subject: string; body: string }>> {
        const client = await this.getAuthenticatedClient(userId);
        const gmail = google.gmail({ version: 'v1', auth: client });

        try {
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: 'label:SENT',
                maxResults: limit,
            });

            const messages = response.data.messages || [];
            const emailDetails: Array<{ from: string; to: string; subject: string; body: string }> = [];

            for (const message of messages) {
                const details = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id!,
                    format: 'full',
                });

                const headers = details.data.payload?.headers;
                const from = headers?.find((h) => h.name === 'From')?.value || '';
                const to = headers?.find((h) => h.name === 'To')?.value || '';
                const subject = headers?.find((h) => h.name === 'Subject')?.value || '';
                const body = this.extractBody(details.data.payload);

                if (body) {
                    emailDetails.push({ from, to, subject, body });
                }
            }

            return emailDetails;
        } catch (error) {
            this.logger.error(`Failed to scan sent emails for user ${userId}:`, error);
            await this.handleAuthError(userId, error);
            throw error;
        }
    }

    private extractBody(payload: any): string {
        if (!payload) return '';

        let body = '';
        if (payload.body?.data) {
            body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        } else if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    break;
                }
            }
        }
        return body;
    }

    /**
     * Fetch new emails with full details
     */
    async fetchNewEmails(userId: number, limit: number = 10): Promise<Array<{ id: string; threadId: string; from: string; subject: string; snippet: string; internalDate: string }>> {
        const client = await this.getAuthenticatedClient(userId);
        const gmail = google.gmail({ version: 'v1', auth: client });

        try {
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: limit,
                q: 'label:INBOX', // Only check inbox
            });

            const messages = response.data.messages || [];
            const emailDetails: Array<{ id: string; threadId: string; from: string; subject: string; snippet: string; internalDate: string }> = [];

            for (const message of messages) {
                const details = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id!,
                    format: 'full',
                });

                const headers = details.data.payload?.headers;
                const from = headers?.find((h) => h.name === 'From')?.value || '';
                const subject = headers?.find((h) => h.name === 'Subject')?.value || '';
                const snippet = details.data.snippet || '';
                const internalDate = details.data.internalDate || Date.now().toString();

                emailDetails.push({
                    id: message.id!,
                    threadId: message.threadId!,
                    from,
                    subject,
                    snippet,
                    internalDate,
                });
            }

            return emailDetails;
        } catch (error) {
            this.logger.error(`Failed to fetch new emails for user ${userId}:`, error);
            await this.handleAuthError(userId, error);
            throw error;
        }
    }

    /**
     * Get a specific message by ID
     */
    async getMessage(userId: number, messageId: string) {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const gmail = google.gmail({ version: 'v1', auth });

            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });

            return response.data;
        } catch (error) {
            this.logger.error(
                `Failed to get message ${messageId} for user ${userId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Send an email via Gmail
     */
    async sendMessage(
        userId: number,
        to: string,
        subject: string,
        body: string,
    ) {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const gmail = google.gmail({ version: 'v1', auth });

            // Create email in RFC 2822 format
            const email = [
                `To: ${to}`,
                `Subject: ${subject}`,
                'Content-Type: text/plain; charset=utf-8',
                '',
                body,
            ].join('\n');

            // Encode in base64url
            const encodedMessage = Buffer.from(email)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage,
                },
            });

            this.logger.log(`Email sent successfully: ${response.data.id}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to send email for user ${userId}:`, error);
            await this.handleAuthError(userId, error);
            throw error;
        }
    }

    /**
     * Store OAuth tokens after successful authentication
     */
    async storeEmailAccount(
        userId: number,
        email: string,
        accessToken: string,
        refreshToken: string,
        expiryDate?: number,
    ) {
        return this.prisma.emailAccount.upsert({
            where: {
                userId_provider: {
                    userId,
                    provider: 'gmail',
                },
            } as any,
            update: {
                emailAddress: email,
                oauthAccessToken: accessToken,
                oauthRefreshToken: refreshToken,
                tokenExpiry: expiryDate ? new Date(expiryDate) : new Date(),
            },
            create: {
                userId,
                provider: 'gmail',
                emailAddress: email,
                oauthAccessToken: accessToken,
                oauthRefreshToken: refreshToken,
                tokenExpiry: expiryDate ? new Date(expiryDate) : new Date(),
            },
        });
    }
}
