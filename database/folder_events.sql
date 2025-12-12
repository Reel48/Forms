-- Folder events (activity feed)
-- Minimal audit/event stream per folder/order.

create table if not exists public.folder_events (
  id uuid primary key,
  folder_id uuid not null references public.folders(id) on delete cascade,
  event_type text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_folder_events_folder_created_at
  on public.folder_events(folder_id, created_at desc);
