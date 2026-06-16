Patch 12 - Identity Verification Review Workflow

الهدف:
إضافة نظام مراجعة واضح بعد رفع صورة البطاقة الشخصية وجه وظهر.

الملفات المطلوب نسخها مكان القديمة:
1) admin.html
2) api/server.js
3) service-worker.js

مطلوب تشغيل SQL مرة واحدة في Supabase:
SUPABASE-IDENTITY-REVIEW-PATCH-12.sql

الجديد في لوحة الإدارة:
- حالة تحقق لكل صنايعي:
  pending = بانتظار المراجعة
  verified = تم التحقق والاعتماد
  rejected = مرفوض
  needs_data = يحتاج تعديل بيانات
  needs_id_reupload = يحتاج إعادة رفع البطاقة

- زر داخل كارت الصنايعي: مراجعة التحقق
- الإدارة تقدر تكتب سبب مختصر وملاحظة داخلية.
- زر حفظ فقط.
- زر حفظ وفتح واتساب برسالة جاهزة للصنايعي.
- فلاتر جديدة حسب حالة التحقق.

سلوك الاعتماد:
- verified: يجعل approved=true و active=true و identity_verified=true.
- rejected / needs_data / needs_id_reupload / pending: يجعل approved=false و identity_verified=false.
- السيرفر يمنع اعتماد الصنايعي إذا لم تكن صورة البطاقة وجه وظهر مرفوعة.

اختبار سريع:
1) شغل SQL في Supabase.
2) انسخ الملفات.
3) npm start
4) افتح /admin
5) افتح كارت صنايعي جديد واضغط مراجعة التحقق.
6) اختر تم التحقق والاعتماد.
7) تأكد أن الصنايعي أصبح موافق عليه وظاهر للعملاء.

PWA cache version: sanay3i-matrouh-v11
