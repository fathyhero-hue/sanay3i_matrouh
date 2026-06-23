FULL_WIDTH_NO_CROP_MATROUH_BANNER_PATCH_ONLY

التعديل:
- استبدال صورة بانر مطروح بصورة جديدة مصممة كبانر 1920x360.
- الصورة الأصلية تظهر كاملة داخل البانر بدون قص، مع خلفية مموهة من نفس الصورة لملء العرض بشكل احترافي.
- ضبط CSS لاستخدام object-fit: contain على الشاشات الكبيرة، مع cover على الموبايل للحفاظ على شكل البانر وعدم ظهور فراغات ضخمة.
- تحديث service-worker cache version.

الملفات المعدلة:
- index.html
- style.css
- service-worker.js
- images/matrouh-hero-banner.jpg

لم يتم تعديل api/server.js أو admin.html أو WhatsApp أو Supabase أو .env.
