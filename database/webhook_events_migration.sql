-- Webhook Events Audit Trail Migration
-- This table stores all Stripe webhook events for audit, debugging, and idempotency

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing_status ON webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_quote_id ON webhook_events(quote_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_invoice_id ON webhook_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your authentication needs)
CREATE POLICY "Allow all operations on webhook_events" ON webhook_events
  FOR ALL USING (true) WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE webhook_events IS 'Stores all Stripe webhook events for audit trail and idempotency checks';

