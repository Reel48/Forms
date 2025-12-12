-- Add order-stage + next-step fields to folders

alter table public.folders
  add column if not exists stage text,
  add column if not exists next_step text,
  add column if not exists next_step_owner text,
  add column if not exists stage_updated_at timestamptz;
