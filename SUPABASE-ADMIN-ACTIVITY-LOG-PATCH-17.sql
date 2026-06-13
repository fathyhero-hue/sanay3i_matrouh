-- Patch 17: Admin Activity Log
-- شغّل الملف مرة واحدة من Supabase SQL Editor

create table if not exists public.admin_activity_log (
  id bigserial primary key,
  action text not null,
  action_label text,
  entity_type text,
  entity_id bigint,
  entity_name text,
  details jsonb default '{}'::jsonb,
  admin_name text default 'الإدارة',
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_activity_log_created_at
  on public.admin_activity_log (created_at desc);

create index if not exists idx_admin_activity_log_action
  on public.admin_activity_log (action);

create index if not exists idx_admin_activity_log_entity
  on public.admin_activity_log (entity_type, entity_id);

comment on table public.admin_activity_log is 'سجل عمليات لوحة إدارة صنايعي مطروح';
comment on column public.admin_activity_log.action is 'كود العملية مثل worker_approve أو subscription_renew';
comment on column public.admin_activity_log.action_label is 'اسم العملية بالعربي للعرض في لوحة الإدارة';
comment on column public.admin_activity_log.entity_type is 'نوع العنصر: worker, review, trades, areas';
comment on column public.admin_activity_log.entity_id is 'رقم العنصر المرتبط بالعملية إن وجد';
comment on column public.admin_activity_log.entity_name is 'اسم العنصر المرتبط بالعملية للعرض السريع';
comment on column public.admin_activity_log.details is 'تفاصيل إضافية بصيغة JSON';
