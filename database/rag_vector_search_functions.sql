-- RAG Vector Search Functions
-- These functions enable vector similarity search using pgvector
-- Run this after the ai_embeddings_migration.sql

-- Function to search quote embeddings by vector similarity
-- Accepts embedding as text and casts to vector for Supabase RPC compatibility
CREATE OR REPLACE FUNCTION public.rag_search_quote_embeddings(
  query_embedding_text text,
  match_limit int DEFAULT 5,
  client_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  quote_id uuid,
  content_type varchar,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    qe.id,
    qe.quote_id,
    qe.content_type,
    qe.content,
    qe.metadata,
    1 - (qe.embedding <=> query_embedding_text::vector)::float as similarity
  FROM public.quote_embeddings qe
  WHERE qe.embedding IS NOT NULL
  AND (client_id_filter IS NULL OR qe.quote_id IN (
    SELECT id FROM public.quotes WHERE client_id = client_id_filter
  ))
  ORDER BY qe.embedding <=> query_embedding_text::vector
  LIMIT greatest(match_limit, 1);
$$;

-- Function to search form embeddings by vector similarity
-- Accepts embedding as text and casts to vector for Supabase RPC compatibility
CREATE OR REPLACE FUNCTION public.rag_search_form_embeddings(
  query_embedding_text text,
  match_limit int DEFAULT 5,
  client_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  form_id uuid,
  content_type varchar,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT
    fe.id,
    fe.form_id,
    fe.content_type,
    fe.content,
    fe.metadata,
    1 - (fe.embedding <=> query_embedding_text::vector)::float as similarity
  FROM public.form_embeddings fe
  WHERE fe.embedding IS NOT NULL
  AND (client_id_filter IS NULL OR fe.form_id IN (
    SELECT DISTINCT ffa.form_id
    FROM public.form_folder_assignments ffa
    JOIN public.folders f ON f.id = ffa.folder_id
    WHERE f.client_id = client_id_filter
  ))
  ORDER BY fe.embedding <=> query_embedding_text::vector
  LIMIT greatest(match_limit, 1);
$$;

-- Function to search knowledge embeddings by vector similarity
-- Accepts embedding as text and casts to vector for Supabase RPC compatibility
CREATE OR REPLACE FUNCTION public.rag_search_knowledge_embeddings_vector(
  query_embedding_text text,
  match_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  category varchar,
  title varchar,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    ke.id,
    ke.category,
    ke.title,
    ke.content,
    ke.metadata,
    1 - (ke.embedding <=> query_embedding_text::vector)::float as similarity
  FROM public.knowledge_embeddings ke
  WHERE ke.embedding IS NOT NULL
  ORDER BY ke.embedding <=> query_embedding_text::vector
  LIMIT greatest(match_limit, 1);
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rag_search_quote_embeddings(text, int, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rag_search_form_embeddings(text, int, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rag_search_knowledge_embeddings_vector(text, int) TO anon, authenticated, service_role;

-- Create vector indexes for better performance (run after data is loaded)
-- These should be created after you have some embeddings in the tables
-- CREATE INDEX IF NOT EXISTS quote_embeddings_vector_idx ON quote_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX IF NOT EXISTS form_embeddings_vector_idx ON form_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX IF NOT EXISTS knowledge_embeddings_vector_idx ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

