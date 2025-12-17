import { Test, TestingModule } from '@nestjs/testing';
import { DailyDigestJob } from './daily-digest.job';
import { PrismaService } from '../common/prisma/prisma.service';
import { DigestService } from '../email/digest.service';

describe('DailyDigestJob', () => {
    let job: DailyDigestJob;
    let prismaService: PrismaService;
    let digestService: DigestService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DailyDigestJob,
                {
                    provide: PrismaService,
                    useValue: {
                        notificationSchedule: {
                            findMany: jest.fn(),
                        },
                    },
                },
                {
                    provide: DigestService,
                    useValue: {
                        generateAndSendDigest: jest.fn(),
                    },
                },
            ],
        }).compile();

        job = module.get<DailyDigestJob>(DailyDigestJob);
        prismaService = module.get<PrismaService>(PrismaService);
        digestService = module.get<DigestService>(DigestService);
    });

    it('should trigger digest for matching schedules', async () => {
        // Mock current time
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

        const mockSchedules = [
            { userId: 1, categoryId: 1, deliveryMode: 'batched_daily', time1: timeString },
            { userId: 2, categoryId: 2, deliveryMode: 'batched_daily', time2: timeString },
        ];

        (prismaService as any).notificationSchedule.findMany.mockResolvedValue(mockSchedules);

        await job.handleCron();

        expect(digestService.generateAndSendDigest).toHaveBeenCalledTimes(2);
        expect(digestService.generateAndSendDigest).toHaveBeenCalledWith(1, 1);
        expect(digestService.generateAndSendDigest).toHaveBeenCalledWith(2, 2);
    });

    it('should skip immediate delivery mode', async () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

        const mockSchedules = [
            { userId: 1, categoryId: 1, deliveryMode: 'immediate', time1: timeString },
        ];

        (prismaService as any).notificationSchedule.findMany.mockResolvedValue(mockSchedules);

        await job.handleCron();

        expect(digestService.generateAndSendDigest).not.toHaveBeenCalled();
    });
});
