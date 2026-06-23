CUSTOMER_SUPPORT_FLOATING_CHAT_PATCH_ONLY

ما الذي تم إضافته:
- أيقونة عائمة لخدمة العملاء في الصفحات العامة.
- نافذة سفلية فيها:
  - مكالمة هاتفية مباشرة.
  - تحدث إلى ممثلي خدمة العملاء.
- المستخدم يكتب رقم هاتفه ويبدأ محادثة داخل التطبيق مع الإدارة.
- تبويب جديد في لوحة الإدارة باسم "خدمة العملاء" لعرض المحادثات والرد عليها.
- المحادثة تتحدث تلقائيًا للمستخدم والإدارة.

مهم قبل الاستخدام:
1) شغل ملف SQL التالي في Supabase:
   SUPABASE-CUSTOMER-SUPPORT-CHAT-PATCH.sql

2) رقم خدمة العملاء مضبوط داخل الواجهة على:
   +201222264993
   لتغييره ابحث في صفحات HTML عن:
   CUSTOMER_SUPPORT_PHONE

3) الملفات المعدلة:
   api/server.js
   admin.html
   index.html
   worker.html
   status.html
   register.html
   style.css
   service-worker.js
   SUPABASE-CUSTOMER-SUPPORT-CHAT-PATCH.sql

4) بعد الرفع اعمل Ctrl + F5.
