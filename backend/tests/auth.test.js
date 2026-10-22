import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { createAuthRateLimiter } from '../src/middleware/rateLimiter.js';

// Tăng trần rate limiter trong môi trường test để đủ hạn mức cho toàn bộ test suite
process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';
const TEST_REFERER = 'http://localhost:5173/register';

describe('Backend Authentication & MongoDB Integration Tests', () => {
  let app;

  // 1. Khởi tạo và kiểm tra an toàn database trước toàn bộ test suite
  beforeAll(async () => {
    // Kết nối tới database kiểm thử riêng biệt
    await connectDB(TEST_DB_URI);

    // BẢO VỆ NGHIÊM NGẶT: Phải đúng tên smart_home_privacy_test
    if (mongoose.connection.name !== 'smart_home_privacy_test') {
      throw new Error(
        `[CRITICAL SAFETY CHECK] Tên database là "${mongoose.connection.name}", KHÔNG PHẢI "smart_home_privacy_test". Dừng test ngay để bảo vệ dữ liệu!`
      );
    }

    // Khởi tạo app với secret kiểm thử (createApp sẽ tự động đợi User.init() và sessionStore)
    app = await createApp({
      sessionSecret: 'test-secret-test-only-session-secret-not-for-deployment-2026-auth-suite'
    });
  });

  // 2. Ngắt kết nối an toàn sau khi chạy xong toàn bộ test
  afterAll(async () => {
    await disconnectDB();
  });

  // 3. Dọn dẹp dữ liệu trong database test trước mỗi ca kiểm thử
  beforeEach(async () => {
    if (mongoose.connection.name !== 'smart_home_privacy_test') {
      throw new Error('[CRITICAL SAFETY CHECK] Không được phép xóa dữ liệu ngoài database smart_home_privacy_test.');
    }

    // Chỉ dọn các collection thuộc phạm vi bài test trong smart_home_privacy_test
    await User.deleteMany({});
    const collections = await mongoose.connection.db.listCollections({ name: 'sessions' }).toArray();
    if (collections.length > 0) {
      await mongoose.connection.db.collection('sessions').deleteMany({});
    }
  });

  // 4. Khôi phục toàn bộ spy/mock sau từng test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // NHÓM 1: ĐĂNG KÝ TÀI KHOẢN (POST /api/auth/register)
  // ==========================================
  describe('POST /api/auth/register', () => {
    it('đăng ký thành công với thông tin hợp lệ, trả về 201 và không chứa passwordHash', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Nguyễn Văn A',
          email: 'user.a@example.com',
          password: 'MatKhau@123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Đăng ký tài khoản thành công');
      expect(res.body.data.user.name).toBe('Nguyễn Văn A');
      expect(res.body.data.user.email).toBe('user.a@example.com');
      expect(res.body.data.user.role).toBe('viewer');
      expect(res.body.data.user.owned).toEqual([]);

      // Tuyệt đối không để lộ mật khẩu băm ra JSON response
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      // Đăng ký không tự động tạo phiên đăng nhập (không có cookie shp_sid)
      expect(res.headers['set-cookie']).toBeUndefined();

      // Kiểm tra trong database
      const dbUser = await User.findOne({ email: 'user.a@example.com' });
      expect(dbUser).not.toBeNull();
      expect(dbUser.passwordHash).toBeDefined();
      expect(dbUser.passwordHash).not.toBe('MatKhau@123'); // Đã được băm
    });

    it('ngăn chặn nâng quyền: client gửi role admin và owned bị ép về viewer và []', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Kẻ Tấn Công',
          email: 'hacker@example.com',
          password: 'Password@123',
          role: 'admin',
          owned: ['smart-door-lock', 'smart-speaker']
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('viewer');
      expect(res.body.data.user.owned).toEqual([]);

      // Xác minh trong DB thực tế cũng là viewer và []
      const dbUser = await User.findOne({ email: 'hacker@example.com' });
      expect(dbUser.role).toBe('viewer');
      expect(dbUser.owned).toEqual([]);
    });

    it('hỗ trợ mật khẩu Unicode (tiếng Việt có dấu)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Lê Thị Bình',
          email: 'binh@example.com',
          password: 'MậtKhẩuTiếngViệt#2026'
        });

      expect(res.status).toBe(201);

      // Đăng nhập lại bằng mật khẩu Unicode này phải thành công
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'binh@example.com',
          password: 'MậtKhẩuTiếngViệt#2026'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });

    it('từ chối mật khẩu vượt quá 72 byte UTF-8 với mã lỗi 400', async () => {
      const longPassword = 'A'.repeat(73);

      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Trần Văn C',
          email: 'longpass@example.com',
          password: longPassword
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.password).toContain('72 byte');
    });

    it('từ chối mật khẩu ngắn hơn 8 ký tự với mã lỗi 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Trần Văn D',
          email: 'shortpass@example.com',
          password: '1234567'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.password).toContain('tối thiểu 8 ký tự');
    });

    it('từ chối email sai định dạng hoặc thiếu trường bắt buộc', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'E',
          email: 'not-an-email',
          password: 'ValidPassword123'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.email).toBeDefined();
      expect(res.body.errors.fullName).toBeDefined();
    });

    it('xử lý trùng email tuần tự: trả về 409 DUPLICATE_KEY', async () => {
      await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Người thứ nhất',
          email: 'duplicate@example.com',
          password: 'Password@123'
        });

      const secondRes = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Người thứ hai',
          email: 'duplicate@example.com',
          password: 'DifferentPassword@456'
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.code).toBe('DUPLICATE_KEY');
      expect(secondRes.body.message).toContain('email');
    });

    it('xử lý hai yêu cầu đăng ký đồng thời cùng email: một thành công 201, một 409', async () => {
      const payload = {
        fullName: 'Đồng Thời',
        email: 'concurrent@example.com',
        password: 'Password@123'
      };

      const [res1, res2] = await Promise.all([
        request(app).post('/api/auth/register').set('Origin', TEST_ORIGIN).set('Content-Type', 'application/json').send(payload),
        request(app).post('/api/auth/register').set('Origin', TEST_ORIGIN).set('Content-Type', 'application/json').send(payload)
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });
  });

  // ==========================================
  // NHÓM 2: CHỐNG CSRF VÀ KIỂM TRA NGUỒN GỬI (ORIGIN / REFERER)
  // ==========================================
  describe('Origin and CSRF Protection', () => {
    it('chấp nhận request khi có Referer hợp lệ nếu thiếu Origin', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Referer', TEST_REFERER)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Referer User',
          email: 'referer@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(201);
    });

    it('từ chối 403 khi Origin không thuộc allowlist', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://attacker-site.com')
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Attacker',
          email: 'attacker@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('từ chối 403 khi Origin là "null"', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'null')
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Null Origin',
          email: 'nullorigin@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('từ chối 403 khi thiếu cả Origin và Referer đối với phương thức POST', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'No Origin',
          email: 'noorigin@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('từ chối 403 khi Referer giả dạng tiền tố domain hợp lệ nhưng origin khác', async () => {
      // Giả mạo sub-domain hoặc domain chứa prefix
      const evilReferers = [
        'http://localhost:5173.attacker.com/steal',
        'http://localhost:5173-phishing.com/login',
        'http://localhost:5173:8080/fake'
      ];

      for (const referer of evilReferers) {
        const res = await request(app)
          .post('/api/auth/register')
          .set('Referer', referer)
          .set('Content-Type', 'application/json')
          .send({
            fullName: 'Evil Referer',
            email: 'evil.ref@example.com',
            password: 'Password@123'
          });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
      }
    });
  });

  // ==========================================
  // NHÓM 3: BẮT BUỘC JSON (CONTENT-TYPE VALIDATION)
  // ==========================================
  describe('Content-Type Validation (Bắt buộc JSON)', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'JSON Tester',
          email: 'jsontester@example.com',
          password: 'Password@123'
        });
    });

    it('POST /register từ chối 415 khi gửi text/plain hoặc form-urlencoded', async () => {
      // 1. text/plain
      const textRes = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('plain text body');

      expect(textRes.status).toBe(415);
      expect(textRes.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

      // 2. form-urlencoded
      const formRes = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('fullName=Name&email=a@b.com&password=Pass1234');

      expect(formRes.status).toBe(415);
      expect(formRes.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

      // 3. Thiếu Content-Type
      const noCtRes = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN);

      expect(noCtRes.status).toBe(415);
      expect(noCtRes.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('POST /login từ chối 415 khi gửi Content-Type không phải JSON', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('email=jsontester@example.com&password=Password@123');

      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('POST /logout từ chối 415 khi gửi Content-Type không phải JSON', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('logout');

      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('chấp nhận Content-Type application/json có charset', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json; charset=utf-8')
        .send({
          email: 'jsontester@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // NHÓM 4: ĐĂNG NHẬP, QUẢN LÝ PHIÊN VÀ KIỂM TRA KIỂU REMEMBER
  // ==========================================
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Đăng ký trước một tài khoản hợp lệ
      await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Chủ Nhà',
          email: 'owner@example.com',
          password: 'StrongPassword@123'
        });
    });

    it('đăng nhập thành công, trả về 200, tạo cookie shp_sid và lưu session trong MongoDB', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'owner@example.com',
          password: 'StrongPassword@123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('owner@example.com');

      // Kiểm tra cookie shp_sid được thiết lập
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = setCookie[0];
      expect(cookieStr).toContain('shp_sid=');
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Lax');
      expect(cookieStr).toContain('Path=/');

      // Kiểm tra phiên đăng nhập đã được ghi vào MongoDB collection "sessions"
      const sessionCount = await mongoose.connection.db.collection('sessions').countDocuments();
      expect(sessionCount).toBe(1);
    });

    it('thiết lập thời hạn cookie và expires trong MongoDB 14 ngày khi remember: true', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'owner@example.com',
          password: 'StrongPassword@123',
          remember: true
        });

      expect(res.status).toBe(200);

      // Kiểm tra cookie header
      const cookieStr = res.headers['set-cookie'][0];
      const expiresMatch = cookieStr.match(/Expires=([^;]+)/i);
      expect(expiresMatch).not.toBeNull();
      const cookieExpiresDate = new Date(expiresMatch[1]);
      const cookieDiffDays = (cookieExpiresDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(cookieDiffDays)).toBe(14);

      // Kiểm tra trực tiếp trường expires của bản ghi session trong MongoDB
      const sessionDoc = await mongoose.connection.db.collection('sessions').findOne({});
      expect(sessionDoc).not.toBeNull();
      expect(sessionDoc.expires).toBeInstanceOf(Date);
      const dbDiffDays = (sessionDoc.expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(dbDiffDays)).toBe(14);
    });

    it('thiết lập thời hạn cookie và expires trong MongoDB 1 ngày khi remember: false', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'owner@example.com',
          password: 'StrongPassword@123',
          remember: false
        });

      expect(res.status).toBe(200);

      // Kiểm tra cookie header
      const cookieStr = res.headers['set-cookie'][0];
      const expiresMatch = cookieStr.match(/Expires=([^;]+)/i);
      expect(expiresMatch).not.toBeNull();
      const cookieExpiresDate = new Date(expiresMatch[1]);
      const cookieDiffDays = (cookieExpiresDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(cookieDiffDays)).toBe(1);

      // Kiểm tra trực tiếp trường expires trong MongoDB
      const sessionDoc = await mongoose.connection.db.collection('sessions').findOne({});
      expect(sessionDoc).not.toBeNull();
      expect(sessionDoc.expires).toBeInstanceOf(Date);
      const dbDiffDays = (sessionDoc.expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(dbDiffDays)).toBe(1);
    });

    it('thiếu trường remember: mặc định 1 ngày (false)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'owner@example.com',
          password: 'StrongPassword@123'
          // remember bị bỏ qua
        });

      expect(res.status).toBe(200);

      const sessionDoc = await mongoose.connection.db.collection('sessions').findOne({});
      expect(sessionDoc).not.toBeNull();
      const dbDiffDays = (sessionDoc.expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(dbDiffDays)).toBe(1);
    });

    it('từ chối mã 400 VALIDATION_ERROR khi remember sai kiểu: chuỗi "false", object, array', async () => {
      const invalidRemembers = ['false', 'true', {}, [], 1, 0];

      for (const val of invalidRemembers) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({
            email: 'owner@example.com',
            password: 'StrongPassword@123',
            remember: val
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors.remember).toBeDefined();
      }
    });

    it('sai mật khẩu hoặc sai email trả về cùng một thông báo lỗi chung 401 (chống phân biệt tài khoản)', async () => {
      // 1. Đúng email, sai mật khẩu
      const wrongPassRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'owner@example.com',
          password: 'WrongPassword@999'
        });

      // 2. Sai email, bất kể mật khẩu
      const wrongEmailRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword@999'
        });

      expect(wrongPassRes.status).toBe(401);
      expect(wrongEmailRes.status).toBe(401);

      // Cả hai phải trả cùng mã code và nội dung message
      expect(wrongPassRes.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrongEmailRes.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPassRes.body.message).toBe('Email hoặc mật khẩu không chính xác.');
      expect(wrongEmailRes.body.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('mật khẩu dài hơn 72 byte khi đăng nhập cũng trả về mã lỗi 401 chung', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'owner@example.com',
          password: 'A'.repeat(80)
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('sau regenerate, cookie phiên cũ không còn xác thực được', async () => {
      // Bước 1: Login lần 1 để lấy session cookie thứ nhất
      const login1 = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ email: 'owner@example.com', password: 'StrongPassword@123' });

      const cookie1 = login1.headers['set-cookie'][0];

      // Bước 2: Dùng session cookie1 để login lần 2 (tái tạo session mới)
      const login2 = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookie1)
        .send({ email: 'owner@example.com', password: 'StrongPassword@123' });

      const cookie2 = login2.headers['set-cookie'][0];

      // Session ID mới phải khác Session ID cũ
      expect(cookie1.split(';')[0]).not.toBe(cookie2.split(';')[0]);

      // Cookie 1 (cũ) KHÔNG CÒN xác thực được
      const oldCheckRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie1);
      expect(oldCheckRes.status).toBe(401);

      // Cookie 2 (mới) xác thực thành công
      const newCheckRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie2);
      expect(newCheckRes.status).toBe(200);
      expect(newCheckRes.body.data.user.email).toBe('owner@example.com');
    });

    it('khi session store lưu session bị lỗi: không trả 200/success:true và không tạo phiên xác thực', async () => {
      const store = app.locals.sessionStore;
      const setSpy = vi.spyOn(store, 'set').mockImplementation((_sid, _sess, callback) => {
        callback(new Error('Mô phỏng lỗi lưu Session Store'));
      });

      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ email: 'owner@example.com', password: 'StrongPassword@123' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);

      // Nếu có trả cookie, cookie đó cũng không thể xác thực
      const rawCookie = res.headers['set-cookie']?.[0];
      if (rawCookie) {
        setSpy.mockRestore(); // Bỏ mock để kiểm tra xem store có bản ghi không
        const meRes = await request(app).get('/api/auth/me').set('Cookie', rawCookie);
        expect(meRes.status).toBe(401);
      }

      setSpy.mockRestore();
    });

    it('database truy vấn lỗi khi đăng nhập: trả 500 có kiểm soát, không treo và không lộ stack trace', async () => {
      const findSpy = vi.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('Mô phỏng lỗi kết nối Database'));

      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ email: 'owner@example.com', password: 'StrongPassword@123' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.message).toContain('Đã xảy ra lỗi máy chủ nội bộ');
      expect(res.body.stack).toBeUndefined();

      findSpy.mockRestore();
    });
  });

  // ==========================================
  // NHÓM 5: LẤY THÔNG TIN TÀI KHOẢN (GET /api/auth/me)
  // ==========================================
  describe('GET /api/auth/me', () => {
    let authCookie;

    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Trần Thị Mai',
          email: 'mai@example.com',
          password: 'MatKhau@1234'
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'mai@example.com',
          password: 'MatKhau@1234'
        });

      authCookie = loginRes.headers['set-cookie'][0];
    });

    it('trả về 401 khi không gửi kèm cookie session', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('trả về 200 và thông tin tài khoản tươi mới từ DB khi có cookie session hợp lệ', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Trần Thị Mai');
      expect(res.body.data.user.email).toBe('mai@example.com');
      expect(res.body.data.user.role).toBe('viewer');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('trả về 401 nếu session cookie giả mạo hoặc không tồn tại trong store', async () => {
      const forgedCookie = 'shp_sid=s%3AforgedSessionId123456.signature; Path=/; HttpOnly';
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', forgedCookie);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('database truy vấn lỗi khi lấy /me: trả 500 có kiểm soát, không lộ stack trace', async () => {
      const findSpy = vi.spyOn(User, 'findById').mockRejectedValueOnce(new Error('Mô phỏng lỗi DB findById'));

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie);

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.stack).toBeUndefined();

      findSpy.mockRestore();
    });
  });

  // ==========================================
  // NHÓM 6: ĐĂNG XUẤT (POST /api/auth/logout)
  // ==========================================
  describe('POST /api/auth/logout', () => {
    let authCookie;

    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          fullName: 'Phạm Đăng Xuất',
          email: 'logout.user@example.com',
          password: 'MatKhau@12345'
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          email: 'logout.user@example.com',
          password: 'MatKhau@12345'
        });

      authCookie = loginRes.headers['set-cookie'][0];
    });

    it('đăng xuất thành công: xóa session trong MongoDB và xóa cookie trình duyệt', async () => {
      // Trước khi logout, session có trong DB
      const beforeCount = await mongoose.connection.db.collection('sessions').countDocuments();
      expect(beforeCount).toBe(1);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', authCookie)
        .send({});

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Cookie bị xóa (Max-Age=0 hoặc thời gian hết hạn trong quá khứ)
      const clearCookie = logoutRes.headers['set-cookie'][0];
      expect(clearCookie).toContain('shp_sid=;');

      // Session trong MongoDB đã bị hủy
      const afterCount = await mongoose.connection.db.collection('sessions').countDocuments();
      expect(afterCount).toBe(0);

      // Cookie cũ không tiếp tục xác thực được ở /me
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie);
      expect(meRes.status).toBe(401);
    });

    it('xử lý đúng và trả về lỗi 500 khi session store gặp sự cố', async () => {
      // Mô phỏng session store bị lỗi khi destroy
      const store = app.locals.sessionStore;
      const destroySpy = vi.spyOn(store, 'destroy').mockImplementation((_sid, callback) => {
        callback(new Error('Mô phỏng lỗi kết nối Session Store'));
      });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', authCookie)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('LOGOUT_FAILED');

      destroySpy.mockRestore();
    });
  });

  // ==========================================
  // NHÓM 7: RATE LIMITING & BẢO VỆ MÁY CHỦ
  // ==========================================
  describe('Rate Limiter & Payload Protection', () => {
    it('trả về 429 TOO_MANY_REQUESTS khi gửi vượt ngưỡng rate limit', async () => {
      const strictLimiter = createAuthRateLimiter({
        windowMs: 60000,
        max: 3
      });

      const rateLimitedApp = await createApp({
        sessionStore: app.locals.sessionStore,
        rateLimiter: strictLimiter,
        sessionSecret: 'test-secret-test-only-session-secret-not-for-deployment-2026-auth-suite'
      });

      // 3 request đầu tiên
      for (let i = 0; i < 3; i++) {
        const res = await request(rateLimitedApp)
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send({ email: 'test@example.com', password: 'Password@123' });
        expect(res.status).not.toBe(429);
      }

      // Request thứ 4 phải nhận 429
      const exceededRes = await request(rateLimitedApp)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ email: 'test@example.com', password: 'Password@123' });

      expect(exceededRes.status).toBe(429);
      expect(exceededRes.body.success).toBe(false);
      expect(exceededRes.body.code).toBe('TOO_MANY_REQUESTS');
    });

    it('từ chối 413 khi kích thước payload JSON vượt quá 10kb', async () => {
      const largePayload = {
        fullName: 'Nguyen Van A',
        email: 'test@example.com',
        password: 'Password@123',
        extraGarbage: 'X'.repeat(15 * 1024)
      };

      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(largePayload);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('từ chối 400 khi cú pháp JSON bị hỏng', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"badJson: true,');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_JSON');
    });
  });

  // ==========================================
  // NHÓM 8: ĐIỀU KIỆN KHỞI ĐỘNG (STARTUP CONDITIONS)
  // ==========================================
  describe('Startup Conditions (Điều kiện khởi động)', () => {
    it('báo lỗi có kiểm soát và từ chối khởi động app nếu khởi tạo User index thất bại', async () => {
      const initSpy = vi.spyOn(User, 'init').mockRejectedValueOnce(new Error('Mô phỏng lỗi index duplicate'));

      await expect(
        createApp({
          sessionSecret: 'test-secret-test-only-session-secret-not-for-deployment-2026-auth-suite'
        })
      ).rejects.toThrow('Khởi tạo chỉ mục Unique Index email thất bại: Mô phỏng lỗi index duplicate');

      initSpy.mockRestore();
    });
  });
});
