-- =========================================================
-- صنايعي مطروح - Reports & Complaints Patch
-- جدول بلاغات وشكاوى الصنايعية
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists worker_reports (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  report_type text not null default 'other' check (report_type in ('wrong_phone','wrong_data','bad_service','inappropriate_photos','other')),
  reporter_name text,
  reporter_phone text,
  message text not null,
  status text not null default 'new' check (status in ('new','reviewing','resolved','rejected')),
  admin_note text,
  page_path text,
  user_agent text,
  ip_hash text,
  worker_snapshot jsonb default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_reports_worker_id on worker_reports(worker_id);
create index if not exists idx_worker_reports_status on worker_reports(status);
create index if not exists idx_worker_reports_created_at on worker_reports(created_at desc);

create or replace function set_worker_reports_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_worker_reports_updated_at on worker_reports;
create trigger trg_worker_reports_updated_at
before update on worker_reports
for each row execute function set_worker_reports_updated_at();
