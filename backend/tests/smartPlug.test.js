import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';
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
    await RegisteredDevice.deleteMany({});

    // Tạo user Nhật Anh (Member sở hữu smart-plug)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123!', salt);

    const nhatAnhUser = await User.create({
      name: 'Phạm Nhật Anh',
      email: 'nhatanh@example.com',
      passwordHash,
      role: 'member',
      owned: ['smart-plug']
    });

    // Tạo user Viewer (Khách chỉ xem)
    const viewerUser = await User.create({
      name: 'Khách Trải Nghiệm',
      email: 'viewer@example.com',
      passwordHash,
      role: 'viewer',
      owned: []
    });

    // Thiết lập quyền sở hữu thật trong RegisteredDevice: Nhật Anh là owner, viewerUser là viewer
    await RegisteredDevice.create({
      code: 'OCTM01',
      deviceId: 'smart-plug',
      claimSecretHash: await hashPairingSecret('pairing-secret-smart-plug-1234'),
      ownerUserId: nhatAnhUser._id,
      viewerUserIds: [viewerUser._id],
      claimedAt: new Date()
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

  it('1. GET /api/devices/smart-plug/state yêu cầu đăng nhập (401 khi chưa đăng nhập, 200 khi có quyền xem)', async () => {
    const unauthRes = await request(app)
      .get('/api/devices/smart-plug/state');
    expect(unauthRes.status).toBe(401);

    const res = await request(app)
      .get('/api/devices/smart-plug/state')
      .set('Cookie', viewerCookies);

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
    // Không suy đoán 50W khi bật relay; trường chưa có telemetry thật là null
    expect(res.body.data.state.powerWatt).toBeNull();
    expect(res.body.data.state.voltage).toBeNull();

    // Kiểm tra đã lưu telemetry vào DB
    const count = await SmartPlugTelemetry.countDocuments({ deviceId: 'smart-plug' });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('5. HTTP telemetry chưa xác thực nguồn không thể ghi số đo hoặc kích hoạt quá tải', async () => {
    const telemetryData = {
      relayState: 'ON',
      voltage: 221.4,
      powerWatt: 2450.0, // Vượt ngưỡng 2000W
      energyKwh: 0.15,
      lightLux: 350
    };

    const res = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Cookie', nhatAnhCookies)
      .set('Content-Type', 'application/json')
      .send(telemetryData);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('TELEMETRY_SOURCE_NOT_CONFIGURED');
    expect(await SmartPlugTelemetry.countDocuments({ deviceId: 'smart-plug' })).toBe(0);
    const state = await request(app).get('/api/devices/smart-plug/state').set('Cookie', nhatAnhCookies);
    expect(state.body.data.state.isOverloaded).toBe(false);
  });

  it('6. GET /api/devices/smart-plug/history trả về danh sách lịch sử đo lường (yêu cầu quyền xem)', async () => {
    // Chưa đăng nhập: 401
    const unauth = await request(app).get('/api/devices/smart-plug/history');
    expect(unauth.status).toBe(401);

    await SmartPlugTelemetry.create({
      deviceId: 'smart-plug',
      relayState: 'ON',
      voltage: 220.0,
      powerWatt: 50.0,
      energyKwh: 0.01,
      lightLux: 400
    });

    const res = await request(app)
      .get('/api/devices/smart-plug/history?limit=10')
      .set('Cookie', viewerCookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.records)).toBe(true);
    expect(res.body.data.records.length).toBeGreaterThanOrEqual(1);
  });

  it('7. HTTP telemetry không ghi kể cả khi payload sai hoặc số đo có vẻ hợp lệ', async () => {
    const invalidRes = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Cookie', nhatAnhCookies)
      .set('Content-Type', 'application/json')
      .send({ voltage: 220, powerWatt: 50, relayState: 'INVALID' });

    expect(invalidRes.status).toBe(503);

    const safeRes = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Cookie', nhatAnhCookies)
      .set('Content-Type', 'application/json')
      .send({ voltage: 220, powerWatt: 100, relayState: 'ON' });

    expect(safeRes.status).toBe(503);
    expect(await SmartPlugTelemetry.countDocuments({ deviceId: 'smart-plug' })).toBe(0);
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
      .get('/api/devices/smart-plug/history?limit=-5')
      .set('Cookie', viewerCookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.records)).toBe(true);
  });

  it('10. Người dùng lạ và Quản trị viên (admin) không sở hữu/được chia sẻ đều bị từ chối 403', async () => {
    // Tạo tài khoản outsider (người lạ không có quyền xem/sở hữu)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123!', salt);
    await User.create({
      name: 'Người Ngoài',
      email: 'outsider@example.com',
      passwordHash,
      role: 'viewer',
      owned: []
    });
    const outsiderLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email: 'outsider@example.com', password: 'Password123!' });
    const outsiderCookies = outsiderLogin.headers['set-cookie'];

    // Tạo tài khoản admin nhưng không được ghi nhận trong RegisteredDevice
    await User.create({
      name: 'Admin Hệ Thống',
      email: 'superadmin@example.com',
      passwordHash,
      role: 'admin',
      owned: []
    });
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email: 'superadmin@example.com', password: 'Password123!' });
    const adminCookies = adminLogin.headers['set-cookie'];

    // Outsider bị từ chối xem state và history
    expect((await request(app).get('/api/devices/smart-plug/state').set('Cookie', outsiderCookies)).status).toBe(403);
    expect((await request(app).get('/api/devices/smart-plug/history').set('Cookie', outsiderCookies)).status).toBe(403);
    // Outsider bị từ chối điều khiển relay
    expect((await request(app).post('/api/devices/smart-plug/relay').set('Cookie', outsiderCookies).set('Origin', TEST_ORIGIN).send({ state: 'ON' })).status).toBe(403);

    // Admin không có quyền sở hữu trong RegisteredDevice: KHÔNG tự động được xem hoặc điều khiển
    expect((await request(app).get('/api/devices/smart-plug/state').set('Cookie', adminCookies)).status).toBe(403);
    expect((await request(app).get('/api/devices/smart-plug/history').set('Cookie', adminCookies)).status).toBe(403);
    expect((await request(app).post('/api/devices/smart-plug/relay').set('Cookie', adminCookies).set('Origin', TEST_ORIGIN).send({ state: 'ON' })).status).toBe(403);
  });

  it('11. Người không có quyền hoặc không có danh tính thiết bị không thể ghi hay đổi state/history', async () => {
    // 11.1 Người dùng xem (viewer) hoặc người lạ cố tình gửi telemetry qua HTTP bị từ chối 403
    const viewerDenied = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Cookie', viewerCookies)
      .set('Content-Type', 'application/json')
      .send({ voltage: 220, powerWatt: 100, relayState: 'ON' });

    expect(viewerDenied.status).toBe(403);
    expect(viewerDenied.body.code).toBe('FORBIDDEN');

    const beforeState = await request(app).get('/api/devices/smart-plug/state').set('Cookie', nhatAnhCookies);
    const beforeHistory = await request(app).get('/api/devices/smart-plug/history').set('Cookie', nhatAnhCookies);
    const beforeCount = await SmartPlugTelemetry.countDocuments({ deviceId: 'smart-plug' });

    const anonymousPost = await request(app)
      .post('/api/devices/smart-plug/telemetry')
      .set('Content-Type', 'application/json')
      .send({ voltage: 219.5, powerWatt: 2500, relayState: 'ON' });

    expect(anonymousPost.status).toBe(401);

    expect(await SmartPlugTelemetry.countDocuments({ deviceId: 'smart-plug' })).toBe(beforeCount);
    const afterState = await request(app).get('/api/devices/smart-plug/state').set('Cookie', nhatAnhCookies);
    const afterHistory = await request(app).get('/api/devices/smart-plug/history').set('Cookie', nhatAnhCookies);
    expect(afterState.body.data.state.relayState).toBe(beforeState.body.data.state.relayState);
    expect(afterState.body.data.state.isOverloaded).toBe(beforeState.body.data.state.isOverloaded);
    expect(afterHistory.body.data.records).toEqual(beforeHistory.body.data.records);
  });
});
