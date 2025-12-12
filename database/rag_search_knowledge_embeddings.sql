-- RAG: Full-text search helper for knowledge base retrieval
-- Optional but recommended for higher-quality, bounded context retrieval.
--
-- Applies to: public.knowledge_embeddings
--
-- Usage from backend:
--   supabase.rpc("rag_search_knowledge_embeddings", { query_text, match_limit })

create index if not exists knowledge_embeddings_fts_idx
on public.knowledge_embeddings
using gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(category, ''))
);

create or replace function public.rag_search_knowledge_embeddings(
  query_text text,
  match_limit int default 5
)
returns table (
  id uuid,
  title text,
  content text,
  category text,
  rank real
)
language sql
stable
as $$
  select
    ke.id,
    ke.title,
    ke.content,
    ke.category,
    ts_rank_cd(
      to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '') || ' ' || coalesce(ke.category, '')),
      websearch_to_tsquery('english', query_text)
    )::real as rank
  from public.knowledge_embeddings ke
  where
    to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '') || ' ' || coalesce(ke.category, ''))
    @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit greatest(match_limit, 1);
$$;

-- Grant execute so API roles can call it.
grant execute on function public.rag_search_knowledge_embeddings(text, int) to anon, authenticated, service_role;

