نسخة Vercel + Supabase - صنايعي مطروح

هذه النسخة تستخدم:
- Supabase PostgreSQL بدل SQLite
- Supabase Storage بدل uploads المحلي
- Vercel لتشغيل الموقع والـ API

مهم:
لا ترفع ملف .env على GitHub.
لا تشارك SUPABASE_SERVICE_ROLE_KEY.

للتشغيل المحلي:
1) انسخ الملفات داخل backend
2) اعمل ملف .env بجانب server.js
3) ضع فيه:
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=uploads

4) شغل:
npm install
npm start

للرفع على Vercel:
1) ارفع هذه الملفات على GitHub
2) Import Project من Vercel
3) أضف Environment Variables الأربعة
4) Deploy
