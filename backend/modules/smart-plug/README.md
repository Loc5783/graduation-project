# Smart Plug Backend Module

**Người phụ trách:** Nhật Anh (nhatanh)

Backend xử lý logic dữ liệu đo đạc điện năng, điều khiển rơ-le và lưu trữ nhật ký telemetry cho Ổ cắm thông minh.

## 1. Cấu trúc thư mục

```text
backend/modules/smart-plug/
├── smartPlugModel.js       # Mongoose Schema lưu trữ bản tin Telemetry & trạng thái rơ-le
├── smartPlugController.js  # Controller xử lý logic đóng/ngắt, quá tải & truy vấn lịch sử
├── smartPlugRoutes.js      # Express Router định tuyến các API endpoints
└── README.md               # Tài liệu module
```

## 2. Danh sách API Endpoints (`/api/devices/smart-plug/*`)

| Phương thức | Đường dẫn API | Xác thực / Quyền | Chức năng |
|---|---|---|---|
| `GET` | `/api/devices/smart-plug/state` | Đăng nhập + owner/viewer | Lấy trạng thái đang lưu |
| `POST` | `/api/devices/smart-plug/relay` | Đăng nhập + owner + CSRF | Đổi trạng thái rơ-le phần mềm |
| `POST` | `/api/devices/smart-plug/telemetry` | Đăng nhập + owner | Tạm khóa ghi: trả 503 cho owner vì chưa xác thực nguồn thiết bị |
| `GET` | `/api/devices/smart-plug/history` | Đăng nhập + owner/viewer | Lấy lịch sử đang lưu |

Nguồn HTTP chưa có danh tính thiết bị/worker được xác minh. Không dùng API này để ghi số đo cho đến khi có xác thực riêng cho thiết bị. Kênh MQTT công khai của Smart Plug vẫn có giới hạn bảo mật riêng.

## 3. Kiểm thử tự động (Vitest)

Bộ kiểm thử tích hợp đầy đủ các kịch bản tại [`backend/tests/smartPlug.test.js`](../../tests/smartPlug.test.js):
- Kiểm tra lấy trạng thái thiết bị.
- Chặn người dùng chưa đăng nhập (401).
- Chặn người dùng không có quyền quản lý thiết bị (403).
- Cho phép tài khoản của **Nhật Anh** điều khiển rơ-le thành công (200).
- Kiểm tra nguồn HTTP chưa xác thực không thể ghi số đo hoặc kích hoạt quá tải.
- Kiểm tra truy vấn danh sách lịch sử đo đạc.
