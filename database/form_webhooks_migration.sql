-- Form Webhooks Migration
-- Create table for form webhook configurations

CREATE TABLE IF NOT EXISTS form_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  url TEXT NOT NULL, -- Webhook URL to send POST requests to
  secret TEXT, -- Optional secret for webhook signature verification
  events TEXT[] DEFAULT ARRAY['submission.created'], -- Events to trigger webhook: submission.created, submission.updated, submission.deleted
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_form_webhooks_form_id ON form_webhooks(form_id);
CREATE INDEX IF NOT EXISTS idx_form_webhooks_active ON form_webhooks(is_active) WHERE is_active = true;

-- Create table for webhook delivery logs
CREATE TABLE IF NOT EXISTS form_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES form_webhooks(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- submission.created, etc.
  url TEXT NOT NULL,
  payload JSONB NOT NULL, -- The payload that was sent
  response_status INTEGER, -- HTTP response status code
  response_body TEXT, -- Response body from webhook endpoint
  error_message TEXT, -- Error message if delivery failed
  attempts INTEGER DEFAULT 1, -- Number of delivery attempts
  delivered_at TIMESTAMP WITH TIME ZONE, -- When successfully delivered
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON form_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_submission_id ON form_webhook_deliveries(submission_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON form_webhook_deliveries(created_at DESC);

COMMENT ON TABLE form_webhooks IS 'Webhook configurations for forms to send submission events to external URLs';
COMMENT ON TABLE form_webhook_deliveries IS 'Log of webhook delivery attempts for debugging and audit trail';

