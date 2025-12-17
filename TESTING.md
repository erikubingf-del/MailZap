# MailZap Testing Guide

This guide provides step-by-step instructions for manually verifying the MailZap application features.

## 1. Environment Setup

Before testing, you need to configure the following services.

### 1.1 Start the Application
1.  Open your terminal in the project root.
2.  Run the development server:
    ```bash
    npm run start:dev
    ```
3.  Ensure the server starts successfully (logs should show `Nest application successfully started`).

### 1.2 Set up Ngrok Tunnel
Ngrok allows Twilio to send webhooks to your local machine.
1.  Install Ngrok if you haven't: [https://ngrok.com/download](https://ngrok.com/download)
2.  Open a new terminal window.
3.  Start the tunnel on port 3000:
    ```bash
    ngrok http 3000
    ```
4.  Copy the HTTPS URL (e.g., `https://a1b2-c3d4.ngrok-free.app`). **Keep this terminal open.**

### 1.3 Configure Twilio Sandbox
1.  Log in to your [Twilio Console](https://console.twilio.com/).
2.  Navigate to **Messaging** > **Try it out** > **Send a WhatsApp message**.
3.  Click on **Sandbox Settings** (left menu or link).
4.  In the **"When a message comes in"** field, paste your Ngrok URL followed by `/webhook`.
    *   Example: `https://a1b2-c3d4.ngrok-free.app/webhook`
5.  Ensure the method is set to **POST**.
6.  Click **Save**.

### 1.4 Link WhatsApp Account
1.  In the Twilio Console (**Messaging** > **Try it out** > **Send a WhatsApp message**), you will see a code (e.g., `join something-random`).
2.  Open WhatsApp on your phone.
3.  Send that code to the Twilio Sandbox number provided on the screen.
4.  Twilio should reply confirming you are connected.

### 1.5 Prepare Gmail Account
1.  Use an existing Gmail account or create a new one for testing.
2.  Ensure you have the credentials ready for the OAuth flow (this happens during the app's onboarding).

## 2. Onboarding Flow
**Goal**: Verify new user registration and email linking.

1.  **Start**: Send "Hello" or "Start" to the Twilio WhatsApp number.
2.  **Expect**: Bot welcomes you and asks to link your email.
3.  **Action**: Click the provided OAuth link.
4.  **Expect**: Google Consent Screen -> Success Page.
5.  **Action**: Return to WhatsApp.
6.  **Expect**: Bot confirms email linking and starts inbox scan.
7.  **Expect**: Bot suggests categories and schedules.
8.  **Action**: Reply "Yes" to confirm.
9.  **Expect**: "You're all set!" message.

## 3. Email Categorization & Notifications
**Goal**: Verify real-time email processing.

1.  **Action**: Send an email to your linked Gmail account from another address.
    *   **Subject**: "Meeting Tomorrow"
    *   **Body**: "Hi, let's meet at 10 AM."
2.  **Expect**: WhatsApp notification within 1-5 minutes (depending on poll interval).
    *   **Format**: "📧 *Work* | *Sender Name*: Meeting Tomorrow..."
3.  **Action**: Send a promotional email (or forward one).
4.  **Expect**: No immediate notification (if "Promotions" is set to digest).

## 4. Reply Flow
**Goal**: Verify replying to an email via WhatsApp.

1.  **Trigger**: Wait for a notification from the previous step.
2.  **Action**: Reply "Reply" to the WhatsApp message.
3.  **Expect**: Bot confirms: "Replying to [Sender]. What would you like to say?"
4.  **Action**: Reply "I'll be there."
5.  **Expect**: Bot shows draft: "Subject: Re: Meeting Tomorrow... Body: I'll be there."
6.  **Action**: Reply "Send".
7.  **Expect**: "Email sent!" confirmation.
8.  **Verify**: Check your Gmail "Sent" folder.

## 5. Compose Flow
**Goal**: Verify sending a new email.

1.  **Action**: Send "Compose" or "New Email".
2.  **Expect**: Bot asks: "Who is this email for?"
3.  **Action**: Reply with an email address (e.g., "test@example.com").
4.  **Expect**: Bot asks for the message body.
5.  **Action**: Send a **Voice Note** saying: "Hi, just checking in on the project status."
6.  **Expect**: Bot transcribes audio and shows draft.
7.  **Action**: Reply "Make it more formal".
8.  **Expect**: Bot shows revised draft (more formal tone).
9.  **Action**: Reply "Send".
10. **Expect**: "Email sent!" confirmation.

## 6. Daily Digest
**Goal**: Verify batched notifications.

1.  **Setup**: Ensure you have unread emails in a category set to "Daily Digest" (e.g., Promotions).
2.  **Action**: Wait for the scheduled time (or manually trigger the job via code/endpoint if available).
3.  **Expect**: A single WhatsApp message summarizing all missed emails in that category.
    *   **Format**: "*Promotions Digest 📅* ... • *Sender*: Summary..."

## 7. Error Handling
**Goal**: Verify system resilience.

1.  **Action**: Revoke access to MailZap in your Google Account Security settings.
2.  **Action**: Trigger an email scan (wait for poll).
3.  **Expect**: System logs "Auth revoked". (Future: Bot notifies user to re-link).
