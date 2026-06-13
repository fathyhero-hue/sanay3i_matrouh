Security Patch 01 - Admin Login Protection

Files to replace/add:
1) Add folder: api
2) Put api/server.js inside backend/api/server.js
3) Replace root server.js with the new server.js
4) Replace admin.html with the new admin.html
5) Update .env.example only as reference. Do NOT upload your real .env to GitHub.

Required environment variables on Vercel and local .env:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_BUCKET
- ADMIN_PASSWORD
- ADMIN_SESSION_SECRET
- ADMIN_SESSION_DAYS

What changed:
- Removed exposed ADMIN_PASSWORD from admin.html.
- Login now goes through POST /api/admin/login.
- Admin session is stored in HttpOnly cookie.
- Protected admin APIs and dangerous write/delete APIs.
- Created proper Vercel structure: api/server.js exports the app, root server.js runs it locally.

Local test:
npm install
npm start
open http://localhost:3000/admin

Vercel:
Make sure the same environment variables exist in Project Settings > Environment Variables.
