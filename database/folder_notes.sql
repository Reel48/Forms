-- Folder notes (admin-authored updates) + per-user read receipts

create table if not exists public.folder_notes (
  id uuid primary key,
  folder_id uuid not null references public.folders(id) on delete cascade,
  body text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_folder_notes_folder_created_at
  on public.folder_notes(folder_id, created_at desc);

create table if not exists public.folder_note_reads (
  note_id uuid not null references public.folder_notes(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists idx_folder_note_reads_user_read_at
  on public.folder_note_reads(user_id, read_at desc);
