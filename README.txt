إصلاح أخطاء أيقونات PWABuilder

المشكلة:
PWABuilder يظهر:
- Fix the links to your icons in your web manifest
- Fix the icon types in your web manifest
- Fix shortcut icons
- Fix icon sizes

طريقة الإصلاح:

1) استبدل ملف manifest.json داخل:
Desktop\sanay3i_matrouh\backend

بالملف الموجود هنا.

2) تأكد أن فولدر icons موجود داخل:
Desktop\sanay3i_matrouh\backend\icons

ولازم يكون فيه على الأقل:
icon-192.png
icon-512.png

3) افتح:
Desktop\sanay3i_matrouh\backend\api\server.js

وتحت route favicon.ico أو تحت Routes الملفات الثابتة، أضف الكود الموجود في:
SERVER-ICONS-ROUTE.txt

4) ارفع على GitHub:
cd %USERPROFILE%\Desktop\sanay3i_matrouh\backend
git add manifest.json icons api/server.js
git commit -m "fix pwa icons for pwabuilder"
git push

5) بعد Deploy اختبر:
https://sanay3i-matrouh.vercel.app/icons/icon-192.png
https://sanay3i-matrouh.vercel.app/icons/icon-512.png
https://sanay3i-matrouh.vercel.app/manifest.json

لو الأيقونات فتحت كصور، ارجع PWABuilder واضغط Scan مرة تانية.
