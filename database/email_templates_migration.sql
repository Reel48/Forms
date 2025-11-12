-- Email Templates Migration
-- Create table for custom email templates

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- Template name (e.g., "Form Submission Notification")
  template_type VARCHAR(50) NOT NULL, -- form_submission_admin, form_submission_user, password_reset, etc.
  subject TEXT NOT NULL, -- Email subject line (supports variables like {{form_name}})
  html_body TEXT NOT NULL, -- HTML email body (supports variables)
  text_body TEXT, -- Plain text email body (optional, auto-generated if not provided)
  variables JSONB DEFAULT '{}'::jsonb, -- Available variables and their descriptions
  is_default BOOLEAN DEFAULT false, -- Whether this is the default template for this type
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_default ON email_templates(template_type, is_default) WHERE is_default = true;

COMMENT ON TABLE email_templates IS 'Custom email templates for various notification types';
COMMENT ON COLUMN email_templates.template_type IS 'Type of template: form_submission_admin, form_submission_user, password_reset, etc.';
COMMENT ON COLUMN email_templates.variables IS 'JSON object describing available variables for this template (e.g., {"form_name": "The name of the form", "submission_id": "The submission ID"})';

