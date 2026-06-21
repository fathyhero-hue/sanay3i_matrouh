ADMIN_FULL_WORKER_CONTROL_PATCH_ONLY

الهدف:
إضافة تحكم شامل في كل صنايعي من لوحة الإدارة بدون لمس WhatsApp أو Supabase أو ملفات التوقيع.

التعديلات:
- زر جديد داخل كارت كل صنايعي باسم: تحكم شامل.
- تعديل الاسم، رقم الاتصال، الواتساب، الحرفة، المنطقة، والوصف.
- التحكم في الموافقة/النشاط/التمييز.
- تعديل بداية ونهاية الاشتراك مباشرة.
- تغيير الصورة الشخصية للصنايعي أو حذفها واستخدام الصورة الافتراضية.
- رفع/استبدال صورة وجه وظهر البطاقة من الإدارة.
- رفع صور أعمال جديدة من نفس النافذة.
- عرض صور الأعمال الحالية وحذف أي صورة منها.
- إضافة API route جديد: PUT /api/admin/workers/:id/full-control
- إضافة API route اختياري: PUT /api/admin/workers/:id/profile-photo

الملفات المعدلة:
- api/server.js
- admin.html
- service-worker.js

لم يتم لمس:
- .env
- WhatsApp token
- keystore
- assetlinks.json
- Google Play / TWA

ملاحظات:
- لا يحتاج SQL جديد.
- يعتمد على جداول workers و worker_photos الموجودة بالفعل.
- رفع الصور يستخدم نفس Supabase Storage الموجود في المشروع.
