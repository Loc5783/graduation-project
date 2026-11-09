import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import UserSession from '../src/models/UserSession.js';
import Notification from '../src/models/Notification.js';
import {
  isInQuietHours,
  isSeverityAllowed,
  dispatchNotification,
  dispatchSessionRevokedNotification
} from '../src/services/notificationService.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/notifications';

describe('Backend Notifications & Session Revocation Event Integration Tests (Phase 4D.1)', () => {
  let app;
  let server;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);

    // Kiểm tra an toàn bắt buộc: chỉ chạy trên database smart_home_privacy_test
    if (mongoose.connection.name !== 'smart_home_privacy_test') {
      throw new Error(
        `[CRITICAL SAFETY CHECK] Tên database là "${mongoose.connection.name}", KHÔNG PHẢI "smart_home_privacy_test". Dừng test ngay để bảo vệ dữ liệu!`
      );
    }

    const expressApp = await createApp({
      sessionSecret: 'test-secret-notifications-phase4d-e9c5a1208fb67c4892e85a08bb87d8e8b61c16260a48b321a'
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
    await UserSession.deleteMany({});
    await Notification.deleteMany({});
    const collections = await mongoose.connection.db.listCollections({ name: 'sessions' }).toArray();
    if (collections.length > 0) {
      await mongoose.connection.db.collection('sessions').deleteMany({});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper tạo người dùng và đăng nhập lấy cookie phiên
   */
  async function createAndLoginUser(customData = {}, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0') {
    const fullName = customData.name || 'Người Dùng Test';
    const email = customData.email || 'user.notification@example.com';
    const password = customData.password || 'MatKhau@123';

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: fullName,
      email: email.toLowerCase(),
      passwordHash,
      role: customData.role || 'viewer',
      owned: customData.owned || [],
      authVersion: customData.authVersion !== undefined ? customData.authVersion : 0,
      settings: customData.settings || {}
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('User-Agent', userAgent)
      .send({ email: email.toLowerCase(), password, remember: false });

    const cookieHeader = loginRes.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookieHeader)
      ? cookieHeader.find((c) => c.startsWith('shp_sid='))
      : cookieHeader;

    return { user, sessionCookie };
  }

  // =========================================================================
  // NHÓM 1: API HỘP THƯ, PHÂN TRANG VÀ BẢO VỆ DỮ LIỆU
  // =========================================================================
  describe('Nhóm 1: API Hộp thư (GET, PATCH read, PATCH read-all)', () => {
    it('GET /api/notifications: từ chối 401 khi chưa đăng nhập', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/notifications: danh sách rỗng trả về 200 với items: [] và unreadCount: 0', async () => {
      const { sessionCookie } = await createAndLoginUser();
      const res = await request(app)
        .get('/api/notifications')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('OK');
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.nextCursor).toBeNull();
      expect(res.body.data.unreadCount).toBe(0);
    });

    it('GET /api/notifications: kiểm tra phân trang limit và từ chối limit không hợp lệ', async () => {
      const { sessionCookie } = await createAndLoginUser();

      // Từ chối limit = 0
      let res = await request(app).get('/api/notifications?limit=0').set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QUERY');

      // Từ chối limit âm
      res = await request(app).get('/api/notifications?limit=-5').set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QUERY');

      // Từ chối limit vượt quá 50
      res = await request(app).get('/api/notifications?limit=51').set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QUERY');

      // Từ chối limit là chữ
      res = await request(app).get('/api/notifications?limit=abc').set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QUERY');

      // Từ chối limit là số thực 10.5
      res = await request(app).get('/api/notifications?limit=10.5').set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QUERY');
    });

    it('GET /api/notifications: từ chối cursor không hợp lệ', async () => {
      const { sessionCookie } = await createAndLoginUser();

      // Chuỗi rác
      let res = await request(app).get('/api/notifications?cursor=not-a-valid-base64!').set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');

      // Base64 nhưng JSON không đủ trường
      const badJson = Buffer.from(JSON.stringify({ someKey: 'val' })).toString('base64url');
      res = await request(app).get(`/api/notifications?cursor=${badJson}`).set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');

      // Base64 nhưng createdAt không phải ngày hợp lệ
      const badDate = Buffer.from(JSON.stringify({ createdAt: 'invalid-date', id: '507f1f77bcf86cd799439011' })).toString('base64url');
      res = await request(app).get(`/api/notifications?cursor=${badDate}`).set('Cookie', sessionCookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('GET /api/notifications: từ chối query lạ (chống chọn userId hoặc lọc trái phép)', async () => {
      const { sessionCookie } = await createAndLoginUser();
      const res = await request(app)
        .get('/api/notifications?userId=507f1f77bcf86cd799439011')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QUERY');
    });

    it('GET /api/notifications: cách ly người dùng (User A không thấy thông báo của User B)', async () => {
      const { user: userA, sessionCookie: cookieA } = await createAndLoginUser({ email: 'user.a@example.com' });
      const { user: userB } = await createAndLoginUser({ email: 'user.b@example.com' });

      // Tạo thông báo cho User B
      await Notification.create({
        userId: userB._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'notif_b_1',
        createdAt: new Date()
      });

      // User A gọi API lấy thông báo
      const resA = await request(app).get('/api/notifications').set('Cookie', cookieA);
      expect(resA.status).toBe(200);
      expect(resA.body.data.items).toHaveLength(0);
      expect(resA.body.data.unreadCount).toBe(0);
    });

    it('GET /api/notifications: toJSON ẩn _id, __v, userId, dedupKey và xuất id công khai', async () => {
      const { user, sessionCookie } = await createAndLoginUser();

      await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        params: { deviceLabel: 'Chrome Windows' },
        dedupKey: 'dedup_sample_1',
        createdAt: new Date()
      });

      const res = await request(app).get('/api/notifications').set('Cookie', sessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);

      const item = res.body.data.items[0];
      expect(item.id).toBeDefined();
      expect(item._id).toBeUndefined();
      expect(item.__v).toBeUndefined();
      expect(item.userId).toBeUndefined();
      expect(item.dedupKey).toBeUndefined();
      expect(item.eventCode).toBe('SESSION_REVOKED');
      expect(item.type).toBe('permissionChanges');
      expect(item.severity).toBe('warning');
      expect(item.params).toEqual({ deviceLabel: 'Chrome Windows' });
      expect(item.isRead).toBe(false);
      expect(item.readAt).toBeNull();
      expect(item.isSilent).toBe(false);
    });

    it('GET /api/notifications: phân trang cursor ổn định khi nhiều mục có cùng millisecond createdAt', async () => {
      const { user, sessionCookie } = await createAndLoginUser();

      const sameTime = new Date('2026-11-06T10:00:00.123Z');
      const olderTime = new Date('2026-11-06T09:00:00.000Z');
      const newerTime = new Date('2026-11-06T11:00:00.000Z');

      // Tạo 5 thông báo: n1 (mới nhất), n2-n3-n4 (cùng millisecond), n5 (cũ nhất)
      const n1 = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_1',
        createdAt: newerTime
      });

      const n2 = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_2',
        createdAt: sameTime
      });

      const n3 = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_3',
        createdAt: sameTime
      });

      const n4 = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_4',
        createdAt: sameTime
      });

      const n5 = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_5',
        createdAt: olderTime
      });

      // Trang 1: limit 2
      const res1 = await request(app).get('/api/notifications?limit=2').set('Cookie', sessionCookie);
      expect(res1.status).toBe(200);
      expect(res1.body.data.items).toHaveLength(2);
      expect(res1.body.data.nextCursor).not.toBeNull();
      const cursor1 = res1.body.data.nextCursor;

      // Trang 2: limit 2 với cursor1
      const res2 = await request(app).get(`/api/notifications?limit=2&cursor=${cursor1}`).set('Cookie', sessionCookie);
      expect(res2.status).toBe(200);
      expect(res2.body.data.items).toHaveLength(2);
      expect(res2.body.data.nextCursor).not.toBeNull();
      const cursor2 = res2.body.data.nextCursor;

      // Trang 3: limit 2 với cursor2
      const res3 = await request(app).get(`/api/notifications?limit=2&cursor=${cursor2}`).set('Cookie', sessionCookie);
      expect(res3.status).toBe(200);
      expect(res3.body.data.items).toHaveLength(1);
      expect(res3.body.data.nextCursor).toBeNull();

      // Tập hợp tất cả các id đã lấy
      const allFetchedIds = [
        ...res1.body.data.items.map((i) => i.id),
        ...res2.body.data.items.map((i) => i.id),
        ...res3.body.data.items.map((i) => i.id)
      ];

      // Đảm bảo không trùng và không mất bất kỳ mục nào (đủ 5 mục)
      expect(allFetchedIds).toHaveLength(5);
      const uniqueIds = new Set(allFetchedIds);
      expect(uniqueIds.size).toBe(5);

      // Mục đầu tiên phải là n1 (mới nhất), mục cuối là n5 (cũ nhất)
      expect(allFetchedIds[0]).toBe(n1._id.toString());
      expect(allFetchedIds[4]).toBe(n5._id.toString());
    });

    it('PATCH /api/notifications/:id/read: kiểm tra bảo mật Origin, Content-Type và Auth', async () => {
      const { user, sessionCookie } = await createAndLoginUser();
      const notif = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_sec_1',
        createdAt: new Date()
      });

      // 1. Chưa đăng nhập -> 401
      let res = await request(app).patch(`/api/notifications/${notif._id}/read`);
      expect(res.status).toBe(401);

      // 2. Origin sai allowlist -> 403
      res = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', sessionCookie)
        .set('Origin', 'http://malicious-site.com')
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(403);

      // 3. Thiếu Content-Type application/json -> 415
      res = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN);
      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

      // 4. Từ chối body chứa thuộc tính lạ -> 400 UNKNOWN_FIELD_REJECTED
      res = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ userId: 'malicious', isRead: true });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('PATCH /api/notifications/:id/read: ID ngoại lai hoặc thuộc user khác trả về 404 trung tính', async () => {
      const { sessionCookie: cookieA } = await createAndLoginUser({ email: 'user.a@example.com' });
      const { user: userB } = await createAndLoginUser({ email: 'user.b@example.com' });

      // ID sai định dạng
      let res = await request(app)
        .patch('/api/notifications/invalid-id/read')
        .set('Cookie', cookieA)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');

      // ID hợp lệ nhưng không tồn tại
      res = await request(app)
        .patch('/api/notifications/507f1f77bcf86cd799439011/read')
        .set('Cookie', cookieA)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');

      // Thông báo thuộc User B: User A gọi sửa -> 404
      const notifB = await Notification.create({
        userId: userB._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_user_b',
        createdAt: new Date()
      });

      res = await request(app)
        .patch(`/api/notifications/${notifB._id}/read`)
        .set('Cookie', cookieA)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');

      // Bản ghi của B trong DB vẫn giữ nguyên isRead: false
      const checkB = await Notification.findById(notifB._id);
      expect(checkB.isRead).toBe(false);
      expect(checkB.readAt).toBeNull();
    });

    it('PATCH /api/notifications/:id/read: thành công và bảo đảm IDEMPOTENT (không đổi readAt ở các lần gọi lặp)', async () => {
      const { user, sessionCookie } = await createAndLoginUser();
      const notif = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_idempotent_1',
        createdAt: new Date()
      });

      // Lần gọi 1: Đánh dấu đã đọc
      const res1 = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res1.status).toBe(200);
      expect(res1.body.data.notification.isRead).toBe(true);
      expect(res1.body.data.notification.readAt).toBeDefined();
      const initialReadAt = res1.body.data.notification.readAt;

      // Đợi 20ms
      await new Promise((r) => setTimeout(r, 20));

      // Lần gọi 2: Đánh dấu lại bản ghi đã đọc
      const res2 = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res2.status).toBe(200);
      expect(res2.body.data.notification.isRead).toBe(true);
      // Idempotency: readAt TUYỆT ĐỐI không thay đổi
      expect(res2.body.data.notification.readAt).toBe(initialReadAt);
    });

    it('PATCH /api/notifications/:id/read: hai request đồng thời không thay đổi readAt đã được xác lập', async () => {
      const { user, sessionCookie } = await createAndLoginUser();
      const notif = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_concurrent_read_1',
        createdAt: new Date()
      });

      // Gửi 2 request đồng thời qua Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/notifications/${notif._id}/read`)
          .set('Cookie', sessionCookie)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({}),
        request(app)
          .patch(`/api/notifications/${notif._id}/read`)
          .set('Cookie', sessionCookie)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({})
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.notification.isRead).toBe(true);
      expect(res2.body.data.notification.isRead).toBe(true);

      // Cả hai phải trả về đúng cùng một mốc readAt đã được xác lập
      expect(res1.body.data.notification.readAt).toBe(res2.body.data.notification.readAt);

      const dbDoc = await Notification.findById(notif._id);
      expect(dbDoc.isRead).toBe(true);
      expect(dbDoc.readAt.toISOString()).toBe(res1.body.data.notification.readAt);
    });

    it('PATCH /api/notifications/:id/read: cạnh tranh đồng thời với read-all không ghi đè mốc đọc đã có', async () => {
      const { user, sessionCookie } = await createAndLoginUser();
      const notif = await Notification.create({
        userId: user._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_race_readall_1',
        createdAt: new Date(Date.now() - 5000)
      });

      // Gửi markAsRead cạnh tranh đồng thời với read-all
      const [resSingle, resAll] = await Promise.all([
        request(app)
          .patch(`/api/notifications/${notif._id}/read`)
          .set('Cookie', sessionCookie)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({}),
        request(app)
          .patch('/api/notifications/read-all')
          .set('Cookie', sessionCookie)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({})
      ]);

      expect(resSingle.status).toBe(200);
      expect(resAll.status).toBe(200);
      expect(resSingle.body.data.notification.isRead).toBe(true);

      const dbDoc = await Notification.findById(notif._id);
      expect(dbDoc.isRead).toBe(true);
      expect(dbDoc.readAt).toBeDefined();

      const establishedReadAt = dbDoc.readAt.toISOString();

      // Gọi lại markAsRead một lần nữa để xác nhận mốc readAt không bị suy chuyển
      const resAfter = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(resAfter.status).toBe(200);
      expect(resAfter.body.data.notification.readAt).toBe(establishedReadAt);
    });

    it('PATCH /api/notifications/read-all: đánh dấu tất cả, không ảnh hưởng user khác và tuân thủ cutoffTime', async () => {
      const { user: userA, sessionCookie: cookieA } = await createAndLoginUser({ email: 'user.a@example.com' });
      const { user: userB } = await createAndLoginUser({ email: 'user.b@example.com' });

      const pastTime = new Date(Date.now() - 10000);
      const futureTime = new Date(Date.now() + 60000);

      // Tạo 2 thông báo chưa đọc cho User A trước mốc cutoff
      const a1 = await Notification.create({
        userId: userA._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'a1',
        createdAt: pastTime
      });
      const a2 = await Notification.create({
        userId: userA._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'a2',
        createdAt: pastTime
      });

      // Tạo 1 thông báo cho User A với mốc thời gian trong tương lai (sau cutoff)
      const aFuture = await Notification.create({
        userId: userA._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'aFuture',
        createdAt: futureTime
      });

      // Tạo 1 thông báo chưa đọc cho User B
      const b1 = await Notification.create({
        userId: userB._id,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'b1',
        createdAt: pastTime
      });

      // User A gọi read-all
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Cookie', cookieA)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedCount).toBe(2);

      // Kiểm tra trong DB: a1, a2 đã đọc
      const checkA1 = await Notification.findById(a1._id);
      const checkA2 = await Notification.findById(a2._id);
      expect(checkA1.isRead).toBe(true);
      expect(checkA2.isRead).toBe(true);

      // aFuture phát sinh sau cutoff -> vẫn chưa đọc (isRead: false)
      const checkAFuture = await Notification.findById(aFuture._id);
      expect(checkAFuture.isRead).toBe(false);

      // b1 của User B -> vẫn chưa đọc (isRead: false)
      const checkB1 = await Notification.findById(b1._id);
      expect(checkB1.isRead).toBe(false);
    });
  });

  // =========================================================================
  // NHÓM 2: DỊCH VỤ TẠO VÀ LỌC THÔNG BÁO (NOTIFICATION SERVICE & SETTINGS)
  // =========================================================================
  describe('Nhóm 2: Dịch vụ Tạo và Lọc Thông báo', () => {
    it('isSeverityAllowed: kiểm tra đúng ma trận ngưỡng severity', () => {
      // 1. Ngưỡng 'urgent': chỉ nhận 'urgent'
      expect(isSeverityAllowed('info', 'urgent')).toBe(false);
      expect(isSeverityAllowed('warning', 'urgent')).toBe(false);
      expect(isSeverityAllowed('urgent', 'urgent')).toBe(true);

      // 2. Ngưỡng 'warning': nhận 'warning' và 'urgent'
      expect(isSeverityAllowed('info', 'warning')).toBe(false);
      expect(isSeverityAllowed('warning', 'warning')).toBe(true);
      expect(isSeverityAllowed('urgent', 'warning')).toBe(true);

      // 3. Ngưỡng 'all': nhận tất cả
      expect(isSeverityAllowed('info', 'all')).toBe(true);
      expect(isSeverityAllowed('warning', 'all')).toBe(true);
      expect(isSeverityAllowed('urgent', 'all')).toBe(true);
    });

    it('isInQuietHours: khoảng cùng ngày [startTime, endTime) (start inclusive, end exclusive)', () => {
      const quiet = { enabled: true, startTime: '09:00', endTime: '17:00' };
      const tz = 'Asia/Ho_Chi_Minh';

      // 08:59:59 (+7) -> ngoài khoảng
      expect(isInQuietHours(new Date('2026-11-06T01:59:59Z'), quiet, tz)).toBe(false);

      // 09:00:00 (+7) -> trong khoảng (start inclusive)
      expect(isInQuietHours(new Date('2026-11-06T02:00:00Z'), quiet, tz)).toBe(true);

      // 12:00:00 (+7) -> trong khoảng
      expect(isInQuietHours(new Date('2026-11-06T05:00:00Z'), quiet, tz)).toBe(true);

      // 16:59:59 (+7) -> trong khoảng
      expect(isInQuietHours(new Date('2026-11-06T09:59:59Z'), quiet, tz)).toBe(true);

      // 17:00:00 (+7) -> ngoài khoảng (end exclusive)
      expect(isInQuietHours(new Date('2026-11-06T10:00:00Z'), quiet, tz)).toBe(false);
    });

    it('isInQuietHours: khoảng qua đêm (22:00 -> 07:00)', () => {
      const quiet = { enabled: true, startTime: '22:00', endTime: '07:00' };
      const tz = 'Asia/Ho_Chi_Minh';

      // 21:59:59 (+7) -> ngoài
      expect(isInQuietHours(new Date('2026-11-06T14:59:59Z'), quiet, tz)).toBe(false);

      // 22:00:00 (+7) -> trong (start inclusive)
      expect(isInQuietHours(new Date('2026-11-06T15:00:00Z'), quiet, tz)).toBe(true);

      // 00:00:00 (+7) -> trong (nửa đêm)
      expect(isInQuietHours(new Date('2026-11-06T17:00:00Z'), quiet, tz)).toBe(true);

      // 06:59:59 (+7) -> trong
      expect(isInQuietHours(new Date('2026-11-06T23:59:59Z'), quiet, tz)).toBe(true);

      // 07:00:00 (+7) -> ngoài (end exclusive)
      expect(isInQuietHours(new Date('2026-11-07T00:00:00Z'), quiet, tz)).toBe(false);
    });

    it('isInQuietHours: startTime === endTime hoặc enabled = false không kích hoạt giờ yên lặng', () => {
      expect(isInQuietHours(new Date(), { enabled: false, startTime: '22:00', endTime: '07:00' })).toBe(false);
      expect(isInQuietHours(new Date(), { enabled: true, startTime: '22:00', endTime: '22:00' })).toBe(false);
    });

    it('isInQuietHours: múi giờ khác nhau cho cùng một thời điểm UTC', () => {
      const quiet = { enabled: true, startTime: '22:00', endTime: '07:00' };
      // Thời điểm UTC: 2026-11-06 16:00:00Z
      // Ở Asia/Ho_Chi_Minh (+7) là 23:00 -> NẰM TRONG khoảng [22:00, 07:00)
      // Ở UTC (+0) là 16:00 -> NGOÀI khoảng
      const instant = new Date('2026-11-06T16:00:00Z');
      expect(isInQuietHours(instant, quiet, 'Asia/Ho_Chi_Minh')).toBe(true);
      expect(isInQuietHours(instant, quiet, 'UTC')).toBe(false);
    });

    it('dispatchNotification: khi loại thông báo bị tắt (types.permissionChanges = false) -> không tạo thông báo', async () => {
      const { user } = await createAndLoginUser({
        settings: {
          notifications: {
            types: { permissionChanges: false }
          }
        }
      });

      const result = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_type_off_1'
      });

      expect(result).toBeNull();
      const count = await Notification.countDocuments({ userId: user._id });
      expect(count).toBe(0);
    });

    it('dispatchNotification: khi kênh web bị tắt (channels.inAppWeb = false) -> không tạo thông báo', async () => {
      const { user } = await createAndLoginUser({
        settings: {
          notifications: {
            channels: { inAppWeb: false }
          }
        }
      });

      const result = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_web_off_1'
      });

      expect(result).toBeNull();
      const count = await Notification.countDocuments({ userId: user._id });
      expect(count).toBe(0);
    });

    it('dispatchNotification: khi sự kiện không đạt minSeverity -> không tạo thông báo', async () => {
      const { user } = await createAndLoginUser({
        settings: {
          notifications: {
            minSeverity: 'urgent'
          }
        }
      });

      // Sự kiện warning bị loại khi user đặt minSeverity: urgent
      const result = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_sev_low_1'
      });

      expect(result).toBeNull();
      const count = await Notification.countDocuments({ userId: user._id });
      expect(count).toBe(0);
    });

    it('dispatchNotification: sự kiện thường trong giờ yên lặng được gán isSilent = true', async () => {
      const { user } = await createAndLoginUser({
        settings: {
          appearance: { timeZone: 'Asia/Ho_Chi_Minh' },
          notifications: {
            quietHours: { enabled: true, startTime: '22:00', endTime: '07:00', allowUrgentBypass: true }
          }
        }
      });

      // 23:00 giờ VN (16:00 UTC)
      const quietNow = new Date('2026-11-06T16:00:00Z');

      const notif = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_quiet_silent_1',
        now: quietNow
      });

      expect(notif).not.toBeNull();
      expect(notif.isSilent).toBe(true);
    });

    it('dispatchNotification: sự kiện urgent vượt giờ yên lặng (isSilent = false) nhưng không vượt loại/kênh bị tắt', async () => {
      const { user } = await createAndLoginUser({
        settings: {
          appearance: { timeZone: 'Asia/Ho_Chi_Minh' },
          notifications: {
            quietHours: { enabled: true, startTime: '22:00', endTime: '07:00', allowUrgentBypass: true }
          }
        }
      });

      const quietNow = new Date('2026-11-06T16:00:00Z');

      // Sự kiện urgent trong giờ yên lặng: allowUrgentBypass -> isSilent: false
      const urgentNotif = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'urgent',
        dedupKey: 'dedup_urgent_bypass_1',
        now: quietNow
      });

      expect(urgentNotif).not.toBeNull();
      expect(urgentNotif.isSilent).toBe(false);

      // Nhưng nếu loại permissionChanges bị tắt: urgent vẫn BỊ CHẶN
      user.settings.notifications.types.permissionChanges = false;
      const blockedNotif = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'urgent',
        dedupKey: 'dedup_urgent_blocked_1',
        now: quietNow
      });
      expect(blockedNotif).toBeNull();
    });

    it('dispatchNotification: settings cũ bị thiếu hoặc null vẫn áp dụng defaults an toàn', async () => {
      const { user } = await createAndLoginUser({
        settings: null // Cấu hình null
      });

      const notif = await dispatchNotification({
        user,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        dedupKey: 'dedup_null_settings_1'
      });

      expect(notif).not.toBeNull();
      expect(notif.type).toBe('permissionChanges');
      expect(notif.severity).toBe('warning');
      expect(notif.isSilent).toBe(false);
    });
  });

  // =========================================================================
  // NHÓM 3: LUỒNG SỰ KIỆN THẬT (REVOKE SESSION -> NOTIFICATION)
  // =========================================================================
  describe('Nhóm 3: Luồng sự kiện thật (revokeSession -> Notification)', () => {
    it('khi thu hồi phiên khác: phiên bị thu hồi nhận 401, phiên còn lại thấy đúng 1 thông báo trung thực', async () => {
      // 1. Tạo user và đăng nhập phiên 1 (Desktop)
      const { user, sessionCookie: cookieDesktop } = await createAndLoginUser({
        email: 'multi.session@example.com',
        password: 'Password@123'
      }, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');

      // 2. Đăng nhập phiên 2 (Mobile) cho cùng tài khoản
      const loginMobileRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
        .send({ email: 'multi.session@example.com', password: 'Password@123', remember: false });

      const cookieMobile = loginMobileRes.headers['set-cookie'].find((c) => c.startsWith('shp_sid='));

      // 3. Desktop lấy danh sách phiên để xác định sessionId của Mobile
      const sessionsRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookieDesktop);

      expect(sessionsRes.status).toBe(200);
      const mobileSessionMeta = sessionsRes.body.data.sessions.find((s) => !s.isCurrent);
      expect(mobileSessionMeta).toBeDefined();
      const mobileSessionId = mobileSessionMeta.id;

      // 4. Desktop thu hồi phiên Mobile
      const revokeRes = await request(app)
        .delete(`/api/account/sessions/${mobileSessionId}`)
        .set('Cookie', cookieDesktop)
        .set('Origin', TEST_ORIGIN);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.data.revoked).toBe(true);
      expect(revokeRes.body.data.requiresLogin).toBe(false);

      // 5. Phiên Mobile cố gắng gọi API -> Lập tức nhận 401 UNAUTHORIZED
      const mobileMeRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookieMobile);

      expect(mobileMeRes.status).toBe(401);
      expect(mobileMeRes.body.code).toBe('UNAUTHORIZED');

      // 6. Phiên Desktop lấy thông báo -> Thấy đúng 1 thông báo của sự kiện
      const notifsRes = await request(app)
        .get('/api/notifications')
        .set('Cookie', cookieDesktop);

      expect(notifsRes.status).toBe(200);
      expect(notifsRes.body.data.items).toHaveLength(1);
      expect(notifsRes.body.data.unreadCount).toBe(1);

      const notif = notifsRes.body.data.items[0];
      expect(notif.eventCode).toBe('SESSION_REVOKED');
      expect(notif.type).toBe('permissionChanges');
      expect(notif.severity).toBe('warning');
      expect(notif.isRead).toBe(false);

      // Kiểm tra nội dung params: trung thực, không lộ raw sessionStoreId hay bí mật
      expect(notif.params.deviceLabel).toBe('iPhone');
      expect(notif.params.browserLabel).toBe('Safari');
      expect(notif.params.sessionStoreId).toBeUndefined();
      expect(notif.params.token).toBeUndefined();
    });

    it('khi thu hồi phiên hiện tại: phiên bị đăng xuất, thông báo được xem sau khi đăng nhập lại', async () => {
      const { sessionCookie } = await createAndLoginUser({
        email: 'self.revoke@example.com',
        password: 'Password@123'
      }, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');

      // Lấy sessionId hiện tại
      const sessionsRes = await request(app).get('/api/account/sessions').set('Cookie', sessionCookie);
      const currentSessionMeta = sessionsRes.body.data.sessions.find((s) => s.isCurrent);
      expect(currentSessionMeta).toBeDefined();

      // Thu hồi chính phiên hiện tại
      const revokeRes = await request(app)
        .delete(`/api/account/sessions/${currentSessionMeta.id}`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.requiresLogin).toBe(true);

      // Phiên này ngay lập tức bị từ chối
      const afterRes = await request(app).get('/api/notifications').set('Cookie', sessionCookie);
      expect(afterRes.status).toBe(401);

      // Đăng nhập lại bằng phiên mới hợp lệ
      const reloginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: 'self.revoke@example.com', password: 'Password@123', remember: false });

      const newCookie = reloginRes.headers['set-cookie'].find((c) => c.startsWith('shp_sid='));

      // Đọc thông báo từ phiên mới -> Thấy thông báo thu hồi phiên trước đó
      const notifsRes = await request(app).get('/api/notifications').set('Cookie', newCookie);
      expect(notifsRes.status).toBe(200);
      expect(notifsRes.body.data.items).toHaveLength(1);
      expect(notifsRes.body.data.items[0].eventCode).toBe('SESSION_REVOKED');
    });

    it('chống tạo trùng: dispatch lặp lại hoặc hai dispatch đồng thời chỉ tạo đúng 1 bản ghi', async () => {
      const { user } = await createAndLoginUser();
      const dummySession = {
        sessionId: 'dummy-session-uuid-12345',
        deviceLabel: 'Desktop PC',
        browserLabel: 'Chrome'
      };

      // Hai lệnh dispatch đồng thời với cùng một sessionId
      const [res1, res2] = await Promise.all([
        dispatchSessionRevokedNotification({ user, revokedSession: dummySession }),
        dispatchSessionRevokedNotification({ user, revokedSession: dummySession })
      ]);

      // Một trong hai tạo thành công, lệnh kia bắt duplicate key E11000 và trả về an toàn
      const notifDocs = await Notification.find({
        userId: user._id,
        dedupKey: `session_revoked:${dummySession.sessionId}`
      });

      expect(notifDocs).toHaveLength(1);
    });

    it('khả năng chống chịu (Resilience): ghi Notification thất bại KHÔNG làm đảo ngược trạng thái thu hồi phiên', async () => {
      const { user, sessionCookie } = await createAndLoginUser({
        email: 'resilience@example.com',
        password: 'Password@123'
      });

      // Tạo một phiên thứ hai trong DB
      const otherSessionRecord = await UserSession.create({
        sessionId: 'other-session-uuid-99999',
        userId: user._id,
        sessionStoreId: 'fake-store-id-99999',
        deviceLabel: 'Tablet',
        browserLabel: 'Safari',
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false
      });

      // Mock Notification.create bị lỗi DB
      const createSpy = vi.spyOn(Notification, 'create').mockRejectedValueOnce(new Error('Mô phỏng lỗi DB Notification'));

      // Thực hiện thu hồi phiên
      const revokeRes = await request(app)
        .delete(`/api/account/sessions/${otherSessionRecord.sessionId}`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN);

      // Thao tác thu hồi vẫn phải thành công 200
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.data.revoked).toBe(true);

      // Phiên trong DB thực sự đã bị thu hồi (isRevoked = true)
      const updatedRecord = await UserSession.findOne({ sessionId: otherSessionRecord.sessionId });
      expect(updatedRecord.isRevoked).toBe(true);
      expect(updatedRecord.revokedAt).toBeDefined();

      createSpy.mockRestore();
    });

    it('khi user đã tắt types.permissionChanges: thu hồi phiên vẫn thành công nhưng không tạo thông báo', async () => {
      const { user, sessionCookie } = await createAndLoginUser({
        email: 'optout.notif@example.com',
        password: 'Password@123',
        settings: {
          notifications: {
            types: { permissionChanges: false }
          }
        }
      });

      const otherSession = await UserSession.create({
        sessionId: 'session-optout-12345',
        userId: user._id,
        sessionStoreId: 'fake-store-id-optout',
        deviceLabel: 'Smart TV',
        browserLabel: 'Chrome',
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false
      });

      const revokeRes = await request(app)
        .delete(`/api/account/sessions/${otherSession.sessionId}`)
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Không có thông báo nào được tạo
      const notifsCount = await Notification.countDocuments({ userId: user._id });
      expect(notifsCount).toBe(0);
    });
  });
});
