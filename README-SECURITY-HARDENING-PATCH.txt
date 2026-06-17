SECURITY HARDENING PATCH - صنايعي مطروح

الملفات داخل الباتش:
- api/server.js
- README-SECURITY-HARDENING-PATCH.txt

ماذا يضيف هذا الباتش؟
1) إخفاء X-Powered-By من Express.
2) إضافة Security Headers:
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - Referrer-Policy
   - Permissions-Policy
3) منع Cache لصفحات/API الإدارة.
4) Rate limit عام لطلبات /api/admin ما عدا login.
5) Brute force protection لتسجيل دخول الإدارة:
   - الافتراضي: 8 محاولات فاشلة
   - قفل مؤقت: 15 دقيقة
   - يمكن ضبطه عبر:
     ADMIN_LOGIN_MAX_ATTEMPTS
     ADMIN_LOGIN_LOCK_MINUTES
6) Rate limit لتتبع analytics حتى لا يتم إغراق جدول التحليلات.
7) تشديد رفع الصور:
   - المسموح فقط JPG / PNG / WEBP
   - فحص MIME + extension
   - فحص أول bytes من الملف للتأكد أن الصورة حقيقية
   - منع أسماء ملفات عشوائية غير آمنة داخل Storage
8) حماية تصدير CSV من CSV formula injection.
9) Error handler واضح لأخطاء رفع الملفات بدل ظهور HTML/500 مبهم.

خطوات التركيب:
1) خذ نسخة احتياطية من api/server.js الحالي.
2) استبدل api/server.js بالملف الموجود في هذا الباتش.
3) شغل محليًا:
   npm run dev
4) اختبر:
   - تسجيل دخول الإدارة
   - إضافة/تعديل صنايعي
   - رفع صورة شخصية وصور أعمال
   - فتح التحليلات
   - تصدير CSV

ملاحظات مهمة:
- لا يوجد SQL مطلوب لهذا الباتش.
- لا تضف متغيرات Vercel جديدة إلا لو عايز تغير الحدود الافتراضية.
- المتغيرات الاختيارية:
  ADMIN_LOGIN_MAX_ATTEMPTS=8
  ADMIN_LOGIN_LOCK_MINUTES=15
  ADMIN_API_RATE_LIMIT=240
  ANALYTICS_RATE_LIMIT=180
