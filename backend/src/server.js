import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Chỉ dùng khóa tạm trong môi trường phát triển cục bộ.
if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== 'production') {
  process.env.SESSION_SECRET = 'df426817e903480c5785c4d2f0a3b7ec3844789295668fc0886f32b37f3ae3d6';
}

import session from 'express-session';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { createEnvironmentSensorBridge } from '../modules/environment-sensor/bridge.js';
import { assertEmailConfig } from './services/emailAuth.js';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_home_privacy';

async function startServer() {
  let envBridge;
  let isDbConnected = false;

  assertEmailConfig();

  try {
    // 1. Thử kết nối cơ sở dữ liệu MongoDB phát triển
    await connectDB(MONGODB_URI, 2);
    isDbConnected = true;
  } catch (dbErr) {
    if (process.env.NODE_ENV === 'production') throw dbErr;
    console.warn(`[Database Warning] Không thể kết nối MongoDB (${MONGODB_URI}): ${dbErr.message}`);
    console.warn('[Database Warning] Backend tự động chạy ở chế độ Bộ nhớ tạm (MemoryStore fallback) để giữ API và MQTT Bridge hoạt động liên tục.');
  }

  try {
    const appOptions = isDbConnected
      ? {}
      : { skipUserInit: true, sessionStore: new session.MemoryStore() };
    const app = await createApp(appOptions);

    envBridge = createEnvironmentSensorBridge(app.locals.environmentSensorTelemetry);
    envBridge.start();

    // 5. Lắng nghe tại 127.0.0.1:5000
    const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
    const server = app.listen(PORT, host, () => {
      console.log(`[Server] Máy chủ backend đang lắng nghe tại http://${host}:${PORT}`);
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
