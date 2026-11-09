import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { createChangePasswordRateLimiter } from '../src/middleware/rateLimiter.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/settings/account';

describe('Backend Account Profile API & MongoDB Integration Tests', () => {
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

  /**
   * Helper tạo tài khoản và đăng nhập để nhận cookie session hợp lệ
   */
  async function createAndLoginUser(customData = {}) {
    const fullName = customData.name || 'Người Dùng Test';
    const email = customData.email || 'user.account@example.com';
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
  // NHÓM A: XÁC THỰC VÀ MIDDLEWARE BẢO VỆ
  // ==========================================
  describe('Nhóm A: Xác thực và Middleware bảo vệ', () => {
    it('PATCH /api/account/profile từ chối 401 khi chưa đăng nhập (không có cookie)', async () => {
      const res = await request(app)
        .patch('/api/account/profile')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Mới' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('PATCH /api/account/profile từ chối 403 khi Origin không thuộc allowlist', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', 'http://malicious-site.com')
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Mới' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/account/profile từ chối 415 khi thiếu hoặc sai Content-Type', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('name=TenMoi');

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('PATCH /api/account/profile chấp nhận Referer hợp lệ khi thiếu Origin', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .send({ name: 'Nguyễn Văn Đạt' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Nguyễn Văn Đạt');
    });
  });

  // ==========================================
  // NHÓM B: CẤU TRÚC BODY VÀ GIÁ TRỊ RỖNG
  // ==========================================
  describe('Nhóm B: Cấu trúc Body và Giá trị rỗng', () => {
    it('từ chối 400 EMPTY_UPDATE_BODY khi body là object rỗng {}', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMPTY_UPDATE_BODY');
    });

    it('từ chối 400 VALIDATION_ERROR khi body là array', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(['name', 'test']);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('từ chối 400 VALIDATION_ERROR khi body là primitive string hoặc null', async () => {
      const { cookies } = await createAndLoginUser();

      const res1 = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify('just a string'));

      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(null);

      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
    });
  });

  // ==========================================
  // NHÓM C: XÁC THỰC TRƯỜNG NAME VÀ UNICODE
  // ==========================================
  describe('Nhóm C: Xác thực trường Name và Unicode', () => {
    it('từ chối 400 khi name sai kiểu dữ liệu (số, boolean, object)', async () => {
      const { cookies } = await createAndLoginUser();

      const resNumber = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 12345 });

      expect(resNumber.status).toBe(400);
      expect(resNumber.body.code).toBe('VALIDATION_ERROR');
      expect(resNumber.body.errors?.name).toBeDefined();

      const resBool = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: true });

      expect(resBool.status).toBe(400);
      expect(resBool.body.code).toBe('VALIDATION_ERROR');
    });

    it('từ chối 400 khi name sau trim ngắn hơn 2 ký tự hoặc toàn khoảng trắng', async () => {
      const { cookies } = await createAndLoginUser();

      const resShort = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'A' });

      expect(resShort.status).toBe(400);
      expect(resShort.body.code).toBe('VALIDATION_ERROR');

      const resSpaces = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: '     ' });

      expect(resSpaces.status).toBe(400);
      expect(resSpaces.body.code).toBe('VALIDATION_ERROR');
    });

    it('từ chối 400 khi name dài hơn 100 ký tự', async () => {
      const { cookies } = await createAndLoginUser();

      const longName = 'A'.repeat(101);
      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: longName });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('cập nhật thành công với tên tiếng Việt có dấu (Unicode) và hỗ trợ trim đầu/cuối', async () => {
      const { cookies, user } = await createAndLoginUser({ name: 'Tên Ban Đầu' });

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: '   Nguyễn Hoàng Minh Quân   ' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Nguyễn Hoàng Minh Quân');

      // Xác minh trong DB
      const dbUser = await User.findById(user._id);
      expect(dbUser.name).toBe('Nguyễn Hoàng Minh Quân');
    });
  });

  // ==========================================
  // NHÓM D: CHẶN TRƯỜNG LẠ VÀ TRƯỜNG ĐẶC QUYỀN
  // ==========================================
  describe('Nhóm D: Chặn trường lạ và trường đặc quyền', () => {
    it('từ chối 400 UNKNOWN_FIELD_REJECTED khi gửi kèm trường lạ hoặc trường phân quyền (role, owned)', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Cố tình gửi role: admin để leo thang đặc quyền
      const resRole = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Hợp Lệ', role: 'admin' });

      expect(resRole.status).toBe(400);
      expect(resRole.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      // Cố tình gửi owned
      const resOwned = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Hợp Lệ', owned: ['smart-door-lock'] });

      expect(resOwned.status).toBe(400);
      expect(resOwned.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      // Kiểm tra DB không bị thay đổi
      const dbUser = await User.findById(user._id);
      expect(dbUser.role).toBe('viewer');
      expect(dbUser.owned).toEqual([]);
    });

    it('từ chối 400 UNKNOWN_FIELD_REJECTED khi gửi email, passwordHash, settings, _id', async () => {
      const { cookies } = await createAndLoginUser();

      const resEmail = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Hợp Lệ', email: 'hacker@example.com' });

      expect(resEmail.status).toBe(400);
      expect(resEmail.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      const resPass = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Hợp Lệ', passwordHash: 'newhash' });

      expect(resPass.status).toBe(400);
      expect(resPass.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });

    it('từ chối 400 UNKNOWN_FIELD_REJECTED khi key chứa dấu chấm (.) hoặc MongoDB ($)', async () => {
      const { cookies } = await createAndLoginUser();

      const resDot = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ 'name.nested': 'Test' });

      expect(resDot.status).toBe(400);
      expect(resDot.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      const resDollar = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ '$where': '1 == 1' });

      expect(resDollar.status).toBe(400);
      expect(resDollar.body.code).toBe('UNKNOWN_FIELD_REJECTED');
    });
  });

  // ==========================================
  // NHÓM E: CÁCH LY NGƯỜI DÙNG, BẢO TOÀN DỮ LIỆU VÀ TÀI KHOẢN ĐÃ XÓA
  // ==========================================
  describe('Nhóm E: Cách ly người dùng và Bảo toàn dữ liệu', () => {
    it('User A cập nhật tên không làm thay đổi tên hoặc dữ liệu của User B', async () => {
      const userA = await createAndLoginUser({ name: 'Nguyễn Văn A', email: 'usera@example.com' });
      const userB = await createAndLoginUser({ name: 'Trần Thị B', email: 'userb@example.com' });

      // User A cập nhật tên
      const resA = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', userA.cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Nguyễn Văn A (Đã Sửa)' });

      expect(resA.status).toBe(200);
      expect(resA.body.data.user.name).toBe('Nguyễn Văn A (Đã Sửa)');

      // Kiểm tra User B trong database hoàn toàn không bị ảnh hưởng
      const dbUserB = await User.findById(userB.user._id);
      expect(dbUserB.name).toBe('Trần Thị B');
      expect(dbUserB.email).toBe('userb@example.com');
    });

    it('Cập nhật tên bảo toàn nguyên vẹn email, role, owned, passwordHash và settings của người dùng', async () => {
      const { cookies, user } = await createAndLoginUser({ name: 'User Test C', email: 'userc@example.com' });

      // Cập nhật settings trước đó cho user
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'settings.appearance.theme': 'light',
          'settings.appearance.fontSize': 'large',
          role: 'member',
          owned: ['smart-door-lock']
        }
      });

      const beforeUpdate = await User.findById(user._id);

      // Gọi PATCH /api/account/profile
      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Mới Sau Cập Nhật' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('Tên Mới Sau Cập Nhật');

      const afterUpdate = await User.findById(user._id);
      // Chỉ name thay đổi
      expect(afterUpdate.name).toBe('Tên Mới Sau Cập Nhật');
      // Các trường khác giữ nguyên 100%
      expect(afterUpdate.email).toBe(beforeUpdate.email);
      expect(afterUpdate.role).toBe(beforeUpdate.role);
      expect(afterUpdate.owned).toEqual(beforeUpdate.owned);
      expect(afterUpdate.passwordHash).toBe(beforeUpdate.passwordHash);
      expect(afterUpdate.settings.appearance.theme).toBe('light');
      expect(afterUpdate.settings.appearance.fontSize).toBe('large');
    });

    it('Response thành công tuân thủ đúng hợp đồng công khai, không lộ passwordHash hay cookie', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Tên Kiểm Tra Hợp Đồng' });

      expect(res.status).toBe(200);
      const returnedUser = res.body.data.user;
      expect(returnedUser.id).toBeDefined();
      expect(returnedUser.name).toBe('Tên Kiểm Tra Hợp Đồng');
      expect(returnedUser.email).toBeDefined();
      expect(returnedUser.role).toBeDefined();
      expect(Array.isArray(returnedUser.owned)).toBe(true);
      expect(returnedUser.createdAt).toBeDefined();

      // Không lộ dữ liệu nội bộ
      expect(returnedUser.passwordHash).toBeUndefined();
      expect(returnedUser._id).toBeUndefined();
      expect(returnedUser.__v).toBeUndefined();
      expect(returnedUser.settings).toBeUndefined();
    });

    it('Trả về 401 UNAUTHORIZED và dọn session khi tài khoản đã bị xóa khỏi database', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Xóa tài khoản khỏi DB trong khi session cookie vẫn còn
      await User.findByIdAndDelete(user._id);

      const res = await request(app)
        .patch('/api/account/profile')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ name: 'Cố Gắng Cập Nhật' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================
  // PHẦN 2: POST /api/account/change-password
  // ==========================================
  describe('POST /api/account/change-password', () => {
    // ------------------------------------------
    // Nhóm 1: Middleware & Bảo vệ yêu cầu
    // ------------------------------------------
    describe('Nhóm 1: Middleware & Bảo vệ yêu cầu', () => {
      it('từ chối 401 khi chưa đăng nhập (không có cookie session)', async () => {
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: 'MatKhauMoi@456' });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('UNAUTHORIZED');
      });

      it('từ chối 403 khi Origin không thuộc allowlist', async () => {
        const { cookies } = await createAndLoginUser();
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', 'http://hacker-site.com')
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: 'MatKhauMoi@456' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
      });

      it('chấp nhận Referer hợp lệ khi không có header Origin', async () => {
        const { cookies } = await createAndLoginUser();
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Referer', TEST_REFERER)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: 'MatKhauMoi@456' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.passwordChanged).toBe(true);
      });

      it('từ chối 415 khi thiếu hoặc sai Content-Type (text/plain)', async () => {
        const { cookies } = await createAndLoginUser();
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'text/plain')
          .send('currentPassword=MatKhau@123&newPassword=MatKhauMoi@456');

        expect(res.status).toBe(415);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      });

      it('rate limit hoạt động: trả về 429 TOO_MANY_REQUESTS khi gửi vượt ngưỡng', async () => {
        const customLimiter = createChangePasswordRateLimiter({ max: 2, windowMs: 60000 });
        const testApp = await createApp({
          sessionStore: app.locals.sessionStore,
          sessionSecret: 'test-secret-fa1ab6a023fd985fc4e25f146661e475d32dd29a833e2e561123902445b6e3c4',
          changePasswordRateLimiter: customLimiter
        });

        const { cookies } = await createAndLoginUser({ email: 'rate.limit.test@example.com' });

        // Request 1: OK (hoặc 400 wrong password)
        const res1 = await request(testApp)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'SaiPassword', newPassword: 'MatKhauMoi@456' });
        expect(res1.status).toBe(400);

        // Request 2: OK (hoặc 400 wrong password)
        const res2 = await request(testApp)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'SaiPassword', newPassword: 'MatKhauMoi@456' });
        expect(res2.status).toBe(400);

        // Request 3: Vượt quá max: 2 -> 429 TOO_MANY_REQUESTS
        const res3 = await request(testApp)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'SaiPassword', newPassword: 'MatKhauMoi@456' });
        expect(res3.status).toBe(429);
        expect(res3.body.code).toBe('TOO_MANY_REQUESTS');
      });
    });

    // ------------------------------------------
    // Nhóm 2: Validation dữ liệu đầu vào
    // ------------------------------------------
    describe('Nhóm 2: Validation dữ liệu đầu vào', () => {
      it('từ chối 400 khi body rỗng {} hoặc không phải object', async () => {
        const { cookies } = await createAndLoginUser();

        const resEmpty = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({});
        expect(resEmpty.status).toBe(400);
        expect(resEmpty.body.code).toBe('VALIDATION_ERROR');

        const resArray = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send([{ currentPassword: '123' }]);
        expect(resArray.status).toBe(400);
        expect(resArray.body.code).toBe('VALIDATION_ERROR');

        const resPrim = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify('just a string'));
        expect(resPrim.status).toBe(400);
        expect(resPrim.body.code).toBe('VALIDATION_ERROR');
      });

      it('từ chối 400 khi thiếu trường currentPassword hoặc newPassword', async () => {
        const { cookies } = await createAndLoginUser();

        const resMissingNew = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123' });
        expect(resMissingNew.status).toBe(400);
        expect(resMissingNew.body.code).toBe('VALIDATION_ERROR');
        expect(resMissingNew.body.errors.newPassword).toBeDefined();

        const resMissingCurrent = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ newPassword: 'MatKhauMoi@456' });
        expect(resMissingCurrent.status).toBe(400);
        expect(resMissingCurrent.body.code).toBe('VALIDATION_ERROR');
        expect(resMissingCurrent.body.errors.currentPassword).toBeDefined();
      });

      it('từ chối 400 khi mật khẩu không phải kiểu chuỗi (số, boolean, object)', async () => {
        const { cookies } = await createAndLoginUser();

        const res1 = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 12345678, newPassword: 'MatKhauMoi@456' });
        expect(res1.status).toBe(400);
        expect(res1.body.code).toBe('VALIDATION_ERROR');

        const res2 = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: true });
        expect(res2.status).toBe(400);
        expect(res2.body.code).toBe('VALIDATION_ERROR');
      });

      it('từ chối 400 UNKNOWN_FIELD_REJECTED khi gửi kèm trường lạ hoặc trường đặc quyền', async () => {
        const { cookies } = await createAndLoginUser();

        const dangerousFields = ['email', 'role', 'owned', 'passwordHash', 'settings', 'userId', '_id', 'extraField'];
        for (const field of dangerousFields) {
          const res = await request(app)
            .post('/api/account/change-password')
            .set('Cookie', cookies)
            .set('Origin', TEST_ORIGIN)
            .set('Content-Type', 'application/json')
            .send({
              currentPassword: 'MatKhau@123',
              newPassword: 'MatKhauMoi@456',
              [field]: 'maliciousValue'
            });
          expect(res.status).toBe(400);
          expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
        }
      });

      it('từ chối 400 UNKNOWN_FIELD_REJECTED khi key chứa dấu "." hoặc "$"', async () => {
        const { cookies } = await createAndLoginUser();

        const resDot = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({
            currentPassword: 'MatKhau@123',
            newPassword: 'MatKhauMoi@456',
            'user.role': 'admin'
          });
        expect(resDot.status).toBe(400);
        expect(resDot.body.code).toBe('UNKNOWN_FIELD_REJECTED');

        const resDollar = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({
            currentPassword: 'MatKhau@123',
            newPassword: 'MatKhauMoi@456',
            $where: 'sleep(1000)'
          });
        expect(resDollar.status).toBe(400);
        expect(resDollar.body.code).toBe('UNKNOWN_FIELD_REJECTED');
      });

      it('từ chối 400 VALIDATION_ERROR khi mật khẩu mới ngắn hơn 8 ký tự', async () => {
        const { cookies } = await createAndLoginUser();

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: 'Short' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors.newPassword).toContain('8 ký tự');
      });

      it('từ chối 400 VALIDATION_ERROR khi mật khẩu mới vượt quá 72 byte UTF-8', async () => {
        const { cookies } = await createAndLoginUser();

        // 73 ký tự ASCII (73 byte)
        const longPassword = 'a'.repeat(73);
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: longPassword });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors.newPassword).toContain('72 byte');

        // Mật khẩu Unicode nhiều byte: 54 ký tự JS nhưng 78 byte UTF-8 (vượt quá 72 byte)
        const unicodeLongPassword = 'TiếngViệt'.repeat(6);
        expect(unicodeLongPassword.length).toBeLessThan(72); // 54 < 72 ký tự JS
        expect(Buffer.byteLength(unicodeLongPassword, 'utf8')).toBeGreaterThan(72); // 78 > 72 byte UTF-8
        const resUnicode = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: unicodeLongPassword });

        expect(resUnicode.status).toBe(400);
        expect(resUnicode.body.code).toBe('VALIDATION_ERROR');
        expect(resUnicode.body.errors.newPassword).toContain('72 byte');
      });

      it('từ chối 400 VALIDATION_ERROR khi mật khẩu hiện tại vượt quá 72 byte UTF-8', async () => {
        const { cookies } = await createAndLoginUser();

        // 73 ký tự ASCII (73 byte)
        const longCurrentPassword = 'b'.repeat(73);
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: longCurrentPassword, newPassword: 'MatKhauMoi@456' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors.currentPassword).toContain('72 byte');

        // Mật khẩu Unicode nhiều byte: 54 ký tự JS nhưng 78 byte UTF-8 (> 72 byte)
        const unicodeLongCurrent = 'TiếngViệt'.repeat(6);
        const resUnicode = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: unicodeLongCurrent, newPassword: 'MatKhauMoi@456' });

        expect(resUnicode.status).toBe(400);
        expect(resUnicode.body.code).toBe('VALIDATION_ERROR');
        expect(resUnicode.body.errors.currentPassword).toContain('72 byte');
      });

      it('trường hợp mật khẩu hiện tại 72 byte kèm hậu tố bị từ chối 400 và không thể dùng để đổi sang cùng mật khẩu', async () => {
        // Đăng ký user với mật khẩu đúng 72 byte ASCII
        const password72 = 'c'.repeat(72);
        const { cookies, user } = await createAndLoginUser({ password: password72, email: 'user72@example.com' });

        const currentWithSuffix = password72 + '_extraSuffix';
        const newPassword = password72;

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: currentWithSuffix, newPassword });

        // Bị từ chối 400 (do currentPassword vượt quá 72 byte)
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');

        // Xác minh DB không bị thay đổi passwordHash hoặc authVersion
        const dbUser = await User.findById(user._id);
        expect(dbUser.passwordHash).toBe(user.passwordHash);
        expect(dbUser.authVersion).toBe(user.authVersion || 0);
      });

      it('chấp nhận mật khẩu có chứa khoảng trắng và bảo toàn nguyên vẹn (không trim)', async () => {
        const { cookies, email } = await createAndLoginUser();

        const passwordWithSpaces = '  Pass Word 123  ';
        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhau@123', newPassword: passwordWithSpaces });

        expect(res.status).toBe(200);

        // Đăng nhập lại với mật khẩu có khoảng trắng nguyên vẹn -> thành công
        const loginRes = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password: passwordWithSpaces });
        expect(loginRes.status).toBe(200);

        // Đăng nhập với mật khẩu đã trim -> thất bại (chứng minh backend không tự trim mật khẩu)
        const loginTrimmed = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password: passwordWithSpaces.trim() });
        expect(loginTrimmed.status).toBe(401);
      });

      it('từ chối 400 INCORRECT_CURRENT_PASSWORD khi sai mật khẩu hiện tại (DB không đổi)', async () => {
        const { cookies, user } = await createAndLoginUser();

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'MatKhauSai@999', newPassword: 'MatKhauMoi@456' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INCORRECT_CURRENT_PASSWORD');
        expect(res.body.message).toContain('không chính xác');

        // Mật khẩu và authVersion trong database không bị thay đổi
        const dbUser = await User.findById(user._id);
        expect(dbUser.passwordHash).toBe(user.passwordHash);
        expect(dbUser.authVersion).toBe(user.authVersion || 0);
      });

      it('từ chối 400 PASSWORD_SAME_AS_CURRENT khi mật khẩu mới trùng mật khẩu hiện tại', async () => {
        const { cookies, password } = await createAndLoginUser();

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: password });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PASSWORD_SAME_AS_CURRENT');
        expect(res.body.message).toContain('không được trùng');
      });
    });

    // ------------------------------------------
    // Nhóm 3: Thành công, Bảo toàn dữ liệu & Cách ly
    // ------------------------------------------
    describe('Nhóm 3: Thành công, Bảo toàn dữ liệu & Cách ly', () => {
      it('đổi mật khẩu thành công: mật khẩu mới đăng nhập được, mật khẩu cũ bị từ chối', async () => {
        const { cookies, email, password } = await createAndLoginUser();

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'NewPassword@2026' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.passwordChanged).toBe(true);
        expect(res.body.data.requiresLogin).toBe(false);

        // Mật khẩu cũ không còn đăng nhập được
        const loginOld = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password });
        expect(loginOld.status).toBe(401);
        expect(loginOld.body.code).toBe('INVALID_CREDENTIALS');

        // Mật khẩu mới đăng nhập thành công
        const loginNew = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password: 'NewPassword@2026' });
        expect(loginNew.status).toBe(200);
        expect(loginNew.body.success).toBe(true);
      });

      it('đổi mật khẩu bảo toàn nguyên vẹn email, role, owned, settings và name', async () => {
        const { cookies, user, password } = await createAndLoginUser();

        // Thiết lập settings cho user trước khi đổi mật khẩu
        await User.findByIdAndUpdate(user._id, {
          $set: {
            'settings.appearance.theme': 'dark',
            'settings.appearance.language': 'en'
          }
        });

        const beforeUser = await User.findById(user._id);

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'BrandNewPassword@789' });

        expect(res.status).toBe(200);

        const afterUser = await User.findById(user._id);
        expect(afterUser.name).toBe(beforeUser.name);
        expect(afterUser.email).toBe(beforeUser.email);
        expect(afterUser.role).toBe(beforeUser.role);
        expect(afterUser.owned).toEqual(beforeUser.owned);
        expect(afterUser.settings.appearance.theme).toBe('dark');
        expect(afterUser.settings.appearance.language).toBe('en');

        // Chỉ passwordHash và authVersion thay đổi
        expect(afterUser.passwordHash).not.toBe(beforeUser.passwordHash);
        expect(afterUser.authVersion).toBe((beforeUser.authVersion || 0) + 1);
      });

      it('User A đổi mật khẩu không ảnh hưởng đến mật khẩu, phiên làm việc hay dữ liệu của User B', async () => {
        const userA = await createAndLoginUser({ email: 'user.a@example.com', password: 'PasswordA@123' });
        const userB = await createAndLoginUser({ email: 'user.b@example.com', password: 'PasswordB@123' });

        // User A đổi mật khẩu
        const resA = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', userA.cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: 'PasswordA@123', newPassword: 'PasswordAMoi@456' });
        expect(resA.status).toBe(200);

        // Phiên của User B vẫn tiếp tục hoạt động bình thường
        const meResB = await request(app)
          .get('/api/auth/me')
          .set('Cookie', userB.cookies);
        expect(meResB.status).toBe(200);
        expect(meResB.body.data.user.email).toBe('user.b@example.com');

        // User B vẫn đăng nhập bình thường bằng mật khẩu cũ của B
        const loginB = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email: 'user.b@example.com', password: 'PasswordB@123' });
        expect(loginB.status).toBe(200);
      });

      it('response thành công tuyệt đối không lộ password, hash, secret, hay cookie trong body', async () => {
        const { cookies, password } = await createAndLoginUser();

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'SuperSecretPassword@1' });

        expect(res.status).toBe(200);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('passwordHash');
        expect(bodyStr).not.toContain('SuperSecretPassword@1');
        expect(bodyStr).not.toContain('MatKhau@123');
        expect(bodyStr).not.toContain('shp_sid');
        expect(res.body.data).toEqual({
          passwordChanged: true,
          requiresLogin: false
        });
      });
    });

    // ------------------------------------------
    // Nhóm 4: Quản lý Phiên & Vô hiệu hóa phiên cũ
    // ------------------------------------------
    describe('Nhóm 4: Quản lý Phiên & Vô hiệu hóa phiên cũ', () => {
      it('phiên 1 đổi mật khẩu nhận session ID mới và tiếp tục gọi API; phiên 2 của cùng user bị từ chối 401', async () => {
        const email = 'multi.session@example.com';
        const password = 'InitialPassword@123';

        // Đăng ký user
        await request(app)
          .post('/api/auth/register')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ fullName: 'Multi Session User', email, password });

        // Tạo phiên 1
        const login1 = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password });
        const cookie1 = login1.headers['set-cookie'];

        // Tạo phiên 2 (trên thiết bị khác)
        const login2 = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password });
        const cookie2 = login2.headers['set-cookie'];

        // Cả 2 phiên ban đầu đều gọi /me thành công
        const me1Before = await request(app).get('/api/auth/me').set('Cookie', cookie1);
        expect(me1Before.status).toBe(200);
        const me2Before = await request(app).get('/api/auth/me').set('Cookie', cookie2);
        expect(me2Before.status).toBe(200);

        // Đổi mật khẩu bằng phiên 1
        const changeRes = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookie1)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'UpdatedPassword@456' });

        expect(changeRes.status).toBe(200);
        // Nhận cookie mới sau regenerate
        const cookie1New = changeRes.headers['set-cookie'];
        expect(cookie1New).toBeDefined();

        // Phiên 1 (với cookie mới) tiếp tục gọi API thành công
        const me1After = await request(app).get('/api/auth/me').set('Cookie', cookie1New);
        expect(me1After.status).toBe(200);
        expect(me1After.body.data.user.email).toBe(email);

        const settings1After = await request(app).get('/api/settings').set('Cookie', cookie1New);
        expect(settings1After.status).toBe(200);

        // Phiên 2 (cookie cũ) lập tức bị từ chối 401 khi gọi /me
        const me2After = await request(app).get('/api/auth/me').set('Cookie', cookie2);
        expect(me2After.status).toBe(401);
        expect(me2After.body.code).toBe('UNAUTHORIZED');

        // Phiên 2 gọi /settings hoặc /profile cũng bị từ chối 401
        const settings2After = await request(app).get('/api/settings').set('Cookie', cookie2);
        expect(settings2After.status).toBe(401);
        expect(settings2After.body.code).toBe('UNAUTHORIZED');

        const profile2After = await request(app)
          .patch('/api/account/profile')
          .set('Cookie', cookie2)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ name: 'Hack Name' });
        expect(profile2After.status).toBe(401);
        expect(profile2After.body.code).toBe('UNAUTHORIZED');
      });

      it('phiên cũ thiếu authVersion (tạo trước khi có cơ chế version) bị từ chối sau khi tài khoản đổi mật khẩu', async () => {
        const { cookies, password } = await createAndLoginUser();

        // Giả lập phiên cũ trong MongoDB sessions collection hoàn toàn thiếu authVersion
        const sidMatch = cookies[0].match(/shp_sid=s%3A([^.]+)\./);
        const rawSid = sidMatch[1];

        // Lấy session doc trong collection 'sessions' và xóa authVersion
        const sessionColl = mongoose.connection.db.collection('sessions');
        const sessionDoc = await sessionColl.findOne({ _id: rawSid });
        if (sessionDoc) {
          const sessObj = JSON.parse(sessionDoc.session);
          delete sessObj.authVersion;
          await sessionColl.updateOne({ _id: rawSid }, { $set: { session: JSON.stringify(sessObj) } });
        }

        // Trước khi đổi mật khẩu (authVersion của user là 0): session thiếu authVersion vẫn qua được (0 === 0)
        const meBefore = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meBefore.status).toBe(200);

        // Đổi mật khẩu -> authVersion của user tăng lên 1
        const newPassword = 'PasswordLegacy@789';
        const changeRes = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword });
        expect(changeRes.status).toBe(200);

        // Dùng lại cookie cũ thiếu authVersion -> Bị từ chối 401 (0 !== 1)
        const meAfter = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meAfter.status).toBe(401);
        expect(meAfter.body.code).toBe('UNAUTHORIZED');
      });

      it('User thực sự thiếu authVersion trong collection thô ($unset) đổi mật khẩu thành công và cập nhật raw authVersion thành 1', async () => {
        const { cookies, user, password } = await createAndLoginUser({ email: 'unset.authver@example.com' });

        // Dùng collection thô $unset authVersion của User
        const userColl = mongoose.connection.db.collection('users');
        await userColl.updateOne({ _id: user._id }, { $unset: { authVersion: '' } });

        // Kiểm tra document thô trong MongoDB thực sự không có trường authVersion
        const rawBefore = await userColl.findOne({ _id: user._id });
        expect(rawBefore.authVersion).toBeUndefined();

        // /api/auth/me vẫn trả 200 (tương thích backward)
        const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meRes.status).toBe(200);

        // Gửi đổi mật khẩu đúng
        const newPassword = 'NewPasswordLegacy@123';
        const changeRes = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword });

        // Phải thành công 200 (KHÔNG ĐƯỢC BỊ 409 AUTH_CONFLICT)
        expect(changeRes.status).toBe(200);
        expect(changeRes.body.success).toBe(true);
        expect(changeRes.body.data.passwordChanged).toBe(true);

        // Kiểm tra database thô: authVersion đã trở thành 1 và passwordHash đã thay đổi
        const rawAfter = await userColl.findOne({ _id: user._id });
        expect(rawAfter.authVersion).toBe(1);
        expect(rawAfter.passwordHash).not.toBe(user.passwordHash);

        // Mật khẩu mới đăng nhập thành công
        const loginNew = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email: 'unset.authver@example.com', password: newPassword });
        expect(loginNew.status).toBe(200);

        // Mật khẩu cũ bị từ chối
        const loginOld = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email: 'unset.authver@example.com', password });
        expect(loginOld.status).toBe(401);

        // Cookie cũ bị từ chối 401 khi gọi API tiếp theo
        const meOldCookie = await request(app).get('/api/auth/me').set('Cookie', cookies);
        expect(meOldCookie.status).toBe(401);
      });

      it('User có authVersion: null trong collection thô đổi mật khẩu thành công và cập nhật raw authVersion thành 1', async () => {
        const { cookies, user, password } = await createAndLoginUser({ email: 'null.authver@example.com' });

        const userColl = mongoose.connection.db.collection('users');
        await userColl.updateOne({ _id: user._id }, { $set: { authVersion: null } });

        const rawBefore = await userColl.findOne({ _id: user._id });
        expect(rawBefore.authVersion).toBeNull();

        const changeRes = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'NewPasswordNull@123' });

        expect(changeRes.status).toBe(200);
        expect(changeRes.body.success).toBe(true);

        const rawAfter = await userColl.findOne({ _id: user._id });
        expect(rawAfter.authVersion).toBe(1);
      });

      it('User có authVersion: 0 trong collection thô đổi mật khẩu thành công và cập nhật raw authVersion thành 1', async () => {
        const { cookies, user, password } = await createAndLoginUser({ email: 'zero.authver@example.com' });

        const userColl = mongoose.connection.db.collection('users');
        await userColl.updateOne({ _id: user._id }, { $set: { authVersion: 0 } });

        const rawBefore = await userColl.findOne({ _id: user._id });
        expect(rawBefore.authVersion).toBe(0);

        const changeRes = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'NewPasswordZero@123' });

        expect(changeRes.status).toBe(200);
        expect(changeRes.body.success).toBe(true);

        const rawAfter = await userColl.findOne({ _id: user._id });
        expect(rawAfter.authVersion).toBe(1);
      });

      it('User có authVersion lớn hơn 0 (ví dụ: version 3) đổi mật khẩu thành công và tăng lên 4', async () => {
        const { cookies, user, password } = await createAndLoginUser({ email: 'v3.authver@example.com' });

        // Cập nhật authVersion thành 3 trên cả DB và session
        const userColl = mongoose.connection.db.collection('users');
        await userColl.updateOne({ _id: user._id }, { $set: { authVersion: 3 } });

        const userSessionColl = mongoose.connection.db.collection('user_sessions');
        await userSessionColl.updateMany({ userId: user._id }, { $set: { authVersion: 3 } });

        const sidMatch = cookies[0].match(/shp_sid=s%3A([^.]+)\./);
        const rawSid = sidMatch[1];
        const sessionColl = mongoose.connection.db.collection('sessions');
        const sessionDoc = await sessionColl.findOne({ _id: rawSid });
        if (sessionDoc) {
          const sessObj = JSON.parse(sessionDoc.session);
          sessObj.authVersion = 3;
          await sessionColl.updateOne({ _id: rawSid }, { $set: { session: JSON.stringify(sessObj) } });
        }

        const changeRes = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'NewPasswordV4@123' });

        expect(changeRes.status).toBe(200);
        expect(changeRes.body.success).toBe(true);

        const rawAfter = await userColl.findOne({ _id: user._id });
        expect(rawAfter.authVersion).toBe(4);
      });
    });

    // ------------------------------------------
    // Nhóm 5: Xử lý Đồng thời và Lỗi giữa chừng
    // ------------------------------------------
    describe('Nhóm 5: Xử lý Đồng thời và Lỗi giữa chừng', () => {
      it('hai request đổi mật khẩu cạnh tranh cùng dùng mật khẩu cũ: request thứ 2 bị từ chối 409 AUTH_CONFLICT', async () => {
        const { cookies, password } = await createAndLoginUser();

        // Bắt đầu 2 request đổi mật khẩu đồng thời
        const [res1, res2] = await Promise.all([
          request(app)
            .post('/api/account/change-password')
            .set('Cookie', cookies)
            .set('Origin', TEST_ORIGIN)
            .set('Content-Type', 'application/json')
            .send({ currentPassword: password, newPassword: 'NewPasswordFirst@1' }),
          request(app)
            .post('/api/account/change-password')
            .set('Cookie', cookies)
            .set('Origin', TEST_ORIGIN)
            .set('Content-Type', 'application/json')
            .send({ currentPassword: password, newPassword: 'NewPasswordSecond@2' })
        ]);

        // Một request thành công (200), một request bị xung đột (409)
        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([200, 409]);

        const conflictRes = res1.status === 409 ? res1 : res2;
        expect(conflictRes.body.code).toBe('AUTH_CONFLICT');
      });

      it('hai request đổi mật khẩu cạnh tranh trên tài khoản legacy thiếu authVersion: request thứ 2 bị từ chối 409 AUTH_CONFLICT', async () => {
        const { cookies, user, password } = await createAndLoginUser({ email: 'legacy.race@example.com' });

        // $unset authVersion trên collection thô
        const userColl = mongoose.connection.db.collection('users');
        await userColl.updateOne({ _id: user._id }, { $unset: { authVersion: '' } });

        const [res1, res2] = await Promise.all([
          request(app)
            .post('/api/account/change-password')
            .set('Cookie', cookies)
            .set('Origin', TEST_ORIGIN)
            .set('Content-Type', 'application/json')
            .send({ currentPassword: password, newPassword: 'LegacyPasswordFirst@1' }),
          request(app)
            .post('/api/account/change-password')
            .set('Cookie', cookies)
            .set('Origin', TEST_ORIGIN)
            .set('Content-Type', 'application/json')
            .send({ currentPassword: password, newPassword: 'LegacyPasswordSecond@2' })
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([200, 409]);

        const conflictRes = res1.status === 409 ? res1 : res2;
        expect(conflictRes.body.code).toBe('AUTH_CONFLICT');
      });

      it('database cập nhật thất bại: trả lỗi 500 và không báo đổi thành công', async () => {
        const { cookies, password } = await createAndLoginUser();

        const updateSpy = vi.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Mô phỏng lỗi DB Update'));

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'NewPasswordFail@1' });

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        updateSpy.mockRestore();
      });

      it('sau khi DB đã đổi mật khẩu nhưng session store regenerate lỗi: trả 200 kèm passwordChanged: true, requiresLogin: true', async () => {
        const { cookies, user, password, email } = await createAndLoginUser();

        // Mock store.regenerate lỗi
        const store = app.locals.sessionStore;
        const regenSpy = vi.spyOn(store, 'regenerate').mockImplementation((_req, cb) => {
          cb(new Error('Mô phỏng lỗi Regenerate Session Store'));
        });

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'BrandNewPass@999' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.code).toBe('PASSWORD_CHANGED_RELOGIN_REQUIRED');
        expect(res.body.data.passwordChanged).toBe(true);
        expect(res.body.data.requiresLogin).toBe(true);

        // Mật khẩu trong database ĐÃ đổi sang mật khẩu mới
        const dbUser = await User.findById(user._id);
        const isNewMatch = await bcrypt.compare('BrandNewPass@999', dbUser.passwordHash);
        expect(isNewMatch).toBe(true);

        regenSpy.mockRestore();

        // Người dùng đăng nhập lại bằng mật khẩu mới thành công
        const reLogin = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password: 'BrandNewPass@999' });
        expect(reLogin.status).toBe(200);
      });

      it('sau khi DB đã đổi mật khẩu nhưng session store save lỗi: trả 200 kèm passwordChanged: true, requiresLogin: true', async () => {
        const { cookies, user, password, email } = await createAndLoginUser();

        // Mock session store.set ném lỗi
        const store = app.locals.sessionStore;
        const setSpy = vi.spyOn(store, 'set').mockImplementation((_sid, _sess, cb) => {
          cb(new Error('Mô phỏng lỗi lưu store'));
        });

        const res = await request(app)
          .post('/api/account/change-password')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ currentPassword: password, newPassword: 'BrandNewPass2@999' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.code).toBe('PASSWORD_CHANGED_RELOGIN_REQUIRED');
        expect(res.body.data.passwordChanged).toBe(true);
        expect(res.body.data.requiresLogin).toBe(true);

        setSpy.mockRestore();

        // Đăng nhập lại bằng mật khẩu mới thành công
        const reLogin = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email, password: 'BrandNewPass2@999' });
        expect(reLogin.status).toBe(200);
      });
    });
  });
});
