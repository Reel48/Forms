-- AI Embeddings Migration
-- This migration sets up vector embeddings for RAG (Retrieval-Augmented Generation)
-- Requires pgvector extension in Supabase

-- Enable pgvector extension (run this first in Supabase SQL Editor if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table for quotes and products
CREATE TABLE IF NOT EXISTS quote_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- 'quote', 'line_item', 'template'
  content TEXT NOT NULL, -- The text content to embed (quote title, line item description, etc.)
  embedding vector(768), -- Gemini embedding dimension (using text-embedding-004 model)
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional context (price, quantity, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create embeddings table for forms
CREATE TABLE IF NOT EXISTS form_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- 'form', 'field', 'description'
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create embeddings table for general knowledge (FAQs, company info, etc.)
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL, -- 'faq', 'company_info', 'pricing', 'services'
  title VARCHAR(255),
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for similarity search (using ivfflat for better performance)
-- Note: ivfflat requires at least some data, so we'll create it after initial data load
-- For now, create basic indexes
CREATE INDEX IF NOT EXISTS idx_quote_embeddings_quote_id ON quote_embeddings(quote_id);
CREATE INDEX IF NOT EXISTS idx_form_embeddings_form_id ON form_embeddings(form_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_category ON knowledge_embeddings(category);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_quote_embeddings_updated_at
  BEFORE UPDATE ON quote_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_embeddings_updated_at();

CREATE TRIGGER update_form_embeddings_updated_at
  BEFORE UPDATE ON form_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_embeddings_updated_at();

CREATE TRIGGER update_knowledge_embeddings_updated_at
  BEFORE UPDATE ON knowledge_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_embeddings_updated_at();

-- Add comments
COMMENT ON TABLE quote_embeddings IS 'Vector embeddings for quotes and line items for AI RAG';
COMMENT ON TABLE form_embeddings IS 'Vector embeddings for forms and form fields for AI RAG';
COMMENT ON TABLE knowledge_embeddings IS 'Vector embeddings for general knowledge base (FAQs, company info)';

