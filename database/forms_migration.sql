-- Forms System Database Migration
-- Run this SQL in your Supabase SQL Editor

-- Create forms table
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft', -- draft, published, archived
  public_url_slug VARCHAR(100) UNIQUE, -- For public form access
  theme JSONB DEFAULT '{}'::jsonb, -- Color scheme, fonts, logo, etc.
  settings JSONB DEFAULT '{}'::jsonb, -- Progress bar, randomize questions, etc.
  welcome_screen JSONB DEFAULT '{}'::jsonb, -- Title, description, button text
  thank_you_screen JSONB DEFAULT '{}'::jsonb, -- Title, description, redirect URL
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create form_fields table
CREATE TABLE IF NOT EXISTS form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  field_type VARCHAR(50) NOT NULL, -- text, email, number, dropdown, etc.
  label TEXT NOT NULL,
  description TEXT,
  placeholder TEXT,
  required BOOLEAN DEFAULT false,
  validation_rules JSONB DEFAULT '{}'::jsonb, -- min/max length, pattern, etc.
  options JSONB DEFAULT '[]'::jsonb, -- For dropdown, multiple choice, etc.
  order_index INTEGER NOT NULL DEFAULT 0, -- Display order
  conditional_logic JSONB DEFAULT '{}'::jsonb, -- Show/hide based on other fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create form_submissions table
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  submitter_email VARCHAR(255),
  submitter_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_spent_seconds INTEGER,
  status VARCHAR(20) DEFAULT 'completed' -- completed, abandoned
);

-- Create form_submission_answers table
CREATE TABLE IF NOT EXISTS form_submission_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  answer_text TEXT,
  answer_value JSONB DEFAULT '{}'::jsonb, -- For complex answers (file URLs, multiple selections, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_forms_status ON forms(status);
CREATE INDEX IF NOT EXISTS idx_forms_public_url_slug ON forms(public_url_slug);
CREATE INDEX IF NOT EXISTS idx_forms_created_at ON forms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_order ON form_fields(form_id, order_index);
CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON form_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_answers_submission_id ON form_submission_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_field_id ON form_submission_answers(field_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at for forms
CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW
  EXECUTE FUNCTION update_forms_updated_at();

-- Function to generate unique public URL slug
CREATE OR REPLACE FUNCTION generate_form_slug()
RETURNS TEXT AS $$
DECLARE
  slug TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    -- Generate a random slug
    slug := 'form-' || lower(substring(md5(random()::text) from 1 for 8));
    
    -- Check if it exists
    SELECT EXISTS(SELECT 1 FROM forms WHERE public_url_slug = slug) INTO exists_check;
    
    -- If it doesn't exist, return it
    IF NOT exists_check THEN
      RETURN slug;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS)
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submission_answers ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your authentication needs)
-- For now, allowing all operations for development
-- In production, you should add proper authentication and user-based policies

CREATE POLICY "Allow all operations on forms" ON forms
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on form_fields" ON form_fields
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on form_submissions" ON form_submissions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on form_submission_answers" ON form_submission_answers
  FOR ALL USING (true) WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE forms IS 'Main forms table storing form definitions and settings';
COMMENT ON TABLE form_fields IS 'Individual fields within a form';
COMMENT ON TABLE form_submissions IS 'Form submission records';
COMMENT ON TABLE form_submission_answers IS 'Individual answers within a submission';

COMMENT ON COLUMN forms.public_url_slug IS 'Unique slug for public form access (e.g., forms.app/your-slug)';
COMMENT ON COLUMN forms.theme IS 'JSON object containing color scheme, fonts, logo URL, etc.';
COMMENT ON COLUMN forms.settings IS 'JSON object containing form settings (progress bar, randomize, etc.)';
COMMENT ON COLUMN form_fields.field_type IS 'Type of field: text, email, number, dropdown, multiple_choice, checkbox, etc.';
COMMENT ON COLUMN form_fields.validation_rules IS 'JSON object with validation rules (min, max, pattern, etc.)';
COMMENT ON COLUMN form_fields.options IS 'JSON array of options for choice-based fields';
COMMENT ON COLUMN form_fields.conditional_logic IS 'JSON object defining when to show/hide this field based on other field answers';

