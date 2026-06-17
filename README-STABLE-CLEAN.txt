SANAY3I MATROUH - STABLE CLEAN BUILD
===================================

تم تجهيز نسخة مستقرة للتطوير التالي.

أهم الإصلاحات:
1) تثبيت مسار صفحة إضافة صنايعي:
   /admin/add-worker

2) إصلاح مسارات CSS/Manifest/Scripts لتعمل على الروابط الداخلية مثل:
   /trade/كهربائي
   /area/مرسى مطروح
   /admin/add-worker

3) إضافة endpoint سريع وآمن للعدادات:
   /api/stats-stable

4) جعل WebSocket optional حتى لا ينهار السيرفر إذا لم تكن مكتبة ws متاحة أو على بيئة لا تدعمه.

تشغيل محلي:
cd backend
npm install
npm run dev

اختبار:
http://localhost:3000/admin
http://localhost:3000/admin/add-worker
http://localhost:3000/trade/كهربائي
