import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
    ) { }

    async validateUser(details: any) {
        console.log('AuthService validateUser', details);

        // For now, we'll create a temporary user with a placeholder WhatsApp number
        // In production, this should be linked to an existing user via a session/state
        const tempWhatsappNumber = `temp_${details.email}`;

        // Find or create user
        let user = await this.prisma.user.findUnique({
            where: { whatsappNumber: tempWhatsappNumber },
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: { whatsappNumber: tempWhatsappNumber },
            });
        }

        // Store email account
        await this.emailService.storeEmailAccount(
            user.id,
            details.email,
            details.accessToken,
            details.refreshToken,
        );

        return {
            success: true,
            message: 'Email account linked successfully!',
            email: details.email,
        };
    }
}
