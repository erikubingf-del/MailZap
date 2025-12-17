import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { LlmService } from '../llm/llm.service';

export interface CategorySuggestion {
    categoryName: string;
    displayName: string;
    sampleEmails: Array<{ from: string; subject: string }>;
    confidence: number;
}

@Injectable()
export class CategoryService {
    private readonly logger = new Logger(CategoryService.name);

    constructor(
        private prisma: PrismaService,
        private llmService: LlmService,
    ) { }

    /**
     * Scan user's inbox and learn categorization patterns
     */
    async scanInboxAndLearnPatterns(
        userId: number,
        emails: Array<{ from: string; subject: string; snippet: string; id: string }>,
    ): Promise<CategorySuggestion[]> {
        this.logger.log(`Scanning ${emails.length} emails for user ${userId}`);

        // Classify each email
        const classified = await Promise.all(
            emails.map(async (email) => {
                const classification = await this.llmService.classifyEmail(
                    email.from,
                    email.subject,
                    email.snippet,
                );
                return {
                    ...email,
                    category: classification.category,
                    confidence: classification.confidence,
                };
            }),
        );

        // Group by category
        const byCategory = classified.reduce((acc, email) => {
            if (!acc[email.category]) {
                acc[email.category] = [];
            }
            acc[email.category].push(email);
            return acc;
        }, {} as Record<string, typeof classified>);

        // Learn rules from patterns
        const allRules = await this.llmService.learnCategorizationPatterns(
            classified.map((e) => ({
                from: e.from,
                subject: e.subject,
                category: e.category,
            })),
        );

        // Save rules to database
        for (const rule of allRules) {
            const category = await this.prisma.emailCategory.findUnique({
                where: { name: rule.categoryName },
            });

            if (category) {
                await this.prisma.categoryRule.create({
                    data: {
                        userId,
                        categoryId: category.id,
                        ruleType: rule.ruleType,
                        pattern: rule.pattern,
                        confidence: rule.confidence,
                    },
                });
            }
        }

        // Create suggestions
        const suggestions: CategorySuggestion[] = [];
        for (const [categoryName, emails] of Object.entries(byCategory)) {
            const category = await this.prisma.emailCategory.findUnique({
                where: { name: categoryName },
            });

            if (category) {
                suggestions.push({
                    categoryName: category.name,
                    displayName: category.displayName,
                    sampleEmails: emails.slice(0, 3).map((e) => ({
                        from: e.from,
                        subject: e.subject,
                    })),
                    confidence: emails.reduce((sum, e) => sum + e.confidence, 0) / emails.length,
                });
            }
        }

        // Mark inbox as scanned
        await this.prisma.preference.upsert({
            where: { userId },
            create: {
                userId,
                inboxScanned: true,
            },
            update: {
                inboxScanned: true,
            },
        });

        this.logger.log(`Learned ${allRules.length} rules for user ${userId}`);
        return suggestions;
    }

    /**
     * Categorize a single email based on learned rules
     */
    async categorizeEmail(
        userId: number,
        email: { from: string; subject: string; snippet: string },
    ): Promise<{ categoryName: string; confidence: number; isUrgent: boolean }> {
        // First, try to match against learned rules
        const rules = await this.prisma.categoryRule.findMany({
            where: { userId },
            include: { category: true },
            orderBy: { confidence: 'desc' },
        });

        for (const rule of rules) {
            let matches = false;

            switch (rule.ruleType) {
                case 'sender_domain':
                    matches = email.from.includes(rule.pattern);
                    break;
                case 'sender_email':
                    matches = email.from.toLowerCase() === rule.pattern.toLowerCase();
                    break;
                case 'subject_keyword':
                    matches = email.subject.toLowerCase().includes(rule.pattern.toLowerCase());
                    break;
                case 'from_contains':
                    matches = email.from.toLowerCase().includes(rule.pattern.toLowerCase());
                    break;
            }

            if (matches && rule.confidence > 0.7) {
                this.logger.log(`Matched rule: ${rule.ruleType}=${rule.pattern} → ${rule.category.name}`);
                return {
                    categoryName: rule.category.name,
                    confidence: rule.confidence,
                    isUrgent: false, // Will be determined by LLM
                };
            }
        }

        // If no rule matches, use LLM
        const classification = await this.llmService.classifyEmail(
            email.from,
            email.subject,
            email.snippet,
        );

        return {
            categoryName: classification.category,
            confidence: classification.confidence,
            isUrgent: classification.isUrgent,
        };
    }

    /**
     * Get all categories
     */
    async getAllCategories() {
        return this.prisma.emailCategory.findMany({
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get category by name
     */
    async getCategoryByName(name: string) {
        return this.prisma.emailCategory.findUnique({
            where: { name },
        });
    }

    /**
     * Initialize default categories (should be called on app startup)
     */
    async initializeCategories() {
        const categories = [
            {
                name: 'banks',
                displayName: 'Banks',
                description: 'Bills, expenses, and promotional offers from financial institutions',
                icon: '🏦',
            },
            {
                name: 'apps',
                displayName: 'Apps',
                description: 'Purchase confirmations, crypto transfers, and app notifications',
                icon: '📱',
            },
            {
                name: 'promotions',
                displayName: 'Promotions',
                description: 'Campaign ads, time-sensitive deals, Black Friday, flash sales',
                icon: '🎯',
            },
            {
                name: 'work',
                displayName: 'Work',
                description: 'Professional correspondence and work-related emails',
                icon: '💼',
            },
            {
                name: 'personal',
                displayName: 'Personal',
                description: 'Passport renewals, legal matters, hotel/flight confirmations, personal appointments',
                icon: '✉️',
            },
        ];

        for (const category of categories) {
            await this.prisma.emailCategory.upsert({
                where: { name: category.name },
                create: category,
                update: category,
            });
        }

        this.logger.log('Initialized email categories');
    }
}
