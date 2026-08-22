-- ⚠️ تحديث لاحق: الجدول ده اتنفّذ فعليًا على قاعدة البيانات، لكن نظام تفعيل
-- الصنايعية القدامى اتغيّر بعدها ليعتمد على تعيين كلمة مرور مباشرة (بدون
-- OTP/SMS/WhatsApp خالص - راجع docs/sql وتقرير المهمة اللي بعد دي). الجدول
-- ده بقى غير مستخدم من أي كود في المشروع حاليًا، لكن ماتمّش حذفه أو حذف الصف
-- من قاعدة الإنتاج تلقائيًا (فقط توضيح، مفيش أي DROP هنا ولا في أي مكان تاني).
-- سيبناه كسجل تاريخي - ممكن يتحذف يدويًا لاحقًا لو حد قرر كده بوضوح.
--
-- شغّل الملف ده مرة واحدة على Supabase (أو عبر node scripts/run-migration.js
-- docs/sql/worker_activation_otp.sql) - جدول جديد بالكامل، بدون أي تعديل على
-- workers أو أي جدول قائم. لا يُنفَّذ تلقائيًا - ينفَّذ فقط بعد توضيح صريح.
--
-- الهدف: تفعيل حسابات الصنايعية القديمة (اللي اتسجلت قبل وجود لوحة التحكم
-- ومعندهاش password_hash خالص) عن طريق كود تحقق (OTP) مرسل لنفس رقم هاتفهم
-- المسجّل، بدل السماح بتعيين كلمة مرور بمجرد معرفة الرقم فقط.
--
-- الكود بيتخزن مُجزّأ (hash) بنفس أسلوب PBKDF2-SHA256 المستخدم فعليًا لكل
-- كلمات مرور الصنايعية/الإدارة في المشروع (salt عشوائي لكل صف) - مش نص صريح
-- أبدًا، ومش نفس أسلوب hashToken البسيط (SHA-256 من غير salt) المستخدم لتوكنات
-- استرجاع كلمة المرور، لأن ده مناسب بس للتوكنات الطويلة عشوائية الإنتروبيا
-- العالية (32 بايت) - مش لكود مكوّن من 6 أرقام بس (إنتروبيا منخفضة، سهل عمل
-- rainbow table له من غير salt/تبطيء).

create table if not exists worker_activation_otps (
  id bigint generated always as identity primary key,
  worker_id bigint not null references workers(id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  otp_salt text not null,
  attempts int not null default 0,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists worker_activation_otps_worker_id_idx on worker_activation_otps(worker_id);
create index if not exists worker_activation_otps_phone_idx on worker_activation_otps(phone);
