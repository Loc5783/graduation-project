import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import {
  normalizeNotifications,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_ENUMS
} from '../src/constants/notificationDefaults.js';
import { APPEARANCE_DEFAULTS } from '../src/constants/settingsDefaults.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/settings';

describe('Backend Notification Settings API & MongoDB Integration Tests (Phase 4B)', () => {
  let app;
  let server;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);

    // BẢO VỆ NGHIÊM NGẶT: Phải đúng tên smart_home_privacy_test
    if (mongoose.connection.name !== 'smart_home_privacy_test') {
      throw new Error(
        `[CRITICAL SAFETY CHECK] Tên database là "${mongoose.connection.name}", KHÔNG PHẢI "smart_home_privacy_test". Dừng test ngay để bảo vệ dữ liệu!`
      );
    }

    const expressApp = await createApp({
      sessionSecret: 'test-secret-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4',
      rateLimiter: (req, res, next) => next()
    });

    await new Promise((resolve, reject) => {
      server = expressApp.listen(0, '127.0.0.1', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    server.locals = expressApp.locals;
    app = server;
  });

  afterAll(async () => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  beforeEach(async () => {
    if (mongoose.connection.name !== 'smart_home_privacy_test') {
      throw new Error('[CRITICAL SAFETY CHECK] Không được phép xóa dữ liệu ngoài database smart_home_privacy_test.');
    }

    await User.deleteMany({});
    const collections = await mongoose.connection.db.listCollections({ name: 'sessions' }).toArray();
    if (collections.length > 0) {
      await mongoose.connection.db.collection('sessions').deleteMany({});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper tạo tài khoản và đăng nhập để nhận cookie session hợp lệ
   */
  async function createAndLoginUser(customData = {}) {
    const fullName = customData.name || 'Người Dùng Thông Báo';
    const email = customData.email || 'user.notifications@example.com';
    const password = customData.password || 'MatKhau@123';

    await request(app)
      .post('/api/auth/register')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ fullName, email, password });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email, password });

    const cookies = loginRes.headers['set-cookie'];
    const user = await User.findOne({ email });

    return { cookies, user, email, password };
  }

  // ==========================================
  // NHÓM A: XÁC THỰC VÀ MIDDLEWARE BẢO VỆ YÊU CẦU
  // ==========================================
  describe('Nhóm A: Xác thực và Middleware bảo vệ yêu cầu', () => {
    it('PATCH /api/settings/notifications từ chối 401 khi chưa đăng nhập', async () => {
      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('PATCH /api/settings/notifications từ chối 415 khi thiếu Content-Type', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .send('minSeverity=urgent');

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('PATCH /api/settings/notifications từ chối 415 khi Content-Type là text/plain', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify({ minSeverity: 'urgent' }));

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('PATCH /api/settings/notifications từ chối 403 khi Origin không thuộc allowlist', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', 'http://malicious-site.com')
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/settings/notifications từ chối 403 khi Origin là "null"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', 'null')
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/settings/notifications từ chối 403 khi thiếu cả Origin và Referer', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/settings/notifications chấp nhận khi thiếu Origin nhưng có Referer hợp lệ', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.minSeverity).toBe('urgent');
    });

    it('PATCH /api/settings/notifications từ chối 400 INVALID_JSON khi cú pháp JSON hỏng', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"minSeverity": "urgent", bad_json}');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_JSON');
    });

    it('Không thể sửa cài đặt user khác qua body: body chứa userId bị từ chối 400 UNKNOWN_FIELD_REJECTED', async () => {
      const { cookies } = await createAndLoginUser({ email: 'user.victim@example.com' });
      const fakeOtherUserId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ userId: fakeOtherUserId, minSeverity: 'urgent' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });
  });

  // ==========================================
  // NHÓM B: GET /api/settings VỚI NOTIFICATIONS
  // ==========================================
  describe('Nhóm B: GET /api/settings với cấu trúc notifications', () => {
    it('User mới đăng ký: GET trả về appearance và notifications đầy đủ giá trị mặc định chuẩn', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appearance).toBeDefined();
      expect(res.body.data.appearance.theme).toBe(APPEARANCE_DEFAULTS.theme);

      const notif = res.body.data.notifications;
      expect(notif).toBeDefined();
      expect(notif.types.unusualAccess).toBe(NOTIFICATION_DEFAULTS.types.unusualAccess);
      expect(notif.types.deviceDisconnected).toBe(NOTIFICATION_DEFAULTS.types.deviceDisconnected);
      expect(notif.types.permissionChanges).toBe(NOTIFICATION_DEFAULTS.types.permissionChanges);
      expect(notif.types.monthlyReport).toBe(NOTIFICATION_DEFAULTS.types.monthlyReport);
      expect(notif.minSeverity).toBe(NOTIFICATION_DEFAULTS.minSeverity);
      expect(notif.quietHours.enabled).toBe(NOTIFICATION_DEFAULTS.quietHours.enabled);
      expect(notif.quietHours.startTime).toBe(NOTIFICATION_DEFAULTS.quietHours.startTime);
      expect(notif.quietHours.endTime).toBe(NOTIFICATION_DEFAULTS.quietHours.endTime);
      expect(notif.quietHours.allowUrgentBypass).toBe(true);
      expect(notif.channels.inAppWeb).toBe(NOTIFICATION_DEFAULTS.channels.inAppWeb);
      expect(notif.channels.email).toBe(false);
    });

    it('User cũ hoàn toàn thiếu settings.notifications trong DB: GET trả về defaults mà không crash', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập tài khoản cũ: xóa hoàn toàn settings.notifications trong collection MongoDB thô
      await User.collection.updateOne(
        { _id: user._id },
        { $unset: { 'settings.notifications': '' } }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toBeDefined();
      expect(res.body.data.notifications.minSeverity).toBe('warning');
      expect(res.body.data.notifications.types.unusualAccess).toBe(true);
      expect(res.body.data.notifications.quietHours.enabled).toBe(false);
      expect(res.body.data.notifications.channels.inAppWeb).toBe(true);
      expect(res.body.data.notifications.channels.email).toBe(false);
    });

    it('Từng nhánh types/quietHours/channels bị null hoặc sai kiểu trong DB thô: GET tự động phục hồi defaults an toàn', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu lỗi/sai kiểu trong MongoDB thô
      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.notifications': {
              types: 'corrupted_string',
              minSeverity: 12345,
              quietHours: null,
              channels: ['invalid_array']
            }
          }
        }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const notif = res.body.data.notifications;
      expect(notif.types.unusualAccess).toBe(true);
      expect(notif.types.monthlyReport).toBe(false);
      expect(notif.minSeverity).toBe('warning');
      expect(notif.quietHours.enabled).toBe(false);
      expect(notif.quietHours.startTime).toBe('22:00');
      expect(notif.quietHours.allowUrgentBypass).toBe(true);
      expect(notif.channels.inAppWeb).toBe(true);
      expect(notif.channels.email).toBe(false);
    });

    it('Bảo toàn giá trị boolean false: GET không dùng truthiness để biến false thành default true', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập user đã tắt unusualAccess và deviceDisconnected
      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.notifications': {
              types: {
                unusualAccess: false,
                deviceDisconnected: false,
                permissionChanges: true,
                monthlyReport: false
              },
              minSeverity: 'urgent',
              quietHours: {
                enabled: false,
                startTime: '23:00',
                endTime: '06:00',
                allowUrgentBypass: true
              },
              channels: {
                inAppWeb: false,
                email: false
              }
            }
          }
        }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      const notif = res.body.data.notifications;
      expect(notif.types.unusualAccess).toBe(false);
      expect(notif.types.deviceDisconnected).toBe(false);
      expect(notif.channels.inAppWeb).toBe(false);
      expect(notif.minSeverity).toBe('urgent');
    });

    it('GET tuyệt đối không ghi defaults ngược vào MongoDB (Kiểm tra collection thô trước và sau)', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Xóa settings.notifications trong DB thô
      await User.collection.updateOne(
        { _id: user._id },
        { $unset: { 'settings.notifications': '' } }
      );

      const rawBefore = await User.collection.findOne({ _id: user._id });
      expect(rawBefore.settings.notifications).toBeUndefined();

      // Gọi GET /api/settings
      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toBeDefined();

      // Kiểm tra lại collection thô: settings.notifications vẫn không bị tự ý ghi vào
      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications).toBeUndefined();
    });
  });

  // ==========================================
  // NHÓM C: PATCH /api/settings/notifications - VALIDATION VÀ KHÓA NGHIỆP VỤ
  // ==========================================
  describe('Nhóm C: Validation dữ liệu đầu vào và Khóa nghiệp vụ', () => {
    it('Cập nhật từng lá hợp lệ thành công: minSeverity', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.minSeverity).toBe('all');
    });

    it('Cập nhật từng lá hợp lệ thành công: types.unusualAccess: false', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.types.unusualAccess).toBe(false);
      // Các lá khác trong types được bảo toàn
      expect(res.body.data.notifications.types.deviceDisconnected).toBe(true);
    });

    it('Cập nhật từng lá hợp lệ thành công: quietHours.enabled: true', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { enabled: true } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.quietHours.enabled).toBe(true);
    });

    it('Cập nhật giờ đi qua nửa đêm: startTime: "22:00", endTime: "07:00"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          quietHours: {
            startTime: '23:30',
            endTime: '06:15'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.quietHours.startTime).toBe('23:30');
      expect(res.body.data.notifications.quietHours.endTime).toBe('06:15');
    });

    it('startTime === endTime được chấp nhận (khoảng yên lặng 0 phút, không chặn)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          quietHours: {
            startTime: '22:00',
            endTime: '22:00'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.quietHours.startTime).toBe('22:00');
      expect(res.body.data.notifications.quietHours.endTime).toBe('22:00');
    });

    it('Cập nhật channels.inAppWeb: false thành công', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { inAppWeb: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.channels.inAppWeb).toBe(false);
    });

    it('Cập nhật channels.email: false được chấp nhận (giữ nguyên tắt)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { email: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.channels.email).toBe(false);
    });

    it('Khóa nghiệp vụ: channels.email: true bị từ chối 400 CHANNEL_NOT_AVAILABLE', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { email: true } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('CHANNEL_NOT_AVAILABLE');
      expect(res.body.errors['channels.email']).toBeDefined();
    });

    it('Khóa nghiệp vụ: allowUrgentBypass: false bị từ chối 400 INVALID_FIELD_VALUE', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { allowUrgentBypass: false } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_VALUE');
      expect(res.body.errors['quietHours.allowUrgentBypass']).toBeDefined();
    });

    it('allowUrgentBypass: true được chấp nhận', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { allowUrgentBypass: true } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.quietHours.allowUrgentBypass).toBe(true);
    });

    it('Từ chối 400 EMPTY_UPDATE_BODY khi body rỗng {}', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMPTY_UPDATE_BODY');
    });

    it('Từ chối 400 EMPTY_UPDATE_BODY khi body chỉ chứa nhánh rỗng { types: {} }', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: {} });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMPTY_UPDATE_BODY');
    });

    it('Từ chối 400 INVALID_ENUM_VALUE khi minSeverity sai enum', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'critical' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_ENUM_VALUE');
      expect(res.body.errors.minSeverity).toBeDefined();
    });

    it('Từ chối 400 INVALID_FIELD_TYPE khi boolean là string ("false")', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: 'false' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_TYPE');
      expect(res.body.errors['types.unusualAccess']).toBeDefined();
    });

    it('Từ chối 400 INVALID_FIELD_TYPE khi boolean là number (0 hoặc 1)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { enabled: 1 } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_TYPE');
    });

    it('Từ chối 400 INVALID_FIELD_TYPE khi boolean là null', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { permissionChanges: null } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_TYPE');
    });

    it('Từ chối 400 INVALID_FIELD_VALUE khi giờ vượt quá phạm vi: startTime: "24:00"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { startTime: '24:00' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_VALUE');
    });

    it('Từ chối 400 INVALID_FIELD_VALUE khi giờ thiếu số 0: startTime: "7:00"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { startTime: '7:00' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_VALUE');
    });

    it('Từ chối 400 INVALID_FIELD_VALUE khi phút vượt quá phạm vi: endTime: "22:60"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { endTime: '22:60' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_VALUE');
    });

    it('Từ chối 400 INVALID_FIELD_VALUE khi giờ không phải định dạng số: startTime: "abc"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { startTime: 'invalid_time' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_FIELD_VALUE');
    });

    it('Từ chối 400 UNKNOWN_FIELD_REJECTED khi chứa trường lạ cấp 1', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ hackerField: true });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('Từ chối 400 UNKNOWN_FIELD_REJECTED khi chứa trường lạ trong types', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unknownEventType: true } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('Từ chối 400 UNKNOWN_FIELD_REJECTED khi chứa trường lạ trong quietHours', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { extraField: 123 } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('Từ chối 400 UNKNOWN_FIELD_REJECTED khi chứa trường lạ trong channels', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { sms: true } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('Chống injection: Key chứa ký tự "." hoặc "$" bị từ chối 400 UNKNOWN_FIELD_REJECTED', async () => {
      const { cookies } = await createAndLoginUser();

      const resDot = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ 'types.unusualAccess': false });

      expect(resDot.status).toBe(400);
      expect(resDot.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      const resDollar = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ '$where': 'sleep(1000)' });

      expect(resDollar.status).toBe(400);
      expect(resDollar.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('Chống leo thang đặc quyền: Cố tình gửi role, owned, passwordHash bị từ chối 400', async () => {
      const { cookies, user } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ role: 'admin', owned: ['device-1', 'device-2'] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      const userInDb = await User.findById(user._id);
      expect(userInDb.role).toBe('viewer');
      expect(userInDb.owned).toEqual([]);
    });

    it('Payload có cả trường đúng và trường sai: Từ chối hoàn toàn và KHÔNG lưu một phần', async () => {
      const { cookies, user } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          types: { unusualAccess: false },
          hackerField: 'malicious_value'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      // Kiểm tra trong DB: unusualAccess KHÔNG bị đổi thành false
      const dbUser = await User.findById(user._id);
      expect(dbUser.settings.notifications.types.unusualAccess).toBe(true);
    });
  });

  // ==========================================
  // NHÓM D: CẬP NHẬT TUẦN TỰ VÀ BẢO TOÀN DỮ LIỆU (SEQUENTIAL UPDATES)
  // ==========================================
  describe('Nhóm D: Cập nhật tuần tự và Bảo toàn dữ liệu (Sequential Updates)', () => {
    it('Hai request sửa hai lá khác nhau của notifications tuần tự không làm mất dữ liệu của nhau', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Request 1: Sửa types.unusualAccess thành false
      const res1 = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: false } });
      expect(res1.status).toBe(200);

      // Request 2: Sửa quietHours.startTime thành '23:00'
      const res2 = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { startTime: '23:00' } });
      expect(res2.status).toBe(200);

      // Kiểm tra: cả hai thay đổi đều có trong response và DB thô
      expect(res2.body.data.notifications.types.unusualAccess).toBe(false);
      expect(res2.body.data.notifications.quietHours.startTime).toBe('23:00');

      const rawUser = await User.collection.findOne({ _id: user._id });
      expect(rawUser.settings.notifications.types.unusualAccess).toBe(false);
      expect(rawUser.settings.notifications.quietHours.startTime).toBe('23:00');
    });

    it('Hai request sửa hai lá trong cùng một nhánh types tuần tự không làm mất dữ liệu của nhau', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Request 1: Tắt unusualAccess
      await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: false } });

      // Request 2: Tắt deviceDisconnected
      const res2 = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { deviceDisconnected: false } });

      expect(res2.status).toBe(200);
      expect(res2.body.data.notifications.types.unusualAccess).toBe(false);
      expect(res2.body.data.notifications.types.deviceDisconnected).toBe(false);

      const rawUser = await User.collection.findOne({ _id: user._id });
      expect(rawUser.settings.notifications.types.unusualAccess).toBe(false);
      expect(rawUser.settings.notifications.types.deviceDisconnected).toBe(false);
    });

    it('PATCH appearance và PATCH notifications tuần tự: Cả hai nhóm được bảo toàn nguyên vẹn', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Cập nhật appearance
      const resApp = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light', fontSize: 'large' });
      expect(resApp.status).toBe(200);

      // Cập nhật notifications
      const resNotif = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent', quietHours: { enabled: true } });
      expect(resNotif.status).toBe(200);

      // Gọi GET /api/settings kiểm tra cả 2 nhóm
      const resGet = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(resGet.status).toBe(200);
      expect(resGet.body.data.appearance.theme).toBe('light');
      expect(resGet.body.data.appearance.fontSize).toBe('large');
      expect(resGet.body.data.notifications.minSeverity).toBe('urgent');
      expect(resGet.body.data.notifications.quietHours.enabled).toBe(true);

      // Kiểm tra DB thô
      const rawUser = await User.collection.findOne({ _id: user._id });
      expect(rawUser.settings.appearance.theme).toBe('light');
      expect(rawUser.settings.appearance.fontSize).toBe('large');
      expect(rawUser.settings.notifications.minSeverity).toBe('urgent');
      expect(rawUser.settings.notifications.quietHours.enabled).toBe(true);
    });

    it('PATCH notifications không làm thay đổi name, email, role, owned, passwordHash hoặc authVersion', async () => {
      const { cookies, user } = await createAndLoginUser();
      const initialUser = await User.findById(user._id).lean();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'all' });

      expect(res.status).toBe(200);

      const afterUser = await User.findById(user._id).lean();
      expect(afterUser.name).toBe(initialUser.name);
      expect(afterUser.email).toBe(initialUser.email);
      expect(afterUser.role).toBe(initialUser.role);
      expect(afterUser.owned).toEqual(initialUser.owned);
      expect(afterUser.passwordHash).toBe(initialUser.passwordHash);
      expect(afterUser.authVersion).toBe(initialUser.authVersion);
    });

    it('Response PATCH thành công không để lộ password, hash, secret hoặc thông tin nhạy cảm', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(200);
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('passwordHash');
      expect(jsonStr).not.toContain('authVersion');
      expect(jsonStr).not.toContain('sessionSecret');
    });

    it('User A cập nhật notifications không ảnh hưởng hoặc thay đổi notifications của User B (Cách ly người dùng)', async () => {
      const userA = await createAndLoginUser({ email: 'user.a.notif@example.com' });
      const userB = await createAndLoginUser({ email: 'user.b.notif@example.com' });

      // User A đặt minSeverity là 'urgent'
      const resA = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', userA.cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });
      expect(resA.status).toBe(200);

      // User B kiểm tra settings của mình: vẫn là default 'warning'
      const resB = await request(app)
        .get('/api/settings')
        .set('Cookie', userB.cookies);

      expect(resB.status).toBe(200);
      expect(resB.body.data.notifications.minSeverity).toBe('warning');
    });

    it('PATCH notifications khi tài khoản đã bị xóa trả về 401 UNAUTHORIZED và không tạo user mới (không upsert)', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Xóa người dùng trong database
      await User.findByIdAndDelete(user._id);

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');

      // Đảm bảo không có user nào bị tạo mới ngoài ý muốn
      const checkDoc = await User.findById(user._id);
      expect(checkDoc).toBeNull();
    });
  });

  // ==========================================
  // NHÓM E: KIỂM THỬ HAI REQUEST ĐỒNG THỜI CÓ BARRIER (TRUE CONCURRENCY)
  // ==========================================
  describe('Nhóm E: Kiểm thử hai request đồng thời có Barrier (True Concurrency)', () => {
    /**
     * Tạo Barrier đồng bộ hóa số lượng request đồng thời trước điểm ghi MongoDB
     */
    function createConcurrencyBarrier(expectedCount = 2, timeoutMs = 8000) {
      let count = 0;
      let timer;
      let resolveBarrier;
      let rejectBarrier;

      const barrierPromise = new Promise((resolve, reject) => {
        resolveBarrier = resolve;
        rejectBarrier = reject;
      });

      timer = setTimeout(() => {
        rejectBarrier(
          new Error(`[Barrier Timeout] Chờ ${expectedCount} requests tới điểm ghi nhưng chỉ có ${count} tới sau ${timeoutMs}ms.`)
        );
      }, timeoutMs);

      return {
        async arriveAndWait() {
          count++;
          if (count >= expectedCount) {
            clearTimeout(timer);
            resolveBarrier();
          }
          await barrierPromise;
        },
        getCount() {
          return count;
        },
        cleanup() {
          clearTimeout(timer);
        }
      };
    }

    /**
     * Cài đặt barrier vào method ghi của Model (mặc định findByIdAndUpdate)
     */
    function installWriteBarrier(model, methodName = 'findByIdAndUpdate', barrier) {
      const originalMethod = model[methodName];
      vi.spyOn(model, methodName).mockImplementation(function (...args) {
        const query = originalMethod.apply(this, args);
        const originalExec = query.exec;
        query.exec = async function (...execArgs) {
          await barrier.arriveAndWait();
          return originalExec.apply(this, execArgs);
        };
        return query;
      });
    }

    it('Trường hợp A: Hai request đồng thời sửa hai nhánh notifications khác nhau (types vs quietHours)', async () => {
      const { cookies, user } = await createAndLoginUser();
      const barrier = createConcurrencyBarrier(2);
      installWriteBarrier(User, 'findByIdAndUpdate', barrier);

      try {
        const req1 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ types: { unusualAccess: false } });

        const req2 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ quietHours: { startTime: '23:00' } });

        const [res1, res2] = await Promise.all([req1, req2]);

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);
        expect(res2.status).toBe(200);
        expect(res2.body.success).toBe(true);
        expect(barrier.getCount()).toBe(2);

        // Xác minh trực tiếp trong collection thô MongoDB
        const rawUser = await User.collection.findOne({ _id: user._id });
        expect(rawUser.settings.notifications.types.unusualAccess).toBe(false);
        expect(rawUser.settings.notifications.quietHours.startTime).toBe('23:00');
        // Các lá không gửi được bảo toàn
        expect(rawUser.settings.notifications.types.deviceDisconnected).toBe(true);
      } finally {
        barrier.cleanup();
        vi.restoreAllMocks();
      }
    });

    it('Trường hợp B: Hai request đồng thời sửa hai lá trong cùng nhánh types (unusualAccess vs deviceDisconnected)', async () => {
      const { cookies, user } = await createAndLoginUser();
      const barrier = createConcurrencyBarrier(2);
      installWriteBarrier(User, 'findByIdAndUpdate', barrier);

      try {
        const req1 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ types: { unusualAccess: false } });

        const req2 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ types: { deviceDisconnected: false } });

        const [res1, res2] = await Promise.all([req1, req2]);

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);
        expect(res2.status).toBe(200);
        expect(res2.body.success).toBe(true);
        expect(barrier.getCount()).toBe(2);

        // Xác minh trực tiếp trong collection thô MongoDB: cả 2 lá đều được lưu thành false
        const rawUser = await User.collection.findOne({ _id: user._id });
        expect(rawUser.settings.notifications.types.unusualAccess).toBe(false);
        expect(rawUser.settings.notifications.types.deviceDisconnected).toBe(false);
        // Các lá khác trong types được giữ nguyên
        expect(rawUser.settings.notifications.types.permissionChanges).toBe(true);
      } finally {
        barrier.cleanup();
        vi.restoreAllMocks();
      }
    });

    it('Trường hợp C: Hai request đồng thời sửa hai endpoint khác nhau (PATCH appearance vs PATCH notifications)', async () => {
      const { cookies, user } = await createAndLoginUser();
      const barrier = createConcurrencyBarrier(2);
      installWriteBarrier(User, 'findByIdAndUpdate', barrier);

      try {
        const reqAppearance = request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ theme: 'light', fontSize: 'large' });

        const reqNotifications = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ minSeverity: 'urgent', quietHours: { enabled: true } });

        const [resApp, resNotif] = await Promise.all([reqAppearance, reqNotifications]);

        expect(resApp.status).toBe(200);
        expect(resApp.body.success).toBe(true);
        expect(resNotif.status).toBe(200);
        expect(resNotif.body.success).toBe(true);
        expect(barrier.getCount()).toBe(2);

        // Xác minh trực tiếp trong collection thô MongoDB: cả hai nhóm đều tồn tại trọn vẹn
        const rawUser = await User.collection.findOne({ _id: user._id });
        expect(rawUser.settings.appearance.theme).toBe('light');
        expect(rawUser.settings.appearance.fontSize).toBe('large');
        expect(rawUser.settings.notifications.minSeverity).toBe('urgent');
        expect(rawUser.settings.notifications.quietHours.enabled).toBe(true);
      } finally {
        barrier.cleanup();
        vi.restoreAllMocks();
      }
    });

    it('Trường hợp D: Hai request đồng thời trên dữ liệu ban đầu hoàn toàn thiếu settings.notifications ($unset)', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu cũ: xóa hoàn toàn settings.notifications
      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: { 'settings.appearance': { theme: 'dark' } },
          $unset: { 'settings.notifications': '' }
        }
      );

      const barrier = createConcurrencyBarrier(2);
      installWriteBarrier(User, 'findByIdAndUpdate', barrier);

      try {
        const req1 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ types: { unusualAccess: false } });

        const req2 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ quietHours: { startTime: '23:00' } });

        const [res1, res2] = await Promise.all([req1, req2]);

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);
        expect(res2.status).toBe(200);
        expect(res2.body.success).toBe(true);
        expect(barrier.getCount()).toBe(2);

        const rawUser = await User.collection.findOne({ _id: user._id });
        expect(rawUser.settings.appearance.theme).toBe('dark');
        expect(rawUser.settings.notifications.types.unusualAccess).toBe(false);
        expect(rawUser.settings.notifications.quietHours.startTime).toBe('23:00');
      } finally {
        barrier.cleanup();
        vi.restoreAllMocks();
      }
    });

    it('Trường hợp E: Hai request đồng thời trên dữ liệu ban đầu có settings.notifications: null', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu cũ: settings.notifications: null
      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': { theme: 'light' },
            'settings.notifications': null
          }
        }
      );

      const barrier = createConcurrencyBarrier(2);
      installWriteBarrier(User, 'findByIdAndUpdate', barrier);

      try {
        const req1 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ types: { unusualAccess: false } });

        const req2 = request(app)
          .patch('/api/settings/notifications')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ quietHours: { startTime: '23:00' } });

        const [res1, res2] = await Promise.all([req1, req2]);

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);
        expect(res2.status).toBe(200);
        expect(res2.body.success).toBe(true);
        expect(barrier.getCount()).toBe(2);

        const rawUser = await User.collection.findOne({ _id: user._id });
        expect(rawUser.settings.appearance.theme).toBe('light');
        expect(rawUser.settings.notifications.types.unusualAccess).toBe(false);
        expect(rawUser.settings.notifications.quietHours.startTime).toBe('23:00');
      } finally {
        barrier.cleanup();
        vi.restoreAllMocks();
      }
    });
  });

  // ==========================================
  // NHÓM F: PATCH PHỤC HỒI CẤU TRÚC DỮ LIỆU CŨ (LEGACY FIXTURES)
  // ==========================================
  describe('Nhóm F: PATCH phục hồi cấu trúc dữ liệu cũ (Legacy Fixtures)', () => {
    it('Fixture 1: PATCH thành công khi settings hoàn toàn thiếu trong collection ($unset)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne({ _id: user._id }, { $unset: { settings: '' } });
      const rawBefore = await User.collection.findOne({ _id: user._id });
      expect(rawBefore.settings).toBeUndefined();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Response có cấu trúc đầy đủ do normalizer bù đắp
      expect(res.body.data.notifications.types.unusualAccess).toBe(false);
      expect(res.body.data.notifications.types.deviceDisconnected).toBe(true);
      expect(res.body.data.notifications.minSeverity).toBe('warning');

      // Xác minh DB thô: chỉ lưu đúng lá gửi lên, không lưu ngầm các defaults
      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.types.unusualAccess).toBe(false);
      expect(rawAfter.settings.notifications.types.deviceDisconnected).toBeUndefined();
      expect(rawAfter.settings.notifications.minSeverity).toBeUndefined();
      expect(rawAfter.settings.notifications._id).toBeUndefined();

      // Không thay đổi các trường hồ sơ cốt lõi
      expect(rawAfter.name).toBe(user.name);
      expect(rawAfter.email).toBe(user.email);
      expect(rawAfter.role).toBe(user.role);
    });

    it('Fixture 2: PATCH thành công khi settings: null trong collection ($set null)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne({ _id: user._id }, { $set: { settings: null } });

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'urgent' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.minSeverity).toBe('urgent');
      expect(rawAfter.settings.notifications._id).toBeUndefined();
    });

    it('Fixture 3: PATCH thành công khi settings là chuỗi sai kiểu ($set string)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne({ _id: user._id }, { $set: { settings: 'corrupted_string' } });

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { enabled: true, startTime: '23:30' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.quietHours.enabled).toBe(true);
      expect(rawAfter.settings.notifications.quietHours.startTime).toBe('23:30');
    });

    it('Fixture 4: PATCH thành công khi settings là mảng sai kiểu ($set array)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne({ _id: user._id }, { $set: { settings: ['an_array'] } });

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { inAppWeb: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.channels.inAppWeb).toBe(false);
    });

    it('Fixture 5: PATCH thành công khi settings.notifications hoàn toàn thiếu ($unset) kèm bảo toàn appearance', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: { 'settings.appearance': { theme: 'light', fontSize: 'small' } },
          $unset: { 'settings.notifications': '' }
        }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.appearance.theme).toBe('light');
      expect(rawAfter.settings.appearance.fontSize).toBe('small');
      expect(rawAfter.settings.notifications.minSeverity).toBe('all');
    });

    it('Fixture 6: PATCH thành công khi settings.notifications: null kèm bảo toàn appearance', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': { theme: 'system', language: 'en' },
            'settings.notifications': null
          }
        }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { permissionChanges: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.appearance.theme).toBe('system');
      expect(rawAfter.settings.appearance.language).toBe('en');
      expect(rawAfter.settings.notifications.types.permissionChanges).toBe(false);
    });

    it('Fixture 7: PATCH thành công khi settings.notifications là chuỗi sai kiểu ($set string)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': { theme: 'dark' },
            'settings.notifications': 'corrupted_notifications_string'
          }
        }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { enabled: true } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.appearance.theme).toBe('dark');
      expect(rawAfter.settings.notifications.quietHours.enabled).toBe(true);
    });

    it('Fixture 8: PATCH thành công khi settings.notifications.types: null ($set null)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        { $set: { 'settings.notifications.types': null } }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.types.unusualAccess).toBe(false);
    });

    it('Fixture 9: PATCH thành công khi settings.notifications.types là chuỗi sai kiểu ($set string)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        { $set: { 'settings.notifications.types': 'invalid_string' } }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { deviceDisconnected: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.types.deviceDisconnected).toBe(false);
    });

    it('Fixture 10: PATCH thành công khi settings.notifications.quietHours: null ($set null)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        { $set: { 'settings.notifications.quietHours': null } }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { startTime: '21:00', endTime: '08:00' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.quietHours.startTime).toBe('21:00');
      expect(rawAfter.settings.notifications.quietHours.endTime).toBe('08:00');
    });

    it('Fixture 11: PATCH thành công khi settings.notifications.quietHours là số sai kiểu ($set number)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        { $set: { 'settings.notifications.quietHours': 99999 } }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ quietHours: { enabled: true } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.quietHours.enabled).toBe(true);
    });

    it('Fixture 12: PATCH thành công khi settings.notifications.channels: null ($set null)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        { $set: { 'settings.notifications.channels': null } }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { inAppWeb: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.channels.inAppWeb).toBe(false);
    });

    it('Fixture 13: PATCH thành công khi settings.notifications.channels là boolean sai kiểu ($set boolean)', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        { $set: { 'settings.notifications.channels': true } }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ channels: { inAppWeb: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.channels.inAppWeb).toBe(false);
    });

    it('Fixture 14: PATCH bảo toàn các nhóm settings khác (ví dụ: settings.privacy) trên dữ liệu cũ', async () => {
      const { cookies, user } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.privacy': { dataSharing: false, tracking: 'disabled' },
            'settings.notifications': null
          }
        }
      );

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ minSeverity: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.privacy.dataSharing).toBe(false);
      expect(rawAfter.settings.privacy.tracking).toBe('disabled');
      expect(rawAfter.settings.notifications.minSeverity).toBe('all');
    });

    it('Fixture 15: Phân biệt giá trị thực sự lưu trong DB vs giá trị do normalizer bù trong response (không ghi defaults vào DB thô)', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Xóa hoàn toàn settings.notifications
      await User.collection.updateOne({ _id: user._id }, { $unset: { 'settings.notifications': '' } });

      // Gửi PATCH chỉ đúng 1 lá duy nhất: types.unusualAccess = false
      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ types: { unusualAccess: false } });

      expect(res.status).toBe(200);
      // Response trả đủ các trường do normalizer bù đắp
      expect(res.body.data.notifications.types.unusualAccess).toBe(false);
      expect(res.body.data.notifications.types.deviceDisconnected).toBe(true);
      expect(res.body.data.notifications.minSeverity).toBe('warning');
      expect(res.body.data.notifications.quietHours.enabled).toBe(false);
      expect(res.body.data.notifications.channels.inAppWeb).toBe(true);

      // Collection thô: CHỈ có unusualAccess được lưu, các lá khác không bị ghi defaults ngầm
      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications.types.unusualAccess).toBe(false);
      expect(rawAfter.settings.notifications.types.deviceDisconnected).toBeUndefined();
      expect(rawAfter.settings.notifications.minSeverity).toBeUndefined();
      expect(rawAfter.settings.notifications.quietHours).toBeUndefined();
      expect(rawAfter.settings.notifications.channels).toBeUndefined();
    });

    it('Fixture 16: Không sinh _id trong bất kỳ subdocument nào của notifications khi lưu vào MongoDB', async () => {
      const { cookies, user } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/notifications')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          types: { unusualAccess: false },
          quietHours: { enabled: true, startTime: '23:00' },
          channels: { inAppWeb: false }
        });

      expect(res.status).toBe(200);

      const rawAfter = await User.collection.findOne({ _id: user._id });
      expect(rawAfter.settings.notifications._id).toBeUndefined();
      expect(rawAfter.settings.notifications.types._id).toBeUndefined();
      expect(rawAfter.settings.notifications.quietHours._id).toBeUndefined();
      expect(rawAfter.settings.notifications.channels._id).toBeUndefined();
    });
  });

  // ==========================================
  // NHÓM G: KIỂM THỬ ĐƠN VỊ CHO NORMALIZER (UNIT TESTS FOR normalizeNotifications)
  // ==========================================
  describe('Nhóm G: Kiểm thử Đơn vị cho Normalizer (Unit Tests for normalizeNotifications)', () => {
    it('Không mutate input object (nghiệm thu an toàn với Object.freeze)', () => {
      const input = Object.freeze({
        types: Object.freeze({ unusualAccess: false }),
        minSeverity: 'urgent',
        quietHours: Object.freeze({ enabled: true, startTime: '23:00' }),
        channels: Object.freeze({ inAppWeb: false })
      });

      expect(() => normalizeNotifications(input)).not.toThrow();
      expect(input.types.unusualAccess).toBe(false);
      expect(input.minSeverity).toBe('urgent');
    });

    it('Không mutate NOTIFICATION_DEFAULTS', () => {
      const defaultsSnapshot = JSON.stringify(NOTIFICATION_DEFAULTS);
      normalizeNotifications(null);
      normalizeNotifications({});
      normalizeNotifications({ types: { unusualAccess: false } });

      expect(JSON.stringify(NOTIFICATION_DEFAULTS)).toBe(defaultsSnapshot);
    });

    it('Hai lần gọi độc lập không dùng chung object con có thể bị sửa ngoài ý muốn', () => {
      const res1 = normalizeNotifications(null);
      const res2 = normalizeNotifications(null);

      // Đảm bảo là các object riêng biệt trong bộ nhớ
      expect(res1).not.toBe(res2);
      expect(res1.types).not.toBe(res2.types);
      expect(res1.quietHours).not.toBe(res2.quietHours);
      expect(res1.channels).not.toBe(res2.channels);

      // Sửa res1 không làm thay đổi res2
      res1.types.unusualAccess = false;
      res1.quietHours.startTime = '01:00';
      res1.channels.inAppWeb = false;

      expect(res2.types.unusualAccess).toBe(true);
      expect(res2.quietHours.startTime).toBe('22:00');
      expect(res2.channels.inAppWeb).toBe(true);
    });

    it('Bảo toàn chính xác giá trị false hợp lệ trên tất cả các trường boolean', () => {
      const input = {
        types: {
          unusualAccess: false,
          deviceDisconnected: false,
          permissionChanges: false,
          monthlyReport: false
        },
        minSeverity: 'urgent',
        quietHours: {
          enabled: false,
          startTime: '23:00',
          endTime: '06:00',
          allowUrgentBypass: true
        },
        channels: {
          inAppWeb: false,
          email: false
        }
      };

      const result = normalizeNotifications(input);
      expect(result.types.unusualAccess).toBe(false);
      expect(result.types.deviceDisconnected).toBe(false);
      expect(result.types.permissionChanges).toBe(false);
      expect(result.types.monthlyReport).toBe(false);
      expect(result.quietHours.enabled).toBe(false);
      expect(result.channels.inAppWeb).toBe(false);
      expect(result.channels.email).toBe(false);
    });

    it('Dữ liệu raw là undefined, null, chuỗi, số, mảng được chuẩn hóa thành cấu trúc mặc định đầy đủ', () => {
      const inputs = [undefined, null, 'invalid_string', 12345, ['array'], true];

      for (const raw of inputs) {
        const result = normalizeNotifications(raw);
        expect(result).toBeDefined();
        expect(result.types.unusualAccess).toBe(true);
        expect(result.types.deviceDisconnected).toBe(true);
        expect(result.types.permissionChanges).toBe(true);
        expect(result.types.monthlyReport).toBe(false);
        expect(result.minSeverity).toBe('warning');
        expect(result.quietHours.enabled).toBe(false);
        expect(result.quietHours.startTime).toBe('22:00');
        expect(result.quietHours.endTime).toBe('07:00');
        expect(result.quietHours.allowUrgentBypass).toBe(true);
        expect(result.channels.inAppWeb).toBe(true);
        expect(result.channels.email).toBe(false);
      }
    });

    it('Từng nhánh con types, quietHours, channels bị null hoặc sai kiểu được chuẩn hóa an toàn', () => {
      const raw = {
        types: 'not_an_object',
        minSeverity: 'invalid_enum',
        quietHours: null,
        channels: [1, 2, 3]
      };

      const result = normalizeNotifications(raw);
      expect(result.types.unusualAccess).toBe(true);
      expect(result.minSeverity).toBe('warning');
      expect(result.quietHours.enabled).toBe(false);
      expect(result.quietHours.startTime).toBe('22:00');
      expect(result.channels.inAppWeb).toBe(true);
      expect(result.channels.email).toBe(false);
    });

    it('allowUrgentBypass luôn luôn chuẩn hóa là true kể cả khi input là false hoặc sai kiểu', () => {
      const resFalse = normalizeNotifications({ quietHours: { allowUrgentBypass: false } });
      expect(resFalse.quietHours.allowUrgentBypass).toBe(true);

      const resString = normalizeNotifications({ quietHours: { allowUrgentBypass: 'false' } });
      expect(resString.quietHours.allowUrgentBypass).toBe(true);

      const resNull = normalizeNotifications({ quietHours: { allowUrgentBypass: null } });
      expect(resNull.quietHours.allowUrgentBypass).toBe(true);
    });

    it('channels.email luôn luôn chuẩn hóa là false kể cả khi input là true hoặc chuỗi', () => {
      const resTrue = normalizeNotifications({ channels: { email: true } });
      expect(resTrue.channels.email).toBe(false);

      const resString = normalizeNotifications({ channels: { email: 'true' } });
      expect(resString.channels.email).toBe(false);

      const resNull = normalizeNotifications({ channels: { email: null } });
      expect(resNull.channels.email).toBe(false);
    });
  });
});
