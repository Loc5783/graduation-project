import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import User from './models/User.js';
import UserSession from './models/UserSession.js';
import Notification from './models/Notification.js';
import { parseAllowedOrigins } from './middleware/csrf.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createSettingsRouter } from './routes/settingsRoutes.js';
import { createAccountRouter } from './routes/accountRoutes.js';
import { createNotificationRouter } from './routes/notificationRoutes.js';
import errorHandler from './middleware/errorHandler.js';

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
  app.use(express.json({ limit: '10kb', strict: false }));
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
    try {
      // 3.1 Kiểm tra cấu hình chỉ mục hiện có trên collection user_sessions trước khi init
      const collection = UserSession.collection;
      const collections = await collection.conn.db.listCollections({ name: collection.collectionName }).toArray();
      if (collections.length > 0) {
        const existingIndexes = await collection.indexes();
        const existingSessionStoreIndex = existingIndexes.find((idx) => idx.name === 'sessionStoreId_1');

        if (existingSessionStoreIndex && !existingSessionStoreIndex.unique) {
          throw new Error(
            'Phát hiện chỉ mục "sessionStoreId_1" trong collection "user_sessions" là chỉ mục không duy nhất (non-unique) từ phiên bản cũ. ' +
            'Server dừng khởi động vì chưa bảo đảm tính duy nhất của phiên đăng nhập. ' +
            'Vui lòng chạy script quản trị: "node scripts/upgradeSessionIndex.js --survey" để khảo sát dữ liệu hoặc "node scripts/upgradeSessionIndex.js --apply" để nâng cấp chỉ mục.'
          );
        }
      }

      await UserSession.init();

      // 3.2 Kiểm chứng cấu hình index thực tế trên MongoDB; không chỉ dựa vào khai báo unique trong schema
      const actualIndexes = await collection.indexes();
      const actualSessionStoreIndex = actualIndexes.find((idx) => idx.name === 'sessionStoreId_1');
      if (!actualSessionStoreIndex || !actualSessionStoreIndex.unique) {
        throw new Error(
          'Chỉ mục "sessionStoreId_1" trên MongoDB chưa đạt yêu cầu unique: true. ' +
          'Server dừng khởi động để bảo đảm tính toàn vẹn dữ liệu. ' +
          'Vui lòng chạy script quản trị: "node scripts/upgradeSessionIndex.js --apply".'
        );
      }

      console.log('[Database] Chỉ mục UserSession (Unique sessionStoreId) đã sẵn sàng.');
    } catch (indexError) {
      throw new Error(`Khởi tạo chỉ mục UserSession thất bại: ${indexError.message}`);
    }

    try {
      await Notification.init();
      console.log('[Database] Chỉ mục Notification đã sẵn sàng.');
    } catch (indexError) {
      throw new Error(`Khởi tạo chỉ mục Notification thất bại: ${indexError.message}`);
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

  // 6. Mount các route cài đặt (Settings)
  const settingsRouter = options.settingsRouter || createSettingsRouter(options);
  app.use('/api/settings', settingsRouter);

  // 7. Mount các route tài khoản (Account)
  const accountRouter = options.accountRouter || createAccountRouter(options);
  app.use('/api/account', accountRouter);

  // 8. Mount các route thông báo (Notifications)
  const notificationRouter = options.notificationRouter || createNotificationRouter(options);
  app.use('/api/notifications', notificationRouter);

  // 9. Xử lý đường dẫn không tồn tại (404 Handler)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `Đường dẫn ${req.method} ${req.originalUrl} không tồn tại trên hệ thống.`
    });
  });

  // 8. Xử lý lỗi tập trung (Error Handler)
  app.use(errorHandler);

  return app;
}

export default createApp;
