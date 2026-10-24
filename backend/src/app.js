import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import User from './models/User.js';
import { parseAllowedOrigins } from './middleware/csrf.js';
import { createAuthRouter } from './routes/authRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import { SmartDoorLockTelemetry } from '../modules/smart-door-lock/telemetry.js';
import { createSmartDoorLockRouter } from '../modules/smart-door-lock/router.js';

/**
 * Khởi tạo ứng dụng Express và cấu hình các middleware an toàn
 * Chỉ sẵn sàng nhận request khi MongoDB và Session store đã kết nối và khởi tạo xong.
 *
 * @param {object} options Các tùy chọn khởi tạo (dùng cho môi trường tùy biến hoặc kiểm thử)
 * @returns {Promise<express.Application>}
 */
export async function createApp(options = {}) {
  const app = express();

  // Đảm bảo SESSION_SECRET tồn tại, không dùng chuỗi mặc định tĩnh
  const sessionSecret = options.sessionSecret || process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('Thiếu cấu hình SESSION_SECRET trong biến môi trường.');
  }

  // 1. Giới hạn kích thước payload JSON (chống tấn công DoS qua payload lớn)
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // 2. Cấu hình CORS với allowlist
  const allowedOrigins = options.allowedOrigins || parseAllowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        // Cho phép request không có origin (ví dụ công cụ kiểm thử nội bộ/supertest) hoặc origin hợp lệ
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true
    })
  );

  // 3. Khởi tạo và kiểm tra chỉ mục User (Unique index trên email)
  if (!options.skipUserInit) {
    if (mongoose.connection.readyState === 0) {
      throw new Error('MongoDB chưa được kết nối trước khi khởi tạo chỉ mục User.');
    }
    try {
      await User.init();
      console.log('[Database] Chỉ mục Unique Index email của User đã sẵn sàng.');
    } catch (indexError) {
      throw new Error(`Khởi tạo chỉ mục Unique Index email thất bại: ${indexError.message}`);
    }
  }

  // 4. Khởi tạo MongoDB session store
  // Sử dụng kết nối Mongoose hiện có để tối ưu tài nguyên và quản lý vòng đời
  let store = options.sessionStore;
  if (!store) {
    if (mongoose.connection.readyState === 0) {
      throw new Error('MongoDB chưa được kết nối trước khi khởi tạo Session Store.');
    }
    store = MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // 14 ngày
    });

    // Đợi session store hoàn tất khởi tạo chỉ mục và collection trước khi nhận request
    await store.collectionP;
  }

  // Lưu tham chiếu store vào app để có thể kiểm thử ngắt kết nối store
  app.locals.sessionStore = store;

  // 4. Cấu hình express-session
  app.use(
    session({
      name: 'shp_sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // Mặc định 1 ngày
      }
    })
  );

  // 5. Mount các route xác thực
  const authRouter = options.authRouter || createAuthRouter(options);
  app.use('/api/auth', authRouter);

  // Smart Door Lock is isolated from the other device modules and exposes read-only data.
  const doorTelemetry = options.smartDoorLockTelemetry || new SmartDoorLockTelemetry();
  app.locals.smartDoorLockTelemetry = doorTelemetry;
  app.use('/api/smart-door-lock', createSmartDoorLockRouter(doorTelemetry, options.smartDoorLockOptions));

  // 6. Xử lý đường dẫn không tồn tại (404 Handler)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `Đường dẫn ${req.method} ${req.originalUrl} không tồn tại trên hệ thống.`
    });
  });

  // 7. Xử lý lỗi tập trung (Error Handler)
  app.use(errorHandler);

  return app;
}

export default createApp;
