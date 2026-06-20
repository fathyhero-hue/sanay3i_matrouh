ADMIN_WORKER_ACTIONS_FORCE_MODAL_V8_PATCH

الغرض:
- إصلاح أزرار كارت الصنايعي داخل لوحة الإدارة عندما يتم تسجيل الضغط في Console لكن لا تفتح النوافذ.
- إعادة فتح النوافذ بنظام مستقل Inline Modal لا يعتمد على CSS القديم أو المودالات القديمة.

الملفات:
- admin.html
- service-worker.js

التركيب:
1) استبدل admin.html و service-worker.js في مجلد backend.
2) أعد تشغيل السيرفر: npm run dev
3) افتح لوحة الإدارة واعمل Ctrl + Shift + R.
4) لو استمر الكاش: DevTools > Application > Service Workers > Unregister.

اختبار سريع من Console:
testForceWorkerActionV8('edit')
testForceWorkerActionV8('identity')
testForceWorkerActionV8('renew')
testForceWorkerActionV8('whatsapp')
