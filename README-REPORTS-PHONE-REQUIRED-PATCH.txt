REPORTS PHONE REQUIRED PATCH

الهدف:
- جعل رقم تليفون صاحب البلاغ شرط أساسي.
- منع إرسال البلاغ من الواجهة بدون رقم صحيح.
- منع API /api/reports من قبول بلاغ بدون رقم.
- جعل reporter_phone غير فارغ في قاعدة البيانات.

الملفات:
- api/server.js
- worker.html
- SUPABASE-REPORTS-PHONE-REQUIRED-PATCH.sql

طريقة التركيب:
1) شغّل ملف SQL في Supabase SQL Editor.
2) استبدل worker.html و api/server.js داخل المشروع.
3) شغّل npm run dev.
4) افتح صفحة أي صنايعي وجرب إرسال بلاغ بدون رقم؛ يجب أن يتم الرفض.
5) جرّب إرسال بلاغ برقم صحيح؛ يجب أن يظهر في تبويب البلاغات داخل الإدارة.

ملاحظة:
هذا الباتش مبني على REPORTS_AND_COMPLAINTS_PATCH.
