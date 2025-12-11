-- Cal.com Meetings Migration
-- Creates tables for storing Cal.com booking information

-- Cal.com bookings table
CREATE TABLE IF NOT EXISTS calcom_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL UNIQUE, -- Cal.com booking ID
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  event_type TEXT, -- Event type name from Cal.com
  event_type_id TEXT, -- Event type ID from Cal.com
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone TEXT DEFAULT 'America/New_York',
  meeting_url TEXT, -- Google Meet link or other meeting URL
  status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, cancelled, rescheduled
  notes TEXT, -- Additional notes from customer
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calcom_bookings_customer_id ON calcom_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_calcom_bookings_booking_id ON calcom_bookings(booking_id);
CREATE INDEX IF NOT EXISTS idx_calcom_bookings_start_time ON calcom_bookings(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_calcom_bookings_status ON calcom_bookings(status);
CREATE INDEX IF NOT EXISTS idx_calcom_bookings_customer_email ON calcom_bookings(customer_email);

-- Enable Row Level Security (RLS)
ALTER TABLE calcom_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calcom_bookings
-- Customers can view their own bookings
DROP POLICY IF EXISTS "Customers can view their own bookings" ON calcom_bookings;
CREATE POLICY "Customers can view their own bookings"
  ON calcom_bookings FOR SELECT
  USING (auth.uid() = customer_id);

-- Admins can view all bookings
DROP POLICY IF EXISTS "Admins can view all bookings" ON calcom_bookings;
CREATE POLICY "Admins can view all bookings"
  ON calcom_bookings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Customers can create their own bookings
DROP POLICY IF EXISTS "Customers can create their own bookings" ON calcom_bookings;
CREATE POLICY "Customers can create their own bookings"
  ON calcom_bookings FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Customers can update their own bookings (for cancellation)
DROP POLICY IF EXISTS "Customers can update their own bookings" ON calcom_bookings;
CREATE POLICY "Customers can update their own bookings"
  ON calcom_bookings FOR UPDATE
  USING (auth.uid() = customer_id);

-- Admins can update all bookings
DROP POLICY IF EXISTS "Admins can update all bookings" ON calcom_bookings;
CREATE POLICY "Admins can update all bookings"
  ON calcom_bookings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calcom_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_calcom_bookings_updated_at ON calcom_bookings;
CREATE TRIGGER trigger_update_calcom_bookings_updated_at
  BEFORE UPDATE ON calcom_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_calcom_bookings_updated_at();

-- Enable Realtime for bookings table (optional, for live updates)
-- ALTER PUBLICATION supabase_realtime ADD TABLE calcom_bookings;

