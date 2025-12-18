-- Add delivery_timing column to forms table
-- This migration adds the delivery_timing field to categorize forms as "Before Delivery" or "After Delivery"

ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS delivery_timing VARCHAR(20) DEFAULT 'before_delivery';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_forms_delivery_timing ON forms(delivery_timing);

-- Update existing forms to default to 'before_delivery' if NULL
UPDATE forms SET delivery_timing = 'before_delivery' WHERE delivery_timing IS NULL;

-- Add constraint to ensure valid values
ALTER TABLE forms 
  ADD CONSTRAINT check_delivery_timing 
  CHECK (delivery_timing IN ('before_delivery', 'after_delivery'));

-- Add comment for documentation
COMMENT ON COLUMN forms.delivery_timing IS 'When the form should be completed: before_delivery (design forms, etc.) or after_delivery (satisfaction surveys, etc.)';

