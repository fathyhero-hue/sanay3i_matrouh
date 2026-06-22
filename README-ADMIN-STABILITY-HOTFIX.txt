ADMIN_STABILITY_FREEZE_MODAL_HOTFIX_PATCH_ONLY

Fixes admin panel freezing after edits and random/duplicated popups.

Changes:
- Removed duplicate pointerdown+click triggering for worker action buttons.
- Added debounce guard for V8 worker action modals.
- Fixed body/document overflow lock not being reset after modal close.
- Added safe ESC close and duplicate submit guard for V8 forms.
- Bumped service worker cache marker.

Modified files:
- admin.html
- service-worker.js

No changes to .env, WhatsApp tokens, signing files, assetlinks, Google Play/TWA.
