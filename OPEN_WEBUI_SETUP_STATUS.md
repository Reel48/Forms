# Open WebUI Setup Status

## ✅ Completed

### 1. Database Migration - DONE ✅

**Status:** Successfully applied via Supabase MCP

**Functions Created:**
- ✅ `rag_search_quote_embeddings()` - Vector search for quotes
- ✅ `rag_search_form_embeddings()` - Vector search for forms  
- ✅ `rag_search_knowledge_embeddings_vector()` - Vector search for knowledge base

**Verification:**
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'rag_search%';
-- Returns all 3 functions ✅
```

**pgvector Extension:**
- ✅ Already enabled (version 0.8.0)

## ⏳ Pending Actions

### 2. Populate Embeddings - REQUIRES MANUAL SETUP

**Status:** Script ready, but needs environment variables

**Current Data:**
- 31 knowledge_embeddings entries (0 with embeddings)
- 4 quotes (0 embeddings created yet)
- 2 published forms (0 embeddings created yet)

**To Run:**
```bash
cd /Users/brayden/Forms/Forms

# Set environment variables first:
export GEMINI_API_KEY="your_key_here"
export SUPABASE_URL="your_url_here"
export SUPABASE_SERVICE_ROLE_KEY="your_key_here"

# Then run:
python scripts/populate_embeddings.py
```

**Options:**
- `--knowledge-only` - Only populate knowledge base
- `--quotes-only` - Only populate quotes
- `--forms-only` - Only populate forms
- `--limit N` - Limit to N entries (for testing)

**Note:** The script has been fixed to import from the correct backend path.

### 3. Create Vector Indexes - READY TO RUN

**Status:** SQL prepared, ready to run after embeddings are populated

**Why After?** Indexes work best when created after data exists. Creating them on empty tables can cause issues.

**To Run (after embeddings are populated):**

```sql
-- Run in Supabase SQL Editor after populate_embeddings.py completes

CREATE INDEX IF NOT EXISTS quote_embeddings_vector_idx 
  ON quote_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS form_embeddings_vector_idx 
  ON form_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS knowledge_embeddings_vector_idx 
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Or I can run these via MCP after you populate embeddings!**

## 📋 Next Steps

1. ✅ **Database Migration** - DONE
2. ⏳ **Populate Embeddings** - Run manually with env vars
3. ⏳ **Create Indexes** - I can run via MCP after step 2

## 🔍 Verification Queries

**Check embedding status:**
```sql
SELECT 
  'knowledge_embeddings' as table_name,
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings
FROM knowledge_embeddings;
```

**Test vector search:**
```sql
-- After embeddings are populated, test with a sample query
SELECT * FROM rag_search_knowledge_embeddings_vector(
  '[0.1,0.2,0.3,...]'::text,  -- Sample embedding (768 dimensions)
  5
);
```

## 🎯 Summary

- ✅ **Migration:** Complete and verified
- ⏳ **Embeddings:** Ready to run (needs env vars)
- ⏳ **Indexes:** Ready to create (after embeddings)

**I can create the indexes for you once embeddings are populated!** Just let me know when step 2 is complete.

