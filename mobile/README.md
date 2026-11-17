# 📱 SmartHome Privacy Mobile App (React Native & Expo)

Ứng dụng di động chuyên biệt dành cho **Smart Home Privacy Dashboard**, tập trung vào **nhận cảnh báo khẩn cấp tức thì (Direct Live Alerts)**, quản lý thông báo thời gian thực và điều khiển toàn bộ thiết bị IoT trong gia đình.

---

## 🌟 Tính năng nổi bật

### 1. 🚨 Trung tâm Cảnh báo & Báo động Trực tiếp (Direct Live Alerts)
- **Rò rỉ khí Gas (MQ-2 Môi trường):** Nhận diện mức độ `SAFE`, `WARNING`, `DANGER`. Khi có nguy hiểm gas cao, ứng dụng tự động hiển thị Banner đỏ khẩn cấp và kích hoạt **nhịp rung điện thoại**.
- **An ninh Khóa cửa (KCTM01) & Cửa sổ (CSTM01):** Báo động tức thì khi phát hiện **cạy cửa**, mở cửa lâu vượt ngưỡng hoặc rung chấn bất thường.
- **An toàn lưới điện (Smart Plug OCTM01):** Cảnh báo ngay khi ổ cắm bị quá tải, hiển thị nút giải phóng và khôi phục nguồn điện an toàn.
- **Vệ sinh thông minh (Thùng rác TRTM01):** Báo động mức rác đầy $\ge 90\%$.
- **Thử nghiệm Báo động:** Tích hợp nút kiểm tra nhịp rung trực tiếp trên thiết bị di động.

### 2. 🔔 Hộp thư Thông báo Thời gian thực (Real-time Notification Inbox)
- Lọc theo danh mục: **Tất cả**, **Chưa đọc**, **Khẩn cấp**.
- Đánh dấu đã đọc theo từng thông báo hoặc **"Đọc tất cả"** chỉ với 1 chạm.
- Tự động đồng bộ với backend mỗi 2.5 giây.

### 3. 📊 Bảng điều khiển Thiết bị (Full Mobile Dashboard)
- Lưới thẻ thiết bị trực quan với biểu tượng và màu sắc nhận diện riêng biệt.
- Hiển thị đầy đủ số đo viễn trắc thật: Nhiệt độ, độ ẩm, nồng độ gas, điện áp, công suất, mức đầy rác, khoảng cách cảm biến.
- **Điều khiển nhanh:** Công tắc Bật/Tắt nguồn rơ-le ổ cắm trực tiếp ngay trên thẻ.
- **Ghép nối thiết bị mới:** Hỗ trợ nhập mã nhận diện (VD: `TRTM01`) và mã ghép nối bí mật trên tem thiết bị.
- **Trang chi tiết thiết bị:** Đổi tên gợi nhớ, xem lịch sử quan sát, và vùng nguy hiểm gỡ thiết bị.

---

## 🚀 Hướng dẫn Chạy Ứng dụng

### Bước 1: Khởi động Backend
Đảm bảo máy chủ Backend đang chạy:
```bash
# Tại thư mục gốc của dự án:
npm --prefix backend run dev
# Hoặc:
node backend/src/server.js
```

### Bước 2: Khởi động Ứng dụng Mobile
Mở một cửa sổ dòng lệnh (Terminal) mới và chạy:
```bash
cd mobile
npm start
```
Hoặc:
```bash
npx expo start
```

### Bước 3: Mở Ứng dụng trên Thiết bị

#### Cách A: Chạy trên Điện thoại thật (Android hoặc iOS) - Khuyến nghị
1. Tải ứng dụng **Expo Go** từ Google Play Store (Android) hoặc App Store (iOS).
2. Kết nối điện thoại vào **cùng mạng Wi-Fi** với máy tính của bạn.
3. Mở camera điện thoại (hoặc app Expo Go) quét mã QR hiển thị trên màn hình terminal.
4. Trên màn hình Đăng nhập của ứng dụng:
   - Bấm vào mục **"Địa chỉ máy chủ"**.
   - Nhập IP mạng LAN máy tính của bạn (VD: `http://192.168.1.15:5000`).
   - Bấm nút **"Kiểm tra kết nối máy chủ"** để xác nhận thành công trước khi đăng nhập.

#### Cách B: Chạy trên Máy ảo Android Emulator
- Nhấn phím `a` trên cửa sổ terminal đang chạy Expo.
- Địa chỉ backend mặc định cho Android Emulator là: `http://10.0.2.2:5000`.

#### Cách C: Chạy thử trên Trình duyệt Web (Mobile View)
- Nhấn phím `w` trên cửa sổ terminal. Ứng dụng sẽ mở trên trình duyệt tại `http://localhost:8081`.

---

## 🏗️ Cấu trúc Mã nguồn Thư mục `mobile/`

```
mobile/
├── App.js                     # Điều hướng Tab chính & quản lý State toàn cục
├── app.json                   # Cấu hình Expo, App Name, Icon, Splash
├── package.json               # Thư viện: React Native, Expo, Async-storage, Vector-icons
└── src/
    ├── api/
    │   ├── client.js          # API Client tự động quản lý Base URL & Session Cookie
    │   ├── authApi.js         # API Đăng nhập, Đăng ký, Kiểm tra phiên, Đăng xuất
    │   ├── devicesApi.js      # API Lấy danh sách, Telemetry, Ghép nối, Điều khiển Rơ-le
    │   └── notificationsApi.js# API Hộp thư thông báo
    ├── context/
    │   ├── AuthContext.js     # Quản lý phiên đăng nhập và cấu hình IP máy chủ
    │   ├── AlertContext.js    # Động cơ quét viễn trắc và kích hoạt Rung/Banner Cảnh báo
    │   └── DevicesContext.js  # Đồng bộ danh sách thiết bị và trạng thái viễn trắc tức thời
    ├── components/
    │   ├── AlertBanner.js     # Banner đỏ nổi cảnh báo sự cố khẩn cấp
    │   ├── Header.js          # Topbar hiển thị trạng thái Hub và chuông thông báo
    │   └── DeviceCard.js      # Thẻ thiết bị di động kèm số đo thật và công tắc điều khiển
    ├── screens/
    │   ├── LoginScreen.js     # Đăng nhập & cấu hình IP máy chủ linh hoạt
    │   ├── RegisterScreen.js  # Đăng ký tài khoản
    │   ├── DashboardScreen.js # Màn hình Tổng quan, danh sách thiết bị & modal ghép nối
    │   ├── AlertsScreen.js    # Trung tâm Giám sát An ninh & Nhận cảnh báo trực tiếp
    │   ├── NotificationsScreen.js # Hộp thư thông báo thời gian thực
    │   ├── DeviceDetailScreen.js  # Chi tiết thiết bị, đổi tên và lịch sử
    │   └── SettingsScreen.js  # Cài đặt kết nối, rung cảnh báo và tài khoản
    └── utils/
        └── storage.js         # Lưu trữ an toàn trên thiết bị (AsyncStorage)
```
