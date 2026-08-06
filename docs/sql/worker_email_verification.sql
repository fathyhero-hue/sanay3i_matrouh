-- =========================================================
-- صنايعي مطروح - البريد الإلكتروني وتوثيق الهوية بالإيميل
-- شغّله مرة واحدة في Supabase Dashboard -> SQL Editor.
-- الأوامر كلها idempotent (آمنة تتشغل أكتر من مرة من غير أي ضرر).
-- =========================================================

-- البريد الإلكتروني + unique constraint (case-insensitive، يسمح بـ NULL للصفوف القديمة)
alter table workers add column if not exists email text;
create unique index if not exists workers_email_unique_idx
  on workers (lower(email)) where email is not null and email <> '';

-- أعمدة مراجعة الهوية (identity review) - آمنة حتى لو بعضها موجود جزئيًا بالفعل
alter table workers add column if not exists identity_status text default 'pending';
alter table workers add column if not exists identity_rejection_reason text;
alter table workers add column if not exists identity_review_note text;

-- توكن إعادة تعيين كلمة المرور بالإيميل
alter table workers add column if not exists password_reset_token_hash text;
alter table workers add column if not exists password_reset_expires_at timestamptz;
create index if not exists workers_password_reset_token_hash_idx
  on workers (password_reset_token_hash) where password_reset_token_hash is not null;

-- =========================================================
-- Backfill حرج: لازم يتشغل قبل نشر أي كود بيفلتر identity_status='verified'
-- في الـ API العام، وإلا الصنايعية المعتمدين حاليًا (approved=true) هيختفوا
-- فورًا من نتائج البحث العامة على الموقع.
-- =========================================================
update workers set identity_status = 'verified'
  where identity_verified is true and (identity_status is null or identity_status = '');
update workers set identity_status = 'pending'
  where (identity_status is null or identity_status = '') and identity_verified is not true;
