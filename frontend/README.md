# Frontend - Smart Home Privacy Dashboard

Thư mục mã nguồn frontend xây dựng bằng **React 18**, **React Router 6**, **CSS thuần** (không UI library) và **Vite**.

## Hướng dẫn nhanh cho lập trình viên

### 1. Cài đặt & Khởi động
```bash
npm install
npm run dev
```

### 2. Chế độ xem trước Dashboard (Preview Mode)
Nếu cần xem trước khung layout Dashboard và các trang module mà chưa có tài khoản máy chủ:
1. Tạo file `.env` từ `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Cập nhật giá trị:
   ```env
   VITE_PREVIEW_MODE=true
   ```
3. Chạy `npm run dev` và truy cập `/overview`.

*Lưu ý an toàn:* Chế độ này chỉ hoạt động khi chạy máy chủ phát triển (`DEV`). Khi đóng gói Production (`npm run build`), cơ chế này luôn bị vô hiệu hóa để bảo đảm an toàn.

### 3. Kiểm thử & Đóng gói
```bash
npm run lint    # Kiểm tra ESLint
npm test        # Chạy kiểm thử tự động Vitest
npm run build   # Đóng gói kiểm tra dist
```

### 4. Cấu trúc mã nguồn
- `src/pages/`: Các trang chính (`Login.jsx`, `Register.jsx`, `Overview.jsx`, `NotFound.jsx`).
- `src/modules/`: 5 module thiết bị độc lập (`smart-door-lock`, `smart-speaker`, `window-sensor`, `smart-plug`, `environment-sensor`). Mỗi module có `OwnerArea.jsx` dành riêng cho thành viên phụ trách.
- `src/services/`: Dịch vụ xác thực (`authService.js`).
- `src/shared/`: Layout chung (`Layout.jsx`), khung thiết bị (`DevicePage.jsx`), cấu hình chung.
- `src/styles/`: Toàn bộ CSS thuần của ứng dụng (`main.css`).
- `src/tests/`: Bộ kiểm thử giao diện và luồng hoạt động.
