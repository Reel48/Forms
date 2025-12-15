-- Notification preferences + SMS fields (clients)
-- Adds phone + preferred notification channel + SMS opt-in/verification fields.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS preferred_notification_channel text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_verified_at timestamptz;

-- Basic validation for preferred channel
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_preferred_notification_channel_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_preferred_notification_channel_check
      CHECK (preferred_notification_channel IN ('email','sms'));
  END IF;
END
$$;

-- Lightweight E.164 validation (allow null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_phone_e164_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_phone_e164_check
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_clients_phone_e164 ON public.clients(phone_e164);

