Patch 11 - إلزام الصنايعي برفع صورة البطاقة الشخصية وجه وظهر

الفكرة:
- صفحة تسجيل الصنايعي لن تُرسل الطلب إلا بعد رفع صورة وجه البطاقة وصورة ظهر البطاقة.
- صور البطاقة لا تظهر للعملاء في الصفحة الرئيسية أو صفحة تفاصيل الصنايعي.
- صور البطاقة تظهر للإدارة فقط من لوحة التحكم من خلال رابط مؤقت Signed URL صالح لمدة 5 دقائق.

الملفات المعدلة:
- register.html
- admin.html
- api/server.js
- privacy-policy.html
- service-worker.js
- .env.example
- SUPABASE-ID-CARD-REQUIREMENT.sql

خطوات التركيب:
1) افتح Supabase > SQL Editor > New Query.
2) شغّل ملف:
   SUPABASE-ID-CARD-REQUIREMENT.sql

هذا الملف يعمل الآتي:
- يضيف أعمدة البطاقة داخل جدول workers.
- ينشئ Bucket خاص باسم identity-docs ويجعله Private.

3) في Vercel Environment Variables أو ملف .env المحلي أضف:
   SUPABASE_ID_BUCKET=identity-docs

4) انسخ الملفات التالية مكان القديمة:
   register.html
   admin.html
   api/server.js
   privacy-policy.html
   service-worker.js

5) شغل محليًا:
   npm start

6) اختبر:
   - افتح /register.
   - جرب إرسال الطلب بدون البطاقة: يجب أن يظهر خطأ.
   - ارفع وجه وظهر البطاقة ثم أرسل الطلب.
   - افتح /admin.
   - في كارت الصنايعي ستجد قسم: مستندات التحقق.
   - اضغط عرض وجه البطاقة أو عرض ظهر البطاقة.

ملاحظات خصوصية مهمة:
- لا تجعل Bucket identity-docs عامًا.
- لا تستخدم bucket uploads العام لصور البطاقة.
- لا تنشر روابط Signed URL؛ الرابط مؤقت لكنه مخصص لمراجعة الإدارة فقط.
- تم تعديل public API بحيث لا يرجع id_front_path أو id_back_path للعملاء.
