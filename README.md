# InboxWhats (MailZap) 📧➡️💬

> Transform WhatsApp into your primary email interface. Built for Brazil and markets where WhatsApp dominates.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white)](https://openai.com/)

## 🎯 The Problem

In Brazil and similar markets:
- ✅ People live on WhatsApp
- ❌ People ignore email
- 😰 They're overwhelmed by spam
- 📝 They don't know how to write professional emails

**BUT** email is still required for work, international communication, and official processes.

## 💡 The Solution

**InboxWhats** makes WhatsApp your email client:
- 📬 Receive smart email summaries on WhatsApp
- 🤖 AI categorizes emails (Banks, Apps, Promotions, Work, Personal)
- ✍️ Compose emails via text or voice
- 🎯 Get only important notifications
- 🔒 LGPD compliant (no content storage)

## ✨ Features

### ✅ Implemented (Phases 1-4)

#### 🔐 Email Integration
- Gmail OAuth with automatic token refresh
- Outlook support (structure ready)
- Secure credential storage

#### 🧠 AI-Powered Categorization
- **5 Smart Categories**:
  - 🏦 Banks (bills, expenses, offers)
  - 📱 Apps (purchases, crypto, notifications)
  - 🎯 Promotions (campaigns, deals, sales)
  - 💼 Work (professional emails)
  - ✉️ Personal (travel, legal, appointments)
- Pattern learning from existing emails
- Rule-based + LLM fallback classification

#### 📝 Writing Assistant
- Analyzes your writing style
- Generates emails in YOUR tone
- Suggests replies to incoming emails
- Revises drafts based on feedback
- Voice-to-email (Whisper transcription)

#### 🔒 Privacy (LGPD Compliant)
- NO email content stored
- Only metadata (sender, subject, date)
- AI summaries (not original text)
- Encrypted OAuth tokens

#### 💬 WhatsApp Integration
- Twilio API (production-ready)
- Conversation state management
- Text and media messages

### 🚧 In Progress (Phases 5-9)

- [ ] **Redesigned Onboarding**: Inbox scanning, category suggestions
- [ ] **Scheduled Notifications**: BullMQ jobs, batched delivery
- [ ] **Enhanced Reply/Compose**: Voice editing, contact search
- [ ] **Attachment Security**: Google Drive integration, virus scanning
- [ ] **Advanced Search**: RAG with pgvector, date-aware queries

## 🏗️ Architecture

```
┌──────────────┐
│   WhatsApp   │  ← Twilio API
└──────┬───────┘
       │
┌──────▼────────┐
│  NestJS API   │  ← TypeScript + Modular Design
└──────┬────────┘
       │
┌──────▼────────┐
│  OpenAI LLM   │  ← GPT-4 + Whisper
└───────────────┘
       │
┌──────▼────────┐
│  Gmail API    │  ← OAuth 2.0
└───────────────┘
       │
┌──────▼────────┐
│   Postgres    │  ← Prisma ORM
└───────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL
- Redis (for production)
- Google Cloud OAuth credentials
- Twilio WhatsApp Business Account
- OpenAI API key

### Installation

```bash
# Clone repository
git clone <your-repo>
cd MailZap

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Set up database
npx prisma migrate dev --name init
psql $DATABASE_URL < prisma/seed.sql

# Generate Prisma client
npx prisma generate

# Start development server
npm run start:dev
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mailzap"

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"

# OpenAI
OPENAI_API_KEY="sk-..."

# Twilio WhatsApp
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"

# WhatsApp Webhook
WHATSAPP_WEBHOOK_VERIFY_TOKEN="your-secret-token"
```

## 📖 Documentation

- **[Development Guide](./DEVELOPMENT.md)**: Detailed architecture and testing
- **[Walkthrough](./walkthrough.md)**: Complete implementation overview
- **[Task List](./task.md)**: Project roadmap and progress

## 🧪 Testing

### Test Email Classification
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+5511999999999",
    "message": "Hello"
  }'
```

### Test OAuth Flow
1. Navigate to `http://localhost:3000/auth/google`
2. Complete Google authentication
3. Check database for stored tokens

## 🗂️ Project Structure

```
src/
├── app.module.ts          # Root module
├── main.ts                # Application entry
├── auth/                  # Google OAuth
├── category/              # Email categorization & learning
├── common/                # Prisma, shared utilities
├── email/                 # Gmail API wrapper
├── llm/                   # OpenAI integration
└── whatsapp/              # Twilio + state machine

prisma/
├── schema.prisma          # Database schema
└── seed.sql               # Category seeds

.gemini/antigravity/brain/
├── implementation_plan.md # Technical plan
├── progress_summary.md    # Current status
├── task.md                # Roadmap
└── walkthrough.md         # Complete guide
```

## 🔐 Security & Privacy

### LGPD Compliance
- ✅ No email content storage
- ✅ Metadata-only (sender, subject, date, category)
- ✅ AI-generated summaries (not original)
- ✅ User data deletion on request
- ✅ Encrypted OAuth tokens

### Best Practices
- OAuth 2.0 for email access
- Automatic token refresh
- Secure webhook verification
- Rate limiting (TODO)
- Input validation

## 📊 Current Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Project Skeleton | ✅ 100% |
| 2 | Email Linking | ✅ 100% |
| 3 | Basic Onboarding | ✅ 100% |
| 4 | Enhanced Categorization | ✅ 100% |
| 5 | Redesigned Onboarding | 🚧 0% |
| 6 | Scheduled Notifications | 📋 0% |
| 7 | Enhanced Reply/Compose | 📋 0% |
| 8 | Attachment Security | 📋 0% |
| 9 | Advanced Search | 📋 0% |

**Overall**: ~45% complete

## 🛠️ Tech Stack

- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL + Prisma ORM
- **AI**: OpenAI (GPT-4, Whisper)
- **WhatsApp**: Twilio API
- **Email**: Gmail API (OAuth 2.0)
- **Jobs**: BullMQ + Redis
- **Storage**: Google Drive API (planned)
- **Search**: pgvector (planned)

## 🤝 Contributing

This is a personal project, but suggestions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT

## 🙏 Acknowledgments

- Inspired by the WhatsApp-first culture in Brazil
- Built with guidance from the [whatsapp-chatgpt-bot](https://github.com/wassengerhq/whatsapp-chatgpt-bot) reference implementation
- Powered by OpenAI's GPT-4 and Whisper

---

**Made with ❤️ for the WhatsApp generation**
