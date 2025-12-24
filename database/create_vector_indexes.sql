-- Vector Indexes for RAG Performance
-- Run this AFTER populating embeddings (after running populate_embeddings.py)
-- Creating indexes on empty tables can cause issues, so populate data first

-- Index for quote embeddings
CREATE INDEX IF NOT EXISTS quote_embeddings_vector_idx 
  ON quote_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for form embeddings  
CREATE INDEX IF NOT EXISTS form_embeddings_vector_idx 
  ON form_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for knowledge embeddings
CREATE INDEX IF NOT EXISTS knowledge_embeddings_vector_idx 
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('quote_embeddings', 'form_embeddings', 'knowledge_embeddings')
AND indexname LIKE '%vector%'
ORDER BY tablename, indexname;

