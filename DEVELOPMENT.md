# InboxWhats (MailZap) - Development Guide

## Project Structure

```
src/
├── app.module.ts           # Root module
├── main.ts                 # Application entry point
├── auth/                   # Authentication module
│   ├── auth.controller.ts  # OAuth endpoints
│   ├── auth.service.ts     # User validation & account linking
│   ├── auth.module.ts
│   └── google.strategy.ts  # Passport Google OAuth strategy
├── common/                 # Shared utilities
│   ├── common.module.ts    # Global module
│   └── prisma/
│       └── prisma.service.ts  # Database client
├── email/                  # Email integration
│   ├── email.service.ts    # Gmail API wrapper
│   └── email.module.ts
└── whatsapp/               # WhatsApp integration
    ├── whatsapp.controller.ts  # Webhook handler
    ├── whatsapp.service.ts     # Message processing & onboarding
    ├── whatsapp.module.ts
    └── types.ts            # Conversation state types
```

## Key Components

### WhatsApp Service
The `WhatsappService` manages the entire conversation flow:
- **State Machine**: Tracks user progress through onboarding
- **Message Routing**: Directs messages to appropriate handlers based on state
- **Preference Collection**: Gathers user settings for email filtering

### Email Service
The `EmailService` provides Gmail API integration:
- **OAuth Management**: Handles token storage and automatic refresh
- **Email Operations**: List, get, and send emails
- **Error Handling**: Robust error logging and recovery

### Auth Service
The `AuthService` manages user authentication:
- **OAuth Callback**: Processes Google OAuth responses
- **User Creation**: Creates or finds users in the database
- **Token Storage**: Securely stores OAuth tokens

## Database Schema

### User
- `whatsappNumber`: Unique identifier (phone number)
- Relations: `emailAccounts`, `preferences`, `styleProfile`, `events`

### EmailAccount
- Stores OAuth tokens for Gmail access
- Unique constraint on `(userId, provider)`

### Preference
- `promoHandling`: How to handle promotional emails
- `importantSenders`, `importantDomains`, `importantKeywords`: Filtering rules

### StyleProfile
- `sampleTexts`: User's writing examples
- `inferredTone`: Detected writing style (formal/semi-formal/casual)

## Environment Variables

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/mailzap"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
OPENAI_API_KEY="your-openai-key"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="your-secret-token"
```

## Testing the Onboarding Flow

You can test the onboarding flow by sending POST requests to `/webhook`:

### 1. New User
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+1234567890", "message": "Hello"}'
```

Response: Welcome message with OAuth link

### 2. After OAuth
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+1234567890", "message": "done"}'
```

Response: Promo preference question

### 3. Promo Preference
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+1234567890", "message": "2"}'
```

Response: Important rules question

### 4. Important Rules
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+1234567890", "message": "boss@company.com, @clients.com, urgent"}'
```

Response: Style samples request

### 5. Style Samples
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+1234567890", "message": "Hi there, hope you are doing well!"}'

curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+1234567890", "message": "done"}'
```

Response: Onboarding complete

## Next Development Steps

### Phase 4: Email Processing
1. Create a background job to poll Gmail for new emails
2. Integrate OpenAI for email classification and summarization
3. Send WhatsApp notifications for important emails
4. Implement approval flow for suggested replies

### Phase 5: Outgoing Emails
1. Parse natural language instructions from WhatsApp
2. Use LLM to draft emails in user's style
3. Implement approval/edit loop
4. Send via Gmail API

### Phase 6: Promotional Digests
1. Create scheduled jobs for daily/weekly digests
2. Aggregate promotional emails
3. Generate summaries with LLM
4. Send via WhatsApp

### Phase 7: RAG Search
1. Set up vector database (pgvector or Pinecone)
2. Index email content
3. Implement semantic search
4. Expose via WhatsApp commands

## Production Considerations

1. **WhatsApp Provider**: Replace mock `sendMessage()` with actual Twilio/Meta API
2. **State Storage**: Move conversation state from memory to Redis
3. **Background Jobs**: Implement BullMQ for email polling and digests
4. **Security**: Encrypt OAuth tokens at rest
5. **Rate Limiting**: Add rate limiting to webhook endpoint
6. **Monitoring**: Add logging and error tracking (e.g., Sentry)
7. **Scaling**: Consider horizontal scaling with Redis for state
