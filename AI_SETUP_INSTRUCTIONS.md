# AI Chatbot Setup Instructions

## Overview
The RAG-based AI chatbot has been implemented. Follow these steps to get it running.

## Step 1: Get Google Gemini API Key

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key (you'll need it for Step 3)

## Step 2: Run Database Migration

Run the embeddings migration in your Supabase SQL Editor:

```sql
-- First, enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Then run the migration from database/ai_embeddings_migration.sql
```

The migration creates three tables:
- `quote_embeddings` - For quotes and line items
- `form_embeddings` - For forms
- `knowledge_embeddings` - For FAQs and general knowledge

**Note:** For now, the system uses simple text-based search. Vector embeddings will be implemented in a future update for better search accuracy.

## Step 3: Set Environment Variable

Add the Gemini API key to your backend environment variables:

### For Local Development:
Create or update `.env` file in the `backend/` directory:
```
GEMINI_API_KEY=your_api_key_here
```

### For AWS App Runner:
Add the environment variable in AWS Console:
1. Go to AWS App Runner → Your Service → Configuration
2. Add environment variable: `GEMINI_API_KEY` = `your_api_key_here`
3. Redeploy the service

## Step 4: Install Dependencies

Install the new Python packages:

```bash
cd backend
pip install -r requirements.txt
```

Or if using Docker:
```bash
docker build -t your-backend-image .
```

## Step 5: Test the AI Endpoint

Once everything is set up, you can test the AI endpoint:

```bash
# POST to generate AI response
curl -X POST "http://your-backend-url/api/chat/conversations/{conversation_id}/ai-response" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## How It Works

1. **Customer sends a message** → Message is saved to database
2. **Frontend calls AI endpoint** → `/api/chat/conversations/{id}/ai-response`
3. **Backend retrieves context** → RAG service searches quotes, forms, customer data
4. **AI generates response** → Gemini uses context + conversation history
5. **Response saved** → AI message saved with `sender_id='ai-assistant'`

## Current Implementation Status

✅ **Completed:**
- Basic RAG context retrieval (text-based search)
- AI service integration with Gemini
- AI response endpoint
- Customer-specific context retrieval

⏳ **Future Enhancements:**
- Vector embeddings for better search accuracy
- Automatic AI responses (currently requires manual endpoint call)
- UI integration (button to trigger AI response)
- Knowledge base population (FAQs, company info)

## Frontend Integration (Next Steps)

To integrate AI responses into the frontend:

1. **Add AI Response Button** in `ChatPage.tsx`:
```typescript
const handleGenerateAIResponse = async () => {
  try {
    const response = await chatAPI.generateAIResponse(selectedConversation.id);
    // Reload messages to show AI response
    loadMessages(selectedConversation.id);
  } catch (error) {
    console.error('Failed to generate AI response:', error);
  }
};
```

2. **Add API method** in `api.ts`:
```typescript
generateAIResponse: async (conversationId: string) => {
  const response = await api.post(`/chat/conversations/${conversationId}/ai-response`);
  return response.data;
}
```

3. **Add UI button** next to the send message button

## Troubleshooting

**Error: "AI service is not configured"**
- Check that `GEMINI_API_KEY` is set in environment variables
- Restart the backend server after adding the variable

**Error: "google-generativeai not installed"**
- Run `pip install google-generativeai==0.3.2`
- Make sure requirements.txt is installed

**AI responses not accurate**
- The current implementation uses simple text search
- For better results, implement vector embeddings (future enhancement)
- Add more data to knowledge_embeddings table

## Cost Estimation

- Gemini Pro: ~$0.0005 per 1K characters input, $0.0015 per 1K characters output
- Average conversation: ~$0.01-0.05 per AI response
- For 1000 AI responses/month: ~$10-50/month

Very affordable for the value provided!

---

## Gemini Live Voice (browser voice + inbound Twilio calls)

This repo now includes a separate realtime bridge service in `realtime/` that connects:
- **Twilio Media Streams (phone calls)** ⇄ **Gemini Live** (audio + transcript)
- **Browser microphone** ⇄ **Gemini Live** (audio + transcript)

It uses the **same Supabase database** as the chatbot. Phone calls store transcripts in `voice_sessions` / `voice_messages` (and will also mirror into `chat_*` tables when the caller maps to an existing `clients.user_id`).

### 1) Database migration (required)
Run/apply `database/voice_sessions_migration.sql` (already applied in Supabase via MCP in this repo history).

### 2) Environment variables

**Realtime service (`realtime/main.py`)**
- `PUBLIC_BASE_URL` = `https://<public-realtime-domain>` (used to generate the `wss://...` Stream URL in TwiML)
- `GEMINI_API_KEY` = your AI Studio key
- `GEMINI_MODEL` (optional) = defaults to `gemini-2.5-flash-native-audio-preview-12-2025`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_AUTH_TOKEN` (used to validate Twilio webhook signatures)
- `REALTIME_JWT_SECRET` (shared with backend; used for browser voice auth)
- `OCHO_USER_ID` (optional; for mirroring AI messages into `chat_messages`)
- `VOICE_OPENING_GREETING` (optional)
- `VOICE_SYSTEM_PROMPT` (optional)

**Backend (App Runner)**
- `REALTIME_JWT_SECRET` (must match realtime service)

**Frontend (Vercel)**
- `VITE_REALTIME_VOICE_URL` = `https://<public-realtime-domain>`

### 3) Twilio configuration (Voice webhook)

In Twilio Console → **Phone Numbers** → your number → **Voice & Fax**:
- **A CALL COMES IN**: Webhook
  - **Method**: POST
  - **URL**: `https://<public-realtime-domain>/twilio/voice`

Notes:
- You do **not** need any inbound SMS webhook for this feature.
- Twilio Media Streams will connect to `wss://<public-realtime-domain>/ws/twilio-media` automatically via TwiML returned by the webhook.

### 4) Local development with ngrok (recommended)

1. Run the realtime service locally (example):
   - `uvicorn realtime.main:app --host 0.0.0.0 --port 8001`
2. Start ngrok:
   - `ngrok http 8001`
3. Set `PUBLIC_BASE_URL` to the ngrok `https://...` URL.
4. Point Twilio Voice webhook to: `https://<ngrok>/twilio/voice`
5. Set `VITE_REALTIME_VOICE_URL` to the same ngrok `https://...` URL for browser voice testing.


