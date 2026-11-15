# Smart Home Privacy Dashboard: progress while device dashboards are in flight

This work deliberately stays out of Antigravity's frontend and device files. The web application is **not finished**.

## Implemented in this pass

- Authenticated `GET /api/privacy-data/export.csv` returns the current account's profile fields, privacy retention choice, notification records, and session metadata. It excludes password hashes, session-store IDs and dedup keys. CSV cells are escaped against spreadsheet formula execution. CSV is not yet a full export of every data class.
- `DELETE /api/privacy-data/notifications` removes only the current user's notification inbox, requires a JSON confirmation value and Origin check. It does not delete account, security audit, or session records.
- A backend retention job prunes only notifications per user's 7/30/90-day setting at server startup and daily thereafter. It never touches UserSession anti-replay metadata or AuditLog. The frontend disclaimer still says cleanup is unavailable and must be updated when frontend integration is safe.
- Admin `GET /api/admin/system-status` returns a fresh Gateway-derived status for five known devices, or 503 if unavailable. It does not invent CPU, power, pin, or MQTT metrics.
- Added `smart-bin` to admin ownership allowlist.

## Evidence

- Full backend suite passed **335/335** before the final notification-delete endpoint was added.
- Targeted privacy export/delete suite passed **4/4** after that endpoint was added.
- Targeted admin status/import/export suite passed **12/12** before the final notification-delete endpoint was added.
- No frontend tests or browser/device checks were claimed in this pass.

## Still required for the entire web

1. Finish and accept Antigravity's device dashboards, then integrate them with the common overview without overwriting its working tree.
2. Build durable device observation/event storage, enforce device viewing and command authorization at the server boundary, and unify Smart Plug's public EMQX channel with the local MQTT architecture. Review physical command safety separately.
3. Feed actual device offline/alert events into the notification inbox; verify deduplication, ownership, quiet hours and retention.
4. Complete user-data export (including PDF), scoped deletion, and meaningful consent management only for real enforced collection purposes. Make the UI state exact and truthful.
5. Connect the real admin backend to an admin-only frontend. Audit permission updates, system status and activity filters. Never substitute fabricated readings or logs.
6. Review and integrate team email verification and inactivity expiry with the current auth contract; implement a real password-reset flow if in scope.
7. Implement help/onboarding/version/contact, verify VI/EN, light/dark, responsive layout and role flows in a real browser, then perform end-to-end tests with physical ESP hardware and hand off clean Git commits.

No commit, push, runtime restart, or production database operation was performed in this pass.
