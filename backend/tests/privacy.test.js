import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/settings/privacy';

describe('Phase 5B Backend Privacy Settings Tests (GET & PATCH /api/settings/privacy)', () => {
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
      sessionSecret: 'test-secret-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4'
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

  async function createAndLoginUser(customData = {}) {
    const fullName = customData.name || 'Người Dùng Privacy';
    const email = customData.email || 'user.privacy@example.com';
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
    const userDoc = await User.findOne({ email });

    return {
      userId: userDoc._id.toString(),
      email,
      cookies
    };
  }

  describe('1. GET /api/settings - Đọc cấu hình privacy', () => {
    it('1.1. Trả về privacy.retentionDays = 30 mặc định cho người dùng mới', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.privacy).toBeDefined();
      expect(res.body.data.privacy.retentionDays).toBe(30);
      expect(res.body.data.appearance).toBeDefined();
      expect(res.body.data.notifications).toBeDefined();
    });

    it('1.2. Tài khoản cũ thiếu settings hoặc privacy null được chuẩn hóa về 30 mà KHÔNG ghi vào DB', async () => {
      const { cookies, userId } = await createAndLoginUser();

      // Cố tình xóa settings hoặc đặt settings = null
      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $unset: { settings: '' } }
      );

      const docBefore = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
      expect(docBefore.settings).toBeUndefined();

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.privacy.retentionDays).toBe(30);

      // Xác nhận DB không bị tự động ghi trong GET
      const docAfter = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
      expect(docAfter.settings).toBeUndefined();
    });

    it('1.3. Tài khoản cũ có giá trị retentionDays sai kiểu hoặc giá trị lạ được chuẩn hóa an toàn', async () => {
      const { cookies, userId } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $set: { 'settings.privacy.retentionDays': 'invalid_string' } }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.privacy.retentionDays).toBe(30);
    });
  });

  describe('2. PATCH /api/settings/privacy - Cập nhật hợp lệ', () => {
    it('2.1. Cập nhật thành công retentionDays = 7, 30, 90', async () => {
      const { cookies, userId } = await createAndLoginUser();

      for (const days of [7, 90, 30]) {
        const res = await request(app)
          .patch('/api/settings/privacy')
          .set('Origin', TEST_ORIGIN)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .set('Cookie', cookies)
          .send({ retentionDays: days });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.privacy.retentionDays).toBe(days);

        const updatedDoc = await User.findById(userId).lean();
        expect(updatedDoc.settings.privacy.retentionDays).toBe(days);
      }
    });

    it('2.2. Cập nhật thành công cho tài khoản cũ có settings null mà không làm hỏng document', async () => {
      const { cookies, userId } = await createAndLoginUser();

      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $set: { settings: null } }
      );

      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ retentionDays: 7 });

      expect(res.status).toBe(200);
      expect(res.body.data.privacy.retentionDays).toBe(7);

      const updatedDoc = await User.findById(userId).lean();
      expect(updatedDoc.settings.privacy.retentionDays).toBe(7);
    });

    it('2.3. Bảo toàn appearance và notifications khi cập nhật privacy', async () => {
      const { cookies, userId } = await createAndLoginUser();

      // Đặt trước appearance và notifications tùy biến
      await request(app)
        .patch('/api/settings/appearance')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ theme: 'light', fontSize: 'large' });

      await request(app)
        .patch('/api/settings/notifications')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ minSeverity: 'urgent' });

      // Bây giờ cập nhật privacy
      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ retentionDays: 90 });

      expect(res.status).toBe(200);
      expect(res.body.data.privacy.retentionDays).toBe(90);

      // Kiểm tra DB: appearance và notifications vẫn nguyên vẹn
      const userDoc = await User.findById(userId).lean();
      expect(userDoc.settings.appearance.theme).toBe('light');
      expect(userDoc.settings.appearance.fontSize).toBe('large');
      expect(userDoc.settings.notifications.minSeverity).toBe('urgent');
      expect(userDoc.settings.privacy.retentionDays).toBe(90);
    });
  });

  describe('3. PATCH /api/settings/privacy - Validate và từ chối payload không hợp lệ', () => {
    it('3.1. Từ chối kiểu chuỗi (không ép kiểu "7" thành 7)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ retentionDays: '7' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.retentionDays).toBeDefined();
    });

    it('3.2. Từ chối kiểu boolean, số thực (float), mảng hoặc null', async () => {
      const { cookies } = await createAndLoginUser();

      for (const invalidVal of [true, false, 7.5, [7], null]) {
        const res = await request(app)
          .patch('/api/settings/privacy')
          .set('Origin', TEST_ORIGIN)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .set('Cookie', cookies)
          .send({ retentionDays: invalidVal });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('3.3. Từ chối các giá trị số không nằm trong enum 7/30/90', async () => {
      const { cookies } = await createAndLoginUser();

      for (const badVal of [0, 1, 14, 15, 60, 100, 365, -7]) {
        const res = await request(app)
          .patch('/api/settings/privacy')
          .set('Origin', TEST_ORIGIN)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .set('Cookie', cookies)
          .send({ retentionDays: badVal });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('3.4. Từ chối body rỗng', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('EMPTY_UPDATE_BODY');
    });

    it('3.5. Từ chối trường lạ hoặc trường đặc quyền (role, owned, extraField)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ retentionDays: 7, role: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('3.6. Từ chối key chứa dấu chấm (.) hoặc ký tự MongoDB ($)', async () => {
      const { cookies } = await createAndLoginUser();

      const res1 = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ 'settings.privacy.retentionDays': 7 });

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      const res2 = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ '$set': { retentionDays: 7 } });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });
  });

  describe('4. Phân lập dữ liệu và bảo mật', () => {
    it('4.1. Cập nhật của User A không làm thay đổi của User B', async () => {
      const userA = await createAndLoginUser({ email: 'userA@example.com' });
      const userB = await createAndLoginUser({ email: 'userB@example.com' });

      await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .set('Cookie', userA.cookies)
        .send({ retentionDays: 7 });

      const docA = await User.findById(userA.userId).lean();
      const docB = await User.findById(userB.userId).lean();

      expect(docA.settings.privacy.retentionDays).toBe(7);
      expect(docB.settings?.privacy?.retentionDays || 30).toBe(30);
    });

    it('4.2. Từ chối request khi chưa đăng nhập (401 UNAUTHORIZED)', async () => {
      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .send({ retentionDays: 7 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('4.3. Từ chối Origin lạ (CSRF check)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', 'https://attacker.evil.com')
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies)
        .send({ retentionDays: 7 });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('4.4. Từ chối Content-Type không phải application/json (415)', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/privacy')
        .set('Origin', TEST_ORIGIN)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'text/plain')
        .set('Cookie', cookies)
        .send('retentionDays=7');

      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('4.5. Cập nhật cạnh tranh giữa appearance, notifications và privacy đều bảo toàn', async () => {
      const { cookies, userId } = await createAndLoginUser();

      await Promise.all([
        request(app)
          .patch('/api/settings/appearance')
          .set('Origin', TEST_ORIGIN)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .set('Cookie', cookies)
          .send({ theme: 'light' }),
        request(app)
          .patch('/api/settings/notifications')
          .set('Origin', TEST_ORIGIN)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .set('Cookie', cookies)
          .send({ minSeverity: 'all' }),
        request(app)
          .patch('/api/settings/privacy')
          .set('Origin', TEST_ORIGIN)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .set('Cookie', cookies)
          .send({ retentionDays: 90 })
      ]);

      const userDoc = await User.findById(userId).lean();
      expect(userDoc.settings.appearance.theme).toBe('light');
      expect(userDoc.settings.notifications.minSeverity).toBe('all');
      expect(userDoc.settings.privacy.retentionDays).toBe(90);
    });
  });
});
