-- =========================================================
-- صنايعي مطروح - Reports Phone Required Patch
-- جعل رقم تليفون صاحب البلاغ شرط أساسي
-- =========================================================

alter table if exists worker_reports
  add column if not exists reporter_phone text;

-- حتى لا يفشل التعديل لو فيه بلاغات قديمة بدون رقم
update worker_reports
set reporter_phone = 'بلاغ قديم بدون رقم'
where reporter_phone is null or btrim(reporter_phone) = '';

alter table if exists worker_reports
  alter column reporter_phone set not null;

alter table if exists worker_reports
  drop constraint if exists worker_reports_reporter_phone_required;

alter table if exists worker_reports
  add constraint worker_reports_reporter_phone_required
  check (length(btrim(reporter_phone)) >= 8);
