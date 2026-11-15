import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';

const DB = 'smart_home_privacy_test';
const ORIGIN = 'http://localhost:5173';
const SECRET = 'private-pair-code-123';
let app;

async function registerAndLogin(email) {
  const password = 'MatKhau@123';
  const reg = await request(app).post('/api/auth/register').set('Origin', ORIGIN).send({ fullName: 'Device User', email, password });
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
  expect(login.status).toBe(200);
  return login.headers['set-cookie'];
}

describe('per-device ownership and read-only sharing', () => {
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({ sessionSecret: 'device-access-test-secret-long-random-value', myDeviceOptions: { limiter: (_req, _res, next) => next() } });
  });
  afterAll(async () => { await disconnectDB(); });
  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await RegisteredDevice.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});
    await RegisteredDevice.create({ code: 'TRTM01', deviceId: 'smart-bin', claimSecretHash: await hashPairingSecret(SECRET) });
  });

  it('starts empty, claims with both codes, and lets only owner share/revoke a read-only view', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const viewer = await registerAndLogin('viewer@example.com');
    const outsider = await registerAndLogin('outsider@example.com');
    expect((await request(app).get('/api/my-devices').set('Cookie', owner)).body.data.devices).toEqual([]);
    expect((await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: 'wrong-pair-code' })).status).toBe(400);
    const claim = await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: SECRET });
    expect(claim.status).toBe(200);
    expect(claim.body.data).toMatchObject({ id: 'smart-bin', access: 'owner' });
    expect((await request(app).get('/api/my-devices').set('Cookie', viewer)).body.data.devices).toEqual([]);
    expect((await request(app).post('/api/my-devices/claim').set('Cookie', outsider).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: SECRET })).status).toBe(409);
    const share = await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', owner).set('Origin', ORIGIN)
      .send({ email: 'viewer@example.com' });
    expect(share.status).toBe(200);
    expect((await request(app).get('/api/my-devices').set('Cookie', viewer)).body.data.devices).toMatchObject([{ id: 'smart-bin', access: 'viewer' }]);
    expect((await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', viewer).set('Origin', ORIGIN)
      .send({ email: 'outsider@example.com' })).status).toBe(404);
    expect((await request(app).get('/api/my-devices/smart-bin/shares').set('Cookie', viewer)).status).toBe(404);
    const viewerDoc = await User.findOne({ email: 'viewer@example.com' });
    expect((await request(app).delete(`/api/my-devices/smart-bin/shares/${viewerDoc._id}`).set('Cookie', owner).set('Origin', ORIGIN)).status).toBe(200);
    expect((await request(app).get('/api/my-devices').set('Cookie', viewer)).body.data.devices).toEqual([]);
  });

  it('requires login, JSON and trusted Origin for claiming', async () => {
    expect((await request(app).get('/api/my-devices')).status).toBe(401);
    const owner = await registerAndLogin('owner2@example.com');
    expect((await request(app).post('/api/my-devices/claim').set('Cookie', owner)
      .send({ code: 'TRTM01', pairingSecret: SECRET })).status).toBe(403);
    expect((await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN)
      .set('Content-Type', 'text/plain').send('TRTM01')).status).toBe(415);
  });

  it('handles concurrent claims, re-claiming, self-share, and duplicate share', async () => {
    const userA = await registerAndLogin('usera@example.com');
    const userB = await registerAndLogin('userb@example.com');

    // Claim đồng thời từ hai người dùng khác nhau trên cùng một thiết bị chưa ai sở hữu
    const [resA, resB] = await Promise.all([
      request(app).post('/api/my-devices/claim').set('Cookie', userA).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET }),
      request(app).post('/api/my-devices/claim').set('Cookie', userB).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winningCookie = resA.status === 200 ? userA : userB;
    const losingCookie = resA.status === 200 ? userB : userA;
    const winningEmail = resA.status === 200 ? 'usera@example.com' : 'userb@example.com';
    const losingEmail = resA.status === 200 ? 'userb@example.com' : 'usera@example.com';

    // Người thắng claim lại: thành công idempotent (200)
    const reclaim = await request(app).post('/api/my-devices/claim').set('Cookie', winningCookie).set('Origin', ORIGIN).send({ code: 'TRTM01', pairingSecret: SECRET });
    expect(reclaim.status).toBe(200);
    expect(reclaim.body.data).toMatchObject({ id: 'smart-bin', access: 'owner' });

    // Không được tự chia sẻ cho chính mình (400 CANNOT_SHARE_SELF)
    const selfShare = await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', winningCookie).set('Origin', ORIGIN).send({ email: winningEmail });
    expect(selfShare.status).toBe(400);
    expect(selfShare.body.code).toBe('CANNOT_SHARE_SELF');

    // Chia sẻ cho người khác
    const share1 = await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', winningCookie).set('Origin', ORIGIN).send({ email: losingEmail });
    expect(share1.status).toBe(200);

    // Chia sẻ trùng email: idempotent (200)
    const shareDup = await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', winningCookie).set('Origin', ORIGIN).send({ email: losingEmail });
    expect(shareDup.status).toBe(200);

    // Chia sẻ cho email không tồn tại trong hệ thống: 404 USER_NOT_FOUND
    const shareNotFound = await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', winningCookie).set('Origin', ORIGIN).send({ email: 'ghost@example.com' });
    expect(shareNotFound.status).toBe(404);
    expect(shareNotFound.body.code).toBe('USER_NOT_FOUND');
  });

  it('prohibits viewer and admin without device ownership from viewing or controlling', async () => {
    // Tạo admin user nhưng không được gán claim/viewer của smart-bin
    const adminCookie = await registerAndLogin('admin@example.com');
    await User.updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } });

    // Admin không có thiết bị -> GET /api/my-devices trả về mảng rỗng
    const adminDevices = await request(app).get('/api/my-devices').set('Cookie', adminCookie);
    expect(adminDevices.status).toBe(200);
    expect(adminDevices.body.data.devices).toEqual([]);

    // Admin không được chia sẻ thiết bị của người khác
    const adminShare = await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', adminCookie).set('Origin', ORIGIN).send({ email: 'viewer@example.com' });
    expect(adminShare.status).toBe(404);
  });

  it('rejects claim requests missing pairingSecret, having short secret, or having invalid structure', async () => {
    const user = await registerAndLogin('claimcheck@example.com');

    // 1. Thiếu hoàn toàn trường pairingSecret
    const resNoSecret = await request(app).post('/api/my-devices/claim')
      .set('Cookie', user).set('Origin', ORIGIN)
      .send({ code: 'TRTM01' });
    expect(resNoSecret.status).toBe(400);
    expect(resNoSecret.body.code).toBe('INVALID_CLAIM');

    // 2. pairingSecret là chuỗi rỗng
    const resEmptySecret = await request(app).post('/api/my-devices/claim')
      .set('Cookie', user).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: '' });
    expect(resEmptySecret.status).toBe(400);
    expect(resEmptySecret.body.code).toBe('INVALID_CLAIM');

    // 3. pairingSecret ngắn hơn 12 ký tự
    const resShortSecret = await request(app).post('/api/my-devices/claim')
      .set('Cookie', user).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: 'short-123' });
    expect(resShortSecret.status).toBe(400);
    expect(resShortSecret.body.code).toBe('INVALID_CLAIM');

    // 4. Thiếu trường code
    const resNoCode = await request(app).post('/api/my-devices/claim')
      .set('Cookie', user).set('Origin', ORIGIN)
      .send({ pairingSecret: SECRET });
    expect(resNoCode.status).toBe(400);
    expect(resNoCode.body.code).toBe('INVALID_CLAIM');

    // 5. Thừa trường không mong muốn
    const resExtraField = await request(app).post('/api/my-devices/claim')
      .set('Cookie', user).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: SECRET, extra: true });
    expect(resExtraField.status).toBe(400);
    expect(resExtraField.body.code).toBe('INVALID_CLAIM');
  });

  it('supports multiple shared devices and immediate removal upon revocation', async () => {
    const DOOR_SECRET = 'door-lock-pairing-secret-999';
    await RegisteredDevice.create({ code: 'KCTM01', deviceId: 'smart-door-lock', claimSecretHash: await hashPairingSecret(DOOR_SECRET) });

    const owner = await registerAndLogin('multidevice-owner@example.com');
    const viewer = await registerAndLogin('multidevice-viewer@example.com');

    // Owner claim cả 2 thiết bị: TRTM01 và KCTM01
    const claim1 = await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN)
      .send({ code: 'TRTM01', pairingSecret: SECRET });
    expect(claim1.status).toBe(200);

    const claim2 = await request(app).post('/api/my-devices/claim').set('Cookie', owner).set('Origin', ORIGIN)
      .send({ code: 'KCTM01', pairingSecret: DOOR_SECRET });
    expect(claim2.status).toBe(200);

    // Ban đầu viewer chưa có thiết bị nào
    const viewerInit = await request(app).get('/api/my-devices').set('Cookie', viewer);
    expect(viewerInit.body.data.devices).toEqual([]);

    // Owner chia sẻ cả 2 thiết bị cho viewer
    await request(app).post('/api/my-devices/smart-bin/shares').set('Cookie', owner).set('Origin', ORIGIN).send({ email: 'multidevice-viewer@example.com' });
    await request(app).post('/api/my-devices/smart-door-lock/shares').set('Cookie', owner).set('Origin', ORIGIN).send({ email: 'multidevice-viewer@example.com' });

    // Viewer thấy cả 2 thiết bị với quyền 'viewer'
    const viewerBoth = await request(app).get('/api/my-devices').set('Cookie', viewer);
    expect(viewerBoth.status).toBe(200);
    const viewerDeviceIds = viewerBoth.body.data.devices.map(d => d.id).sort();
    expect(viewerDeviceIds).toEqual(['smart-bin', 'smart-door-lock']);
    expect(viewerBoth.body.data.devices.every(d => d.access === 'viewer')).toBe(true);

    // Owner thu hồi quyền xem smart-bin
    const viewerDoc = await User.findOne({ email: 'multidevice-viewer@example.com' });
    const revoke1 = await request(app).delete(`/api/my-devices/smart-bin/shares/${viewerDoc._id}`).set('Cookie', owner).set('Origin', ORIGIN);
    expect(revoke1.status).toBe(200);

    // Viewer lập tức chỉ còn lại smart-door-lock
    const viewerAfterRevoke1 = await request(app).get('/api/my-devices').set('Cookie', viewer);
    expect(viewerAfterRevoke1.body.data.devices.map(d => d.id)).toEqual(['smart-door-lock']);

    // Owner thu hồi nốt smart-door-lock
    const revoke2 = await request(app).delete(`/api/my-devices/smart-door-lock/shares/${viewerDoc._id}`).set('Cookie', owner).set('Origin', ORIGIN);
    expect(revoke2.status).toBe(200);

    // Viewer lập tức không còn thiết bị nào ([])
    const viewerAfterRevoke2 = await request(app).get('/api/my-devices').set('Cookie', viewer);
    expect(viewerAfterRevoke2.body.data.devices).toEqual([]);
  });
});
