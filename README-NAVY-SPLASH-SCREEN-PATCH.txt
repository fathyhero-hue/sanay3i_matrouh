NAVY_SPLASH_SCREEN_PATCH_ONLY

الهدف:
- تغيير خلفية شاشة فتح التطبيق / PWA / TWA من الأبيض إلى كحلي.
- توحيد theme_color و background_color على اللون: #061A3D.
- الحفاظ على باتش V8 الخاص بأزرار كروت الصنايعية وعدم تعديل منطق لوحة الإدارة.

الملفات المعدلة:
- manifest.json
- index.html
- admin.html
- register.html
- worker.html
- offline.html
- privacy-policy.html
- status.html
- admin-add-worker.html
- PWA-HEAD-SNIPPET.txt
- style.css
- service-worker.js

ملاحظات مهمة:
1) بعد رفع التعديلات على Vercel افتح:
   https://sanay3i-matrouh.vercel.app/manifest.json
   وتأكد أن background_color و theme_color = #061A3D.

2) لو التطبيق المثبت من Google Play ظل يعرض شاشة بيضاء، فهذا طبيعي لأن TWA/AAB قد يحتفظ بإعدادات Splash Screen داخل نسخة التطبيق.
   الحل وقتها: إعادة بناء AAB بعد نشر manifest الجديد، ثم رفع تحديث على Google Play.

3) ينصح بحذف التطبيق من الهاتف وإعادة تثبيته أو عمل Clear Storage للتجربة بعد التحديث.
