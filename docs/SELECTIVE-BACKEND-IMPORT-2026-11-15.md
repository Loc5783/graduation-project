# Selective backend import - 2026-11-15

User boundary: import upstream work without changing any frontend/interface or device implementation. Remote source: `origin/integration` at `46532892ea1699816d5a37e0cbed1a6831e0e44c`. Local HEAD remains `fd30bfc`; this is a selective working-tree import, not a completed Git merge.

## Imported into the active backend source

- `src/controllers/adminController.js`: actual users list, create/delete user, change role/owned assignments and list audit events.
- `src/middleware/admin.js`: admin authorization.
- `src/models/AuditLog.js`: stored audit events.
- `src/routes/adminRoutes.js`: authenticated admin user/audit endpoints.
- `src/app.js`: only adds admin router import/mount; preserves existing IoT routes and the local `/api/live-devices` route.
- `tests/adminImport.test.js`: integration checks using only the dedicated `smart_home_privacy_test` database.

Compatibility adaptations: removed the optional email-auth dependency from admin-created users because the local frontend does not implement email challenges. Excluded the upstream system/device-status handler and route because they contain hardcoded online/device readings. Removed fabricated fallback audit events; empty database returns an empty list, disconnected database returns503.

Active routes after a normal backend restart: GET/POST `/api/admin/users`, PATCH `/api/admin/users/:userId/role`, DELETE `/api/admin/users/:userId`, GET `/api/admin/audit-logs`. Admin authentication is required; write methods keep Origin/JSON protection as applicable. This import does not add a frontend admin screen and does not create any admin account.

## Downloaded as reference only

Upstream backend email challenge/registration/login, session inactivity handling and associated source/tests were saved outside the running project. They are NOT activated: the current frontend expects one-step authentication and has no activity heartbeat. Importing only that backend would break enabled email authentication or expire sessions during active frontend use. Integrate them as a coordinated frontend/backend task only after the user permits frontend changes.

Reference and pre-edit copies:
`C:\Users\PhamDinhDong\Documents\Codex\2026-10-20\b-n\work\backend-import-20261115-131008`

The reference tree is not a runnable deployment. Upstream development-mode mock auth/MemoryStore fallback, hardcoded server secret and all device-related changes were not imported. No `.env`, dependencies, firmware, gateway, MQTT, frontend or UI source was modified by this import.

## Validation and limits

`npm test --prefix backend -- --run tests/adminImport.test.js tests/auth.test.js tests/liveDevices.test.js`: 3 files,52 tests passed. Includes actual admin role changes and audit writes in test DB, viewer/unauthenticated denial, Origin rejection, existing one-step login compatibility and existing live-device normalization/auth tests. Node syntax checks passed. Logs are saved beside the reference.

No real user data was changed, no runtime restart, no UI/browser verification, no commit/push and no completed merge. Upstream code is adapted, not fully security-audited; concurrent last-admin changes and best-effort audit recording remain outside this import's acceptance. Existing dirty frontend/device work belongs to ongoing tasks and must not be overwritten with a blanket pull/reset.
