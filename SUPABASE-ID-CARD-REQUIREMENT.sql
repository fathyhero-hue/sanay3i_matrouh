-- Patch 11: Required ID card images for worker registration
-- Run once in Supabase SQL Editor before deploying the patched api/server.js.

-- 1) Add private verification columns to workers table
alter table public.workers
  add column if not exists id_front_path text,
  add column if not exists id_back_path text,
  add column if not exists id_submitted_at timestamptz,
  add column if not exists identity_verified boolean not null default false,
  add column if not exists identity_review_note text;

create index if not exists workers_identity_verified_idx
  on public.workers(identity_verified);

-- 2) Create private Supabase Storage bucket for identity documents.
-- Keep public = false. These files are accessed only by signed admin URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-docs',
  'identity-docs',
  false,
  6291456,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = 6291456,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'];
