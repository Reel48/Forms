-- E-Signature System Database Migration
-- Run this SQL in your Supabase SQL Editor

-- Create esignature_documents table
CREATE TABLE IF NOT EXISTS esignature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  document_type VARCHAR(50) DEFAULT 'terms_of_service', -- terms_of_service, contract, agreement, custom
  
  -- Signature mode
  signature_mode VARCHAR(20) DEFAULT 'simple', -- simple, advanced
  require_signature BOOLEAN DEFAULT true,
  
  -- Advanced mode: signature field definitions
  signature_fields JSONB DEFAULT '[]'::jsonb, -- Array of signature field positions/definitions
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, signed, declined, expired
  signed_by UUID REFERENCES auth.users(id),
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_ip_address VARCHAR(45),
  signature_method VARCHAR(20), -- draw, type, upload
  
  -- Relationships (folder_id will be added when folders table exists)
  folder_id UUID, -- Will add foreign key when folders table is created
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE -- Optional expiration
);

-- Create esignature_document_folder_assignments table (many-to-many relationship)
-- Will add foreign key to folders when folders table exists
CREATE TABLE IF NOT EXISTS esignature_document_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES esignature_documents(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL, -- Will add foreign key when folders table is created
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'pending', -- Status per folder assignment
  signed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(document_id, folder_id)
);

-- Create esignature_signatures table (stores actual signature data)
CREATE TABLE IF NOT EXISTS esignature_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES esignature_documents(id) ON DELETE CASCADE,
  folder_id UUID, -- Will add foreign key when folders table is created
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Signature data
  signature_data TEXT NOT NULL, -- Base64 encoded signature image or text
  signature_type VARCHAR(20) NOT NULL, -- draw, type, upload
  signature_position JSONB, -- Position on document (x, y, page) - for advanced mode
  field_id VARCHAR(50), -- For advanced mode: which signature field
  
  -- Metadata
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Signed document
  signed_file_id UUID REFERENCES files(id), -- Reference to signed PDF
  signed_file_url TEXT -- URL to signed PDF
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_esignature_documents_file_id ON esignature_documents(file_id);
CREATE INDEX IF NOT EXISTS idx_esignature_documents_folder_id ON esignature_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_esignature_documents_quote_id ON esignature_documents(quote_id);
CREATE INDEX IF NOT EXISTS idx_esignature_documents_status ON esignature_documents(status);
CREATE INDEX IF NOT EXISTS idx_esignature_documents_signed_by ON esignature_documents(signed_by);
CREATE INDEX IF NOT EXISTS idx_esignature_documents_signature_mode ON esignature_documents(signature_mode);
CREATE INDEX IF NOT EXISTS idx_esignature_signatures_document_id ON esignature_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_esignature_signatures_user_id ON esignature_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_esignature_signatures_folder_id ON esignature_signatures(folder_id);
CREATE INDEX IF NOT EXISTS idx_esignature_document_folder_assignments_document_id ON esignature_document_folder_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_esignature_document_folder_assignments_folder_id ON esignature_document_folder_assignments(folder_id);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_esignature_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_esignature_documents_updated_at
  BEFORE UPDATE ON esignature_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_esignature_documents_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE esignature_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE esignature_document_folder_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE esignature_signatures ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for esignature_documents table
-- Allow admins to do everything
CREATE POLICY "Admins can manage all esignature documents" ON esignature_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view documents they created (folder policies will be added when folders are implemented)
CREATE POLICY "Users can view their own esignature documents" ON esignature_documents
  FOR SELECT
  USING (created_by = auth.uid());

-- Allow users to create documents (they become the owner)
CREATE POLICY "Users can create esignature documents" ON esignature_documents
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Allow users to update documents they created
CREATE POLICY "Users can update their own esignature documents" ON esignature_documents
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Allow users to delete documents they created
CREATE POLICY "Users can delete their own esignature documents" ON esignature_documents
  FOR DELETE
  USING (created_by = auth.uid());

-- Create RLS policies for esignature_document_folder_assignments table
-- Allow admins to manage all assignments
CREATE POLICY "Admins can manage all esignature document folder assignments" ON esignature_document_folder_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view assignments for documents they created (folder policies will be added when folders are implemented)
CREATE POLICY "Users can view esignature document folder assignments for their documents" ON esignature_document_folder_assignments
  FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM esignature_documents WHERE created_by = auth.uid()
    )
  );

-- Create RLS policies for esignature_signatures table
-- Allow admins to view all signatures
CREATE POLICY "Admins can view all esignature signatures" ON esignature_signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view their own signatures
CREATE POLICY "Users can view their own esignature signatures" ON esignature_signatures
  FOR SELECT
  USING (user_id = auth.uid());

-- Allow users to create signatures (they sign documents)
CREATE POLICY "Users can create esignature signatures" ON esignature_signatures
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

