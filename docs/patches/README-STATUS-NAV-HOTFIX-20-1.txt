Patch 20.1 - إظهار رابط صفحة حالة الطلب

السبب:
صفحة /status كانت موجودة كرابط مباشر فقط، ولم يكن هناك تبويب/زر واضح للوصول لها من الواجهة.

الملفات:
- index.html: إضافة رابط "حالة الطلب" في الهيدر والموبايل والهيرو والفوتر.
- register.html: إضافة رابط "حالة الطلب" في الهيدر، وزر متابعة حالة الطلب بعد نجاح التسجيل.
- status.html: صفحة الحالة كما هي.
- api/server.js: نفس سيرفر Patch 20.
- vercel.json: يدعم /status.
- service-worker.js: تحديث الكاش إلى v22.

طريقة التركيب:
انسخ index.html وregister.html وstatus.html وservice-worker.js وvercel.json مكان القديمة.
وانسخ api/server.js إلى backend/api/server.js.
ثم أعد تشغيل السيرفر وافتح الصفحة مع Ctrl+F5.
