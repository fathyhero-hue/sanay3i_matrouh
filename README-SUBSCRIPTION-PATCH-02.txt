باتش 02 - تطوير نظام الاشتراكات والدفع | صنايعي مطروح

الملفات المعدلة:
- admin.html
- api/server.js

ملفات مساعدة:
- SUPABASE-SUBSCRIPTION-PAYMENTS.sql
- server.js
- package.json
- vercel.json
- .env.example

ما الجديد؟
1) استبدال أزرار التجديد السريعة بنافذة تجديد منظمة داخل لوحة الإدارة.
2) اختيار الباقة: شهر / نصف سنة / سنة / مخصص.
3) تسجيل عدد الشهور، المبلغ، طريقة الدفع، حالة الدفع، وملاحظات الدفع.
4) تحديث subscription_start و subscription_end في جدول workers.
5) حفظ سجل الدفع في جدول subscription_payments.
6) عرض سجل التجديدات داخل نافذة التجديد لكل صنايعي.
7) إذا لم تنشئ جدول subscription_payments سيظل تجديد الاشتراك يعمل، لكن سيظهر تحذير أن سجل الدفع لم يُحفظ.

خطوات التركيب:
1) انسخ admin.html بدل الملف القديم.
2) انسخ api/server.js بدل الملف القديم داخل فولدر api.
3) شغّل ملف SUPABASE-SUBSCRIPTION-PAYMENTS.sql مرة واحدة من Supabase SQL Editor.
4) شغل المشروع محليًا:
   npm start
5) افتح:
   http://localhost:3000/admin

اختبار سريع:
- افتح لوحة الإدارة.
- عند أي صنايعي اضغط "تجديد الاشتراك".
- اختار الباقة وطريقة الدفع واضغط "حفظ التجديد".
- تأكد أن تاريخ نهاية الاشتراك اتغير.
- افتح نفس النافذة مرة أخرى وتأكد أن سجل التجديد ظهر.

ملاحظات:
- لا ترفع ملف .env الحقيقي على GitHub.
- تأكد أن ADMIN_PASSWORD و ADMIN_SESSION_SECRET موجودين في .env محليًا وفي Vercel Environment Variables.
