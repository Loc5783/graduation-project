import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { APPEARANCE_DEFAULTS } from '../src/constants/settingsDefaults.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/settings';

describe('Backend Settings API & MongoDB Integration Tests', () => {
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
    const email = customData.email || 'user.settings@example.com';
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
  // NHÓM A: XÁC THỰC VÀ MIDDLEWARE BẢO MẬT
  // ==========================================
  describe('Nhóm A: Xác thực và Middleware bảo vệ', () => {
    it('GET /api/settings từ chối 401 khi chưa đăng nhập (không có cookie)', async () => {
      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('PATCH /api/settings/appearance từ chối 401 khi chưa đăng nhập', async () => {
      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/settings không yêu cầu Content-Type vẫn hoạt động thành công khi đã đăng nhập', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);
      // Không gửi header Content-Type

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appearance).toBeDefined();
      expect(res.body.data.appearance.theme).toBe(APPEARANCE_DEFAULTS.theme);
    });

    it('PATCH /api/settings/appearance từ chối 415 khi thiếu tiêu đề Content-Type', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .send('theme=light'); // Không set Content-Type

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('PATCH /api/settings/appearance từ chối 415 khi Content-Type là text/plain', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('{"theme":"light"}');

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('PATCH /api/settings/appearance từ chối 403 khi Origin không thuộc allowlist', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', 'http://malicious-attacker.com')
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/settings/appearance từ chối 403 khi Origin là "null"', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', 'null')
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/settings/appearance từ chối 403 khi thiếu cả Origin và Referer', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('PATCH /api/settings/appearance chấp nhận khi thiếu Origin nhưng có Referer hợp lệ', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appearance.theme).toBe('light');
    });

    it('PATCH /api/settings/appearance từ chối 400 INVALID_JSON khi cú pháp JSON bị hỏng', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"theme": "light", broken json}');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_JSON');
    });
  });

  // ==========================================
  // NHÓM B: DỮ LIỆU CŨ (LEGACY DATA) VÀ FALLBACK
  // ==========================================
  describe('Nhóm B: Dữ liệu cũ và Fallback an toàn', () => {
    it('User hoàn toàn thiếu trường settings trong MongoDB: GET trả đủ 8 trường default nhưng KHÔNG ghi vào DB', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Sử dụng collection thô để $unset hoàn toàn trường settings
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $unset: { settings: '' } }
      );

      // Xác minh DB thực sự không có trường settings
      const rawBefore = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawBefore.settings).toBeUndefined();

      // Gọi GET /api/settings
      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const appData = res.body.data.appearance;

      // Đảm bảo trả đủ 8 trường
      expect(Object.keys(appData).sort()).toEqual([
        'dateFormat',
        'fontSize',
        'highContrast',
        'hourFormat',
        'language',
        'reducedMotion',
        'theme',
        'timeZone'
      ]);
      expect(appData.theme).toBe('dark');
      expect(appData.language).toBe('vi');
      expect(appData.fontSize).toBe('medium');
      expect(appData.highContrast).toBe(false);
      expect(appData.reducedMotion).toBe(false);
      expect(appData.timeZone).toBe('Asia/Ho_Chi_Minh');
      expect(appData.dateFormat).toBe('DD/MM/YYYY');
      expect(appData.hourFormat).toBe('24h');

      // QUAN TRỌNG: Kiểm tra database thô sau GET, settings vẫn là undefined
      const rawAfter = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawAfter.settings).toBeUndefined();
    });

    it('User có appearance một phần: GET trả trường đã lưu kèm default cho các trường thiếu', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu cũ chỉ lưu theme = light và fontSize = large
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': {
              theme: 'light',
              fontSize: 'large'
            }
          }
        }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.appearance.theme).toBe('light');
      expect(res.body.data.appearance.fontSize).toBe('large');
      // Các trường còn lại phải có giá trị mặc định chuẩn
      expect(res.body.data.appearance.language).toBe('vi');
      expect(res.body.data.appearance.highContrast).toBe(false);
      expect(res.body.data.appearance.reducedMotion).toBe(false);
      expect(res.body.data.appearance.timeZone).toBe('Asia/Ho_Chi_Minh');
      expect(res.body.data.appearance.dateFormat).toBe('DD/MM/YYYY');
      expect(res.body.data.appearance.hourFormat).toBe('24h');
    });

    it('false hợp lệ không bị ghi đè thành default do kiểm tra truthy', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Lưu rõ ràng false cho highContrast và reducedMotion
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': {
              highContrast: false,
              reducedMotion: false
            }
          }
        }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.appearance.highContrast).toBe(false);
      expect(res.body.data.appearance.reducedMotion).toBe(false);
    });

    it('dữ liệu cũ bị null, sai kiểu hoặc enum lạ: chuẩn hóa an toàn sang default, không crash server', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu cũ bị hỏng trong DB
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': {
              theme: 'cyberpunk-neon', // enum lạ
              highContrast: 'invalid-string', // sai kiểu
              reducedMotion: 123, // sai kiểu
              timeZone: 'Mars/Phobos', // múi giờ không tồn tại
              fontSize: null,
              dateFormat: 9999
            }
          }
        }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Đã được chuẩn hóa về default sạch
      expect(res.body.data.appearance.theme).toBe(APPEARANCE_DEFAULTS.theme);
      expect(res.body.data.appearance.highContrast).toBe(false);
      expect(res.body.data.appearance.reducedMotion).toBe(false);
      expect(res.body.data.appearance.timeZone).toBe(APPEARANCE_DEFAULTS.timeZone);
      expect(res.body.data.appearance.fontSize).toBe(APPEARANCE_DEFAULTS.fontSize);
      expect(res.body.data.appearance.dateFormat).toBe(APPEARANCE_DEFAULTS.dateFormat);
    });

    it('GET dữ liệu cũ có offset timeZone (+07:00) trả default Asia/Ho_Chi_Minh và không thay đổi database', async () => {
      const { cookies, user } = await createAndLoginUser();

      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            'settings.appearance': {
              timeZone: '+07:00'
            }
          }
        }
      );

      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.appearance.timeZone).toBe('Asia/Ho_Chi_Minh');

      // Database thô vẫn giữ nguyên, GET không tự ý sửa database
      const rawUser = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawUser.settings.appearance.timeZone).toBe('+07:00');
    });
  });

  // ==========================================
  // NHÓM C: VALIDATION NGHIÊM NGẶT
  // ==========================================
  describe('Nhóm C: Kiểm tra dữ liệu đầu vào (Validation)', () => {
    it('từ chối 400 VALIDATION_ERROR khi body không phải là object (null, array, string, number)', async () => {
      const { cookies } = await createAndLoginUser();

      // 1. Body null
      const resNull = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('null');
      expect(resNull.status).toBe(400);
      expect(resNull.body.code).toBe('VALIDATION_ERROR');

      // 2. Body array
      const resArr = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send([1, 2, 3]);
      expect(resArr.status).toBe(400);
      expect(resArr.body.code).toBe('VALIDATION_ERROR');

      // 3. Body string
      const resStr = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('"just a string"');
      expect(resStr.status).toBe(400);
      expect(resStr.body.code).toBe('VALIDATION_ERROR');

      // 4. Body number
      const resNum = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('12345');
      expect(resNum.status).toBe(400);
      expect(resNum.body.code).toBe('VALIDATION_ERROR');
    });

    it('từ chối 400 EMPTY_UPDATE_BODY khi body rỗng ({})', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMPTY_UPDATE_BODY');
    });

    it('từ chối 400 INVALID_ENUM_VALUE khi enum sai giá trị', async () => {
      const { cookies } = await createAndLoginUser();

      const testCases = [
        { payload: { theme: 'neon' }, field: 'theme' },
        { payload: { language: 'fr' }, field: 'language' },
        { payload: { fontSize: 'extra-large' }, field: 'fontSize' },
        { payload: { dateFormat: 'YYYY/MM/DD' }, field: 'dateFormat' },
        { payload: { hourFormat: '48h' }, field: 'hourFormat' }
      ];

      for (const tc of testCases) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send(tc.payload);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_ENUM_VALUE');
        expect(res.body.errors[tc.field]).toBeDefined();
      }
    });

    it('từ chối 400 INVALID_FIELD_TYPE khi boolean sai kiểu ("false", 0, 1, null)', async () => {
      const { cookies } = await createAndLoginUser();

      const invalidBooleans = ['false', 'true', 0, 1, null];

      for (const val of invalidBooleans) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ highContrast: val });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELD_TYPE');
        expect(res.body.errors.highContrast).toBeDefined();
      }

      for (const val of invalidBooleans) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ reducedMotion: val });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELD_TYPE');
        expect(res.body.errors.reducedMotion).toBeDefined();
      }
    });

    it('từ chối 400 INVALID_FIELD_TYPE khi chuỗi sai kiểu dữ liệu', async () => {
      const { cookies } = await createAndLoginUser();

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FIELD_TYPE');
      expect(res.body.errors.theme).toBeDefined();
    });

    it('từ chối 400 INVALID_TIMEZONE khi múi giờ là offset (+07:00, -05:00, +00:00)', async () => {
      const { cookies } = await createAndLoginUser();

      const offsetCases = ['+07:00', '-05:00', '+00:00', '+0700', '-08:00'];

      for (const tz of offsetCases) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ timeZone: tz });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_TIMEZONE');
        expect(res.body.errors.timeZone).toBeDefined();
      }
    });

    it('từ chối 400 INVALID_TIMEZONE khi múi giờ sai tên, chuỗi rỗng hoặc vượt quá 50 ký tự', async () => {
      const { cookies } = await createAndLoginUser();

      const invalidTimezones = ['Mars/Curiosity', '', '   ', 'Asia/' + 'A'.repeat(50)];

      for (const tz of invalidTimezones) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ timeZone: tz });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_TIMEZONE');
        expect(res.body.errors.timeZone).toBeDefined();
      }
    });

    it('chấp nhận và lưu thành công các tên múi giờ IANA hợp lệ (Asia/Ho_Chi_Minh, America/New_York, UTC)', async () => {
      const { cookies } = await createAndLoginUser();

      const validZones = ['Asia/Ho_Chi_Minh', 'America/New_York', 'UTC'];

      for (const tz of validZones) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ timeZone: tz });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.appearance.timeZone).toBe(tz);
      }
    });

    it('từ chối 400 UNKNOWN_FIELD_REJECTED khi gửi trường lạ hoặc trường đặc quyền (role, owned, email, userId, _id)', async () => {
      const { cookies } = await createAndLoginUser();

      const forbiddenFields = [
        { role: 'admin' },
        { owned: ['hub-01'] },
        { email: 'hacker@example.com' },
        { passwordHash: 'stolen_hash' },
        { userId: '65f1234567890abcdef12345' },
        { _id: '65f1234567890abcdef12345' },
        { unknownCustomKey: 'hacked' }
      ];

      for (const payload of forbiddenFields) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
      }
    });

    it('từ chối 400 UNKNOWN_FIELD_REJECTED khi key chứa dấu "." hoặc "$"', async () => {
      const { cookies } = await createAndLoginUser();

      const maliciousKeys = [
        { 'settings.theme': 'light' },
        { '$set': { theme: 'light' } },
        { '$where': '1 == 1' }
      ];

      for (const payload of maliciousKeys) {
        const res = await request(app)
          .patch('/api/settings/appearance')
          .set('Cookie', cookies)
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');
      }
    });

    it('tính nguyên tử: request trộn trường đúng và sai bị từ chối toàn bộ và KHÔNG thay đổi DB', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Ban đầu theme = dark (mặc định)
      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          theme: 'light', // Hợp lệ
          role: 'admin' // Không được phép
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNKNOWN_FIELD_REJECTED');

      // Kiểm tra database: theme KHÔNG được thay đổi thành light
      const dbUser = await User.findById(user._id);
      expect(dbUser.role).toBe('viewer');
      expect(dbUser.settings?.appearance?.theme || 'dark').toBe('dark');
    });
  });

  // ==========================================
  // NHÓM D: CÁCH LY, CẬP NHẬT NGUYÊN TỬ VÀ BẢO MẬT
  // ==========================================
  describe('Nhóm D: Cách ly người dùng và Cập nhật nguyên tử', () => {
    it('User A cập nhật settings không ảnh hưởng hoặc thay đổi settings của User B', async () => {
      const userA = await createAndLoginUser({ email: 'user.a@example.com', name: 'User A' });
      const userB = await createAndLoginUser({ email: 'user.b@example.com', name: 'User B' });

      // User A đổi theme = light
      const resA = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', userA.cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });
      expect(resA.status).toBe(200);
      expect(resA.body.data.appearance.theme).toBe('light');

      // User B kiểm tra settings của mình: vẫn là dark
      const resB = await request(app)
        .get('/api/settings')
        .set('Cookie', userB.cookies);
      expect(resB.status).toBe(200);
      expect(resB.body.data.appearance.theme).toBe('dark');
    });

    it('PATCH một trường đơn lẻ giữ nguyên toàn bộ các trường khác', async () => {
      const { cookies } = await createAndLoginUser();

      // 1. Cập nhật highContrast = true
      await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ highContrast: true });

      // 2. Cập nhật fontSize = large (chỉ gửi duy nhất fontSize)
      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ fontSize: 'large' });

      expect(res.status).toBe(200);
      expect(res.body.data.appearance.fontSize).toBe('large');
      expect(res.body.data.appearance.highContrast).toBe(true); // Vẫn được giữ nguyên
      expect(res.body.data.appearance.theme).toBe('dark'); // Vẫn là default
    });

    it('hai PATCH đồng thời vào hai trường khác nhau: MongoDB $set giữ được cả hai thay đổi', async () => {
      const { cookies, user } = await createAndLoginUser();

      const patchTheme = request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      const patchLanguage = request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ language: 'en' });

      const [resTheme, resLang] = await Promise.all([patchTheme, patchLanguage]);
      expect(resTheme.status).toBe(200);
      expect(resLang.status).toBe(200);

      // GET đối soát dữ liệu cuối cùng từ DB
      const resGet = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(resGet.status).toBe(200);
      expect(resGet.body.data.appearance.theme).toBe('light');
      expect(resGet.body.data.appearance.language).toBe('en');
    });

    it('PATCH thành công khi cấu trúc settings = null trong MongoDB', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu thô: settings = null
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $set: { settings: null } }
      );

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appearance.theme).toBe('light');

      // Kiểm tra trong DB
      const rawUser = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawUser.settings).not.toBeNull();
      expect(rawUser.settings.appearance.theme).toBe('light');
    });

    it('PATCH thành công khi cấu trúc settings.appearance = null trong MongoDB', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu thô: settings = { appearance: null }
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $set: { settings: { appearance: null } } }
      );

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appearance.theme).toBe('light');

      const rawUser = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawUser.settings.appearance).not.toBeNull();
      expect(rawUser.settings.appearance.theme).toBe('light');
    });

    it('PATCH thành công khi settings thiếu hoàn toàn trong MongoDB', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập dữ liệu thô: không có field settings
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $unset: { settings: '' } }
      );

      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light', fontSize: 'small' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appearance.theme).toBe('light');
      expect(res.body.data.appearance.fontSize).toBe('small');
    });

    it('PATCH giữ nguyên các nhóm settings khác và các trường appearance cũ hợp lệ', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Giả lập user có nhóm settings.privacy và appearance chỉ có một phần
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            settings: {
              appearance: {
                fontSize: 'large',
                highContrast: true
              },
              privacy: {
                dataCollection: false,
                auditLog: true
              }
            }
          }
        }
      );

      // PATCH chỉ cập nhật trường theme
      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(200);
      expect(res.body.data.appearance.theme).toBe('light');
      expect(res.body.data.appearance.fontSize).toBe('large');
      expect(res.body.data.appearance.highContrast).toBe(true);

      // Kiểm tra DB thô: nhóm privacy và các trường appearance cũ hoàn toàn nguyên vẹn
      const rawUser = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawUser.settings.privacy).toEqual({
        dataCollection: false,
        auditLog: true
      });
      expect(rawUser.settings.appearance.fontSize).toBe('large');
      expect(rawUser.settings.appearance.highContrast).toBe(true);
      expect(rawUser.settings.appearance.theme).toBe('light');
    });

    it('hai PATCH đồng thời sửa hai trường khác nhau khi cấu trúc ban đầu là null: cả hai thay đổi được lưu', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Khởi đầu settings = null
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $set: { settings: null } }
      );

      const patchTheme = request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      const patchLanguage = request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ language: 'en' });

      const [resTheme, resLang] = await Promise.all([patchTheme, patchLanguage]);
      expect(resTheme.status).toBe(200);
      expect(resLang.status).toBe(200);

      // GET đối soát dữ liệu cuối cùng từ DB
      const resGet = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);

      expect(resGet.status).toBe(200);
      expect(resGet.body.data.appearance.theme).toBe('light');
      expect(resGet.body.data.appearance.language).toBe('en');

      const rawUser = await mongoose.connection.db.collection('users').findOne({ _id: user._id });
      expect(rawUser.settings.appearance.theme).toBe('light');
      expect(rawUser.settings.appearance.language).toBe('en');
    });

    it('trả về 401 UNAUTHORIZED khi user trong session không còn tồn tại trong DB', async () => {
      const { cookies, user } = await createAndLoginUser();

      // Xóa người dùng khỏi database
      await User.findByIdAndDelete(user._id);

      // Gọi PATCH
      const res = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('response của GET và PATCH tuyệt đối không để lộ passwordHash hoặc trường nhạy cảm', async () => {
      const { cookies } = await createAndLoginUser();

      const resGet = await request(app)
        .get('/api/settings')
        .set('Cookie', cookies);
      const strGet = JSON.stringify(resGet.body);
      expect(strGet).not.toContain('passwordHash');
      expect(strGet).not.toContain('shp_sid');

      const resPatch = await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'system' });
      const strPatch = JSON.stringify(resPatch.body);
      expect(strPatch).not.toContain('passwordHash');
      expect(strPatch).not.toContain('shp_sid');
    });

    it('PATCH không thể làm thay đổi role, owned, email hay passwordHash của tài khoản', async () => {
      const { cookies, user, password } = await createAndLoginUser();

      // Cập nhật hợp lệ
      await request(app)
        .patch('/api/settings/appearance')
        .set('Cookie', cookies)
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ theme: 'light', highContrast: true });

      const refreshedUser = await User.findById(user._id);
      expect(refreshedUser.role).toBe('viewer');
      expect(refreshedUser.owned).toEqual([]);
      expect(refreshedUser.email).toBe(user.email);
      expect(refreshedUser.passwordHash).toBe(user.passwordHash);
    });
  });
});
