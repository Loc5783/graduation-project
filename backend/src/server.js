import dotenv from 'dotenv';
dotenv.config();

import session from 'express-session';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { createEnvironmentSensorBridge } from '../modules/environment-sensor/bridge.js';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_home_privacy';

async function startServer() {
  let envBridge;
  let isDbConnected = false;

  try {
    // 1. Thử kết nối cơ sở dữ liệu MongoDB phát triển
    try {
      await connectDB(MONGODB_URI);
      isDbConnected = true;
      console.log('[Database] Kết nối MongoDB thành công.');
    } catch (dbErr) {
      console.warn(`[Database] Không thể kết nối MongoDB tại ${MONGODB_URI}.`);
      console.warn('[Database] Khởi động chế độ phát triển độc lập (Memory Session, xác thực tài khoản tạm tắt).');
    }

    // 2. Cấu hình app options nếu không có DB
    const appOptions = {};
    if (!isDbConnected) {
      appOptions.sessionStore = new session.MemoryStore();
      appOptions.skipUserInit = true;
    }

    // 3. Khởi tạo Express app
    const app = await createApp(appOptions);

    // 4. Khởi động MQTT Bridge kết nối Broker (broker.emqx.io)
    envBridge = createEnvironmentSensorBridge(app.locals.environmentSensorTelemetry);
    envBridge.start();

    // 5. Lắng nghe tại 127.0.0.1:5000
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`[Server] Máy chủ backend đang lắng nghe tại http://127.0.0.1:${PORT}`);
    });

    // Xử lý dừng máy chủ an toàn (Graceful Shutdown)
    let shuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n[Server] Nhận tín hiệu ${signal}. Đang đóng các kết nối...`);
      await envBridge?.close();
      server.close(async () => {
        try {
          if (isDbConnected) await disconnectDB();
          console.log('[Server] Đã đóng máy chủ an toàn.');
          process.exit(0);
        } catch (err) {
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error(`[Server Error] Lỗi nghiêm trọng khi khởi động máy chủ: ${error.message}`);
    await envBridge?.close();
    if (isDbConnected) {
      try {
        await disconnectDB();
      } catch {}
    }
    process.exit(1);
  }
}

startServer();
