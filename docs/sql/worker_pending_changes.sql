-- إشعار مرئي للإدارة عند قيام الصنايعي بتعديل بياناته الأساسية أو صور أعماله بنفسه
alter table workers add column if not exists has_pending_changes boolean default false;
alter table workers add column if not exists pending_changes_summary text;
alter table workers add column if not exists pending_changes_at timestamptz;
