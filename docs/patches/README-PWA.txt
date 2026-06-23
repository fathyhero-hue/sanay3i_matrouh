تحديث PWA لتطبيق صنايعي مطروح

انسخ كل الملفات والفولدرات داخل:
Desktop\sanay3i_matrouh\backend

اختبر:
http://localhost:3000/manifest.json
http://localhost:3000/service-worker.js
http://localhost:3000/privacy-policy.html

ثم ارفع على GitHub:
git add -A
git commit -m "add pwa files"
git push

بعد Deploy على Vercel افتح PWABuilder:
https://www.pwabuilder.com/

واكتب:
https://sanay3i-matrouh.vercel.app

Privacy Policy URL:
https://sanay3i-matrouh.vercel.app/privacy-policy.html
