-- Stripe Integration Migration
-- Add Stripe-related fields to support payment processing

-- Add Stripe fields to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Add Stripe fields to quotes table
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid'; -- unpaid, paid, partially_paid, refunded, failed

-- Create indexes for Stripe fields
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer_id ON clients(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_stripe_invoice_id ON quotes(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_quotes_payment_status ON quotes(payment_status);

