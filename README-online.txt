تجهيز مشروع صنايعي مطروح للرفع Online
تاريخ التجهيز: 2026-06-04 12:07:13

الملفات داخل هذا التحديث:
- server.js
- package.json
- .gitignore
- README-online.txt

انسخ الملفات داخل:
Desktop\sanay3i_matrouh\backend

مهم:
لا تحذف:
- index.html
- register.html
- worker.html
- admin.html
- style.css
- uploads
- sanaiey.db

بعد النسخ، شغل محليًا للتأكد:
cd %USERPROFILE%\Desktop\sanay3i_matrouh\backend
npm install
npm start

ثم افتح:
http://localhost:3000

ما الذي تغير؟
1) server.js أصبح يدعم بورت الاستضافة:
   const PORT = process.env.PORT || 3000;

2) تمت إضافة package.json:
   لتعرف الاستضافة كيف تشغل المشروع.

3) تمت إضافة .gitignore:
   لمنع رفع ملفات غير مناسبة مثل node_modules وملفات النظام.

ملاحظات مهمة للرفع Online:
- لو الاستضافة لا تحفظ الملفات بعد إعادة التشغيل، ممكن الصور المرفوعة تختفي.
- SQLite مناسب كبداية بسيطة، لكن لاحقًا الأفضل الانتقال إلى PostgreSQL عند التوسع.
- uploads مناسب كبداية، لكن لاحقًا الأفضل استخدام Cloud Storage.
- حماية لوحة الإدارة لازم تتعمل بشكل أقوى قبل الإطلاق الحقيقي للناس.

أوامر مهمة:
تثبيت الحزم:
npm install

تشغيل المشروع:
npm start

تشغيل مباشر:
node server.js
