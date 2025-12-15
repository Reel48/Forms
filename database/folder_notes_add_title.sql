-- Add title to folder notes

alter table public.folder_notes
  add column if not exists title text not null default '';

-- Backfill any existing rows just in case
update public.folder_notes set title = '' where title is null;
