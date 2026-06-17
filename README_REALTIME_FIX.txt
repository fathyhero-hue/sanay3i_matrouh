REALTIME FIX
============

بعد فك الضغط داخل المشروع:

1) افتح CMD داخل مجلد backend
2) نفذ:
   npm install
3) ثم:
   npm run dev

سبب الخطأ السابق:
Cannot find module 'ws'
لأن مكتبة WebSocket لم تكن مضافة في package.json.

تمت إضافة:
- ws
- compression
