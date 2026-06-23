# Patch 22 — SEO وتحسين ظهور التطبيق في جوجل

## الملفات المعدلة

انسخ الملفات التالية مكان القديمة:

- index.html
- worker.html
- service-worker.js
- api/server.js داخل backend/api/server.js

## اللي اتضاف

1. عناوين صفحات ديناميكية حسب الرابط:
   - /trade/سباك => سباك في مطروح | صنايعي مطروح
   - /area/علم الروم => صنايعية علم الروم | صنايعي مطروح
   - /trade/سباك/area/علم الروم => سباك في علم الروم | صنايعي مطروح

2. Meta description ديناميكي.
3. Canonical URL ديناميكي.
4. Open Graph لروابط واتساب وفيسبوك.
5. Twitter Card.
6. JSON-LD للصفحة الرئيسية وصفحات الحرف والمناطق.
7. JSON-LD لصفحة تفاصيل الصنايعي.
8. robots.txt و sitemap.xml ديناميكي من السيرفر.
9. تحسين دعم رابط الحرفة + المنطقة في الواجهة.

## بعد التركيب

أقفل السيرفر وشغله:

```bash
npm start
```

ثم افتح:

```txt
http://localhost:3000/trade/سباك
http://localhost:3000/area/علم%20الروم
http://localhost:3000/trade/سباك/area/علم%20الروم
http://localhost:3000/sitemap.xml
http://localhost:3000/robots.txt
```

ثم اعمل Ctrl + F5.

## ملاحظات

- لا يوجد SQL جديد.
- ملف sitemap.xml يتولد تلقائيًا من قاعدة البيانات عند وجود Supabase.
- صور البطاقة أو أي بيانات حساسة لا تظهر في SEO أو sitemap.
