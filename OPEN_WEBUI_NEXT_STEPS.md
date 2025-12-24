# Open WebUI Integration - Immediate Next Steps

## ✅ Completed

1. **Streaming Implementation**
   - Backend streaming endpoint created
   - Frontend streaming handler created
   - Dependencies installed

2. **RAG with Vector Embeddings**
   - Embeddings service implemented
   - Vector search functions created
   - RAG service upgraded with vector support
   - Population script created

## 🚀 Immediate Actions Required

### 1. Run Database Migration (5 minutes)

**In Supabase SQL Editor:**

1. Enable pgvector (if not already enabled):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. Run the vector search functions:
   - Open `database/rag_vector_search_functions.sql`
   - Copy and paste into Supabase SQL Editor
   - Execute

3. Verify functions were created:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name LIKE 'rag_search%';
   ```

### 2. Populate Embeddings (10-30 minutes depending on data size)

**Run the population script:**

```bash
cd /Users/brayden/Forms/Forms

# Test with knowledge base first (smallest dataset)
python scripts/populate_embeddings.py --knowledge-only --limit 5

# If successful, populate all
python scripts/populate_embeddings.py
```

**Required Environment Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `GEMINI_API_KEY` - Google Gemini API key

**Note:** The script will:
- Skip entries that already have embeddings
- Process entries one by one
- Log progress and errors

### 3. Create Vector Indexes (2 minutes)

**After embeddings are populated, in Supabase SQL Editor:**

```sql
-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS quote_embeddings_vector_idx 
  ON quote_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS form_embeddings_vector_idx 
  ON form_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS knowledge_embeddings_vector_idx 
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 4. Test the Implementation

**Test Streaming:**
```bash
# Get auth token from browser (localStorage.getItem('token'))
# Get conversation ID from chat interface

curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/chat/conversations/CONVERSATION_ID/ai-response-stream"
```

**Test Vector RAG:**
1. Send a message in chat that should use knowledge base
2. Check backend logs for vector search activity
3. Verify responses are more accurate

## 📋 Verification Checklist

- [ ] pgvector extension enabled in Supabase
- [ ] Vector search functions created (3 functions)
- [ ] Embeddings populated for knowledge base
- [ ] Embeddings populated for quotes (if any exist)
- [ ] Embeddings populated for forms (if any exist)
- [ ] Vector indexes created
- [ ] Streaming endpoint tested
- [ ] Vector RAG tested in chat

## 🔧 Troubleshooting

### Embedding Generation Fails

**Check:**
- `GEMINI_API_KEY` is set correctly
- API key has access to embedding models
- `google-generativeai` package is installed
- Check Google Cloud Console for quotas/errors

**Fix:**
```bash
# Reinstall package if needed
pip install google-generativeai --upgrade
```

### Vector Search Returns Empty

**Check:**
- Functions exist in database
- Embeddings were actually created (check with SQL)
- Embedding format is correct (vector(768))

**Verify:**
```sql
-- Check if embeddings exist
SELECT COUNT(*) FROM knowledge_embeddings WHERE embedding IS NOT NULL;

-- Check embedding format
SELECT id, embedding IS NOT NULL as has_embedding 
FROM knowledge_embeddings 
LIMIT 5;
```

### Streaming Not Working

**Check:**
- Backend is running
- Endpoint is accessible
- Authentication token is valid
- Browser console for errors

**Test:**
- Use curl to test endpoint directly
- Check backend logs for errors
- Verify SSE format is correct

## 📊 Expected Results

### After Setup:

1. **RAG Quality:** Vector search should provide more accurate context retrieval
2. **Streaming:** Tokens appear as they're generated (when UI is integrated)
3. **Performance:** Vector indexes improve search speed
4. **Fallback:** Keyword search still works if embeddings unavailable

## 🎯 Success Criteria

- ✅ Vector search functions execute without errors
- ✅ Embeddings are generated for existing data
- ✅ RAG uses vector search when embeddings available
- ✅ Streaming endpoint returns SSE events
- ✅ System falls back gracefully when needed

## 📝 Notes

- **Embedding API:** If `embed_content` doesn't work, we may need to use Google's REST API directly
- **Streaming UI:** Can be integrated incrementally - backend is ready
- **Performance:** Indexes should be created after data population
- **Costs:** Monitor Google API usage for embedding generation

## 🚀 Ready to Deploy

Once setup is complete:
1. Test in development environment
2. Deploy backend changes
3. Deploy frontend changes
4. Monitor for issues
5. Gather user feedback

