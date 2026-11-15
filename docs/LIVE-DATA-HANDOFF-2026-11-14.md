# Local IoT data integration handoff

## Implemented

- Authenticated `GET /api/live-devices` reads the existing Python gateway `GET /api/devices`. Destination defaults to `http://127.0.0.1:8001`; optional server-side `IOT_GATEWAY_URL` selects a different deployment. Frontend cannot choose the destination. No browser access to the unauthenticated gateway is introduced.
- Backend allowlists fields from five known devices. Missing readings remain null; no generated readings, fake battery, PINs, fingerprint records or raw gateway envelopes are exposed. Connection failures return503.
- A shared authenticated React provider polls sequentially every3seconds; stops on unmount/account change; handles current-session401; late old-account responses are ignored. Readings older than15seconds are stale even while HTTP is pending. Gateway failure preserves last readings as offline/stale.
- Overview live cards, door/window/environment module pages, `/devices/smart-bin` and a bin sidebar link use the same data. Existing team OwnerArea files remain on disk; their module entrypoints now render local-gateway readings. Existing smart-plug controls are unchanged and may still use their separate broker/API.
- Hub badge reflects recently observed gateway broker connectivity, not a fixed online label. It does not mean every device is online.
- UI supports VI/EN and existing theme tokens. Gas is ADC, not calibrated ppm. Door servo command/relay state is not proof of mechanical operation. No actuator controls were added.

## Validation

- Six backend tests passed for normalization, filtering, staleness, unauthenticated denial, upstream failure and fixed proxy destination. No database writes are performed by this endpoint/test file.
- Frontend suite before the final small schema validation change:310 tests passed. Final lint/build passed; final suite output is in `C:\Users\PhamDinhDong\Documents\Codex\2026-10-20\b-n\work\live-web-frontend-tests-handoff.log`.
- Backend full regression suite has not been rerun for this change. No live browser/hardware acceptance claimed.
- HTTP checks during this task found gateway8001, backend5000 and frontend5180 unavailable. Source integration alone does not prove connected device operation.

## Continue with Antigravity

1. Preserve all existing dirty files. Firmware, bridge.py, ACL, backend lockfile and local audio additions were already dirty before this task. Do not reset, stash, clean or overwrite them.
2. Start the existing authenticated local broker/gateway setup using private local configuration without printing secrets. Check the actual broker port; historical1884 is not a verified current setting. Do not accidentally start the voice gateway against default1883 if the devices use another port.
3. Start backend and frontend using normal scripts. Validate login -> `/api/live-devices` -> overview/device pages from actual gateway telemetry. Separate fixture tests from real devices.
4. For each device compare gateway keys and actual firmware payload with the normalizer. Local deployed firmware may differ from Git snapshots. Do not flash firmware to solve a web mapping issue.
5. Confirm offline/stale transitions by removing device power; restore and confirm freshness. Recheck Light/Dark, VI/EN, mobile and account switch in a browser when tools exist.
6. Smart plug physical operation remains unverified; door servo remains unverified. No remote unlock, fan, light or bin actuator test is authorized by this read-only data task.
7. Run relevant regressions and report exact evidence, then stop. Do not commit/push without a new user request.

## Real-time Permission Revocation & SSE Timing

- **SSE Stream Revocation Behavior**: Khi chủ sở hữu thu hồi quyền xem của một tài khoản (`viewer`), luồng SSE (`/api/environment-sensor/events`) sẽ **bị ngắt ở nhịp kiểm tra quyền kế tiếp, tối đa khoảng 15 giây theo cấu hình hiện tại** (`heartbeatMs = 15000`), kể cả khi phần cứng hoàn toàn im lặng không phát telemetry.
- **Frontend Reactive Revalidation**: Khi quay lại tab/trang (`focus`/`visibilitychange`) hoặc khi nhận mã `403` / sự kiện `session-expired`, client tự động tải lại danh sách quyền, xóa trắng dữ liệu module đã mất quyền và `DeviceGuard` chặn truy cập route ngay lập tức.

## Smart Plug Public MQTT Broker Limitations & Security Boundary

- **Broker MQTT công khai vẫn là giới hạn chưa giải quyết**: Firmware của Smart Plug hiện tại trỏ trực tiếp đến broker đám mây công khai `broker.emqx.io:8084/mqtt` không có tài khoản xác thực và không có ACL. Do đó, **hệ thống KHÔNG tuyên bố đã bảo vệ điều khiển ổ cắm ở tầng broker**. Bất kỳ ai bên ngoài Internet kết nối vào `broker.emqx.io` và biết chuỗi topic (`shp/device-smart-plug-01/command`) đều có thể can thiệp thiết bị vật lý bên ngoài ứng dụng web.
- **Bảo vệ ở tầng Web & API**: Quyền bật/tắt rơ-le và các nút điều khiển được bảo vệ trên giao diện Web UI và qua API backend (`POST /api/devices/smart-plug/relay`), chỉ tài khoản là chủ sở hữu (`RegisteredDevice` owner) mới được phép thực thi. Tài khoản chỉ xem (`viewer`) bị vô hiệu hóa nút bấm và chặn lệnh publish MQTT từ trình duyệt.
- **API Telemetry HTTP tạm khóa ghi**: `POST /api/devices/smart-plug/telemetry` trả `401` khi chưa đăng nhập, `403` khi không sở hữu, và `503 TELEMETRY_SOURCE_NOT_CONFIGURED` cho owner. Chưa có danh tính thiết bị/worker để xác minh nguồn HTTP; endpoint này không ghi database, không đổi trạng thái hay lịch sử. Trang Smart Plug hiện vẫn dùng broker EMQX công khai qua WebSocket; thay đổi này không xác thực được nguồn MQTT đó.
- **Giải pháp chuyển tiếp**: Để giải quyết triệt để rủi ro tầng broker, cần cập nhật firmware Smart Plug chuyển sang broker Mosquitto nội bộ có xác thực (port 1884) với chứng chỉ và ACL đồng bộ.
- **Chỉ thị an toàn kiểm thử**: Tuyệt đối không gửi lệnh điều khiển đến thiết bị thật để tránh kích hoạt actuator ngoài ý muốn.

Pre-edit copies of changed existing source/tests are outside the repo: `C:\Users\PhamDinhDong\Documents\Codex\2026-10-20\b-n\work\live-web-20261114-backup`. This task did not edit firmware, MQTT credentials or the Python gateway.
