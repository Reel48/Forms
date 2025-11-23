-- Shipments System Migration
-- Creates shipments table and tracking events table for Shippo integration

-- Create shipments table
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  tracking_number VARCHAR(255) NOT NULL,
  carrier VARCHAR(100) NOT NULL, -- e.g., 'usps', 'ups', 'fedex'
  carrier_name VARCHAR(255), -- Human-readable name
  shippo_tracking_id VARCHAR(255), -- Shippo's internal tracking ID
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_transit, delivered, exception, etc.
  status_details TEXT, -- JSON string with detailed status info
  estimated_delivery_date TIMESTAMP WITH TIME ZONE,
  actual_delivery_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(folder_id, tracking_number) -- One tracking number per folder
);

-- Shipment tracking history (for detailed tracking events)
CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_shipments_folder_id ON shipments(folder_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_shipment_id ON shipment_tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_timestamp ON shipment_tracking_events(timestamp DESC);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW
  EXECUTE FUNCTION update_shipments_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tracking_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for shipments table
-- Allow admins to manage all shipments
CREATE POLICY "Admins can manage all shipments" ON shipments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view shipments for their folders
CREATE POLICY "Users can view shipments for their folders" ON shipments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    OR folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
  );

-- Create RLS policies for tracking events
-- Allow admins to manage all tracking events
CREATE POLICY "Admins can manage all tracking events" ON shipment_tracking_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view tracking events for accessible shipments
CREATE POLICY "Users can view tracking events for accessible shipments" ON shipment_tracking_events
  FOR SELECT
  USING (
    shipment_id IN (
      SELECT id FROM shipments
      WHERE folder_id IN (
        SELECT folder_id FROM folder_assignments
        WHERE user_id = auth.uid()
      )
      OR folder_id IN (
        SELECT id FROM folders WHERE created_by = auth.uid()
      )
    )
  );

