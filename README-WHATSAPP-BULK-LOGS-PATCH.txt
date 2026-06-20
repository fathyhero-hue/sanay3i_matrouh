WHATSAPP BULK SEND & LOGS PATCH

Files:
- admin.html
- api/server.js
- SUPABASE-WHATSAPP-BULK-LOGS-PATCH.sql

What it adds:
1. New admin tab: رسائل واتساب
2. Bulk WhatsApp sending by worker segment/filter
3. WhatsApp message logs UI
4. Server endpoint: POST /api/admin/whatsapp/send-bulk
5. Enhanced logs endpoint with status filters and totals
6. Optional SQL columns for bulk_group_id and bulk_label

Install:
1. Run SUPABASE-WHATSAPP-BULK-LOGS-PATCH.sql in Supabase SQL Editor.
2. Replace admin.html and api/server.js in backend.
3. Restart local server.
4. Test from /admin > رسائل واتساب.

Safety:
- Bulk send is limited to 100 workers per request.
- Each sent/failed message is logged.
- Uses existing whatsapp:send permission.
