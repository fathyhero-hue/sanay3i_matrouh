Sanay3i Matrouh - Register Steps Hotfix 18.2

سبب المشكلة:
صفحة التسجيل الجديدة بتفحص تكرار الرقم قبل الإرسال من خلال:
/api/workers/check-duplicate
لو ملف api/server.js القديم لا يحتوي هذا الراوت، Express يعامله كأنه ID صنايعي:
/api/workers/:id
فيرجع الخطأ: الصنايعي غير موجود.

الملفات المطلوبة:
1) register.html
2) api/server.js
3) service-worker.js

طريقة التركيب:
- انسخ register.html إلى جذر مشروع backend مكان القديم.
- انسخ api/server.js إلى backend/api/server.js مكان القديم.
- انسخ service-worker.js إلى جذر مشروع backend مكان القديم.
- اقفل السيرفر وشغله من جديد:
  npm start
- افتح صفحة التسجيل واعمل Ctrl + F5.

اختبار سريع:
findstr /n "check-duplicate" api\server.js
لازم يظهر الراوت قبل:
/api/workers/:id

لا يوجد SQL جديد مطلوب.
