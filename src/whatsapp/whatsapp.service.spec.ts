import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TwilioService } from './twilio.service';
import { EmailService } from '../email/email.service';
import { ContactService } from '../email/contact.service';
import { CategoryService } from '../category/category.service';
import { LlmService } from '../llm/llm.service';
import { OnboardingState } from './types';

describe('WhatsappService Compose Flow', () => {
  let service: WhatsappService;
  let prismaService: PrismaService;
  let twilioService: TwilioService;
  let contactService: ContactService;
  let llmService: LlmService;
  let emailService: EmailService;

  const mockUser = {
    id: 1,
    whatsappNumber: 'whatsapp:+1234567890',
    emailAccounts: [{ id: 1, emailAddress: 'test@example.com' }],
    preferences: { onboardingCompleted: true },
  };

  const mockContact = {
    name: 'John Doe',
    email: 'john@example.com',
    frequency: 5,
    lastContacted: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn().mockResolvedValue(mockUser),
            },
            styleProfile: {
              findUnique: jest.fn().mockResolvedValue(null), // No style profile yet
            },
            preference: {
              upsert: jest.fn(),
            },
            notificationSchedule: {
              upsert: jest.fn(),
            },
            emailMetadata: {
              findFirst: jest.fn(),
            }
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: TwilioService,
          useValue: {
            sendMessage: jest.fn(),
            downloadMedia: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            scanSentEmails: jest.fn().mockResolvedValue([]),
            sendMessage: jest.fn(),
          },
        },
        {
          provide: ContactService,
          useValue: {
            searchContacts: jest.fn(),
          },
        },
        {
          provide: CategoryService,
          useValue: {
            getCategoryByName: jest.fn(),
          },
        },
        {
          provide: LlmService,
          useValue: {
            generateEmailDraft: jest.fn(),
            transcribeAudio: jest.fn(),
            reviseEmailDraft: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    prismaService = module.get<PrismaService>(PrismaService);
    twilioService = module.get<TwilioService>(TwilioService);
    contactService = module.get<ContactService>(ContactService);
    llmService = module.get<LlmService>(LlmService);
    emailService = module.get<EmailService>(EmailService);
  });

  it('should start compose flow when user says "compose"', async () => {
    await service.processWebhook({
      From: mockUser.whatsappNumber,
      Body: 'compose',
    });

    expect(twilioService.sendMessage).toHaveBeenCalledWith(
      mockUser.whatsappNumber,
      expect.stringContaining('Who would you like to email?')
    );
  });

  it('should find contact and move to body state', async () => {
    // Setup state as COMPOSING_TO
    (service as any).conversationStates.set(mockUser.whatsappNumber, {
      whatsappNumber: mockUser.whatsappNumber,
      userId: mockUser.id,
      onboardingState: OnboardingState.COMPLETED,
      step: 'COMPOSING_TO',
    });

    (contactService.searchContacts as jest.Mock).mockResolvedValue([mockContact]);

    await service.processWebhook({
      From: mockUser.whatsappNumber,
      Body: 'John',
    });

    expect(contactService.searchContacts).toHaveBeenCalledWith(mockUser.id, 'John');
    expect(twilioService.sendMessage).toHaveBeenCalledWith(
      mockUser.whatsappNumber,
      expect.stringContaining('Drafting email to John Doe')
    );

    const state = (service as any).conversationStates.get(mockUser.whatsappNumber);
    expect(state.step).toBe('COMPOSING_BODY');
    expect(state.tempData.to).toBe(mockContact.email);
  });

  it('should generate draft from text body', async () => {
    // Setup state as COMPOSING_BODY
    (service as any).conversationStates.set(mockUser.whatsappNumber, {
      whatsappNumber: mockUser.whatsappNumber,
      userId: mockUser.id,
      onboardingState: OnboardingState.COMPLETED,
      step: 'COMPOSING_BODY',
      tempData: { to: mockContact.email },
    });

    (llmService.generateEmailDraft as jest.Mock).mockResolvedValue({
      subject: 'Project Update',
      body: 'Here is the update.',
    });

    await service.processWebhook({
      From: mockUser.whatsappNumber,
      Body: 'Send project update',
    });

    expect(llmService.generateEmailDraft).toHaveBeenCalled();
    expect(twilioService.sendMessage).toHaveBeenCalledWith(
      mockUser.whatsappNumber,
      expect.stringContaining('Here is your draft')
    );

    const state = (service as any).conversationStates.get(mockUser.whatsappNumber);
    expect(state.step).toBe('CONFIRMING_DRAFT');
    expect(state.tempData.subject).toBe('Project Update');
  });

  it('should handle voice note for body', async () => {
    // Setup state as COMPOSING_BODY
    (service as any).conversationStates.set(mockUser.whatsappNumber, {
      whatsappNumber: mockUser.whatsappNumber,
      userId: mockUser.id,
      onboardingState: OnboardingState.COMPLETED,
      step: 'COMPOSING_BODY',
      tempData: { to: mockContact.email },
    });

    (twilioService.downloadMedia as jest.Mock).mockResolvedValue(Buffer.from('audio'));
    (llmService.transcribeAudio as jest.Mock).mockResolvedValue('Voice message content');
    (llmService.generateEmailDraft as jest.Mock).mockResolvedValue({
      subject: 'Voice Email',
      body: 'Voice message content',
    });

    await service.processWebhook({
      From: mockUser.whatsappNumber,
      Body: '',
      MediaUrl0: 'http://example.com/audio.ogg',
      MediaContentType0: 'audio/ogg',
    });

    expect(twilioService.downloadMedia).toHaveBeenCalledWith('http://example.com/audio.ogg');
    expect(llmService.transcribeAudio).toHaveBeenCalled();
    expect(llmService.generateEmailDraft).toHaveBeenCalledWith(
      expect.stringContaining('Voice message content'),
      expect.any(Object),
      expect.any(String)
    );
  });

  it('should send email when user confirms', async () => {
    // Setup state as CONFIRMING_DRAFT
    (service as any).conversationStates.set(mockUser.whatsappNumber, {
      whatsappNumber: mockUser.whatsappNumber,
      userId: mockUser.id,
      onboardingState: OnboardingState.COMPLETED,
      step: 'CONFIRMING_DRAFT',
      tempData: {
        to: mockContact.email,
        subject: 'Test Subject',
        body: 'Test Body'
      },
    });

    const emailServiceMock = emailService;
    (emailService.sendMessage as jest.Mock).mockResolvedValue({ id: '123' });

    await service.processWebhook({
      From: mockUser.whatsappNumber,
      Body: 'Send',
    });

    expect(emailService.sendMessage).toHaveBeenCalledWith(
      mockUser.id,
      mockContact.email,
      'Test Subject',
      'Test Body'
    );
    expect(twilioService.sendMessage).toHaveBeenCalledWith(
      mockUser.whatsappNumber,
      expect.stringContaining('Email sent')
    );

    const state = (service as any).conversationStates.get(mockUser.whatsappNumber);
    expect(state.step).toBe('COMPLETED');
  });

  it('should start reply flow when user says "reply"', async () => {
    // Mock finding last email
    (prismaService as any).emailMetadata = {
      findFirst: jest.fn().mockResolvedValue({
        id: 100,
        from: 'sender@example.com',
        subject: 'Original Subject',
        summary: 'Original summary',
        notified: true,
        notifiedAt: new Date(),
      }),
    };

    await service.processWebhook({
      From: mockUser.whatsappNumber,
      Body: 'reply',
    });

    expect(twilioService.sendMessage).toHaveBeenCalledWith(
      mockUser.whatsappNumber,
      expect.stringContaining('Replying to sender@example.com')
    );

    const state = (service as any).conversationStates.get(mockUser.whatsappNumber);
    expect(state.step).toBe('COMPOSING_BODY');
    expect(state.tempData.to).toBe('sender@example.com');
    expect(state.tempData.subject).toBe('Re: Original Subject');
  });
});
