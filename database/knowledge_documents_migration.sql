-- Knowledge Documents Migration
-- Adds table to track source documents for knowledge base
-- Links document chunks to their source files

-- Create knowledge_documents table
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL, -- 'pdf', 'xlsx', 'pptx', 'docx'
  file_size BIGINT,
  storage_path TEXT, -- Path in Supabase Storage (optional, if storing files)
  uploaded_by UUID REFERENCES auth.users(id),
  chunk_count INT DEFAULT 0,
  processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add document_id to knowledge_embeddings for tracking
ALTER TABLE knowledge_embeddings 
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE;

-- Add chunk_index to track order of chunks in document
ALTER TABLE knowledge_embeddings 
ADD COLUMN IF NOT EXISTS chunk_index INT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_document_id 
ON knowledge_embeddings(document_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status 
ON knowledge_documents(processing_status);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_uploaded_by 
ON knowledge_documents(uploaded_by);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_documents_updated_at();

-- Add comments
COMMENT ON TABLE knowledge_documents IS 'Tracks source documents uploaded to knowledge base';
COMMENT ON COLUMN knowledge_embeddings.document_id IS 'Links embedding chunk to source document';
COMMENT ON COLUMN knowledge_embeddings.chunk_index IS 'Order of chunk within source document';

