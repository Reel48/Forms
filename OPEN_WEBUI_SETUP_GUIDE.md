# Open WebUI Integration - Setup Guide

## Quick Start

Follow these steps to complete the Open WebUI integration setup.

## Step 1: Install Frontend Dependencies ✅

The `eventsource-parser` package has been installed. If you need to reinstall:

```bash
cd frontend
npm install eventsource-parser
```

## Step 2: Run Database Migrations

### 2.1 Enable pgvector Extension

In Supabase SQL Editor, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.2 Create Vector Search Functions

Run the migration file in Supabase SQL Editor:

```sql
-- Copy and paste the contents of database/rag_vector_search_functions.sql
-- Or execute the file directly if Supabase supports file uploads
```

The file `database/rag_vector_search_functions.sql` contains:
- `rag_search_quote_embeddings()` - Vector search for quotes
- `rag_search_form_embeddings()` - Vector search for forms  
- `rag_search_knowledge_embeddings_vector()` - Vector search for knowledge base

### 2.3 Verify Functions

After running the migration, verify the functions exist:

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'rag_search%';
```

You should see all three functions listed.

## Step 3: Populate Embeddings

### 3.1 Generate Embeddings for Existing Data

Run the population script:

```bash
cd /Users/brayden/Forms/Forms
python scripts/populate_embeddings.py
```

**Options:**
- `--knowledge-only` - Only populate knowledge base embeddings
- `--quotes-only` - Only populate quote embeddings
- `--forms-only` - Only populate form embeddings
- `--limit N` - Limit to N entries (for testing)

**Example:**
```bash
# Populate all embeddings
python scripts/populate_embeddings.py

# Test with first 10 knowledge base entries
python scripts/populate_embeddings.py --knowledge-only --limit 10
```

### 3.2 Verify Embeddings

Check that embeddings were created:

```sql
-- Check knowledge base embeddings
SELECT COUNT(*) FROM knowledge_embeddings WHERE embedding IS NOT NULL;

-- Check quote embeddings
SELECT COUNT(*) FROM quote_embeddings WHERE embedding IS NOT NULL;

-- Check form embeddings
SELECT COUNT(*) FROM form_embeddings WHERE embedding IS NOT NULL;
```

## Step 4: Create Vector Indexes (Optional but Recommended)

After populating embeddings, create indexes for better performance:

```sql
-- Create vector indexes (run after data is populated)
CREATE INDEX IF NOT EXISTS quote_embeddings_vector_idx 
  ON quote_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS form_embeddings_vector_idx 
  ON form_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS knowledge_embeddings_vector_idx 
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Note:** These indexes require at least some data in the tables. Create them after running the population script.

## Step 5: Test Streaming Endpoint

### 5.1 Manual Test

Test the streaming endpoint with curl:

```bash
# Get your auth token first
TOKEN="your_auth_token_here"
CONVERSATION_ID="your_conversation_id"

curl -N -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/chat/conversations/$CONVERSATION_ID/ai-response-stream"
```

You should see SSE events like:
```
data: {"delta": "Hello"}
data: {"delta": " there"}
data: [DONE]
```

### 5.2 Frontend Integration

The streaming API is ready. To integrate into the UI:

1. Import the streaming handler in your chat component
2. Call `chatAPI.streamAIResponse(conversationId)`
3. Use `createTextStream()` to parse the SSE events
4. Update message state as tokens arrive

## Step 6: Test Vector RAG

### 6.1 Verify Vector Search Works

Test that vector search is being used:

1. Send a message in chat that should trigger knowledge base lookup
2. Check backend logs for "Vector search" messages
3. Verify responses are more accurate than before

### 6.2 Monitor Fallback

The system falls back to keyword search if:
- Embeddings don't exist yet
- Embedding generation fails
- Vector search returns no results

Check logs to see which method is being used.

## Troubleshooting

### Embeddings Not Generating

**Issue:** `embed_content` method not found or returns error

**Solution:** 
- Verify `GEMINI_API_KEY` is set
- Check that `google-generativeai` package is installed
- Verify the API key has access to embedding models
- Check Google Cloud Console for API quotas

### Vector Search Returns No Results

**Issue:** RPC functions return empty results

**Possible Causes:**
1. Embeddings haven't been populated yet
2. Functions weren't created in database
3. Embedding format mismatch

**Solution:**
- Run the population script
- Verify functions exist in database
- Check embedding format matches (should be vector(768))

### Streaming Not Working

**Issue:** SSE events not arriving

**Check:**
- Backend is running and accessible
- Authentication token is valid
- Conversation ID exists
- Check browser console for errors
- Verify `eventsource-parser` is installed

## Performance Tips

1. **Batch Embedding Generation**: The population script processes entries one by one. For large datasets, consider batching.

2. **Index Creation**: Create vector indexes after populating data for better search performance.

3. **Embedding Updates**: When content changes, regenerate embeddings:
   ```python
   # Update specific entry
   python scripts/populate_embeddings.py --knowledge-only --limit 1
   ```

4. **Monitoring**: Monitor embedding generation costs. Google's text-embedding-004 is cost-effective but track usage.

## Next Steps

After setup is complete:

1. ✅ Test streaming in production
2. ✅ Monitor RAG quality improvements
3. ✅ Populate embeddings for all data
4. ✅ Create vector indexes
5. ✅ Integrate streaming UI (optional enhancement)
6. ✅ Monitor performance and costs

## Support

If you encounter issues:
1. Check backend logs for errors
2. Verify environment variables are set
3. Test database functions directly in Supabase SQL Editor
4. Check Google Cloud Console for API issues

