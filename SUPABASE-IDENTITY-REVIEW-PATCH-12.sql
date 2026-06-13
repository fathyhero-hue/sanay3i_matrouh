-- Patch 12: Identity verification review workflow
-- Run once in Supabase SQL Editor after Patch 11.

alter table public.workers
  add column if not exists identity_status text not null default 'pending',
  add column if not exists identity_rejection_reason text,
  add column if not exists identity_reviewed_at timestamptz;

-- Keep old boolean column compatible with the new status workflow.
update public.workers
set identity_status = case
  when identity_verified = true then 'verified'
  when identity_status is null or identity_status = '' then 'pending'
  else identity_status
end;

update public.workers
set identity_status = 'pending'
where identity_status not in ('pending','verified','rejected','needs_data','needs_id_reupload');

-- Add a check constraint safely if it does not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workers_identity_status_check'
  ) then
    alter table public.workers
      add constraint workers_identity_status_check
      check (identity_status in ('pending','verified','rejected','needs_data','needs_id_reupload'));
  end if;
end $$;

create index if not exists workers_identity_status_idx
  on public.workers(identity_status);

create index if not exists workers_identity_reviewed_at_idx
  on public.workers(identity_reviewed_at);
