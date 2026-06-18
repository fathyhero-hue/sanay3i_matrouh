REPORTS FULL UI + PHONE REQUIRED PATCH

This patch combines:
1) Admin reports tab UI in admin.html
2) Worker report modal in worker.html with reporter phone required
3) API routes in api/server.js for creating and managing reports
4) Supabase SQL files for worker_reports table and required phone constraint

Install order:
1. Run SUPABASE-REPORTS-COMPLAINTS-PATCH.sql in Supabase SQL Editor first.
2. If it has already run successfully, skip it.
3. Run SUPABASE-REPORTS-PHONE-REQUIRED-PATCH.sql, or use the combined SQL previously provided.
4. Replace admin.html, worker.html, and api/server.js in the backend project.
5. Restart npm run dev.
6. Open /admin, hard refresh Ctrl+F5, then check the "البلاغات" tab.
