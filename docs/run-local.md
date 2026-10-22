# Chạy frontend và backend trên máy

Ứng dụng hiện có đăng ký/đăng nhập thật, dashboard dạng khung, VI/EN và 5 module.
Hub/MQTT và chức năng phần cứng chưa được tích hợp. Tài khoản đăng ký mới là viewer.

## Chuẩn bị

- Dùng Node.js 24 để khớp môi trường đã kiểm tra, cùng npm và MongoDB cục bộ.
- Sau khi clone, chuyển sang nhánh `integration`. Lệnh bên dưới chạy từ thư mục repo.
- Mỗi thành viên có database và cấu hình riêng; dữ liệu MongoDB không nằm trong Git.
- MongoDB mặc định tại `127.0.0.1:27017`; không mở cổng ra mạng ngoài để chạy hướng dẫn này.

## Backend — cửa sổ PowerShell 1

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Chỉ sao chép khi chưa có `.env`; không ghi đè cấu hình riêng đã sử dụng.
Mở `.env`, giữ `PORT=5000`, URI database phát triển `smart_home_privacy`, và thay
`SESSION_SECRET` mẫu bằng chuỗi ngẫu nhiên riêng. Có thể sinh chuỗi trên máy bằng:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Dán kết quả vào `.env` trên máy, không gửi vào chat, commit hoặc dùng lại secret của người khác.
Nếu MongoDB có xác thực, cấu hình URI riêng trong `.env`; không đưa credential vào source.

```powershell
npm run dev
```

Chờ MongoDB, unique index và session store sẵn sàng, máy chủ nghe tại `127.0.0.1:5000`.

## Frontend — cửa sổ PowerShell 2

```powershell
cd frontend
npm ci
$env:VITE_PREVIEW_MODE="false"
npm run dev
```

Mở `http://localhost:5173`. Giữ hai cửa sổ chạy. Nhấn `Ctrl+C` từng cửa sổ để dừng.
Vite proxy `/api` tới `http://127.0.0.1:5000`. Nếu Vite chuyển sang cổng khác do
cổng 5173 bận, ưu tiên giải phóng đúng tiến trình phát triển của bạn hoặc cập nhật
allowlist Origin trong `.env` backend tương ứng; không cho phép mọi origin.

## Kiểm tra sử dụng

1. Đăng ký email mới và mật khẩu hợp lệ.
2. Từ màn hình thành công chuyển sang đăng nhập.
3. Đăng nhập, mở dashboard và 5 trang thiết bị.
4. Đổi VI/EN, tải lại và xác nhận phiên còn hiệu lực.
5. Đăng xuất; mở `/overview` phải yêu cầu đăng nhập lại.

Preview chỉ dùng để phát triển giao diện, không tạo tài khoản hay quyền thật và bị
tắt trong production. Dùng preview=false khi kiểm tra xác thực.

## Kiểm tra tự động

Từ `frontend/`: `npm run lint`, `npm test`, `npm run build`.

Từ `backend/`: `npm test`. Bộ test dùng MongoDB `smart_home_privacy_test` và **xóa
dữ liệu `users`/`sessions` trong database test**. Không dùng tên này cho dữ liệu cần giữ,
không chạy đồng thời hai bộ backend test trên cùng database. Database phát triển
`smart_home_privacy` tách biệt và không được bộ test dọn dữ liệu.

Nếu gặp `EACCES` khi mở socket/kết nối MongoDB, báo kiểm tra bị chặn bởi môi trường;
không tắt bảo vệ hệ thống hoặc coi test đó đã thành công. Kiểm tra giao diện trên
trình duyệt thật vẫn cần thực hiện riêng, test JSDOM không xác nhận chất lượng hình ảnh.

## Phân công và quy tắc nhóm

| Module | Người phụ trách | Frontend đang chạy |
|---|---|---|
| smart-door-lock | Thành | frontend/src/modules/smart-door-lock/ |
| smart-speaker | Lộc | frontend/src/modules/smart-speaker/ |
| window-sensor | Minh | frontend/src/modules/window-sensor/ |
| smart-plug | Nhật Anh | frontend/src/modules/smart-plug/ |
| environment-sensor | Quỳnh | frontend/src/modules/environment-sensor/ |

Các nhánh `module/*`, `feature/*`, `fix/*` tích hợp về `integration` theo quy ước nhóm.
Không tự đổi id/topic hoặc chép frontend sang thư mục planning `frontend/features/`.
Registry đã đăng ký sẵn 5 module. Thay đổi shared/context/router/dependency cần phối hợp.
Xem `docs/mqtt-topics.md` trước khi tích hợp phần cứng; mẫu config frontend chưa phải
hợp đồng backend/firmware đã được kiểm chứng.

Giữ `.env.example` và lockfile trong Git. Không commit `.env`, secret, dữ liệu database,
`node_modules`, `dist` hoặc file log. Hướng dẫn này là chạy phát triển cục bộ, chưa phải
cấu hình triển khai production/HTTPS.
