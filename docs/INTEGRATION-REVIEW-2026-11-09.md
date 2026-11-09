# Integration review - 2026-11-09

## Published scope

Local web changes through phase 5B: appearance, profile, password change, session management, notification preferences and inbox, and retention preference persistence. Retention does not delete data yet. Personal export, consent enforcement and deletion remain unavailable.

The existing integration modules are preserved: environment sensor (7611c81), window sensor standalone frontend (806c7bc), smart plug UI/API (6a9d618). Shared app routes and AuthContext changes were combined rather than replaced. Added the missing frontend paho-mqtt dependency. Preserved fail-closed MongoDB startup while keeping the environment MQTT bridge. Fixed environment UI lint warnings and stale record access in its network-error handler.

Local source additions include smart-speaker, smart-bin, smart-curtain, gateway, door-lock firmware and window-sensor firmware. Private network configurations, broker credentials, build output and managed dependencies are excluded. These additions are source snapshots, not verified hardware releases. Existing integration firmware takes precedence over alternate local snapshots at the same paths.

## Team work not merged automatically

| Branch | Latest commit | Outstanding work |
| --- | --- | --- |
| module/smart-door-lock | 04cc3cf | Four commits: dashboard, clarity improvements, ESP32-S3 firmware, authenticated realtime web/API/MQTT. Firmware snapshot exists locally, but its web/API integration is still absent from integration. |
| module/environment-sensor | 2b8f8d8 | Firmware restructured into sensor/display nodes, gas threshold below 1100, unicast ESP-NOW. Integration still uses the earlier realtime MQTT layout. Review protocol/hardware compatibility before merging. |
| module/smart-plug | f06e8ce | New ESP32 relay/fan/MQTT firmware. UI/API are already integrated; firmware is not. |
| windowsensor | 3ea6780 | Window ESP32 firmware and connection guide. Local source overlaps this firmware; frontend is already integrated as a standalone feature. |
| module/smart-speaker | 966023e | No new remote work beyond the scaffold; local speaker/gateway additions are newer. |
| module/window-sensor | 966023e | Scaffold only; actual work is on windowsensor. |

Do not merge these branches wholesale by copying their older shared settings/auth files. They share an older base and overlap app.js, server.js, dependencies, and firmware paths.

## Validation and limits

- Frontend: 306 tests passed on the combined tree; production build passed. Final environment lint fix is checked separately before publication.
- Backend: 315 tests passed, 9 files, sequential test configuration; dedicated smart_home_privacy_test DB.
- No browser, physical-device, firmware-build or live MQTT acceptance was performed for this publication.
- No private .env files were copied/read. Automated tracked-tree credential pattern scan found no matches; private configuration filenames were excluded.
- Publishing uses an isolated checkout; D:\smart-home-privacy-dashboard is not overwritten and remains behind the integrated team modules.

## Next work

Continue privacy phase 5C, then scoped deletion/retention, meaningful consent handling, remaining security settings, admin and help. Coordinate door-lock web integration and outstanding firmware with module owners. Local source additions also contain gateway behavior that is separate from the authenticated web dashboard; do not expose its unauthenticated HTTP endpoint publicly.
