CORRECT_FULL_IMAGE_BANNER_PATCH_ONLY

Purpose:
- Replace the previous Matrouh hero banner with the corrected panoramic image.
- Show the image complete as an <img> element, without crop, stretch, blur, or background-fit tricks.
- Only blank white canvas margins were removed from the uploaded asset; the panorama itself was not cropped.

Modified files:
- index.html
- style.css
- service-worker.js
- images/matrouh-hero-banner.jpg

Not touched:
- api/server.js
- admin.html
- WhatsApp/Supabase logic
- .env / tokens / signing files
- assetlinks.json / Google Play / TWA
