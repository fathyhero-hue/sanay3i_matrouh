ADMIN_ROLES_AND_ACTIVITY_LOGS_PATCH

الملفات داخل هذا الباتش:
1) api/server.js
2) admin.html
3) index.html
4) worker.html
5) SUPABASE-ADMIN-ROLES-ACTIVITY-PATCH.sql

ماذا يضيف؟
- نظام أدوار داخل لوحة الإدارة:
  super_admin = مدير كامل
  reviewer = موظف مراجعة
  subscription_manager = موظف اشتراكات
  viewer = مشاهد فقط

- تسجيل احترافي للعمليات داخل admin_activity_log:
  مين نفذ العملية
  دوره
  العملية
  العنصر المتأثر
  before_data
  after_data
  الوقت

- شاشة مستخدمين داخل لوحة الإدارة للمدير الكامل.
- توافق رجعي: دخول ADMIN_PASSWORD القديم يعمل كمدير كامل للطوارئ.
- واجهة الإدارة تخفي الأزرار غير المسموحة حسب الصلاحية.
- حماية حقيقية على API endpoints من السيرفر، وليست إخفاء أزرار فقط.

خطوات التركيب:
1) قبل استبدال الملفات، نفّذ:
   git status

2) لو الحالة نظيفة، استبدل الملفات داخل جذر المشروع:
   admin.html
   index.html
   worker.html
   api/server.js

3) افتح Supabase SQL Editor وشغّل:
   SUPABASE-ADMIN-ROLES-ACTIVITY-PATCH.sql

4) شغّل محليًا:
   npm run dev

5) افتح:
   http://localhost:3000/admin

6) ادخل بالطريقة القديمة:
   اترك اسم المستخدم فارغًا
   اكتب ADMIN_PASSWORD

7) من تبويب المستخدمون، أنشئ مستخدمين جدد بأدوار مختلفة.

8) جرّب كل دور من نافذة Incognito:
   - reviewer: يراجع ويوافق فقط
   - subscription_manager: يجدد الاشتراكات فقط
   - viewer: يشاهد فقط

9) بعد الاختبار:
   git add admin.html index.html worker.html api/server.js SUPABASE-ADMIN-ROLES-ACTIVITY-PATCH.sql README-ADMIN-ROLES-ACTIVITY-PATCH.txt
   git commit -m "Add admin roles and activity logging"
   git pull --rebase origin main
   git push origin main

ملاحظة مهمة:
لا تحذف ADMIN_PASSWORD من Vercel الآن. خليه كدخول طوارئ للمدير الكامل.
