import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';

export interface Contact {
    name: string;
    email: string;
    frequency?: number;
    lastContacted?: Date;
}

@Injectable()
export class ContactService {
    private readonly logger = new Logger(ContactService.name);

    constructor(private emailService: EmailService) { }

    /**
     * Search contacts by query (name or email)
     */
    async searchContacts(userId: number, query: string): Promise<Contact[]> {
        const sentEmails = await this.emailService.scanSentEmails(userId, 50);
        const contactsMap = new Map<string, Contact>();

        for (const email of sentEmails) {
            if (!email.to) continue;

            // Extract name and email from "Name <email@example.com>" format
            const matches = email.to.match(/(?:^|,\s*)(?:["']?([^"<>,]+)["']?\s*)?(?:<([^>]+)>|([^,\s]+))/g);

            if (matches) {
                for (const match of matches) {
                    const cleanMatch = match.trim().replace(/^,/, '').trim();
                    let name = '';
                    let address = '';

                    if (cleanMatch.includes('<')) {
                        const parts = cleanMatch.split('<');
                        name = parts[0].trim().replace(/["']/g, '');
                        address = parts[1].replace('>', '').trim();
                    } else {
                        address = cleanMatch;
                        name = cleanMatch.split('@')[0];
                    }

                    if (address) {
                        const existing = contactsMap.get(address) || { name, email: address, frequency: 0 };
                        existing.frequency = (existing.frequency || 0) + 1;
                        contactsMap.set(address, existing);
                    }
                }
            }
        }

        const contacts = Array.from(contactsMap.values()).sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
        const lowerQuery = query.toLowerCase();

        return contacts.filter(
            (c) =>
                c.name.toLowerCase().includes(lowerQuery) ||
                c.email.toLowerCase().includes(lowerQuery),
        );
    }

    /**
     * Get frequent contacts
     */
    async getFrequentContacts(userId: number, limit: number = 5): Promise<Contact[]> {
        // Mock implementation
        return [
            { name: 'Boss', email: 'boss@work.com', frequency: 10 },
            { name: 'Mom', email: 'mom@family.com', frequency: 8 },
            { name: 'John Doe', email: 'john@example.com', frequency: 5 },
        ].slice(0, limit);
    }
}
