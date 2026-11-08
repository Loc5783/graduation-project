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
| `GET` | `/api/devices/smart-plug/state` | Công khai | Lấy trạng thái tức thời (relay, công suất, điện năng, ánh sáng) |
| `POST` | `/api/devices/smart-plug/relay` | `requireAuth` + Quyền `smart-plug` | Điều khiển Bật/Tắt Rơ-le (Bảo vệ CSRF + Allowlist) |
| `POST` | `/api/devices/smart-plug/telemetry` | `Content-Type: JSON` | Nhận số đo chu kỳ từ phần cứng/worker, phát hiện quá tải |
| `GET` | `/api/devices/smart-plug/history` | Công khai | Lấy lịch sử đo đạc phục vụ vẽ biểu đồ diễn biến điện năng |

## 3. Kiểm thử tự động (Vitest)

Bộ kiểm thử tích hợp đầy đủ các kịch bản tại [`backend/tests/smartPlug.test.js`](../../tests/smartPlug.test.js):
- Kiểm tra lấy trạng thái thiết bị.
- Chặn người dùng chưa đăng nhập (401).
- Chặn người dùng không có quyền quản lý thiết bị (403).
- Cho phép tài khoản của **Nhật Anh** điều khiển rơ-le thành công (200).
- Kiểm tra cơ chế tự động ngắt nguồn khi công suất vượt ngưỡng quá tải.
- Kiểm tra truy vấn danh sách lịch sử đo đạc.
