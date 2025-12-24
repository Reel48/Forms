# Open WebUI Integration - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Database Setup (5 minutes)

**In Supabase SQL Editor:**

```sql
-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Run the vector search functions
-- Copy/paste contents of: database/rag_vector_search_functions.sql
```

### Step 2: Populate Embeddings (10-30 minutes)

```bash
cd /Users/brayden/Forms/Forms
python scripts/populate_embeddings.py
```

**Required:** `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Create Indexes (2 minutes)

**In Supabase SQL Editor (after embeddings are populated):**

```sql
CREATE INDEX IF NOT EXISTS knowledge_embeddings_vector_idx 
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## ✅ That's It!

Your system now has:
- ✅ Vector-based RAG (better search quality)
- ✅ Streaming support (ready for UI integration)
- ✅ Keyword search fallback (always works)

## 📚 Full Documentation

- **Setup Guide**: `OPEN_WEBUI_SETUP_GUIDE.md`
- **Implementation Details**: `OPEN_WEBUI_INTEGRATION_COMPLETE.md`
- **Status**: `OPEN_WEBUI_IMPLEMENTATION_STATUS.md`

## 🧪 Test It

**Test Vector RAG:**
1. Send a message in chat
2. Check backend logs for "vector search" messages
3. Verify responses are more accurate

**Test Streaming:**
```bash
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/chat/conversations/CONVERSATION_ID/ai-response-stream"
```

## 🐛 Troubleshooting

**Embeddings not generating?**
- Check `GEMINI_API_KEY` is set
- Verify API key has embedding access
- Check Google Cloud Console for quotas

**Vector search returns empty?**
- Verify functions exist: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE 'rag_search%';`
- Check embeddings exist: `SELECT COUNT(*) FROM knowledge_embeddings WHERE embedding IS NOT NULL;`

**Need help?** See `OPEN_WEBUI_SETUP_GUIDE.md` for detailed troubleshooting.

