FIXED_BANNER_SERVE_ROUTE_UTF8_PATCH_ONLY

Purpose:
- Fix Arabic text encoding by providing a clean UTF-8 index.html.
- Make the Matrouh homepage banner load reliably on Vercel via an explicit API static route.

Files changed:
- index.html
- api/server.js
- service-worker.js
- matrouh-hero-banner.jpg
- images/matrouh-hero-banner.jpg
- icons/matrouh-hero-banner.jpg

Banner URL used by homepage:
/api/static/matrouh-hero-banner.jpg?v=serve-fixed-20260621

Direct test URL after deploy:
https://sanay3i-matrouh.online/api/static/matrouh-hero-banner.jpg

Important:
Do not edit Arabic HTML files with PowerShell Get-Content/Set-Content. Use VS Code manual editing or a UTF-8 safe script.
