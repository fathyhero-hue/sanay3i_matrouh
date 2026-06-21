WHATSAPP_INBOX_WEBHOOK_PATCH_ONLY

الهدف:
- استقبال ردود الصنايعية على رسائل واتساب داخل لوحة الإدارة.
- إضافة Inbox داخل تبويب "رسائل واتساب".
- ربط الردود تلقائيًا بالصنايعي إذا كان رقم الهاتف/الواتساب مطابقًا.
- الرد من داخل لوحة الإدارة عبر WhatsApp Cloud API.

الملفات المعدلة:
- api/server.js
- admin.html
- service-worker.js

ملف SQL جديد:
- SUPABASE-WHATSAPP-INBOX-WEBHOOK-PATCH.sql

متغير بيئة جديد مطلوب في Vercel وملف .env المحلي:
WHATSAPP_WEBHOOK_VERIFY_TOKEN=اكتب_رمز_سري_من_اختيارك

Callback URL المقترح في Meta:
https://sanay3i-matrouh.online/api/webhooks/whatsapp

Verify Token:
نفس قيمة WHATSAPP_WEBHOOK_VERIFY_TOKEN

Webhook fields المطلوبة:
- messages

ملاحظات أمان:
- لا تشارك WHATSAPP_ACCESS_TOKEN.
- لا تشارك WHATSAPP_WEBHOOK_VERIFY_TOKEN علنًا.
- لم يتم تعديل .env أو أي ملفات توقيع.

خطوات التشغيل:
1. شغّل SQL في Supabase SQL Editor.
2. أضف WHATSAPP_WEBHOOK_VERIFY_TOKEN في Vercel Environment Variables.
3. اعمل Deploy.
4. في Meta Developers > WhatsApp > Configuration:
   - Callback URL: https://sanay3i-matrouh.online/api/webhooks/whatsapp
   - Verify token: نفس قيمة WHATSAPP_WEBHOOK_VERIFY_TOKEN
   - Subscribe to messages
5. افتح لوحة الإدارة > رسائل واتساب > صندوق وارد واتساب.
