import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import UserSession from '../src/models/UserSession.js';
import { surveyOrUpgradeSessionIndex } from '../scripts/upgradeSessionIndex.js';
import { verifySessionRegistry } from '../src/middleware/auth.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/settings/account';

describe('Backend Session Management API & MongoDB Integration Tests (Phase 3A)', () => {
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
      sessionSecret: 'test-secret-phase3a-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4'
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
    const collections = await mongoose.connection.db.listCollections({ name: 'sessions' }).toArray();
    if (collections.length > 0) {
      await mongoose.connection.db.collection('sessions').deleteMany({});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper tạo tài khoản và đăng nhập với User-Agent tùy chọn để nhận cookie session hợp lệ
   */
  async function createAndLoginUser(customData = {}, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36') {
    const fullName = customData.name || 'Người Dùng Test';
    const email = customData.email || 'user.session@example.com';
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

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    return { user, cookies };
  }

  /**
   * Helper đăng nhập thêm phiên thứ hai cho cùng một tài khoản
   */
  async function loginAnotherSession(email, password, userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15') {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('User-Agent', userAgent)
      .send({ email: email.toLowerCase(), password, remember: false });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);

    return loginRes.headers['set-cookie'];
  }

  // ============================================================================
  // NHÓM A: LIỆT KÊ DANH SÁCH PHIÊN (GET /api/account/sessions)
  // ============================================================================
  describe('Nhóm A: Liệt kê danh sách phiên (GET /api/account/sessions)', () => {
    it('từ chối 401 UNAUTHORIZED khi chưa đăng nhập', async () => {
      const res = await request(app).get('/api/account/sessions');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('GET không có Content-Type vẫn hoạt động bình thường', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.sessions)).toBe(true);
      expect(res.body.data.total).toBe(1);
    });

    it('hai phiên độc lập của cùng User A xuất hiện đầy đủ với thông tin thiết bị/trình duyệt đúng', async () => {
      const ua1 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
      const ua2 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

      const { user, cookies: cookies1 } = await createAndLoginUser(
        { email: 'usera@example.com', password: 'Password@123' },
        ua1
      );
      const cookies2 = await loginAnotherSession('usera@example.com', 'Password@123', ua2);

      // Gọi từ phiên 1
      const res1 = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies1);

      expect(res1.status).toBe(200);
      expect(res1.body.data.total).toBe(2);

      const sessions1 = res1.body.data.sessions;
      const currentSess1 = sessions1.find((s) => s.isCurrent === true);
      const otherSess1 = sessions1.find((s) => s.isCurrent === false);

      expect(currentSess1).toBeDefined();
      expect(otherSess1).toBeDefined();
      expect(currentSess1.deviceLabel).toBe('Windows');
      expect(currentSess1.browserLabel).toBe('Chrome');
      expect(otherSess1.deviceLabel).toBe('macOS');
      expect(otherSess1.browserLabel).toBe('Safari');

      // Gọi từ phiên 2: chỉ phiên 2 có isCurrent = true
      const res2 = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies2);

      expect(res2.status).toBe(200);
      const currentSess2 = res2.body.data.sessions.find((s) => s.isCurrent === true);
      expect(currentSess2.id).toBe(otherSess1.id);
      expect(currentSess2.deviceLabel).toBe('macOS');
      expect(currentSess2.browserLabel).toBe('Safari');
    });

    it('User A tuyệt đối không nhìn thấy phiên của User B (Cách ly tài khoản)', async () => {
      const { cookies: cookiesA } = await createAndLoginUser(
        { name: 'User A', email: 'usera@example.com', password: 'Password@123' },
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      );
      const { cookies: cookiesB } = await createAndLoginUser(
        { name: 'User B', email: 'userb@example.com', password: 'Password@456' },
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1'
      );

      const resA = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookiesA);

      expect(resA.status).toBe(200);
      expect(resA.body.data.total).toBe(1);
      expect(resA.body.data.sessions[0].deviceLabel).toBe('Windows');

      const resB = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookiesB);

      expect(resB.status).toBe(200);
      expect(resB.body.data.total).toBe(1);
      expect(resB.body.data.sessions[0].deviceLabel).toBe('iPhone');
    });

    it('không để lộ raw session ID, cookie, secret hoặc passwordHash ra response', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      const sessionObj = res.body.data.sessions[0];

      // Đảm bảo có đúng các trường công khai
      expect(sessionObj).toHaveProperty('id');
      expect(sessionObj).toHaveProperty('deviceLabel');
      expect(sessionObj).toHaveProperty('browserLabel');
      expect(sessionObj).toHaveProperty('createdAt');
      expect(sessionObj).toHaveProperty('lastActiveAt');
      expect(sessionObj).toHaveProperty('expiresAt');
      expect(sessionObj).toHaveProperty('isCurrent');

      // TUYỆT ĐỐI KHÔNG để lộ thông tin nội bộ hay bí mật
      expect(sessionObj).not.toHaveProperty('sessionStoreId');
      expect(sessionObj).not.toHaveProperty('rawSessionId');
      expect(sessionObj).not.toHaveProperty('cookie');
      expect(sessionObj).not.toHaveProperty('secret');
      expect(sessionObj).not.toHaveProperty('passwordHash');
      expect(sessionObj).not.toHaveProperty('userId');
      expect(sessionObj).not.toHaveProperty('_id');

      // ID trả về phải là UUID công khai
      expect(sessionObj.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('phiên hết hạn, phiên đã bị thu hồi hoặc phiên có authVersion cũ không xuất hiện', async () => {
      const { user, cookies } = await createAndLoginUser();

      // 1. Tạo bản ghi phiên đã hết hạn trong UserSession
      await UserSession.create({
        sessionId: crypto.randomUUID(),
        userId: user._id,
        sessionStoreId: 'fake-store-id-expired',
        authVersion: 0,
        deviceLabel: 'Linux',
        browserLabel: 'Firefox',
        createdAt: new Date(Date.now() - 3600000),
        lastActiveAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() - 1000), // Đã hết hạn
        isRevoked: false
      });

      // 2. Tạo bản ghi phiên đã bị thu hồi
      await UserSession.create({
        sessionId: crypto.randomUUID(),
        userId: user._id,
        sessionStoreId: 'fake-store-id-revoked',
        authVersion: 0,
        deviceLabel: 'Android',
        browserLabel: 'Chrome',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: true,
        revokedAt: new Date()
      });

      // 3. Tạo bản ghi phiên có authVersion không khớp
      await UserSession.create({
        sessionId: crypto.randomUUID(),
        userId: user._id,
        sessionStoreId: 'fake-store-id-old-version',
        authVersion: 99, // Không khớp với 0 của user
        deviceLabel: 'Windows',
        browserLabel: 'Edge',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false
      });

      const res = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1); // Chỉ có phiên hiện tại hợp lệ
    });

    it('phiên legacy thiếu metadata được khởi tạo trung thực với createdAt: null và hiển thị bình thường', async () => {
      // 1. Tạo User
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('MatKhau@123', salt);
      const user = await User.create({
        name: 'Legacy User',
        email: 'legacy@example.com',
        passwordHash,
        authVersion: 0
      });

      // 2. Tạo phiên legacy trực tiếp trong connect-mongo collection 'sessions' (KHÔNG tạo UserSession)
      const rawSid = 'legacy-raw-session-id-12345';
      const sessionDoc = {
        _id: rawSid,
        session: JSON.stringify({
          cookie: {
            originalMaxAge: 86400000,
            expires: new Date(Date.now() + 86400000).toISOString(),
            secure: false,
            httpOnly: true,
            path: '/',
            sameSite: 'lax'
          },
          userId: user._id.toString(),
          authVersion: 0
        }),
        expires: new Date(Date.now() + 86400000)
      };
      await mongoose.connection.db.collection('sessions').insertOne(sessionDoc);

      // Ký cookie session bằng sessionSecret để gửi qua Supertest
      // Định dạng cookie express-session: s:rawSid.signature
      // Dùng hàm nội bộ hoặc gửi cookie giả lập
      const cookieParser = (await import('cookie-signature')).default;
      const signedSid = 's:' + cookieParser.sign(rawSid, 'test-secret-phase3a-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4');

      const res = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', [`shp_sid=${signedSid}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(1);

      const legacySess = res.body.data.sessions[0];
      expect(legacySess.isCurrent).toBe(true);
      expect(legacySess.createdAt).toBeNull(); // Trung thực: không bịa lịch sử quá khứ
      expect(legacySess.id).toBeDefined();
    });
  });

  // ============================================================================
  // NHÓM B: THU HỒI TỪNG PHIÊN (DELETE /api/account/sessions/:sessionId)
  // ============================================================================
  describe('Nhóm B: Thu hồi từng phiên (DELETE /api/account/sessions/:sessionId)', () => {
    it('từ chối 401 UNAUTHORIZED khi chưa đăng nhập', async () => {
      const res = await request(app)
        .delete('/api/account/sessions/any-session-id')
        .set('Origin', TEST_ORIGIN);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('từ chối 403 FORBIDDEN_ORIGIN khi Origin không thuộc allowlist', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .delete('/api/account/sessions/some-session-id')
        .set('Cookie', cookies)
        .set('Origin', 'http://malicious-website.com');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('từ chối 400 INVALID_SESSION_ID khi sessionId sai định dạng (chứa ký tự lạ, MongoDB injection)', async () => {
      const { cookies } = await createAndLoginUser();

      const res1 = await request(app)
        .delete('/api/account/sessions/$gt')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN);

      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.code).toBe('INVALID_SESSION_ID');

      const res2 = await request(app)
        .delete('/api/account/sessions/invalid$token')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN);

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('INVALID_SESSION_ID');
    });

    it('User A thu hồi phiên khác của User A thành công: phiên mục tiêu bị từ chối, phiên hiện tại vẫn hoạt động', async () => {
      const { user, cookies: cookiesA1 } = await createAndLoginUser(
        { email: 'usera.multi@example.com', password: 'Password@123' },
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      );
      const cookiesA2 = await loginAnotherSession(
        'usera.multi@example.com',
        'Password@123',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'
      );

      // Lấy danh sách để tìm ID của phiên A2
      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookiesA1);

      expect(listRes.status).toBe(200);
      const sessA2 = listRes.body.data.sessions.find((s) => s.isCurrent === false);
      expect(sessA2).toBeDefined();

      // A1 gửi yêu cầu thu hồi phiên A2
      const revokeRes = await request(app)
        .delete(`/api/account/sessions/${sessA2.id}`)
        .set('Cookie', cookiesA1)
        .set('Origin', TEST_ORIGIN);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.data.revoked).toBe(true);
      expect(revokeRes.body.data.requiresLogin).toBe(false);

      // Phiên A1 vẫn hoạt động bình thường
      const meResA1 = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookiesA1);
      expect(meResA1.status).toBe(200);

      // Phiên A2 gọi /me tiếp theo phải bị từ chối 401 UNAUTHORIZED
      const meResA2 = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookiesA2);
      expect(meResA2.status).toBe(401);
      expect(meResA2.body.success).toBe(false);
      expect(meResA2.body.code).toBe('UNAUTHORIZED');

      // Phiên A2 gọi cập nhật profile cũng bị từ chối 401
      const profileResA2 = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookiesA2)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Không Thể Đổi' });
      expect(profileResA2.status).toBe(401);
    });

    it('User A không thể thu hồi phiên của User B: trả 404 SESSION_NOT_FOUND trung tính, không rò rỉ thông tin chủ phiên', async () => {
      const { cookies: cookiesA } = await createAndLoginUser(
        { email: 'usera.protect@example.com', password: 'Password@123' }
      );
      const { cookies: cookiesB } = await createAndLoginUser(
        { email: 'userb.protect@example.com', password: 'Password@456' }
      );

      // Lấy ID phiên của User B
      const listResB = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookiesB);
      const sessB = listResB.body.data.sessions[0];
      expect(sessB).toBeDefined();

      // User A cố gắng xóa phiên của User B
      const attackRes = await request(app)
        .delete(`/api/account/sessions/${sessB.id}`)
        .set('Cookie', cookiesA)
        .set('Origin', TEST_ORIGIN);

      expect(attackRes.status).toBe(404);
      expect(attackRes.body.success).toBe(false);
      expect(attackRes.body.code).toBe('SESSION_NOT_FOUND');

      // Phiên của User B vẫn hoàn toàn hoạt động
      const meResB = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookiesB);
      expect(meResB.status).toBe(200);
      expect(meResB.body.data.user.email).toBe('userb.protect@example.com');
    });

    it('thu hồi chính phiên hiện tại: trả requiresLogin: true và clear cookie', async () => {
      const { cookies } = await createAndLoginUser();

      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies);
      const currentSess = listRes.body.data.sessions[0];

      const revokeCurrentRes = await request(app)
        .delete(`/api/account/sessions/${currentSess.id}`)
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN);

      expect(revokeCurrentRes.status).toBe(200);
      expect(revokeCurrentRes.body.success).toBe(true);
      expect(revokeCurrentRes.body.data.revoked).toBe(true);
      expect(revokeCurrentRes.body.data.requiresLogin).toBe(true);

      // Kiểm tra có clear cookie trong headers
      const setCookies = revokeCurrentRes.headers['set-cookie'];
      expect(setCookies).toBeDefined();
      const clearedCookie = setCookies.some((c) => c.includes('shp_sid=;') || c.includes('Expires=Thu, 01 Jan 1970'));
      expect(clearedCookie).toBe(true);

      // Yêu cầu tiếp theo với cookie cũ bị từ chối
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);
      expect(meRes.status).toBe(401);
    });

    it('phiên đã thu hồi không thể tự sống lại nếu session store bị ghi đè lại bởi request cũ (Anti-revived Session Trap)', async () => {
      const { user, cookies: cookies1 } = await createAndLoginUser(
        { email: 'usera.antirevived@example.com', password: 'Password@123' }
      );
      const cookies2 = await loginAnotherSession('usera.antirevived@example.com', 'Password@123');

      // Tìm session 2
      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies1);
      const sess2 = listRes.body.data.sessions.find((s) => !s.isCurrent);

      // Thu hồi session 2
      await request(app)
        .delete(`/api/account/sessions/${sess2.id}`)
        .set('Cookie', cookies1)
        .set('Origin', TEST_ORIGIN);

      // MÔ PHỎNG NGUY CƠ: Một request cũ đang chạy trên session 2 ghi đè lại session vào MongoDB store
      const userSessionDoc = await UserSession.findOne({ sessionId: sess2.id });
      expect(userSessionDoc.isRevoked).toBe(true);

      const store = app.locals.sessionStore;
      await new Promise((resolve) => {
        store.set(userSessionDoc.sessionStoreId, {
          cookie: { maxAge: 86400000 },
          userId: user._id.toString(),
          authVersion: 0,
          managedSessionId: sess2.id
        }, resolve);
      });

      // Kiểm tra session doc đã được ghi lại trong connect-mongo
      const revivedDoc = await new Promise((resolve) => {
        store.get(userSessionDoc.sessionStoreId, (_err, sess) => resolve(sess));
      });
      expect(revivedDoc).toBeDefined();

      // Bây giờ Session 2 gửi request: Middleware xác thực requireAuth phải phát hiện isRevoked trong UserSession
      // và dứt khoát từ chối 401, không cho phép sống lại!
      const attemptRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies2);

      expect(attemptRes.status).toBe(401);
      expect(attemptRes.body.code).toBe('UNAUTHORIZED');
    });
  });

  // ============================================================================
  // NHÓM C: ĐĂNG XUẤT MỌI NƠI (POST /api/account/logout-all)
  // ============================================================================
  describe('Nhóm C: Đăng xuất mọi nơi (POST /api/account/logout-all)', () => {
    it('từ chối 401 khi chưa đăng nhập', async () => {
      const res = await request(app)
        .post('/api/account/logout-all')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('từ chối 403 khi Origin không thuộc allowlist', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookies)
        .set('Origin', 'http://hacker.com')
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('từ chối 415 khi thiếu Content-Type application/json', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN);

      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('từ chối 400 UNKNOWN_FIELD_REJECTED nếu body chứa trường lạ hoặc key chứa . / $', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ unknownField: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('đăng xuất tất cả phiên thành công: tất cả phiên của User A bị vô hiệu hóa, phiên của User B vẫn hoạt động', async () => {
      const { user: userA, cookies: cookiesA1 } = await createAndLoginUser(
        { name: 'Nguyễn Văn A', email: 'usera.all@example.com', password: 'Password@123' }
      );
      const cookiesA2 = await loginAnotherSession('usera.all@example.com', 'Password@123');

      const { user: userB, cookies: cookiesB } = await createAndLoginUser(
        { name: 'Trần Thị B', email: 'userb.all@example.com', password: 'Password@456' }
      );

      // User A gọi logout-all từ phiên A1
      const logoutAllRes = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookiesA1)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(logoutAllRes.status).toBe(200);
      expect(logoutAllRes.body.success).toBe(true);
      expect(logoutAllRes.body.code).toBe('LOGOUT_ALL_SUCCESS');
      expect(logoutAllRes.body.data.loggedOutAll).toBe(true);
      expect(logoutAllRes.body.data.requiresLogin).toBe(true);

      // Cả hai phiên A1 và A2 đều bị từ chối 401 khi gọi API kế tiếp
      const meResA1 = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookiesA1);
      expect(meResA1.status).toBe(401);

      const meResA2 = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookiesA2);
      expect(meResA2.status).toBe(401);

      // Phiên User B vẫn hoạt động hoàn toàn bình thường
      const meResB = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookiesB);
      expect(meResB.status).toBe(200);
      expect(meResB.body.data.user.email).toBe('userb.all@example.com');

      // Kiểm tra bảo toàn dữ liệu: User A không bị thay đổi passwordHash, tên, hay settings
      const dbUserA = await User.findById(userA._id);
      expect(dbUserA.name).toBe('Nguyễn Văn A');
      expect(dbUserA.authVersion).toBe(1); // Đã tăng nguyên tử lên 1

      // Mật khẩu cũ của User A vẫn đúng khi đăng nhập lại
      const reLoginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: 'usera.all@example.com', password: 'Password@123' });
      expect(reLoginRes.status).toBe(200);
      expect(reLoginRes.body.success).toBe(true);
    });

    it('nếu dọn dẹp store lỗi khi logout-all: vẫn trả về 200 requiresLogin: true vì authVersion đã tăng trên DB', async () => {
      const { cookies } = await createAndLoginUser();

      const store = app.locals.sessionStore;
      vi.spyOn(store, 'destroy').mockImplementation((_sid, callback) => {
        if (callback) callback(new Error('Mô phỏng lỗi dọn store'));
      });

      const res = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requiresLogin).toBe(true);
    });
  });

  // ============================================================================
  // NHÓM D: HỒI QUY, TƯƠNG THÍCH VÀ XỬ LÝ LỖI
  // ============================================================================
  describe('Nhóm D: Hồi quy, Tương thích và Xử lý Lỗi', () => {
    it('Đổi mật khẩu tạo phiên hiện tại hợp lệ, cập nhật metadata mới và vô hiệu hóa phiên cũ', async () => {
      const { user, cookies: cookies1 } = await createAndLoginUser(
        { email: 'usera.pwd@example.com', password: 'OldPassword@123' }
      );
      const cookies2 = await loginAnotherSession('usera.pwd@example.com', 'OldPassword@123');

      // Đổi mật khẩu trên Phiên 1
      const changeRes = await request(app)
        .post('/api/account/change-password')
        .set('Cookie', cookies1)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          currentPassword: 'OldPassword@123',
          newPassword: 'NewPassword@456'
        });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);
      expect(changeRes.body.data.passwordChanged).toBe(true);
      expect(changeRes.body.data.requiresLogin).toBe(false);

      // Phiên 1 nhận session cookie mới qua set-cookie sau regenerate
      const newCookies1 = changeRes.headers['set-cookie'] || cookies1;

      // Phiên 1 gọi danh sách phiên: metadata mới phản ánh đúng phiên hiện tại
      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', newCookies1);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.total).toBe(1); // Chỉ còn 1 phiên hợp lệ
      expect(listRes.body.data.sessions[0].isCurrent).toBe(true);

      // Phiên 2 gọi /me ngay lập tức bị từ chối 401 do sai authVersion
      const meRes2 = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies2);
      expect(meRes2.status).toBe(401);
    });

    it('Đăng xuất qua POST /api/auth/logout đánh dấu thu hồi phiên trong UserSession', async () => {
      const { cookies } = await createAndLoginUser();

      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies);
      const sessId = listRes.body.data.sessions[0].id;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(logoutRes.status).toBe(200);

      // Kiểm tra trong database: bản ghi đã được đánh dấu isRevoked: true
      const sessionDoc = await UserSession.findOne({ sessionId: sessId });
      expect(sessionDoc.isRevoked).toBe(true);
      expect(sessionDoc.revokedAt).toBeDefined();
    });

    it('Xử lý an toàn khi hai yêu cầu thu hồi cùng một phiên được gửi đồng thời', async () => {
      const { cookies: cookies1 } = await createAndLoginUser();
      const cookies2 = await loginAnotherSession('user.session@example.com', 'MatKhau@123');

      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies1);
      const targetSess = listRes.body.data.sessions.find((s) => !s.isCurrent);

      // Gửi đồng thời hai yêu cầu thu hồi
      const [res1, res2] = await Promise.all([
        request(app)
          .delete(`/api/account/sessions/${targetSess.id}`)
          .set('Cookie', cookies1)
          .set('Origin', TEST_ORIGIN),
        request(app)
          .delete(`/api/account/sessions/${targetSess.id}`)
          .set('Cookie', cookies1)
          .set('Origin', TEST_ORIGIN)
      ]);

      // Một yêu cầu thành công 200, yêu cầu thứ hai trả về 404 SESSION_NOT_FOUND (idempotent an toàn)
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 404]);
    });

    it('Lỗi database khi logout-all không báo thành công giả', async () => {
      const { cookies } = await createAndLoginUser();

      vi.spyOn(User, 'findByIdAndUpdate').mockRejectedValueOnce(new Error('Mô phỏng lỗi DB Update'));

      const res = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Nhóm E: Kiểm thử Hồi quy cho 3 lỗi Backend Giai đoạn 3A', () => {
    it('POST /api/account/logout-all thành công khi authVersion ban đầu là null, unset, hoặc 0 (Bug 3)', async () => {
      // 1. Trường hợp authVersion: null
      const { user: userNull, cookies: cookiesNull } = await createAndLoginUser({
        email: 'user.null.version@example.com'
      });
      await User.collection.updateOne({ _id: userNull._id }, { $set: { authVersion: null } });

      const resNull = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookiesNull)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(resNull.status).toBe(200);
      expect(resNull.body.code).toBe('LOGOUT_ALL_SUCCESS');
      expect(resNull.body.data.requiresLogin).toBe(true);

      const rawUserNull = await User.collection.findOne({ _id: userNull._id });
      expect(rawUserNull.authVersion).toBe(1);

      // 2. Trường hợp authVersion bị unset (không tồn tại trong MongoDB)
      const { user: userUnset, cookies: cookiesUnset } = await createAndLoginUser({
        email: 'user.unset.version@example.com'
      });
      await User.collection.updateOne({ _id: userUnset._id }, { $unset: { authVersion: '' } });

      const resUnset = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookiesUnset)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(resUnset.status).toBe(200);
      expect(resUnset.body.code).toBe('LOGOUT_ALL_SUCCESS');

      const rawUserUnset = await User.collection.findOne({ _id: userUnset._id });
      expect(rawUserUnset.authVersion).toBe(1);

      // 3. Trường hợp authVersion: 0
      const { user: userZero, cookies: cookiesZero } = await createAndLoginUser({
        email: 'user.zero.version@example.com'
      });
      await User.collection.updateOne({ _id: userZero._id }, { $set: { authVersion: 0 } });

      const resZero = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookiesZero)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(resZero.status).toBe(200);
      const rawUserZero = await User.collection.findOne({ _id: userZero._id });
      expect(rawUserZero.authVersion).toBe(1);

      // 4. Trường hợp authVersion dương (ví dụ: 5 -> 6)
      const { user: userFive, cookies: cookiesFive } = await createAndLoginUser({
        email: 'user.five.version@example.com',
        authVersion: 5
      });

      const resFive = await request(app)
        .post('/api/account/logout-all')
        .set('Cookie', cookiesFive)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(resFive.status).toBe(200);
      const rawUserFive = await User.collection.findOne({ _id: userFive._id });
      expect(rawUserFive.authVersion).toBe(6);
    });

    it('Tự động phục hồi metadata khi UserSession bị mất và session store vẫn còn (Bug 2)', async () => {
      const { user, cookies } = await createAndLoginUser({ email: 'user.healed@example.com' });

      // Lấy bản ghi UserSession hiện tại và xóa khỏi database để giả lập sự cố mất metadata
      const initialMeta = await UserSession.findOne({ userId: user._id });
      expect(initialMeta).not.toBeNull();
      await UserSession.deleteOne({ _id: initialMeta._id });

      const verifyDeleted = await UserSession.findOne({ userId: user._id });
      expect(verifyDeleted).toBeNull();

      // Gọi /api/auth/me: middleware requireAuth phải tự động chữa lành metadata nguyên tử
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);
      expect(meRes.status).toBe(200);

      // Gọi /api/account/sessions: danh sách phải có đúng 1 phiên và isCurrent = true
      const listRes = await request(app)
        .get('/api/account/sessions')
        .set('Cookie', cookies);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.total).toBe(1);
      expect(listRes.body.data.sessions.length).toBe(1);
      expect(listRes.body.data.sessions[0].isCurrent).toBe(true);

      // Bản ghi trong DB đã được phục hồi
      const healedMeta = await UserSession.findOne({ userId: user._id });
      expect(healedMeta).not.toBeNull();
      expect(healedMeta.sessionStoreId).toBe(initialMeta.sessionStoreId);
      expect(healedMeta.isRevoked).toBe(false);
    });

    it('Xử lý đồng thời 2 yêu cầu GET /api/account/sessions cho phiên legacy chỉ tạo duy nhất 1 bản ghi registry (Bug 1)', async () => {
      const { user, cookies } = await createAndLoginUser({ email: 'user.legacy.race@example.com' });

      const store = app.locals.sessionStore;
      const getStore = (sid) => new Promise((resolve, reject) => store.get(sid, (err, s) => (err ? reject(err) : resolve(s))));
      const setStore = (sid, sess) => new Promise((resolve, reject) => store.set(sid, sess, (err) => (err ? reject(err) : resolve())));

      const initialMeta = await UserSession.findOne({ userId: user._id });
      const storePayload = await getStore(initialMeta.sessionStoreId);

      // Giả lập phiên legacy: xóa managedSessionId trong store và xóa toàn bộ UserSession
      delete storePayload.managedSessionId;
      await setStore(initialMeta.sessionStoreId, storePayload);
      await UserSession.deleteMany({ userId: user._id });

      // Gửi đồng thời 2 yêu cầu liệt kê phiên
      const [listRes1, listRes2] = await Promise.all([
        request(app).get('/api/account/sessions').set('Cookie', cookies),
        request(app).get('/api/account/sessions').set('Cookie', cookies)
      ]);

      expect(listRes1.status).toBe(200);
      expect(listRes2.status).toBe(200);

      // Chỉ có duy nhất 1 bản ghi được tạo trong UserSession cho sessionStoreId này
      const records = await UserSession.find({ userId: user._id, sessionStoreId: initialMeta.sessionStoreId });
      expect(records.length).toBe(1);

      // Cả 2 response đều nhận cùng một public sessionId và isCurrent = true
      expect(listRes1.body.data.sessions[0].id).toBe(records[0].sessionId);
      expect(listRes2.body.data.sessions[0].id).toBe(records[0].sessionId);
      expect(listRes1.body.data.sessions[0].isCurrent).toBe(true);
      expect(listRes2.body.data.sessions[0].isCurrent).toBe(true);
    });

    it('Ngăn chặn phiên đã thu hồi sống lại kể cả khi session store bị ghi đè lại (Anti-revived Session Trap)', async () => {
      const { user, cookies } = await createAndLoginUser({ email: 'user.revive.trap@example.com' });
      const meta = await UserSession.findOne({ userId: user._id });

      const store = app.locals.sessionStore;
      const getStore = (sid) => new Promise((resolve, reject) => store.get(sid, (err, s) => (err ? reject(err) : resolve(s))));
      const setStore = (sid, sess) => new Promise((resolve, reject) => store.set(sid, sess, (err) => (err ? reject(err) : resolve())));

      const storePayloadBeforeRevoke = await getStore(meta.sessionStoreId);

      // Thu hồi phiên làm việc
      const revokeRes = await request(app)
        .delete(`/api/account/sessions/${meta.sessionId}`)
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.requiresLogin).toBe(true);

      // Giả lập replay store: một tiến trình cũ ghi đè lại session vào MongoStore
      await setStore(meta.sessionStoreId, storePayloadBeforeRevoke);

      // Yêu cầu tiếp theo với cookie cũ phải bị từ chối 401 vì UserSession đã đánh dấu isRevoked: true
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);

      expect(meRes.status).toBe(401);
    });

    it('Đổi mật khẩu thất bại khi tạo UserSession metadata trả về requiresLogin: true và hủy phiên (Fail-safe)', async () => {
      const { cookies } = await createAndLoginUser({
        email: 'user.metafail@example.com',
        password: 'OldPassword@123'
      });

      // Giả lập lỗi khi lưu metadata phiên mới sau khi đổi mật khẩu
      vi.spyOn(UserSession, 'create').mockRejectedValueOnce(new Error('Mô phỏng lỗi lưu UserSession'));

      const changeRes = await request(app)
        .post('/api/account/change-password')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          currentPassword: 'OldPassword@123',
          newPassword: 'NewPassword@456'
        });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.code).toBe('PASSWORD_CHANGED_RELOGIN_REQUIRED');
      expect(changeRes.body.data.passwordChanged).toBe(true);
      expect(changeRes.body.data.requiresLogin).toBe(true);

      // Phiên hiện tại đã bị hủy
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);
      expect(meRes.status).toBe(401);
    });
  });

  describe('Nhóm F: Kiểm thử Xác thực Toàn diện Metadata và Khảo sát/Nâng cấp Chỉ mục', () => {
    // =========================================================================
    // PHẦN 1: KIỂM THỬ ĐƠN VỊ (UNIT TEST) verifySessionRegistry VỚI EXPIRESAT
    // =========================================================================
    describe('Phần 1: Kiểm thử đơn vị verifySessionRegistry với các giá trị expiresAt đặc biệt', () => {
      const mockUserId = new mongoose.Types.ObjectId();
      const mockUser = { _id: mockUserId, authVersion: 1 };

      it('từ chối khi expiresAt là undefined', () => {
        const record = { userId: mockUserId, authVersion: 1, isRevoked: false };
        const result = verifySessionRegistry(record, mockUser, 1);
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('không có hạn sử dụng hoặc đã hết hạn');
      });

      it('từ chối khi expiresAt là null', () => {
        const record = { userId: mockUserId, authVersion: 1, isRevoked: false, expiresAt: null };
        const result = verifySessionRegistry(record, mockUser, 1);
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('không có hạn sử dụng hoặc đã hết hạn');
      });

      it('từ chối khi expiresAt là chuỗi không hợp lệ "invalid-date"', () => {
        const record = { userId: mockUserId, authVersion: 1, isRevoked: false, expiresAt: 'invalid-date' };
        const result = verifySessionRegistry(record, mockUser, 1);
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('Hạn sử dụng của phiên làm việc không hợp lệ');
      });

      it('từ chối khi expiresAt là NaN', () => {
        const record = { userId: mockUserId, authVersion: 1, isRevoked: false, expiresAt: NaN };
        const result = verifySessionRegistry(record, mockUser, 1);
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('không có hạn sử dụng hoặc đã hết hạn');
      });

      it('từ chối khi expiresAt ở thời điểm quá khứ so với mốc now', () => {
        const pastDate = new Date(Date.now() - 10000);
        const record = { userId: mockUserId, authVersion: 1, isRevoked: false, expiresAt: pastDate };
        const result = verifySessionRegistry(record, mockUser, 1);
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('Phiên làm việc đã hết hạn');
      });

      it('chấp nhận khi expiresAt ở thời điểm tương lai so với mốc now', () => {
        const futureDate = new Date(Date.now() + 86400000);
        const record = { userId: mockUserId, authVersion: 1, isRevoked: false, expiresAt: futureDate };
        const result = verifySessionRegistry(record, mockUser, 1);
        expect(result.isValid).toBe(true);
      });
    });

    // =========================================================================
    // PHẦN 2: KIỂM THỬ HẠN DÙNG VÀ METADATA QUA API VÀ MONGODB THỰC
    // =========================================================================
    describe('Phần 2: Kiểm thử hạn dùng và metadata qua API và MongoDB thực', () => {
      it('expiresAt = null trên MongoDB -> GET /api/auth/me trả 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.exp.null@example.com' });
        await UserSession.updateOne({ userId: user._id }, { $set: { expiresAt: null } });

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');
      });

      it('expiresAt bị unset khỏi document MongoDB -> GET /api/auth/me trả 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.exp.unset@example.com' });
        await mongoose.connection.db.collection('user_sessions').updateOne(
          { userId: user._id },
          { $unset: { expiresAt: '' } }
        );

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');
      });

      it('expiresAt quá khứ trên MongoDB -> GET /api/auth/me trả 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.exp.past@example.com' });
        await UserSession.updateOne(
          { userId: user._id },
          { $set: { expiresAt: new Date(Date.now() - 5000) } }
        );

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');
      });

      it('expiresAt hợp lệ tương lai -> GET /api/auth/me trả 200, GET /api/account/sessions trả 200 và có phiên hiện tại', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.exp.future@example.com' });
        await UserSession.updateOne(
          { userId: user._id },
          { $set: { expiresAt: new Date(Date.now() + 86400000) } }
        );

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(200);

        const listRes = await request(app).get('/api/account/sessions').set('Cookie', cookies);
        expect(listRes.status).toBe(200);
        expect(listRes.body.data.total).toBe(1);
        expect(listRes.body.data.sessions[0].isCurrent).toBe(true);
      });

      it('Metadata version khác User/session store -> từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.version.diff@example.com' });
        await UserSession.updateOne({ userId: user._id }, { $set: { authVersion: 88 } });

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(401);

        const listRes = await request(app).get('/api/account/sessions').set('Cookie', cookies);
        expect(listRes.status).toBe(401);
      });

      it('Metadata đã thu hồi -> từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.revoked.meta@example.com' });
        await UserSession.updateOne({ userId: user._id }, { $set: { isRevoked: true, revokedAt: new Date() } });

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(401);
      });

      it('Metadata không thuộc về người dùng hiện tại -> từ chối 401', async () => {
        const { cookies } = await createAndLoginUser({ email: 'user.wrong.owner@example.com' });
        const alienId = new mongoose.Types.ObjectId();
        await UserSession.updateOne({}, { $set: { userId: alienId } });

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(401);
      });
    });

    // =========================================================================
    // PHẦN 3: KIỂM THỬ CHỨNG MINH NHÁNH PHỤC HỒI (UPSERT RECOVERY BRANCH) ĐƯỢC THỰC THI
    // =========================================================================
    describe('Phần 3: Kiểm thử chứng minh nhánh phục hồi (upsert) thực sự được thực thi và kiểm tra bản ghi trả về', () => {
      it('Tình huống A: findOne trả null (mô phỏng race), upsert trả về bản ghi sai authVersion -> kích hoạt findOneAndUpdate và từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.wrongversion@example.com' });
        const meta = await UserSession.findOne({ userId: user._id });
        expect(meta).not.toBeNull();

        // Chuẩn bị bản ghi trong MongoDB có authVersion không khớp (ví dụ phiên cũ hoặc lệch version)
        await UserSession.updateOne({ _id: meta._id }, { $set: { authVersion: 99 } });

        // Mô phỏng findOne ban đầu trả về null (bắt buộc requireAuth phải nhảy vào nhánh upsert phục hồi)
        vi.spyOn(UserSession, 'findOne').mockResolvedValueOnce(null);
        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

        // Chứng minh findOneAndUpdate đã thực sự được gọi
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');

        // Chứng minh $setOnInsert KHÔNG ghi đè authVersion: 99 của bản ghi đã có
        const preservedMeta = await UserSession.findById(meta._id);
        expect(preservedMeta.authVersion).toBe(99);
      });

      it('Tình huống B: findOne trả null, upsert trả về bản ghi đã thu hồi (isRevoked = true) -> kích hoạt findOneAndUpdate và từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.revoked@example.com' });
        const meta = await UserSession.findOne({ userId: user._id });

        // Bản ghi trong DB đã bị thu hồi
        await UserSession.updateOne({ _id: meta._id }, { $set: { isRevoked: true, revokedAt: new Date() } });

        // findOne trả về null -> nhảy vào nhánh upsert
        vi.spyOn(UserSession, 'findOne').mockResolvedValueOnce(null);
        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');

        // Bản ghi trong DB vẫn giữ nguyên isRevoked: true
        const preservedMeta = await UserSession.findById(meta._id);
        expect(preservedMeta.isRevoked).toBe(true);
      });

      it('Tình huống C: findOne trả null, upsert trả về bản ghi đã hết hạn (expiresAt quá khứ) -> kích hoạt findOneAndUpdate và từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.expired@example.com' });
        const meta = await UserSession.findOne({ userId: user._id });

        // Bản ghi trong DB có expiresAt trong quá khứ
        const pastDate = new Date(Date.now() - 15000);
        await UserSession.updateOne({ _id: meta._id }, { $set: { expiresAt: pastDate } });

        vi.spyOn(UserSession, 'findOne').mockResolvedValueOnce(null);
        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');

        // Bản ghi trong DB vẫn giữ nguyên expiresAt quá khứ
        const preservedMeta = await UserSession.findById(meta._id);
        expect(preservedMeta.expiresAt.getTime()).toBe(pastDate.getTime());
      });

      it('Tình huống D: findOne trả null, upsert trả về bản ghi có expiresAt = null -> kích hoạt findOneAndUpdate và từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.nulltime@example.com' });
        const meta = await UserSession.findOne({ userId: user._id });

        // Bản ghi trong DB có expiresAt: null
        await UserSession.updateOne({ _id: meta._id }, { $set: { expiresAt: null } });

        vi.spyOn(UserSession, 'findOne').mockResolvedValueOnce(null);
        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');

        // Bản ghi trong DB không bị tự tiện gia hạn 1 ngày
        const preservedMeta = await UserSession.findById(meta._id);
        expect(preservedMeta.expiresAt).toBeNull();
      });

      it('Tình huống E: findOne trả null, upsert trả về bản ghi sai userId (thuộc user khác) -> kích hoạt findOneAndUpdate và từ chối 401', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.alienuser@example.com' });
        const meta = await UserSession.findOne({ userId: user._id });

        const alienId = new mongoose.Types.ObjectId();
        await UserSession.updateOne({ _id: meta._id }, { $set: { userId: alienId } });

        vi.spyOn(UserSession, 'findOne').mockResolvedValueOnce(null);
        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes.status).toBe(401);
        expect(meRes.body.code).toBe('UNAUTHORIZED');

        const preservedMeta = await UserSession.findById(meta._id);
        expect(preservedMeta.userId.toString()).toBe(alienId.toString());
      });

      it('Tình huống F: Phiên legacy hợp lệ chưa có UserSession -> upsert chạy, thành công 200, tạo 1 bản ghi duy nhất, ổn định sessionId', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.validlegacy@example.com' });
        const initialMeta = await UserSession.findOne({ userId: user._id });
        expect(initialMeta).not.toBeNull();

        // Xóa hoàn toàn bản ghi UserSession để mô phỏng phiên legacy thực sự chưa có metadata
        await UserSession.deleteMany({ userId: user._id });

        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        // Request 1: Kích hoạt nhánh upsert phục hồi
        const meRes1 = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes1.status).toBe(200);

        // Kiểm tra đúng 1 bản ghi được tạo
        const createdDocs = await UserSession.find({ userId: user._id });
        expect(createdDocs.length).toBe(1);
        const restoredMeta = createdDocs[0];
        expect(restoredMeta.sessionStoreId).toBe(initialMeta.sessionStoreId);
        expect(restoredMeta.isRevoked).toBe(false);
        expect(restoredMeta.expiresAt.getTime()).toBeGreaterThan(Date.now());

        // Request 2: Gọi tiếp GET /api/account/sessions
        const listRes = await request(app).get('/api/account/sessions').set('Cookie', cookies);
        expect(listRes.status).toBe(200);
        expect(listRes.body.data.total).toBe(1);
        expect(listRes.body.data.sessions[0].id).toBe(restoredMeta.sessionId);
        expect(listRes.body.data.sessions[0].isCurrent).toBe(true);

        // Xác nhận không bị nhân bản bản ghi
        const docsCount = await UserSession.countDocuments({ userId: user._id });
        expect(docsCount).toBe(1);
      });

      it('Kiểm tra $setOnInsert không ghi đè dữ liệu của bản ghi đã có khi upsert chạy', async () => {
        const { user, cookies } = await createAndLoginUser({ email: 'user.upsert.safeinsert@example.com' });
        const meta = await UserSession.findOne({ userId: user._id });

        // Đặt thông tin nhận dạng đặc biệt ban đầu
        const customDevice = 'Thiết Bị Gốc Riêng Biệt';
        await UserSession.updateOne({ _id: meta._id }, { $set: { deviceLabel: customDevice } });

        // findOne trả về null -> nhảy vào nhánh upsert
        vi.spyOn(UserSession, 'findOne').mockResolvedValueOnce(null);
        const updateSpy = vi.spyOn(UserSession, 'findOneAndUpdate');

        // Gửi request với User-Agent hoàn toàn khác
        const meRes = await request(app)
          .get('/api/auth/me')
          .set('Cookie', cookies)
          .set('User-Agent', 'Malicious-Device-Override/1.0');

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(meRes.status).toBe(200);

        // $setOnInsert bảo đảm dữ liệu của bản ghi hiện hữu KHÔNG bị ghi đè bởi User-Agent mới
        const afterMeta = await UserSession.findById(meta._id);
        expect(afterMeta.deviceLabel).toBe(customDevice);
      });
    });

    // --- Phần 2: Kiểm thử Quản trị & Nâng cấp Index (Issue 1) ---
    it('Database mới / hiện tại -> index thực tế có unique:true (Test A)', async () => {
      const indexes = await mongoose.connection.db.collection('user_sessions').indexes();
      const storeIdx = indexes.find((i) => i.name === 'sessionStoreId_1');
      expect(storeIdx).toBeDefined();
      expect(storeIdx.unique).toBe(true);
    });

    it('Có index cũ không unique -> createApp dừng an toàn, hướng dẫn nâng cấp, không tự sửa dữ liệu (Test B)', async () => {
      const col = mongoose.connection.db.collection('user_sessions');
      await col.insertOne({
        sessionId: 'test-uuid-old',
        userId: new mongoose.Types.ObjectId(),
        sessionStoreId: 'sid-old-123',
        authVersion: 0,
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        isRevoked: false
      });

      // Tạm thời hạ cấp chỉ mục thành non-unique
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 });

      let errorThrown = null;
      try {
        await createApp({
          sessionSecret: 'test-secret-phase3a-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4'
        });
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).not.toBeNull();
      expect(errorThrown.message).toContain('chỉ mục không duy nhất');
      expect(errorThrown.message).toContain('node scripts/upgradeSessionIndex.js');

      // Xác nhận dữ liệu không bị xóa tự động
      const doc = await col.findOne({ sessionId: 'test-uuid-old' });
      expect(doc).not.toBeNull();

      // Xác nhận index cũ vẫn giữ nguyên (không bị server tự ý drop khi startup)
      const indexes = await col.indexes();
      const idx = indexes.find((i) => i.name === 'sessionStoreId_1');
      expect(idx.unique).toBeFalsy();

      // Khôi phục lại Unique Index cho các test tiếp theo
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 }, { unique: true });
      await col.deleteOne({ sessionId: 'test-uuid-old' });
    });

    it('Dry-run / Survey -> không thay đổi dữ liệu hoặc chỉ mục (Test C)', async () => {
      const col = mongoose.connection.db.collection('user_sessions');
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 });

      const surveyResult = await surveyOrUpgradeSessionIndex({ mode: 'survey', connection: mongoose.connection });
      expect(surveyResult.success).toBe(true);
      expect(surveyResult.mode).toBe('survey');
      expect(surveyResult.isUnique).toBe(false);

      // Kiểm chứng chỉ mục và dữ liệu vẫn nguyên vẹn
      const indexes = await col.indexes();
      const idx = indexes.find((i) => i.name === 'sessionStoreId_1');
      expect(idx.unique).toBeFalsy();

      // Khôi phục
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 }, { unique: true });
    });

    it('Áp dụng nâng cấp trên database TEST không có dữ liệu trùng -> thành công, app khởi tạo lại được (Test D)', async () => {
      const col = mongoose.connection.db.collection('user_sessions');
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 });

      // Chạy chế độ apply
      const applyResult = await surveyOrUpgradeSessionIndex({ mode: 'apply', connection: mongoose.connection });
      expect(applyResult.success).toBe(true);
      expect(applyResult.isUnique).toBe(true);

      // Kiểm chứng index thực tế trên MongoDB đã có unique: true
      const indexes = await col.indexes();
      const idx = indexes.find((i) => i.name === 'sessionStoreId_1');
      expect(idx.unique).toBe(true);

      // createApp khởi tạo lại thành công không còn bị lỗi index conflict
      const testApp = await createApp({
        sessionSecret: 'test-secret-phase3a-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4'
      });
      expect(testApp).toBeDefined();
    });

    it('Có dữ liệu trùng -> dừng an toàn, không xóa bản ghi, không làm mất dấu phiên đã thu hồi (Test E)', async () => {
      const col = mongoose.connection.db.collection('user_sessions');
      const sameStoreId = 'duplicate-sid-xyz-123';

      // Hạ cấp tạm thời xuống non-unique để có thể nạp dữ liệu trùng lặp lịch sử
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 });

      // Ghi nhận 2 bản ghi trùng lặp: 1 bản ghi active, 1 bản ghi đã revoked
      await col.insertMany([
        {
          sessionId: 'uuid-1-active',
          userId: new mongoose.Types.ObjectId(),
          sessionStoreId: sameStoreId,
          authVersion: 0,
          lastActiveAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
          isRevoked: false
        },
        {
          sessionId: 'uuid-2-revoked',
          userId: new mongoose.Types.ObjectId(),
          sessionStoreId: sameStoreId,
          authVersion: 0,
          lastActiveAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
          isRevoked: true,
          revokedAt: new Date()
        }
      ]);

      // Chạy apply trên database có dữ liệu trùng
      let applyError = null;
      try {
        await surveyOrUpgradeSessionIndex({ mode: 'apply', connection: mongoose.connection });
      } catch (err) {
        applyError = err;
      }

      expect(applyError).not.toBeNull();
      expect(applyError.message).toContain('[DỪNG AN TOÀN]');
      expect(applyError.message).toContain('1 nhóm sessionStoreId trùng lặp');

      // BẢO VỆ DỮ LIỆU: Cả 2 bản ghi vẫn tồn tại đầy đủ, không bị script tự tiện xóa
      const remainingDocs = await col.find({ sessionStoreId: sameStoreId }).toArray();
      expect(remainingDocs.length).toBe(2);

      // Bản ghi đã thu hồi vẫn giữ nguyên trạng thái isRevoked: true (không làm mất dấu)
      const revokedDoc = remainingDocs.find((d) => d.sessionId === 'uuid-2-revoked');
      expect(revokedDoc.isRevoked).toBe(true);
      expect(revokedDoc.revokedAt).toBeDefined();

      // Dọn dẹp dữ liệu test và khôi phục Unique Index
      await col.deleteMany({ sessionStoreId: sameStoreId });
      await col.dropIndex('sessionStoreId_1');
      await col.createIndex({ sessionStoreId: 1 }, { unique: true });
    });
  });
});
