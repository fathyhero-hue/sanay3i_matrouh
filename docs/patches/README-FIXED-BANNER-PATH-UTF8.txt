FIXED_BANNER_PATH_UTF8_PATCH_ONLY

تم تجهيز هذه النسخة لإصلاح مشكلتين:
1) الحفاظ على ترميز العربي UTF-8 بدون كسر النصوص.
2) جعل صورة بانر مطروح تظهر من مسار ثابت مباشر.

المسار المستخدم داخل index.html:
/matrouh-hero-banner.jpg?v=fixed-visible-banner-20260621

تم وضع نفس الصورة أيضًا في:
- matrouh-hero-banner.jpg
- images/matrouh-hero-banner.jpg
- icons/matrouh-hero-banner.jpg

مهم: لا تعدّل index.html بأوامر PowerShell Get-Content / Set-Content حتى لا يتكسر العربي. لو احتجت تعديل، استخدم VS Code يدويًا واحفظ UTF-8.

الملفات المقصودة في هذا الباتش:
- index.html
- service-worker.js
- matrouh-hero-banner.jpg
- images/matrouh-hero-banner.jpg
- icons/matrouh-hero-banner.jpg
