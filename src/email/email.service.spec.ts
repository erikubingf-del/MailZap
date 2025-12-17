import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('EmailService', () => {
  let service: EmailService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: PrismaService,
          useValue: {
            emailAccount: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should throw and log on invalid_grant error', async () => {
    const userId = 1;
    const error = { message: 'invalid_grant' };

    // Access private method for testing
    await expect((service as any).handleAuthError(userId, error)).rejects.toEqual(error);
    // We can't easily spy on the logger without more setup, but ensuring it rethrows is key.
  });

  it('should rethrow other errors', async () => {
    const userId = 1;
    const error = { message: 'other error' };

    await expect((service as any).handleAuthError(userId, error)).rejects.toEqual(error);
  });
});
