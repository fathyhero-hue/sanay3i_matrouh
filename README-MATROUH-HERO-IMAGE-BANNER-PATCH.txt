MATROUH_HERO_IMAGE_BANNER_PATCH_ONLY

Purpose:
- Replace the large empty hero card under the homepage navy header with a professional Matrouh image banner.
- Add a navy horizontal information strip below the image.
- Keep homepage actions clean and mobile responsive.

Changed files:
- index.html
- style.css
- service-worker.js
- images/matrouh-hero.jpg

Not changed:
- api/server.js
- admin.html
- WhatsApp API logic
- Supabase logic
- .env or secrets
- assetlinks.json
- Google Play / TWA settings

After deploy:
- Hard refresh the browser.
- On mobile/PWA, clear app cache if old homepage still appears.
