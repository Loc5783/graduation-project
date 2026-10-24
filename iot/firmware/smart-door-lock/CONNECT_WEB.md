# Chạy Smart Door Lock với web

Mở ba Terminal trong thư mục gốc repository (nơi có `frontend/`, `backend/`, `iot/`). Chỉ module Smart Door Lock và hai điểm gắn backend được bổ sung; các module khác không được đổi code.

## A. Broker MQTT trên máy tính

Đã có Eclipse Mosquitto ở `C:\Program Files\mosquitto` trên máy kiểm tra. Trong Terminal 1:

```powershell
& .\iot\firmware\smart-door-lock\tools\start-broker.ps1
```

Lần đầu script hỏi tạo **hai mật khẩu MQTT**: tài khoản `smart-door-lock` dùng trên ESP32; `smart-door-web` dùng cho backend. Đây là mật khẩu kết nối broker, khác PIN mở cửa. Script không ghi mật khẩu rõ vào source và không sửa service hay firewall. Cấu hình/password hash được lưu trong `.local/` đã bỏ qua bởi Git.

Để nguyên Terminal này khi dùng web; Ctrl+C dừng broker. Nếu cổng 1883 đang được broker khác dùng, dùng broker hiện có với ACL tương đương hoặc chọn `-Port 1884` và đổi cùng cổng trong firmware/backend. Broker này lắng nghe LAN để ESP32 truy cập được; dùng mạng riêng và tài khoản đã tạo. Nếu Windows hiện thông báo cho phép truy cập mạng, chỉ cho phép mạng riêng đang sử dụng.

Script chỉ cho ESP32 **ghi** status/telemetry, backend chỉ **đọc** hai topic đó. Không cấp lệnh mở khóa. Tham khảo cấu hình gốc: [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html).

## B. Cấu hình firmware

Trên máy chạy broker, xem IPv4 LAN bằng `ipconfig`, ví dụ `192.168.1.10`. Trong `include/network_config.h` của firmware:

```cpp
#define SDL_WIFI_SSID "TEN_WIFI_2G4"
#define SDL_WIFI_PASSWORD "MAT_KHAU_WIFI"
#define SDL_MQTT_URI "mqtt://192.168.1.10:1883"
#define SDL_MQTT_USERNAME "smart-door-lock"
#define SDL_MQTT_PASSWORD "MAT_KHAU_MQTT_CUA_ESP32"
#define SDL_MQTT_CA_CERT ""
#define SDL_VIBRATION_ENABLED 1
#define SDL_VIBRATION_ACTIVE_LEVEL -1
```

Đây chỉ là ví dụ, phải điền giá trị riêng trên máy. Mở folder firmware trong PlatformIO, Build/Upload/Monitor. Làm thiết lập PIN → RFID → vân tay theo [README](README.md). Không dùng Erase Flash để cập nhật code. Không commit `network_config.h`.

## C. Backend có phiên đăng nhập

Terminal 2:

```powershell
cd backend
npm ci
```

Nếu chưa có `.env`, sao chép `.env.example` thành `.env`. Giữ cấu hình MongoDB, `SESSION_SECRET` và origin đang dùng cho web. Bổ sung:

```dotenv
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_USERNAME=smart-door-web
MQTT_PASSWORD=MAT_KHAU_MQTT_CUA_BACKEND
```

Backend chạy cùng máy broker nên có thể dùng 127.0.0.1; ESP32 luôn dùng IP LAN. Đảm bảo MongoDB đang chạy rồi:

```powershell
npm run dev
```

Nếu backend báo MongoDB chưa kết nối, cần khởi động MongoDB hoặc điền URI MongoDB đang dùng trước khi đăng nhập. Không có chế độ bỏ qua xác thực để xem dữ liệu IoT.

## D. Web

Terminal 3:

```powershell
cd frontend
npm ci
npm run dev
```

Mở `http://localhost:5173`, đăng ký/đăng nhập bằng tài khoản thật, vào **Khóa cửa thông minh** (`/devices/smart-door-lock`). Chế độ preview chỉ xem giao diện, không tạo cookie đăng nhập backend.

Khi đủ kết nối, nhãn chuyển sang **Đang cập nhật trực tiếp**. Nếu board chưa có quyền truy cập, hướng dẫn thiết lập mới hiển thị dựa trên trạng thái PIN/thẻ/vân tay nhận từ chính board.

## E. Kiểm tra trên thiết bị thật sau khi nạp

| Thao tác | Kết quả cần thấy trên web |
|---|---|
| Để board và broker chạy | Nhãn trực tiếp; thời điểm nhận mới ít nhất mỗi 2 giây |
| Mở/đóng MC38 | Cửa đang mở/đóng; sự kiện tương ứng |
| Che/chiếu sáng CDS | HIGH/LOW đổi theo DO của module; chưa gán lux |
| Gõ nhẹ SW420 | DO đổi; sau hiệu chuẩn0/1 có phát hiện rung và tăng đếm |
| Chạm thẻ chưa đăng ký | Sự kiện thẻ bị từ chối; không tự đăng ký |
| Chạm thẻ đã đăng ký | Mở tại cửa + lịch sử RFID |
| Dùng vân tay đã đăng ký | Mở tại cửa + lịch sử vân tay |
| Nhập PIN đúng trên keypad | Mở tại cửa + lịch sử PIN; web không thấy chữ số |
| Nhập sai PIN 5 lần | Khóa PIN 60 giây + thời gian còn lại |
| Nhấn nút trong khi PIN bị khóa | Vẫn mở tại cửa + sự kiện nút trong |
| Servo hoàn tất di chuyển | Lệnh khóa/mở, không ghi xác nhận chốt vật lý |
| Rút tín hiệu AS608 trong điều kiện thử phù hợp | Sau các timeout UART, thẻ vân tay báo mất kết nối; cắm lại tự thử nhận |
| Dừng broker hoặc tắt board | Mất MQTT hoặc hết heartbeat trong7 giây; dữ liệu cảm biến được ẩn |
| Khởi động lại board | PIN, thẻ, vân tay mới vẫn dùng được; uptime/bộ đếm khởi động lại |
| Đăng xuất web | Luồng bị đóng khi phiên được kiểm tra, không tiếp tục nhận dữ liệu |

OLED, còi, bộ nhớ, tín hiệu Wi-Fi và phiên admin được hiển thị trong **Chi tiết thiết bị**. Bàn phím ma trận không có chân xác nhận tình trạng điện riêng; web hiển thị việc đã cấu hình và kết quả xác thực, không giả định phát hiện được mọi dây keypad bị rút.

## F. Định dạng dữ liệu

Giữ nguyên MQTT topic registry. Mỗi state/event có `schemaVersion:1`, `deviceId:"smart-door-lock"`, bootId8ký tự hex, sequenceuint32 tăng theo lần publish và uptimeMsuint32. State có `kind:"state"`, `data` chứa các trường cảm biến đã được backend allowlist. Event có `kind:"event"` và `code` đã chuẩn hóa (ACCESS_PIN, DOOR_OPEN, VIBRATION_DETECTED...). Không gửi log text tùy ý.

Status retained gồm schemaVersion/deviceId/bootId/online; Last Will đặt onlinefalse. State/event không retained. Backend bỏ qua telemetry retained và các sequence cũ/trùng. State mới tối thiểu mỗi2giây; stale7giây. Event có thêm thời điểm backend nhận; các sự kiện xếp hàng khi mất mạng có uptime gốc nên không coi giờ nhận là giờ thật lúc sự kiện xảy ra.

Luồng SSE được bảo vệ bởi phiên HttpOnly:

- `GET /api/smart-door-lock/state` → `{success:true,data:snapshot}`.
- `GET /api/smart-door-lock/events` → `event: state`, dữ liệu là snapshot.
- Snapshot gồm brokerConnected, availability, fresh, receivedAt, state, events.

Lịch sử web giữ tối đa64sự kiện trong RAM; giao diện hiển thị30mục gần nhất. Khởi động lại backend xóa lịch sử RAM; log LittleFS trên ESP32 độc lập, chưa có cơ chế tải bù toàn bộ log cũ. Đây là giới hạn thực tế của bản kết nối hiện tại.

Chi tiết backend và kiểm thử ở `backend/modules/smart-door-lock/README.md`. Mạng firmware dùng [ESP-MQTT enqueue](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32s3/api-reference/protocols/mqtt.html) trong task riêng; không chờ kết nối mạng trong vòng điều khiển cửa.
