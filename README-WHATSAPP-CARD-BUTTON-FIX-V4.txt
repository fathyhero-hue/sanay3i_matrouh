WHATSAPP_CARD_BUTTON_FIX_V4

Fixes the WhatsApp button under each worker card in admin.html after performance optimization.

Changes:
- openWhatsAppModal now accepts either a worker object or an id/code/phone string.
- Card button event delegation now catches the actual card button even if inline onclick is bypassed.
- Uses nearest .admin-worker-card dataset to resolve the worker.

Install:
Replace admin.html only.
Restart local server and hard refresh admin page.
