import dotenv from 'dotenv';
dotenv.config();

import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { createSmartDoorLockBridge } from '../modules/smart-door-lock/bridge.js';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_home_privacy';

async function startServer() {
  let doorBridge;
  try {
    // 1. Kết nối cơ sở dữ liệu MongoDB phát triển
    await connectDB(MONGODB_URI);

    // 2. Khởi tạo Express app sau khi database và session store đã sẵn sàng
    const app = await createApp();
    doorBridge = createSmartDoorLockBridge(app.locals.smartDoorLockTelemetry);
    if (!doorBridge.start()) {
      console.log('[SmartDoorLock] MQTT_URL chưa cấu hình; dữ liệu trực tuyến đang tắt.');
    }

    // 3. Chỉ lắng nghe cục bộ tại 127.0.0.1 để bảo vệ mạng nội bộ, không mở mạng ngoài
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`[Server] Máy chủ backend đang lắng nghe tại http://127.0.0.1:${PORT}`);
    });

    // Xử lý dừng máy chủ an toàn (Graceful Shutdown)
    let shuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n[Server] Nhận tín hiệu ${signal}. Đang đóng các kết nối...`);
      // End SSE streams before waiting for HTTP connections to finish.
      await doorBridge.close();
      server.close(async () => {
        try {
          await disconnectDB();
          console.log('[Server] Đã đóng máy chủ và ngắt kết nối database an toàn.');
          process.exit(0);
        } catch (err) {
          console.error('[Server Error] Lỗi khi ngắt kết nối database:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error(`[Server Error] Lỗi nghiêm trọng khi khởi động máy chủ: ${error.message}`);
    await doorBridge?.close();
    try {
      await disconnectDB();
    } catch {}
    process.exit(1);
  }
}

startServer();
