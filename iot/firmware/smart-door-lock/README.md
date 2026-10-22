# Smart Door Lock — ESP32-S3 N16R8

Project PlatformIO Arduino cho phần khóa cửa chạy độc lập. Mở chính thư mục này bằng VS Code/PlatformIO. Người dùng đã xác nhận bản firmware này chạy được trên bo ESP32-S3 của mình; mức độ đã thử của từng mục phần cứng xem ghi chú cuối tài liệu. Chưa có Wi-Fi/MQTT, backend hay điều khiển từ web.

Bản hiện tại trả `SDL-FP-RETRY-20261022-C` cho lệnh `VERSION` trong Serial Monitor. AS608 được thử kết nối lại mỗi khoảng 2 giây trong tác vụ riêng nếu chưa phản hồi khi ESP32 khởi động. `STATUS` có thêm `FP`, `wipePending` và `busy`. Sau `RESET AUTH`, chỉ đăng ký vân tay mới khi đã thấy `OLD FINGERS CLEARED`, `FP READY` và `STATUS` báo `FP=1 wipePending=0 busy=0`. Nếu `FP=0` kéo dài, kiểm tra nguồn/GND và TX cảm biến → GPIO18, RX cảm biến ← GPIO17; không cần lặp lại `RESET AUTH`.

## 1. Phần cứng giữ nguyên

| Thiết bị | Kết nối |
| --- | --- |
| CDS 3 chân | VCC 3V3, GND, DO GPIO1; chỉ hiển thị mức DO, không dùng để xác thực |
| Nút mở bên trong | GPIO2–GND, INPUT_PULLUP |
| Buzzer active-low | Signal GPIO3, 3V3, GND; LOW bật |
| SW-420 | GPIO4 dành sẵn, **chưa lắp và không tham gia cảnh báo** |
| OLED I2C 128×64, thử SH1106/SSD1306 | 0x3C, SDA GPIO5, SCK/SCL GPIO6, 3V3/GND; SCK trên module I2C chính là SCL |
| MC-38 thật | GPIO7–GND, INPUT_PULLUP; sát nam châm LOW=CLOSED, tách HIGH=OPEN |
| MG90S | Signal GPIO8; 5V nguồn riêng, chung GND với ESP32 |
| RC522 | 3V3/GND; SS/SDA GPIO9, SCK12, MOSI11, MISO13, RST14; IRQ bỏ trống |
| AS608 | ESP RX GPIO18 ← TX module; ESP TX GPIO17 → RX module; UART 57600 |
| Keypad dây vật lý | 1→21, 2→47, 3→42, 4→41, 5→40, 6→39, 7→38 |

Scanner giữ nguyên `ROWS={38,39,40,41}`, `COLS={42,47,21}` và ma trận `123 / 456 / 789 / *0#`. Không dùng thư viện keypad để đổi thứ tự chân. Bấm nhiều phím cùng lúc bị bỏ qua.

AS608 cấp nguồn theo đúng biến thể module của anh; UART vào ESP phải tương thích 3.3V. Servo không lấy nguồn 5V công suất từ chân 3V3 ESP. Thử servo khi tháo tải cơ khí trước; LOCK=570µs, UNLOCK=2425µs. Nếu cơ cấu ngược chiều, chỉ hoán đổi hai hằng này. Không tự tăng hành trình.

## 2. Build và nạp

Mở thư mục này bằng VS Code + PlatformIO, chọn môi trường `smartdoor_s3_n16r8`.

```sh
pio run
pio run -t upload
pio device monitor -b 115200
```

Platform ghim `espressif32@7.1.3`, ba thư viện ghim phiên bản trong `platformio.ini`. Arduino core 2.0.17 dùng API `ledcSetup/ledcAttachPin/ledcWrite`. PWM 50Hz, **14 bit đúng giới hạn ESP32-S3**; không cần ESP32Servo. Thang duty là 16384 bước/chu kỳ 20000µs: LOCK khoảng 570.07µs, UNLOCK khoảng 2425.54µs. Nếu khởi tạo LEDC thất bại, giữ bolt UNKNOWN và báo SERVO PWM ERROR; STATUS có PWM=1 khi khởi tạo thành công.

Board nền có tên N8 trong thông báo PlatformIO; cấu hình project **đã override flash 16MB, bảng phân vùng default_16MB, QIO flash + OPI PSRAM (`qio_opi`) và BOARD_HAS_PSRAM** cho N16R8. Build xác nhận HARDWARE 16MB Flash. PSRAM vật lý phải kiểm tra trên đúng bo; chương trình nhỏ, không phụ thuộc PSRAM để mở cửa.

Bản CH343 dùng UART0 RX44/TX43 qua cổng USB-to-Serial CH343 của bo (COM5 trên máy anh), ARDUINO_USB_CDC_ON_BOOT=0. Vẫn là ESP32-S3 N16R8, giữ nguyên flash/PSRAM và GPIO cảm biến. Không dùng cổng USB native để nhập lệnh ở bản này. Nếu cần vào chế độ nạp, giữ BOOT, bấm RESET rồi thả BOOT. Chọn lại cổng sau nạp. Không cần gắn PC để hệ thống chạy, không có `while(!Serial)`.

## 3. Khởi tạo PIN và LittleFS lần đầu

Firmware không tự xóa PIN, thẻ RFID hoặc quyền vân tay khi khởi động/nạp lại. Ngoại lệ duy nhất là lần khởi động ngay sau lệnh khôi phục đã xác nhận ở mục bên dưới. Không có PIN mặc định. Chỉ cần tạo PIN nếu `STATUS` báo `PIN=0`; nếu `PIN=1`, dùng PIN đã lưu. Serial gửi từng dòng, kết thúc bằng LF hoặc CRLF.

### Khôi phục khi quên PIN và muốn tạo quyền từ đầu

Thực hiện trên bàn thử với cửa mở được bằng phương án cơ khí. Lệnh này **xóa PIN, danh sách thẻ và quyền vân tay đã lưu**; khi khởi động lại, firmware yêu cầu AS608 xóa các mẫu vân tay cũ. Log LittleFS vẫn được giữ. Không cần biết PIN cũ, nhưng phải có nút mở bên trong và Serial Monitor của bo.

1. Nạp bản firmware có hỗ trợ `RESET AUTH`, mở Serial Monitor 115200 và giữ nút mở bên trong.
2. Trong lúc vẫn giữ nút, gửi `RESET AUTH`. Chờ `CONFIRM RESET AUTH 15s`.
3. Trong vòng 15 giây, vẫn giữ nút và gửi `CONFIRM RESET AUTH`. Chờ `AUTH CLEARED; RESTARTING` rồi thả nút.
4. Chờ `OLD FINGERS CLEARED` và `FP READY`. Gửi `STATUS`: các trường cần là `PIN=0`, `cards=0`, `NVS=1`. Nếu thấy `FP CLEAR FAILED` hoặc `FP RESET INCOMPLETE`, vân tay chưa sẵn sàng; kiểm tra AS608 rồi khởi động lại để firmware thử xóa tiếp. Không đăng ký vân tay khi chưa có `FP READY`.
5. Tạo PIN mới theo hướng dẫn keypad hoặc Serial dưới đây; sau đó đăng ký lại từng thẻ RFID và vân tay. `RESET DENIED` nghĩa là thiếu nút inside, quá 15 giây hoặc chưa thực hiện bước xác nhận đầu.

Nếu muốn xóa cả log cũ, sau khi tạo PIN mới hãy vào admin, giữ nút inside và dùng `FORMATFS` trên bàn thử. Đây là thao tác riêng vì format flash có thể tạm dừng vòng lặp điều khiển cửa.

**Trên keypad và OLED:** Khi chưa có PIN, giữ nút mở bên trong và bấm `#`, rồi thả nút. Nhập PIN mới 6–8 số và bấm `#`; nhập lại đúng PIN và bấm `#` để xác nhận. Chờ `PIN CREATED`. `*` xóa phần đang nhập; bấm `*` khi trống để hủy. Cửa sổ tạo PIN kéo dài 60 giây.

**Qua Serial Monitor (cách thay thế):**

1. Trên bàn thử, giữ nút mở bên trong GPIO2.
2. Gửi `SETUP <PIN_6_DEN_8_SO>` với PIN riêng của anh, không gõ dấu `< >`.
3. Chờ `PIN CREATED`, rồi thả nút. Lệnh SETUP chỉ hợp lệ khi chưa có PIN, NVS tốt và nút thực sự đang giữ.
4. Gửi `ADMIN <PIN_CUA_ANH>`; khi đúng, phiên quản trị kéo dài 60 giây.
5. Với thiết bị mới chưa có LittleFS: giữ nút inside, gửi `FORMATFS`, chờ `FS READY`, thả nút. Lệnh này **xóa log**, cần cả phiên admin và nút vật lý. Chỉ làm trên bàn thử: thao tác format flash có thể tạm dừng vòng lặp. Không chạy khi đang sử dụng cửa.
6. Gửi `END` để kết thúc quản trị; dùng `STATUS` kiểm tra `PIN=1 FS=1 NVS=1`.

LittleFS không tự format khi mount lỗi để tránh xóa dữ liệu ngoài ý muốn. Nếu FS=0, chức năng cửa vẫn chạy nhưng không lưu log; xử lý FS trước khi đưa vào sử dụng. NVS lỗi làm các phương thức xác thực điện tử không được chấp nhận; nút inside vẫn hoạt động. Không tự reset PIN khi NVS hỏng.

## 4. Sử dụng PIN

Nhập 6–8 số rồi bấm `#`. `*` xóa phần đang nhập; sau 15 giây không nhập cũng tự xóa. OLED chỉ hiển thị dấu sao. Quá 8 số bị tính sai; không bỏ qua số thừa để mở bằng tiền tố.

Sai 5 lần ở keypad hoặc ADMIN sẽ khóa **xác thực PIN và quản trị** 60 giây. RFID/vân tay đã được cấp quyền vẫn dùng được. Nút inside luôn được ưu tiên, kể cả trong lockout hoặc khi AS608 không phản hồi. Số lần sai lưu NVS: reboot không xóa chuỗi lần sai; nếu đang lockout, reboot bắt đầu lại 60 giây. PIN đúng hoặc hết lockout sẽ xóa bộ đếm.

PIN lưu dạng SHA256(salt thiết bị 16 byte || PIN); salt tạo bằng RNG ESP32 và lưu Preferences. Không lưu PIN rõ trong log hay Preferences. PIN cũng là quyền quản trị: chỉ cấp cho người được phép quản lý. Serial không echo lại PIN; terminal phía máy tính có thể lưu lịch sử nên tránh dùng máy không tin cậy.

Đổi PIN trên keypad: bấm `#` khi chưa nhập số, nhập PIN quản trị rồi `#`, chọn `3`, nhập PIN mới rồi `#`, nhập lại rồi `#`. Qua Serial: `ADMIN <PIN_CU>` rồi `SETPIN <PIN_MOI>`; cách Serial kết thúc phiên quản trị sau khi gửi lệnh. Lệnh SETUP không thay PIN đang có. Quên PIN cần quy trình phục hồi có chủ đích trên bàn thử; xóa flash/NVS sẽ mất các quyền đã lưu.

## 5. Đăng ký và thu hồi thẻ RFID

1. Gửi `ADMIN <PIN_CUA_ANH>`.
2. Gửi `ADDCARD` và chờ `TAP NEW CARD`.
3. Đưa **một thẻ cần cấp quyền** vào RC522. Chờ `CARD ENROLLED`. Mỗi lệnh chỉ thêm một thẻ; tối đa 24 UID (4/7/10 byte).
4. Lấy thẻ ra, chờ hơn 2 giây rồi quét thử. Gửi `END` khi xong.

Thẻ lạ báo `UNKNOWN CARD <UID>` và không mở cửa. Thẻ không tự được tin cậy sau khi quét. ADDCARD hết hiệu lực khi phiên admin kết thúc hoặc hết 60 giây. Chỉ cho người tin cậy tiếp cận đầu đọc trong cửa sổ enrollment.

Có thể thêm thẻ bằng keypad: bấm `#` khi chưa nhập số, nhập PIN quản trị rồi `#`, chọn `1`, sau đó quét một thẻ mới và chờ `CARD ENROLLED`. Trong phiên admin, `CARDS` liệt kê UID; `DELCARD <UID_HEX>` xóa một thẻ, ví dụ UID liền nhau không dấu cách. Dữ liệu chỉ cập nhật vào RAM khi ghi Preferences thành công. Chống đọc lặp bằng halt card + lọc cùng UID trong 2 giây; khi thử lại hãy nhấc thẻ ra.

**UID RC522 có thể bị sao chép và không phải cơ chế bảo mật mạnh.** Whitelist UID phù hợp prototype/nhu cầu cơ bản, không thay thế xác thực thẻ mật mã. SHA256 với salt cũng không biến PIN ngắn thành bí mật mạnh nếu kẻ tấn công đọc được flash; cấu hình này chưa bật flash encryption/secure boot.

## 6. Đăng ký vân tay AS608

1. Chờ `FP READY` trên Serial (khoảng hơn 1 giây sau boot).
2. `ADMIN <PIN_CUA_ANH>` rồi `ENROLL 1` (ID 1–127).
3. Đặt ngón tay trong 20 giây; khi báo `REMOVE, THEN REPLACE`, nhấc ngón ra trong 10 giây rồi đặt lại trong 20 giây.
4. Chờ `FINGER ENROLLED`, nhấc ra và thử lại. Có thể dùng ID khác cho người khác. Nếu ID đã được cấp quyền, lệnh sẽ báo `REVOKE FINGER FIRST`; phải thu hồi ID đó trước khi đăng ký mẫu mới.
5. Thu hồi quyền: `ADMIN <PIN>` rồi `REVOKEFINGER 1`. Template vẫn nằm trong AS608 nhưng firmware không cho ID đó mở cửa. Đăng ký lại ID sẽ cấp quyền lại.

Có thể thêm vân tay bằng keypad: vào menu admin như trên, chọn `2`; firmware chọn ID chưa được cấp quyền đầu tiên. Chỉ ID được ENROLL thành công qua firmware này và lưu allowlist NVS mới được mở. Template có sẵn trong module không tự được tin cậy. Không cấp quyền nếu enrollment hoặc ghi NVS thất bại. Enrollment đã được admin cho phép sẽ chạy đến khi xong/timeout, kể cả phiên admin hết hạn sau lúc bắt đầu; không xếp hàng nhiều lượt. Nếu `REVOKEFINGER <ID>` được gửi trong lúc đăng ký chính ID đó, kết quả sẽ không được cấp quyền. Bấm `*` trên keypad để trở về menu không hủy tác vụ vân tay đã chạy. Bấm inside không bị chặn bởi quá trình này.

AS608 mất kết nối khi boot báo FP OFFLINE; kiểm tra RX/TX, baud, nguồn rồi reboot. Lỗi giao tiếp/không khớp không cấp quyền. Tác vụ vân tay trên core riêng chỉ gửi kết quả qua queue; không điều khiển servo, OLED hay NVS.

## 7. Logic cửa và servo

- Startup cửa đóng: đợi cửa ổn định 600ms rồi gửi LOCK. Startup cửa mở: không phát PWM khóa, trạng thái bolt UNKNOWN; đến khi đóng ổn định mới khóa. Không chờ nút cửa bằng vòng lặp blocking.
- Xác thực hoặc inside: cho phép một chu kỳ mở và chuyển servo UNLOCK. Nút inside debounce 35ms, đọc đầu mỗi vòng lặp; có thể đảo chiều ngay khi servo đang khóa. Giữ nút inside ngăn lệnh tự khóa; thả nút mới tiếp tục tính điều kiện khóa.
- Không mở cửa sau xác thực: sau 10 giây gửi LOCK, chỉ khi cửa đóng và inside đã thả.
- MC38 OPEN rồi CLOSED: debounce 35ms, sau CLOSED 600ms gửi LOCK. Mở lại trong thời gian này hủy bộ đếm đóng.
- Khi cửa mở giữa một lượt servo đang khóa: hủy hướng khóa và thu chốt về UNLOCK. Không bắt đầu lệnh khóa khi MC38 đang HIGH, kể cả trước khi debounce hoàn tất.
- Cửa mở ngoài chu kỳ cho phép: cảnh báo forced opening. Cửa mở quá 30 giây: cảnh báo held open. Còi nhịp 160ms, khoảng 1 giây, không dùng delay kéo dài; đóng cửa sẽ hết cờ cảnh báo. Inside/xác thực hợp lệ xác nhận chu kỳ mở mới.
- Servo chuyển mỗi 20ms, bước tối đa 35µs, rồi đợi thêm 700ms trước khi đánh dấu hoàn tất lệnh. PWM do phần cứng giữ ổn định khi tác vụ khác chạy. Lúc boot chưa biết vị trí thật nên áp dụng endpoint an toàn khi được phép, không giả lập vị trí hiện tại để sweep.

`servoKnown` chỉ thành true sau khi hoàn tất lệnh và thời gian settle; MG90S không có cảm biến vị trí. `LOCKED (command)` **không chứng minh chốt đã khóa cơ khí** hoặc servo có nguồn. MC38 đo cửa đóng/mở, không đo chốt. Sau mất nguồn lúc cửa mở, firmware không thể suy ra lịch sử mở trước đó; giữ UNKNOWN đến khi có lệnh hợp lệ.

OLED chỉ có chữ ASCII, không dùng animation/bitmap. Không điều khiển LED ngoài vì sơ đồ không có LED ngoài. OLED refresh tối đa mỗi 150ms; I2C 100kHz, timeout 20ms. Constructor U8g2 khai báo tường minh SCL=6, SDA=5 (thứ tự constructor là clock trước data). CDS được hiển thị HIGH/LOW thay vì tự đoán cực tính sáng/tối của module.

Nếu màn hình không lên: nguồn 3V3/GND, SDA→5 và SCK/SCL→6 vẫn giữ nguyên. Firmware thử địa chỉ 0x3C và 0x3D, ưu tiên 0x3C, tự thử lại mỗi 2 giây nếu chưa nhận ACK; không bỏ hiển thị vĩnh viễn vì một lần dò lúc boot thất bại. Gửi `STATUS` để xem dòng `OLED=... addr=... probe3C=... probe3D=...`. Probe=0 nghĩa là địa chỉ phản hồi; OLED=1 chỉ chứng minh ACK và đã gửi lệnh khởi tạo, không chứng minh panel thực sự phát sáng. `OLEDINIT` yêu cầu khởi tạo lại (không cần admin). Nếu OLED=0, kiểm tra nguồn/dây/tiếp xúc. Nếu OLED=1 nhưng màn vẫn đen, cần đối chiếu đúng controller SSD1306/SH1106 và cấu hình màn cũ đã chạy; không tự đổi controller theo suy đoán.

Vòng lặp không có chờ vân tay hoặc chờ cửa. UART vân tay có thể timeout trong task riêng. I2C/SPI và ghi flash vẫn là thao tác đồng bộ ngắn: firmware không phải hệ thống hard real-time; cần đo độ trễ thực tế khi có lỗi bus/nguồn. Không chạy FORMATFS trong sử dụng bình thường.

## 8. Log

LittleFS lưu `/access.log`; khi >=32KiB xoay sang `/access.old`, xóa bản old trước đó. Tổng dữ liệu hai file khoảng tối đa 66KiB, không tăng vô hạn. Không ghi PIN/hash/salt. Mốc thời gian là millis từ boot (có wrap), không phải ngày giờ lịch. Log không phải audit chống sửa/xóa hoặc an toàn tuyệt đối khi cắt nguồn.

`ADMIN <PIN>` rồi `LOG`: đọc tối đa 2048 byte cuối file hiện tại, truyền từng khối để không dump toàn file trong một vòng lặp; dòng đầu có thể bị cắt. Hết phiên admin thì dừng đọc. `STATUS` không cần admin. Bản CH343 truyền UART0 ở 115200; LOG gửi từng khối khi buffer còn chỗ. Các thông báo ngắn vẫn dùng Serial trực tiếp, có thể chờ ngắn khi buffer đầy. Nhập STATUS viết hoa trong PlatformIO Serial Monitor, không nhập vào PowerShell; monitor bật echo và send_on_enter.

## 9. Checklist kiểm tra trên mạch thật (chưa có kết quả đầy đủ)

| Thử | Kết quả cần thấy |
| --- | --- |
| Boot MC38 sát nam châm | Sau >=600ms servo bắt đầu LOCK, chỉ báo known sau settle |
| Boot MC38 tách nam châm | Không có lệnh LOCK; bolt UNKNOWN; đóng lại mới khóa |
| Bấm inside khi đang LOCK sweep | Đổi hướng UNLOCK sau debounce, không chờ vân tay |
| Giữ inside hơn 10s | Không tự khóa; thả nút và cửa đóng mới được khóa |
| PIN đúng nhưng không mở cửa | LOCK sau 10s tính từ lúc cấp quyền |
| Mở rồi đóng thật | LOCK sau CLOSED ổn định 600ms; mở lại trước đó hủy khóa |
| Tách nam châm trong lock sweep | Hướng servo chuyển UNLOCK; không tiếp tục đẩy chốt |
| PIN sai 5 lần, reboot | PIN/admin bị khóa 60s; inside vẫn mở; RFID/vân tay vẫn dùng |
| Thẻ lạ và thẻ đã thêm | Thẻ lạ không mở; thẻ whitelist mở; giữ thẻ không mở lặp liên tục |
| ADDCARD chưa ADMIN/hết 60s | Không cấp quyền thẻ mới |
| Finger có sẵn nhưng chưa ENROLL bằng firmware | Không được mở; ENROLL thành công mới có quyền |
| Rút AS608 hoặc để timeout khi ENROLL | Inside/keypad/servo vẫn xử lý; không cấp quyền sai |
| Nạp lại firmware khi đã có PIN/thẻ/vân tay | Cấu hình xác thực còn nguyên, không có thông báo xóa tự động |
| ENROLL ID vân tay đang có quyền | Báo `REVOKE FINGER FIRST`, mẫu và quyền cũ vẫn dùng được |
| REVOKEFINGER đúng ID lúc đang ENROLL | Khi tác vụ xong không cấp lại quyền; cần ENROLL lần mới để cấp quyền |
| RESET AUTH chưa giữ inside hoặc không xác nhận kịp | Không xóa quyền cũ; báo từ chối hoặc hết hiệu lực |
| RESET AUTH xác nhận đúng rồi khởi động lại | PIN/thẻ/quyền bằng 0; AS608 xóa mẫu cũ; không tự lặp lại lần reset |
| Mở cửa không xác thực | Forced alarm; giữ mở 30s có held alarm; đóng sẽ hết |
| GPIO4 không gắn | Không có vibration alarm |
| Rút OLED/không mở Serial PC | Điều khiển cửa vẫn chạy |
| Reset sau thêm thẻ/đổi PIN/enroll | Credentials đã lưu vẫn dùng được |
| Log đạt 32KiB | Xoay old, không tích lũy file vô hạn |
| Servo nguồn riêng, thử tải | Không brownout/reset, không kẹt cơ khí, đúng 570/2425µs |

Bản hiện tại đã build thành công; xem `BUILD_TEST.md`. Người dùng xác nhận đã nạp và chạy được trên bo, nhưng chưa cung cấp kết quả riêng cho toàn bộ checklist, nhất là `RESET AUTH`, thử mất nguồn, tải cơ khí và kiểm tra độ bền. Chỉ đưa vào cửa thật sau khi hoàn tất checklist, giữ phương án mở cửa cơ khí khi mất nguồn/hỏng servo.

## Tham khảo API

- PlatformIO Espressif32: https://github.com/platformio/platform-espressif32
- Adafruit Fingerprint: https://adafruit.github.io/Adafruit-Fingerprint-Sensor-Library/html/class_adafruit___fingerprint.html
- MFRC522: https://github.com/miguelbalboa/rfid

## Bản OLED dual-driver

Log thực tế: ACK 0x3C trước init nhưng OLED=0 sau init. Đã thêm Wire.end() trước U8g2.begin() để Wire được khởi tạo lại đầy đủ sau khi thư viện đổi pinMode SDA/SCL. Giữ SCK/SCL6 và SDA5. Mặc định thử SH1106 cho module 1.3 inch (chưa xác nhận controller thật); lệnh OLED SSD1306 hoặc OLED SH1106 đổi driver để thử, không cần admin. Lựa chọn driver tạm thời trong RAM; reboot quay về SH1106. STATUS bổ sung driver và postInit; postInit=0 là ACK sau init. Bản này vẫn là project khóa đầy đủ, giữ PWM14 và Serial CH343. Không xóa credentials. Chưa xác nhận màn hiển thị trên mạch.
