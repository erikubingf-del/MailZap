import { Test, TestingModule } from '@nestjs/testing';
import { DigestService } from './digest.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { TwilioService } from '../whatsapp/twilio.service';

describe('DigestService', () => {
    let service: DigestService;
    let prismaService: PrismaService;
    let llmService: LlmService;
    let twilioService: TwilioService;

    const mockUser = { id: 1, whatsappNumber: 'whatsapp:+123' };
    const mockCategory = { id: 1, name: 'banks', displayName: 'Banks' };
    const mockEmails = [
        { id: 1, from: 'Bank', subject: 'Statement', summary: 'You spent money', date: new Date() },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DigestService,
                {
                    provide: PrismaService,
                    useValue: {
                        user: { findUnique: jest.fn().mockResolvedValue(mockUser) },
                        emailCategory: { findUnique: jest.fn().mockResolvedValue(mockCategory) },
                        emailMetadata: {
                            findMany: jest.fn().mockResolvedValue(mockEmails),
                            updateMany: jest.fn(),
                        },
                    },
                },
                {
                    provide: LlmService,
                    useValue: {
                        generateDigest: jest.fn().mockResolvedValue('Digest Content'),
                    },
                },
                {
                    provide: TwilioService,
                    useValue: {
                        sendMessage: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<DigestService>(DigestService);
        prismaService = module.get<PrismaService>(PrismaService);
        llmService = module.get<LlmService>(LlmService);
        twilioService = module.get<TwilioService>(TwilioService);
    });

    it('should generate and send digest', async () => {
        await service.generateAndSendDigest(1, 1);

        expect(llmService.generateDigest).toHaveBeenCalledWith(mockEmails);
        expect(twilioService.sendMessage).toHaveBeenCalledWith(
            mockUser.whatsappNumber,
            expect.stringContaining('Banks Digest')
        );
        expect((prismaService as any).emailMetadata.updateMany).toHaveBeenCalled();
    });

    it('should do nothing if no emails', async () => {
        (prismaService as any).emailMetadata.findMany.mockResolvedValue([]);

        await service.generateAndSendDigest(1, 1);

        expect(llmService.generateDigest).not.toHaveBeenCalled();
        expect(twilioService.sendMessage).not.toHaveBeenCalled();
    });
});
