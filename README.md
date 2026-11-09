# Smart Home Privacy Dashboard

Dự án bảng điều khiển quyền riêng tư cho nhà thông minh (**Smart Home Privacy Dashboard**), phát triển bằng **React 18**, **React Router 6**, **JavaScript** (ESM), **CSS thuần** (không dùng thư viện UI bên ngoài), cùng với **Node.js + Express** và **MongoDB** làm backend xác thực phiên an toàn (Session-based Authentication qua HttpOnly cookie).

---

## 1. Kiến trúc hệ thống & Luồng xác thực

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Trình duyệt (Browser / Client)                      │
│                                                                        │
│   Giao diện: http://localhost:5180                                      │
│   - Trang Đăng nhập (/login)                                           │
│   - Trang Đăng ký (/register) -> Màn hình "Tài khoản đã sẵn sàng!"     │
│   - Bảng điều khiển được bảo vệ (/overview, /devices/*)                │
│   - Cookie HttpOnly 'shp_sid' được trình duyệt tự động đính kèm        │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ (Vite Proxy: /api/* -> 127.0.0.1:5000)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Backend Express (Node.js)                            │
│                                                                        │
│   Dịch vụ API: http://127.0.0.1:5000/api/auth/*                        │
│   - POST /api/auth/register : Tạo tài khoản (băm bcrypt, role: viewer) │
│   - POST /api/auth/login    : Xác thực mật khẩu, tạo phiên MongoDB    │
│   - GET  /api/auth/me       : Khôi phục phiên làm việc tươi mới        │
│   - POST /api/auth/logout   : Hủy session store và xóa cookie          │
│   - Bảo vệ: Helmet, Rate Limiting, JSON Payload Guard, CORS           │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ (Mongoose connection)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Cơ sở dữ liệu MongoDB                                │
│                                                                        │
│   - smart_home_privacy      (Môi trường phát triển cục bộ)             │
│   - smart_home_privacy_test (Môi trường kiểm thử tự động)              │
│   - Collection 'users'      : Lưu trữ hồ sơ người dùng                 │
│   - Collection 'sessions'   : Lưu trữ phiên do connect-mongo quản lý   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Bảng phân công thành viên & 5 Module thiết bị

Mỗi thành viên phụ trách độc lập 1 module thiết bị trong thư mục `frontend/src/modules/<id>/`. Cấu trúc mỗi module gồm:
- `config.js`: Cấu hình nhận diện, bên truy cập, loại dữ liệu thu thập, MQTT topic demo.
- `OwnerArea.jsx`: Khu vực triển khai riêng biệt của thành viên (nơi viết giao diện & logic chuyên biệt).
- `index.jsx`: Export component module hoàn chỉnh tích hợp vào Dashboard.

| STT | Thiết bị | Mã định danh (`id`) | Thành viên phụ trách | Thư mục module | MQTT Topic Demo đề xuất |
|:---:|:---|:---|:---|:---|:---|
| 1 | Khóa cửa thông minh | `smart-door-lock` | **Thành** | `frontend/src/modules/smart-door-lock/` | `home/smart-door-lock/#` |
| 2 | Loa thông minh | `smart-speaker` | **Lộc** | `frontend/src/modules/smart-speaker/` | `home/smart-speaker/#` |
| 3 | Cảm biến cửa sổ | `window-sensor` | **Minh** | `frontend/src/modules/window-sensor/` | `home/window-sensor/#` |
| 4 | Ổ cắm thông minh | `smart-plug` | **Nhật Anh** | `frontend/src/modules/smart-plug/` | `home/smart-plug/#` |
| 5 | Cảm biến môi trường | `environment-sensor` | **Quỳnh** | `frontend/src/modules/environment-sensor/` | `home/environment-sensor/#` |

> **Quy tắc phân chia:** Để tránh xung đột git (merge conflict), các thành viên chỉ tập trung chỉnh sửa bên trong thư mục module được phân công (`src/modules/<id>/OwnerArea.jsx` và `config.js`). Các chỉnh sửa tại core (`src/context/`, `src/shared/`, `src/App.jsx`) phải được thảo luận trước khi hợp nhất.

---

## 3. Cài đặt và Khởi chạy Hệ thống

### 3.1. Yêu cầu môi trường
- **Node.js**: Phiên bản 18 trở lên (Khuyến nghị Node LTS hoặc v24.x).
- **npm**: Phiên bản 9 trở lên.
- **MongoDB**: Dịch vụ MongoDB cục bộ đang chạy tại cổng mặc định `27017` (URI: `mongodb://127.0.0.1:27017`).

---

### 3.2. Kiểm tra dịch vụ MongoDB
Trước khi khởi chạy Backend, hãy đảm bảo MongoDB daemon (`mongod`) đang hoạt động:
```powershell
# Kiểm tra dịch vụ MongoDB trên Windows PowerShell
Get-Service -Name MongoDB*

# Hoặc khởi động nhanh dịch vụ nếu chưa chạy (yêu cầu quyền Admin):
Start-Service MongoDB
```

---

### 3.3. Khởi chạy bằng 2 Cửa sổ PowerShell độc lập

Để hệ thống hoạt động trơn tru với đầy đủ Frontend và Backend, hãy mở **2 cửa sổ PowerShell riêng biệt**:

#### Cửa sổ 1: Backend (Node.js + Express API)
```powershell
# 1. Di chuyển vào thư mục backend
cd D:\smart-home-privacy-dashboard\backend

# 2. Cài đặt các gói phụ thuộc (nếu chưa cài)
npm install

# 3. Tạo file cấu hình môi trường .env (nếu chưa có)
# Mặc định file .env kết nối vào mongodb://127.0.0.1:27017/smart_home_privacy và PORT=5000

# 4. Khởi chạy Backend ở chế độ phát triển
npm run dev
```
*Kết quả hiển thị mong đợi:*
```
[Database] Đã kết nối thành công tới MongoDB. Database: smart_home_privacy
[Database] Chỉ mục Unique Index email của User đã sẵn sàng.
[Server] Backend đang lắng nghe tại http://127.0.0.1:5000
```

---

#### Cửa sổ 2: Frontend (React 18 + Vite Dev Server)
```powershell
# 1. Di chuyển vào thư mục frontend
cd D:\smart-home-privacy-dashboard\frontend

# 2. Cài đặt các gói phụ thuộc (nếu chưa cài)
npm install

# 3. Khởi chạy Frontend ở chế độ phát triển
npm run dev
```
*Kết quả hiển thị mong đợi:*
```
  VITE v6.4.4  ready in 320 ms

  ➜  Local:   http://localhost:5180/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

---

### 3.4. Truy cập và Trải nghiệm trên Trình duyệt

Mở trình duyệt và truy cập: **`http://localhost:5180`**

1. **Đăng ký tài khoản mới (`/register`):**
   - Điền Họ tên, Email, Mật khẩu (tối thiểu 8 ký tự, tối đa 72 byte UTF-8), Xác nhận mật khẩu và chấp nhận điều khoản.
   - Nhấn **Tạo tài khoản** -> Hệ thống hiển thị màn hình **"Tài khoản đã sẵn sàng!"**.
   - Mật khẩu được xóa sạch khỏi bộ nhớ client, tài khoản không tự động đăng nhập ngầm.
2. **Đăng nhập (`/login`):**
   - Nhập Email và Mật khẩu vừa đăng ký.
   - Chọn hoặc bỏ chọn ô "Ghi nhớ phiên đăng nhập trên thiết bị này" (14 ngày nếu tích chọn, 1 ngày nếu không chọn).
   - Nhấn **Đăng nhập** -> Chuyển hướng an toàn vào Bảng điều khiển (`/overview`).
3. **Bảo vệ tuyến đường & Tải lại trang (Reload):**
   - F5 hoặc Reload lại trang tại `/overview`: Trình duyệt gửi cookie phiên HttpOnly `shp_sid`, Backend xác thực qua `GET /api/auth/me` và khôi phục thông tin người dùng ngay lập tức mà không nhấp nháy màn hình đăng nhập.
4. **Đăng xuất an toàn:**
   - Nhấn nút **Đăng xuất** ở góc trên thanh Topbar.
   - Frontend gửi yêu cầu `POST /api/auth/logout` tới Backend để hủy bản ghi phiên trong MongoDB và xóa cookie trình duyệt, sau đó chuyển hướng về trang `/login`.

---

## 4. Kiểm tra Chất lượng & Bộ Kiểm thử (Automated Tests)

Cả hai dự án Backend và Frontend đều được trang bị bộ kiểm thử tự động toàn diện:

### 4.1. Kiểm thử Backend (37 tests)
```powershell
cd D:\smart-home-privacy-dashboard\backend
npm test
```
*Phạm vi kiểm thử Backend:*
- 8 tests cho `POST /api/auth/register` (hợp lệ 201, băm bcrypt, hỗ trợ Unicode tiếng Việt, concurrency chống race condition trùng email 409).
- 4 tests cho `Content-Type: application/json` bắt buộc (từ chối 415 với text/plain hoặc urlencoded).
- 10 tests cho `POST /api/auth/login` (200 kèm cookie `shp_sid`, remember 14 ngày vs 1 ngày, chống phân biệt tài khoản 401, giới hạn 72 byte, regenerate session id).
- 4 tests cho `GET /api/auth/me` (401 khi thiếu cookie/cookie giả, 200 trả dữ liệu tươi mới từ DB, xử lý lỗi 500 có kiểm soát).
- 2 tests cho `POST /api/auth/logout` (xóa session MongoDB, xóa cookie, xử lý lỗi store 500).
- 3 tests cho Rate Limiting & Payload Protection (chống brute force 429 và kích thước JSON quá tải).

---

### 4.2. Kiểm thử Frontend (58 tests, ESLint & Build)
```powershell
cd D:\smart-home-privacy-dashboard\frontend

# 1. Chạy toàn bộ 58 bài kiểm thử Vitest
npm test

# 2. Kiểm tra quy chuẩn mã nguồn ESLint (0 errors, 0 warnings)
npm run lint

# 3. Đóng gói sản phẩm cho môi trường Production
npm run build
```
*Phạm vi kiểm thử Frontend:*
- **Giai đoạn 1 (37 tests):** Tính tất định của Mock Data (PRNG Seed), quy tắc giờ đêm (04:59 biên đêm vs 05:00 biên ngày), Share Score, RBAC (Admin/Member/Viewer), an toàn ngoại lệ getter `window.localStorage`/`sessionStorage` ném SecurityError, chống leo thang đặc quyền.
- **Giai đoạn 2 (21 tests):** Đăng ký 5 module độc lập & cấu hình MQTT demo, kết nối API qua `authService`, form Login (bỏ tên đăng nhập cũ, validation realtime, ẩn/hiện mật khẩu), form Register (thanh đo độ mạnh 4 mức, giới hạn 72 byte, lỗi trùng email 409, màn hình thành công "Tài khoản đã sẵn sàng!"), bảo vệ tuyến đường (`ProtectedRoute`, `PublicAuthRoute`), chống phản hồi cũ `/me` ghi đè sau logout (`activeSeqRef`), và an toàn đăng xuất.

---

## 5. Cấu hình Vite Proxy & Xử lý sự cố (Troubleshooting)

### 5.1. Cấu hình Proxy trong `vite.config.js`
Frontend sử dụng cơ chế reverse proxy của Vite để chuyển tiếp toàn bộ yêu cầu có tiền tố `/api` tới backend Express:
```javascript
// frontend/vite.config.js
server: {
  port: 5180,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:5000',
      changeOrigin: true
    }
  }
}
```
Nhờ proxy này:
- Frontend gọi tương đối: `fetch('/api/auth/login', { credentials: 'include', ... })`.
- Không phát sinh lỗi CORS do trình duyệt xem Frontend và API cùng một origin `localhost:5180`.
- Cookie HttpOnly `shp_sid` được trao đổi tự nhiên và an toàn.

---

### 5.2. Hướng dẫn Xử lý Sự cố Thường gặp

| Vấn đề | Nguyên nhân khả dĩ | Hướng dẫn khắc phục |
|:---|:---|:---|
| **Lỗi `ECONNREFUSED 127.0.0.1:27017`** khi chạy Backend | Dịch vụ MongoDB chưa được khởi động trên máy | Chạy lệnh `Start-Service MongoDB` trên PowerShell (quyền Admin) hoặc chạy `mongod` thủ công. |
| **Lỗi `EADDRINUSE: address already in use :::5000`** | Cổng 5000 đang bị chiếm dụng bởi tiến trình Node cũ | Chạy `Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process` để giải phóng cổng. |
| **Màn hình thông báo "Không thể kết nối đến máy chủ"** trên Dashboard | Backend chưa khởi động hoặc gặp sự cố mạng | Đảm bảo cửa sổ PowerShell chạy Backend đang chạy `npm run dev` tại `http://127.0.0.1:5000`. Nhấn nút **"Thử lại kết nối"** trên giao diện sau khi Backend khởi động. |
| **Không đăng nhập được, báo 429 TOO_MANY_REQUESTS** | Gửi yêu cầu đăng nhập liên tiếp vượt ngưỡng chống dò mật khẩu | Chờ 15 phút để bộ nhớ Rate Limiter tự động làm mới, hoặc khởi động lại tiến trình Backend. |
| **Không truy cập được `/overview` trực tiếp** | Chưa đăng nhập và không bật cờ Preview Mode | Đăng ký/đăng nhập tài khoản thật, hoặc thiết lập `VITE_PREVIEW_MODE=true` trong `frontend/.env` nếu chỉ muốn xem khung giao diện trong môi trường phát triển. |

---

## 6. Quy ước Git & Bảo mật

- **Không tự ý commit hay đẩy (push) lên Git** khi chưa có sự chấp thuận của chủ dự án hoặc review hoàn tất từ Chat A.
- Tuyệt đối không commit các file bí mật: `.env`, `.env.local`, `node_modules/`, `dist/`.
- Mọi nhánh tính năng của các thành viên tuân thủ cú pháp: `feature/<id-thiet-bi>-<ten-thanh-vien>`.
