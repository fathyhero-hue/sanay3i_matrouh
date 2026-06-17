-- Admin Roles + Professional Activity Log Patch
-- شغّل الملف مرة واحدة داخل Supabase SQL Editor قبل رفع كود الصلاحيات.

create table if not exists public.admin_users (
  id bigserial primary key,
  username text not null unique,
  display_name text not null,
  role text not null default 'viewer' check (role in ('super_admin','reviewer','subscription_manager','viewer')),
  password_salt text not null,
  password_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_users_username on public.admin_users (username);
create index if not exists idx_admin_users_role on public.admin_users (role);
create index if not exists idx_admin_users_active on public.admin_users (active);

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

alter table public.admin_activity_log
  add column if not exists admin_id bigint,
  add column if not exists admin_username text,
  add column if not exists admin_role text,
  add column if not exists before_data jsonb default '{}'::jsonb,
  add column if not exists after_data jsonb default '{}'::jsonb;

create index if not exists idx_admin_activity_log_created_at on public.admin_activity_log (created_at desc);
create index if not exists idx_admin_activity_log_action on public.admin_activity_log (action);
create index if not exists idx_admin_activity_log_entity on public.admin_activity_log (entity_type, entity_id);
create index if not exists idx_admin_activity_log_admin_username on public.admin_activity_log (admin_username);
create index if not exists idx_admin_activity_log_admin_role on public.admin_activity_log (admin_role);

comment on table public.admin_users is 'مستخدمي لوحة إدارة صنايعي مطروح مع الأدوار والصلاحيات';
comment on table public.admin_activity_log is 'سجل عمليات لوحة إدارة صنايعي مطروح';
comment on column public.admin_activity_log.before_data is 'القيم قبل التعديل بصيغة JSON';
comment on column public.admin_activity_log.after_data is 'القيم بعد التعديل بصيغة JSON';
comment on column public.admin_activity_log.admin_username is 'اسم مستخدم الإدارة الذي نفذ العملية';
comment on column public.admin_activity_log.admin_role is 'دور مستخدم الإدارة وقت تنفيذ العملية';
