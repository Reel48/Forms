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

