import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import SmartPlugTelemetry from '../modules/smart-plug/smartPlugModel.js';

process.env.RATE_LIMIT_MAX = '500';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/smart_home_privacy_test';
const TEST_ORIGIN = 'http://localhost:5173';

describe('Smart Plug Module - Backend Integration Tests (Nhật Anh)', () => {
  let app;
  let nhatAnhCookies;
  let viewerCookies;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    if (mongoose.connection.name !== 'smart_home_privacy_test') {
      throw new Error('[CRITICAL SAFETY CHECK] Dừng test để bảo vệ database!');
    }

    app = await createApp({
      sessionSecret: 'test-secret-smart-plug-integration-suite-nhatanh-2026'
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await SmartPlugTelemetry.deleteMany({});

    // Tạo user Nhật Anh (Member sở hữu smart-plug)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123!', salt);

    await User.create({
      name: 'Phạm Nhật Anh',
      email: 'nhatanh@example.com',
      passwordHash,
      role: 'member',
      owned: ['smart-plug']
    });

    // Tạo user Viewer (Khách chỉ xem)
    await User.create({
      name: 'Khách Trải Nghiệm',
      email: 'viewer@example.com',
      passwordHash,
      role: 'viewer',
      owned: []
    });

    // Đăng nhập Nhật Anh để lấy session cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email: 'nhatanh@example.com', password: 'Password123!' });

    nhatAnhCookies = loginRes.headers['set-cookie'];

    // Đăng nhập Viewer để lấy session cookie
    const viewerLoginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email: 'viewer@example.com', password: 'Password123!' });

    viewerCookies = viewerLoginRes.headers['set-cookie'];
  });

  it('1. GET /api/devices/smart-plug/state trả về 200 và trạng thái tức thời', async () => {
    const res = await request(app)
      .get('/api/devices/smart-plug/state');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.state).toBeDefined();
    expect(res.body.data.state.deviceId).toBe('smart-plug');
  });

  it('2. POST /api/devices/smart-plug/relay từ chối người dùng chưa đăng nhập (401)', async () => {
    const res = await request(app)
      .post('/api/devices/smart-plug/relay')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ state: 'ON' });

    expect(res.status).toBe(401);
  });

  it('3. POST /api/devices/smart-plug/relay từ chối người dùng không sở hữu thiết bị (403)', async () => {
    const res = await request(app)
      .post('/api/devices/smart-plug/relay')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', viewerCookies)
      .set('Content-Type', 'application/json')
      .send({ state: 'ON' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('4. POST /api/devices/smart-plug/relay cho phép Nhật Anh bật rơ-le thành công (200)', async () => {
    const res = await request(app)
      .post('/api/devices/smart-plug/relay')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', nhatAnhCookies)
      .set('Content-Type', 'application/json')
      .send({ state: 'ON' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.state.relayState).toBe('ON');

    // Kiểm tra đã lưu telemetry vào DB
    const count = await SmartPlugTelemetry.countDocuments({ deviceId: 'smart-plug' });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('5. POST /api/devices/smart-plug/telemetry ghi nhận bản tin đo lường và phát hiện quá tải', async () => {
    const telemetryData = {
      relayState: 'ON',
      voltage: 221.4,
      powerWatt: 2450.0, // Vượt ngưỡng 2000W
      energyKwh: 0.15,
      lightLux: 350
    };

    const res = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Content-Type', 'application/json')
      .send(telemetryData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.telemetry.isOverloaded).toBe(true);
    expect(res.body.data.telemetry.relayState).toBe('OFF'); // Tự động ngắt khi quá tải
  });

  it('6. GET /api/devices/smart-plug/history trả về danh sách lịch sử đo lường', async () => {
    await SmartPlugTelemetry.create({
      deviceId: 'smart-plug',
      relayState: 'ON',
      voltage: 220.0,
      powerWatt: 50.0,
      energyKwh: 0.01,
      lightLux: 400
    });

    const res = await request(app)
      .get('/api/devices/smart-plug/history?limit=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.records)).toBe(true);
    expect(res.body.data.records.length).toBeGreaterThanOrEqual(1);
  });

  it('7. POST /api/devices/smart-plug/telemetry xác thực relayState và tự động giải phóng quá tải', async () => {
    // 7.1 Từ chối relayState không hợp lệ
    const invalidRes = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Content-Type', 'application/json')
      .send({ voltage: 220, powerWatt: 50, relayState: 'INVALID' });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.code).toBe('VALIDATION_ERROR');

    // 7.2 Khi nhận công suất an toàn (<= 2000W), tự động giải phóng cờ quá tải
    const safeRes = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Content-Type', 'application/json')
      .send({ voltage: 220, powerWatt: 100, relayState: 'ON' });

    expect(safeRes.status).toBe(201);
    expect(safeRes.body.data.telemetry.isOverloaded).toBe(false);
  });

  it('8. POST /api/devices/smart-plug/reset-overload cho phép chủ sở hữu reset quá tải an toàn', async () => {
    const res = await request(app)
      .post('/api/devices/smart-plug/reset-overload')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', nhatAnhCookies)
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.state.isOverloaded).toBe(false);
  });

  it('9. GET /api/devices/smart-plug/history chuẩn hoá limit âm thành hợp lệ', async () => {
    const res = await request(app)
      .get('/api/devices/smart-plug/history?limit=-5');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.records)).toBe(true);
  });
});
