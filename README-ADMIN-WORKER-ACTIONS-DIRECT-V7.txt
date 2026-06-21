# ADMIN_WORKER_ACTIONS_DIRECT_V7_PATCH_ONLY

إصلاح مباشر لأزرار كارت الصنايعي داخل لوحة الإدارة بعد باتش التسريع.

## الملفات
- admin.html
- service-worker.js

## ماذا يفعل؟
- يعيد بناء أزرار: تعديل البيانات، مراجعة التحقق، صور الأعمال، الاشتراك والتجديد، رسائل واتساب.
- يستخدم handlers مباشرة على onpointerdown و onclick مع fallback عام.
- يمنع service worker من اعتراض /admin و /api حتى لا تظهر نسخة قديمة أو مكسورة من لوحة الإدارة.

## التركيب
استبدل admin.html و service-worker.js داخل مجلد backend.
ثم:
Ctrl + C
npm run dev

ثم افتح /admin واعمل Ctrl + Shift + R.
لو ما زالت نسخة قديمة تظهر: DevTools > Application > Service Workers > Unregister ثم Reload.
