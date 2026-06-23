ANALYTICS PATCH
===============

تمت إضافة نظام تحليلات للتطبيق:

1) تتبع ضغطات:
   - اتصال
   - واتساب
   - مشاهدة صفحة الصنايعي

2) API جديد:
   POST /api/analytics/track
   GET  /api/admin/analytics?days=30

3) تاب جديد داخل لوحة الإدارة:
   التحليلات

4) ملف SQL مطلوب تشغيله مرة واحدة في Supabase:
   SUPABASE-ANALYTICS-PATCH.sql

خطوات التركيب:
1) استبدل ملفات الـ Patch.
2) افتح Supabase > SQL Editor.
3) شغّل محتوى ملف:
   SUPABASE-ANALYTICS-PATCH.sql
4) شغل المشروع:
   npm install
   npm run dev
5) اختبر:
   - افتح صفحة صنايعي واضغط اتصال أو واتساب.
   - افتح لوحة الإدارة > التحليلات.

ملاحظة:
لو لم يتم تشغيل SQL، سيعمل التطبيق طبيعيًا لكن تبويب التحليلات سيطلب إنشاء الجدول.
