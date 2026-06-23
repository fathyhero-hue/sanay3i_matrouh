WhatsApp Cloud API Patch - Sanay3i Matrouh
===========================================

Files:
- api/server.js
- admin.html
- SUPABASE-WHATSAPP-CLOUD-API-PATCH.sql

What it adds:
- Admin endpoint to send WhatsApp messages automatically via Meta Cloud API.
- Admin modal button: إرسال تلقائي.
- Manual WhatsApp fallback remains available.
- WhatsApp message logs in Supabase.
- Activity log entry for every send action.

Required environment variables in local .env and Vercel:

WHATSAPP_ENABLED=true
WHATSAPP_ACCESS_TOKEN=YOUR_META_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID=1170600799473381
WHATSAPP_BUSINESS_ACCOUNT_ID=2968326820176990
WHATSAPP_API_VERSION=v25.0
WHATSAPP_DEFAULT_TEMPLATE=hello_world
WHATSAPP_DEFAULT_LANGUAGE=en_US

Important:
- Do not commit .env.
- Do not share WHATSAPP_ACCESS_TOKEN in chat or screenshots.
- Free text messages may fail unless the recipient has opened/replied within the WhatsApp customer-service window.
- For messages initiated by the admin to craftsmen, use approved WhatsApp Templates in production.
- The default template hello_world is for testing only.

Install:
1. Run SUPABASE-WHATSAPP-CLOUD-API-PATCH.sql in Supabase SQL Editor.
2. Replace admin.html and api/server.js in the backend folder.
3. Put WhatsApp env variables in .env locally.
4. Restart npm run dev.
5. Login to /admin and open a worker card > رسائل واتساب > إرسال تلقائي.

Test recommendation:
- First select mode: إرسال قالب اختبار/رسمي عبر Cloud API.
- Keep template name: hello_world.
- Send to your verified test recipient.
- For text mode, reply first from your WhatsApp to the test number, then send a text message from admin.
