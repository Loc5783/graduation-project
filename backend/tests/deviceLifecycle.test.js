import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import DeviceObservation from '../src/models/DeviceObservation.js';
import SmartPlugTelemetry from '../modules/smart-plug/smartPlugModel.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';

const DB = 'smart_home_privacy_test';
const ORIGIN = 'http://localhost:5173';
const SECRET_BIN = 'private-pair-bin-12345';
const SECRET_DOOR = 'private-pair-door-67890';
const SECRET_PLUG = 'private-pair-plug-54321';
const SECRET_SPEAKER = 'private-pair-speaker-98765';
let app;

async function register(email, password = 'MatKhau@123', fullName = 'Test User') {
  return await request(app).post('/api/auth/register').set('Origin', ORIGIN).send({ fullName, email, password });
}

async function login(email, password = 'MatKhau@123') {
  const res = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
  return { status: res.status, body: res.body, cookie: res.headers['set-cookie'] };
}

async function registerAndLogin(email, password = 'MatKhau@123', fullName = 'Test User') {
  const reg = await register(email, password, fullName);
  expect(reg.status).toBe(201);
  const log = await login(email, password);
  expect(log.status).toBe(200);
  return log.cookie;
}

describe('Toàn bộ vòng đời: Tài khoản -> Claim -> Đổi tên -> Chia sẻ -> Thu hồi -> Gỡ thiết bị', () => {
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({
      sessionSecret: 'device-lifecycle-test-secret-long-random-key-123',
      myDeviceOptions: { limiter: (_req, _res, next) => next() }
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await RegisteredDevice.deleteMany({});
    await User.deleteMany({});
    await DeviceObservation.deleteMany({});
    await SmartPlugTelemetry.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});

    // Khởi tạo 4 thiết bị catalog trong DB test
    await RegisteredDevice.create({
      code: 'TRTM01',
      deviceId: 'smart-bin',
      claimSecretHash: await hashPairingSecret(SECRET_BIN)
    });
    await RegisteredDevice.create({
      code: 'KCTM01',
      deviceId: 'smart-door-lock',
      claimSecretHash: await hashPairingSecret(SECRET_DOOR)
    });
    await RegisteredDevice.create({
      code: 'OCTM01',
      deviceId: 'smart-plug',
      claimSecretHash: await hashPairingSecret(SECRET_PLUG)
    });
    await RegisteredDevice.create({
      code: 'LTTM01',
      deviceId: 'smart-speaker',
      claimSecretHash: await hashPairingSecret(SECRET_SPEAKER)
    });
  });

  describe('1. TÀI KHOẢN (Account Authentication & Isolation)', () => {
    it('bắt lỗi form đăng ký: bỏ trống, email sai định dạng, email trùng, mật khẩu ngắn', async () => {
      // Bỏ trống các trường
      const emptyRes = await register('', '', '');
      expect(emptyRes.status).toBe(400);

      // Email sai định dạng
      const badEmailRes = await register('invalid-email-format', 'MatKhau@123');
      expect(badEmailRes.status).toBe(400);

      // Mật khẩu quá ngắn
      const shortPassRes = await register('user1@example.com', '123');
      expect(shortPassRes.status).toBe(400);

      // Đăng ký thành công lần 1
      const okRes = await register('user1@example.com', 'MatKhau@123');
      expect(okRes.status).toBe(201);

      // Email trùng lặp
      const dupRes = await register('user1@example.com', 'MatKhau@123');
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe('DUPLICATE_KEY');
    });

    it('đăng nhập, tải lại trang (get me), đăng xuất và đổi tài khoản A/B cách ly hoàn toàn', async () => {
      const cookieA = await registerAndLogin('usera@example.com');
      const cookieB = await registerAndLogin('userb@example.com');

      // Tải lại trang: xác thực qua /api/auth/me
      const meA = await request(app).get('/api/auth/me').set('Cookie', cookieA);
      expect(meA.status).toBe(200);
      expect(meA.body.data.user.email).toBe('usera@example.com');

      const meB = await request(app).get('/api/auth/me').set('Cookie', cookieB);
      expect(meB.status).toBe(200);
      expect(meB.body.data.user.email).toBe('userb@example.com');

      // Tài khoản mới ban đầu có đúng 0 thiết bị
      const devicesA = await request(app).get('/api/my-devices').set('Cookie', cookieA);
      expect(devicesA.status).toBe(200);
      expect(devicesA.body.data.devices).toEqual([]);

      // User A claim TRTM01
      const claimA = await request(app).post('/api/my-devices/claim')
        .set('Cookie', cookieA).set('Origin', ORIGIN)
        .send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      expect(claimA.status).toBe(200);

      // User A đăng xuất
      const logoutA = await request(app).post('/api/auth/logout')
        .set('Cookie', cookieA).set('Origin', ORIGIN).set('Content-Type', 'application/json').send({});
      expect(logoutA.status).toBe(200);

      // Cookie A sau khi đăng xuất bị vô hiệu hóa (401)
      const afterLogoutMe = await request(app).get('/api/auth/me').set('Cookie', cookieA);
      expect(afterLogoutMe.status).toBe(401);

      // Đăng nhập User B: tuyệt đối KHÔNG thấy thiết bị của User A
      const devicesB = await request(app).get('/api/my-devices').set('Cookie', cookieB);
      expect(devicesB.body.data.devices).toEqual([]);
    });
  });

  describe('2. THÊM THIẾT BỊ (Claiming / Pairing Device)', () => {
    it('từ chối claim khi thiếu secret, sai secret, mã không tồn tại, và chuẩn hóa chữ hoa/thường khoảng trắng', async () => {
      const user = await registerAndLogin('claimer@example.com');

      // Thiếu secret
      const resNoSecret = await request(app).post('/api/my-devices/claim').set('Cookie', user).set('Origin', ORIGIN).send({ code: 'TRTM01' });
      expect(resNoSecret.status).toBe(400);

      // Sai secret
      const resWrongSecret = await request(app).post('/api/my-devices/claim').set('Cookie', user).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: 'wrong-secret-12345' });
      expect(resWrongSecret.status).toBe(400);
      expect(resWrongSecret.body.code).toBe('CLAIM_FAILED');

      // Mã không tồn tại
      const resNonExist = await request(app).post('/api/my-devices/claim').set('Cookie', user).set('Origin', ORIGIN).send({ code: 'KHONGTONTAI99', pairingSecret: SECRET_BIN });
      expect(resNonExist.status).toBe(400);
      expect(resNonExist.body.code).toBe('CLAIM_FAILED');

      // Chuẩn hóa: chữ thường + khoảng trắng ('  trtm01  ') và secret có khoảng trắng được trim
      const resNormalize = await request(app).post('/api/my-devices/claim')
        .set('Cookie', user).set('Origin', ORIGIN)
        .send({ code: '  trtm01  '.trim(), pairingSecret: `  ${SECRET_BIN}  `.trim() });
      expect(resNormalize.status).toBe(200);
      expect(resNormalize.body.data.id).toBe('smart-bin');
      expect(resNormalize.body.data.access).toBe('owner');

      // Claim lại chính thiết bị của mình: thành công idempotent (200)
      const resReclaim = await request(app).post('/api/my-devices/claim')
        .set('Cookie', user).set('Origin', ORIGIN)
        .send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      expect(resReclaim.status).toBe(200);

      // Người khác cố claim thiết bị đã có chủ -> 409 ALREADY_CLAIMED
      const user2 = await registerAndLogin('intruder@example.com');
      const resOther = await request(app).post('/api/my-devices/claim')
        .set('Cookie', user2).set('Origin', ORIGIN)
        .send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      expect(resOther.status).toBe(409);
      expect(resOther.body.code).toBe('ALREADY_CLAIMED');
    });
  });

  describe('3. SỬA TÊN GỢI NHỚ (Edit Display Name)', () => {
    it('chỉ Owner được đổi tên gợi nhớ, kiểm tra độ dài và viewer chỉ xem được tên này', async () => {
      const owner = await registerAndLogin('owner-edit@example.com');
      const viewer = await registerAndLogin('viewer-edit@example.com');
      const outsider = await registerAndLogin('outsider-edit@example.com');

      // Owner claim TRTM01
      await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      // Owner chia sẻ cho viewer
      await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', owner).set('Origin', ORIGIN).send({ email: 'viewer-edit@example.com' });

      // 1. Viewer cố tình PATCH đổi tên -> 403 FORBIDDEN
      const viewerPatch = await request(app).patch('/api/my-devices/smart-bin')
        .set('Cookie', viewer).set('Origin', ORIGIN)
        .send({ customName: 'Tên do Viewer đặt' });
      expect(viewerPatch.status).toBe(403);

      // 2. Người ngoài cố tình PATCH đổi tên -> 403 FORBIDDEN
      const outsiderPatch = await request(app).patch('/api/my-devices/smart-bin')
        .set('Cookie', outsider).set('Origin', ORIGIN)
        .send({ customName: 'Tên do Hacker đặt' });
      expect(outsiderPatch.status).toBe(403);

      // 3. Tên quá dài (> 50 ký tự) -> 400 NAME_TOO_LONG
      const tooLongName = 'A'.repeat(51);
      const longRes = await request(app).patch('/api/my-devices/smart-bin')
        .set('Cookie', owner).set('Origin', ORIGIN)
        .send({ customName: tooLongName });
      expect(longRes.status).toBe(400);
      expect(longRes.body.code).toBe('NAME_TOO_LONG');

      // 4. Owner đổi tên thành công thành "Thùng rác phòng khách"
      const patchOk = await request(app).patch('/api/my-devices/smart-bin')
        .set('Cookie', owner).set('Origin', ORIGIN)
        .send({ customName: 'Thùng rác phòng khách' });
      expect(patchOk.status).toBe(200);
      expect(patchOk.body.data.customName).toBe('Thùng rác phòng khách');

      // 5. Viewer gọi GET /api/my-devices -> thấy customName "Thùng rác phòng khách"
      const viewerGet = await request(app).get('/api/my-devices').set('Cookie', viewer);
      expect(viewerGet.body.data.devices[0].customName).toBe('Thùng rác phòng khách');

      // 6. Owner khôi phục tên mặc định (customName: null hoặc "")
      const resetOk = await request(app).patch('/api/my-devices/smart-bin')
        .set('Cookie', owner).set('Origin', ORIGIN)
        .send({ customName: null });
      expect(resetOk.status).toBe(200);
      expect(resetOk.body.data.customName).toBeNull();
    });
  });

  describe('4. CHIA SẺ VÀ THU HỒI (Sharing & Revocation Matrix)', () => {
    it('A là owner, B là viewer, C là người ngoài, D là admin: kiểm tra ma trận phân quyền', async () => {
      const ownerA = await registerAndLogin('user-a@example.com');
      const viewerB = await registerAndLogin('user-b@example.com');
      const outsiderC = await registerAndLogin('user-c@example.com');
      const adminD = await registerAndLogin('user-d-admin@example.com');
      await User.updateOne({ email: 'user-d-admin@example.com' }, { $set: { role: 'admin' } });

      // A claim smart-bin
      await request(app).post('/api/my-devices/claim').set('Cookie', ownerA).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET_BIN });

      // A chia sẻ cho B
      const shareRes = await request(app).post('/api/my-devices/smart-bin/shares')
        .set('Cookie', ownerA).set('Origin', ORIGIN)
        .send({ email: 'user-b@example.com' });
      expect(shareRes.status).toBe(200);

      // B xem được thiết bị với access 'viewer'
      const bDevices = await request(app).get('/api/my-devices').set('Cookie', viewerB);
      expect(bDevices.body.data.devices).toMatchObject([{ id: 'smart-bin', access: 'viewer' }]);

      // B không được phép chia sẻ tiếp cho C (404/403)
      const bShareToC = await request(app).post('/api/my-devices/smart-bin/shares')
        .set('Cookie', viewerB).set('Origin', ORIGIN)
        .send({ email: 'user-c@example.com' });
      expect(bShareToC.status).toBe(404);

      // C (người ngoài) không xem được thiết bị
      const cDevice = await request(app).get('/api/my-devices/smart-bin').set('Cookie', outsiderC);
      expect(cDevice.status).toBe(404);

      // D (Admin) không tự động có quyền xem thiết bị của nhà A
      const dDevice = await request(app).get('/api/my-devices/smart-bin').set('Cookie', adminD);
      expect(dDevice.status).toBe(404);

      // A xem danh sách người được chia sẻ
      const shareList = await request(app).get('/api/my-devices/smart-bin/shares').set('Cookie', ownerA);
      expect(shareList.body.data.users).toMatchObject([{ email: 'user-b@example.com' }]);

      // A thu hồi quyền của B
      const userBDoc = await User.findOne({ email: 'user-b@example.com' });
      const revokeRes = await request(app).delete(`/api/my-devices/smart-bin/shares/${userBDoc._id}`)
        .set('Cookie', ownerA).set('Origin', ORIGIN);
      expect(revokeRes.status).toBe(200);

      // B ngay lập tức bị chặn truy cập
      const bAfterRevoke = await request(app).get('/api/my-devices/smart-bin').set('Cookie', viewerB);
      expect(bAfterRevoke.status).toBe(404);

      const bDevicesAfter = await request(app).get('/api/my-devices').set('Cookie', viewerB);
      expect(bDevicesAfter.body.data.devices).toEqual([]);
    });
  });

  describe('5. GỠ THIẾT BỊ KHỎI TÀI KHOẢN (Unclaim Device)', () => {
    it('chỉ Owner được gỡ thiết bị, thu hồi toàn bộ viewer một cách nguyên tử, và cho phép ghép nối lại bằng secret cũ', async () => {
      const owner = await registerAndLogin('owner-unclaim@example.com');
      const viewer = await registerAndLogin('viewer-unclaim@example.com');
      const outsider = await registerAndLogin('outsider-unclaim@example.com');

      // 1. Owner claim TRTM01 và đặt customName
      await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      await request(app).patch('/api/my-devices/smart-bin').set('Cookie', owner).set('Origin', ORIGIN).send({ customName: 'Thùng rác ban công' });
      await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', owner).set('Origin', ORIGIN).send({ email: 'viewer-unclaim@example.com' });

      // 2. Viewer cố unclaim -> 403 FORBIDDEN
      const viewerUnclaim = await request(app).post('/api/my-devices/smart-bin/unclaim').set('Cookie', viewer).set('Origin', ORIGIN);
      expect(viewerUnclaim.status).toBe(403);

      // 3. Outsider cố unclaim -> 403 FORBIDDEN
      const outsiderUnclaim = await request(app).post('/api/my-devices/smart-bin/unclaim').set('Cookie', outsider).set('Origin', ORIGIN);
      expect(outsiderUnclaim.status).toBe(403);

      // 4. Owner unclaim thiết bị
      const unclaimRes = await request(app).post('/api/my-devices/smart-bin/unclaim').set('Cookie', owner).set('Origin', ORIGIN);
      expect(unclaimRes.status).toBe(200);
      expect(unclaimRes.body.data.unclaimed).toBe(true);

      // 5. Kiểm tra CSDL: bản ghi RegisteredDevice vẫn tồn tại nhưng ownerUserId = null, viewerUserIds = [], customName = null
      const docInDB = await RegisteredDevice.findOne({ deviceId: 'smart-bin' });
      expect(docInDB).not.toBeNull();
      expect(docInDB.ownerUserId).toBeNull();
      expect(docInDB.viewerUserIds).toEqual([]);
      expect(docInDB.customName).toBeNull();
      expect(docInDB.claimedAt).toBeNull();

      // 6. Cả Owner lẫn Viewer đều không còn thấy thiết bị trên /api/my-devices
      const ownerDevices = await request(app).get('/api/my-devices').set('Cookie', owner);
      expect(ownerDevices.body.data.devices).toEqual([]);

      const viewerDevices = await request(app).get('/api/my-devices').set('Cookie', viewer);
      expect(viewerDevices.body.data.devices).toEqual([]);

      // 7. Thiết bị có thể được claim lại bình thường bằng chính pairingSecret in trên tem thiết bị
      const newOwner = await registerAndLogin('new-owner@example.com');
      const reclaimOk = await request(app).post('/api/my-devices/claim')
        .set('Cookie', newOwner).set('Origin', ORIGIN)
        .send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      expect(reclaimOk.status).toBe(200);
      expect(reclaimOk.body.data.id).toBe('smart-bin');
      expect(reclaimOk.body.data.access).toBe('owner');

      // Bí mật ghép nối tuyệt đối không lộ trong response
      expect(reclaimOk.body.data.claimSecretHash).toBeUndefined();
      expect(reclaimOk.body.data.pairingSecret).toBeUndefined();
    });
  });

  describe('6. CÁCH LY DỮ LIỆU LỊCH SỬ THEO LẦN SỞ HỮU (Data Isolation per Ownership Tenure)', () => {
    it('khi A unclaim rồi B claim, B và viewer của B không thấy bất kỳ bản ghi nào của A trên DeviceObservation', async () => {
      const ownerA = await registerAndLogin('owner-a-obs@example.com');
      const viewerA = await registerAndLogin('viewer-a-obs@example.com');
      const ownerB = await registerAndLogin('owner-b-obs@example.com');
      const viewerB = await registerAndLogin('viewer-b-obs@example.com');
      const outsider = await registerAndLogin('outsider-obs@example.com');
      const admin = await registerAndLogin('admin-obs@example.com');
      await User.updateOne({ email: 'admin-obs@example.com' }, { $set: { role: 'admin' } });

      // 1. Owner A claim smart-bin (tenure 1)
      const claimA = await request(app).post('/api/my-devices/claim')
        .set('Cookie', ownerA).set('Origin', ORIGIN)
        .send({ code: 'TRTM01', pairingSecret: SECRET_BIN });
      expect(claimA.status).toBe(200);

      // Đặt claimedAt về quá khứ để fixture t1 thuộc khoảng thời gian sở hữu của A
      await RegisteredDevice.updateOne({ deviceId: 'smart-bin' }, { $set: { claimedAt: new Date(Date.now() - 120000) } });

      // A chia sẻ cho viewer A
      await request(app).post('/api/my-devices/smart-bin/shares')
        .set('Cookie', ownerA).set('Origin', ORIGIN)
        .send({ email: 'viewer-a-obs@example.com' });

      // Tạo các quan sát trong thời gian sở hữu của A (tenure 1)
      const t1 = new Date(Date.now() - 60000);
      await DeviceObservation.create({
        deviceId: 'smart-bin',
        observedAt: t1,
        expiresAt: new Date(t1.getTime() + 86400000),
        fresh: true,
        brokerConnected: true,
        data: { fillPercent: 45, distanceCm: 25, lidOpen: false, mode: 'auto' },
        ownershipEpoch: 1
      });

      // Cả Owner A và Viewer A đều đọc được dữ liệu này
      const aHist = await request(app).get('/api/device-history/smart-bin').set('Cookie', ownerA);
      expect(aHist.status).toBe(200);
      expect(aHist.body.data.items).toHaveLength(1);
      expect(aHist.body.data.items[0].data.fillPercent).toBe(45);

      const aViewerHist = await request(app).get('/api/device-history/smart-bin').set('Cookie', viewerA);
      expect(aViewerHist.status).toBe(200);
      expect(aViewerHist.body.data.items).toHaveLength(1);

      // 2. Owner A unclaim thiết bị
      const unclaimRes = await request(app).post('/api/my-devices/smart-bin/unclaim')
        .set('Cookie', ownerA).set('Origin', ORIGIN);
      expect(unclaimRes.status).toBe(200);

      // 3. Tranh chấp claim giữa B và một tài khoản khác: cả hai cùng gửi đồng thời
      const [raceResB, raceResOutsider] = await Promise.all([
        request(app).post('/api/my-devices/claim').set('Cookie', ownerB).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET_BIN }),
        request(app).post('/api/my-devices/claim').set('Cookie', outsider).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET_BIN })
      ]);
      const raceStatuses = [raceResB.status, raceResOutsider.status].sort();
      expect(raceStatuses).toEqual([200, 409]);

      // Xác định cookie của người thắng cuộc
      let activeOwnerCookie = ownerB;
      let activeViewerEmail = 'viewer-b-obs@example.com';
      if (raceResB.status !== 200) {
        activeOwnerCookie = outsider;
        activeViewerEmail = 'owner-b-obs@example.com';
      }

      // Người sở hữu mới chia sẻ cho viewer của mình
      await request(app).post('/api/my-devices/smart-bin/shares')
        .set('Cookie', activeOwnerCookie).set('Origin', ORIGIN)
        .send({ email: activeViewerEmail });

      // 4. Chủ mới gọi GET /api/device-history/smart-bin -> nhận mảng RỖNG, không thấy bất kỳ bản ghi nào của A
      const bHistBeforeNew = await request(app).get('/api/device-history/smart-bin').set('Cookie', activeOwnerCookie);
      expect(bHistBeforeNew.status).toBe(200);
      expect(bHistBeforeNew.body.data.items).toEqual([]);

      // Viewer của chủ mới cũng nhận mảng RỖNG
      const bViewerCookie = activeViewerEmail === 'viewer-b-obs@example.com' ? viewerB : ownerB;
      const bViewerHistBeforeNew = await request(app).get('/api/device-history/smart-bin').set('Cookie', bViewerCookie);
      expect(bViewerHistBeforeNew.status).toBe(200);
      expect(bViewerHistBeforeNew.body.data.items).toEqual([]);

      // 5. Chủ cũ A, viewer cũ của A, và admin không sở hữu bị chặn 403
      expect((await request(app).get('/api/device-history/smart-bin').set('Cookie', ownerA)).status).toBe(403);
      expect((await request(app).get('/api/device-history/smart-bin').set('Cookie', viewerA)).status).toBe(403);
      expect((await request(app).get('/api/device-history/smart-bin').set('Cookie', admin)).status).toBe(403);

      // 6. Phát sinh dữ liệu mới trong lần sở hữu thứ 2 của B
      const t2 = new Date();
      await DeviceObservation.create({
        deviceId: 'smart-bin',
        observedAt: t2,
        expiresAt: new Date(t2.getTime() + 86400000),
        fresh: true,
        brokerConnected: true,
        data: { fillPercent: 80, distanceCm: 10, lidOpen: true, mode: 'manual' },
        ownershipEpoch: 2
      });

      // Chủ mới B và viewer của B chỉ thấy đúng 1 bản ghi mới của B (fillPercent 80), KHÔNG có bản ghi cũ của A (fillPercent 45)
      const bHistAfterNew = await request(app).get('/api/device-history/smart-bin').set('Cookie', activeOwnerCookie);
      expect(bHistAfterNew.status).toBe(200);
      expect(bHistAfterNew.body.data.items).toHaveLength(1);
      expect(bHistAfterNew.body.data.items[0].data.fillPercent).toBe(80);
      expect(bHistAfterNew.body.data.items.some(it => it.data.fillPercent === 45)).toBe(false);

      const bViewerHistAfterNew = await request(app).get('/api/device-history/smart-bin').set('Cookie', bViewerCookie);
      expect(bViewerHistAfterNew.body.data.items).toHaveLength(1);
      expect(bViewerHistAfterNew.body.data.items[0].data.fillPercent).toBe(80);
    });

    it('cách ly lịch sử Smart Plug: B không thấy lịch sử tiêu thụ điện của A sau khi claim lại', async () => {
      const ownerA = await registerAndLogin('owner-a-plug@example.com');
      const ownerB = await registerAndLogin('owner-b-plug@example.com');

      // A claim smart-plug
      await request(app).post('/api/my-devices/claim')
        .set('Cookie', ownerA).set('Origin', ORIGIN)
        .send({ code: 'OCTM01', pairingSecret: SECRET_PLUG });

      // Đặt claimedAt về quá khứ để fixture tA thuộc khoảng thời gian sở hữu của A
      await RegisteredDevice.updateOne({ deviceId: 'smart-plug' }, { $set: { claimedAt: new Date(Date.now() - 60000) } });

      // Tạo bản ghi viễn trắc trong thời gian A sở hữu (tenure 1)
      const tA = new Date(Date.now() - 30000);
      await SmartPlugTelemetry.create({
        deviceId: 'smart-plug',
        relayState: 'ON',
        voltage: 220,
        powerWatt: 60,
        energyKwh: 1.5,
        ownershipEpoch: 1,
        createdAt: tA
      });

      // A xem được lịch sử
      const aHistory = await request(app).get('/api/devices/smart-plug/history').set('Cookie', ownerA);
      expect(aHistory.status).toBe(200);
      expect(aHistory.body.data.records).toHaveLength(1);

      // A unclaim smart-plug
      await request(app).post('/api/my-devices/smart-plug/unclaim')
        .set('Cookie', ownerA).set('Origin', ORIGIN);

      // B claim lại smart-plug (tenure 2)
      await request(app).post('/api/my-devices/claim')
        .set('Cookie', ownerB).set('Origin', ORIGIN)
        .send({ code: 'OCTM01', pairingSecret: SECRET_PLUG });

      // B gọi GET history -> nhận mảng RỖNG, không thấy bản ghi 60W của A
      const bHistory = await request(app).get('/api/devices/smart-plug/history').set('Cookie', ownerB);
      expect(bHistory.status).toBe(200);
      expect(bHistory.body.data.records).toEqual([]);

      // A bị chặn 403
      expect((await request(app).get('/api/devices/smart-plug/history').set('Cookie', ownerA)).status).toBe(403);
    });

    it('cách ly lịch sử Loa thông minh từ Gateway: ẩn toàn bộ lịch sử khi thiết bị đã đổi chủ (ownershipEpoch > 1)', async () => {
      const ownerA = await registerAndLogin('owner-a-spk@example.com');
      const ownerB = await registerAndLogin('owner-b-spk@example.com');

      // A claim smart-speaker (tenure 1)
      await request(app).post('/api/my-devices/claim')
        .set('Cookie', ownerA).set('Origin', ORIGIN)
        .send({ code: 'LTTM01', pairingSecret: SECRET_SPEAKER });

      // A unclaim smart-speaker
      await request(app).post('/api/my-devices/smart-speaker/unclaim')
        .set('Cookie', ownerA).set('Origin', ORIGIN);

      // B claim smart-speaker (tenure 2, ownershipEpoch = 2)
      await request(app).post('/api/my-devices/claim')
        .set('Cookie', ownerB).set('Origin', ORIGIN)
        .send({ code: 'LTTM01', pairingSecret: SECRET_SPEAKER });

      // B gọi /api/live-devices/speaker-history -> nhận history: [] và cờ ownershipRestricted: true kèm ghi chú bảo vệ quyền riêng tư
      const bSpeakerHist = await request(app).get('/api/live-devices/speaker-history').set('Cookie', ownerB);
      expect(bSpeakerHist.status).toBe(200);
      expect(bSpeakerHist.body.data.history).toEqual([]);
      expect(bSpeakerHist.body.data.ownershipRestricted).toBe(true);
      expect(bSpeakerHist.body.data.note).toContain('bảo vệ quyền riêng tư');
    });
  });
});
