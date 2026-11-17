import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import ActivityLog from '../src/models/ActivityLog.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';

const DB = 'smart_home_privacy_test';
const ORIGIN = 'http://localhost:5173';
let app;

async function account(email) {
  expect((await request(app).post('/api/auth/register').set('Origin', ORIGIN)
    .send({ fullName: 'Test User', email, password: 'MatKhau@123' })).status).toBe(201);
  const login = await request(app).post('/api/auth/login').set('Origin', ORIGIN)
    .send({ email, password: 'MatKhau@123' });
  expect(login.status).toBe(200);
  return login.headers['set-cookie'];
}

describe('Nhật ký tài khoản và truy cập thiết bị chia sẻ', () => {
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({ sessionSecret: 'activity-test-secret-long-random-key-123' });
  });
  afterAll(async () => { await disconnectDB(); });
  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await ActivityLog.deleteMany({});
    await RegisteredDevice.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});
    await RegisteredDevice.create({ code: 'TRTM01', deviceId: 'smart-bin',
      claimSecretHash: await hashPairingSecret('private-pair-bin-12345') });
  });

  it('mỗi tài khoản chỉ xem đăng ký và đăng nhập của chính mình', async () => {
    const owner = await account('owner@example.com');
    const viewer = await account('viewer@example.com');
    expect((await request(app).post('/api/auth/login').set('Origin', ORIGIN)
      .send({ email: 'owner@example.com', password: 'wrong-password' })).status).toBe(401);
    const own = await request(app).get('/api/account/activity').set('Cookie', owner);
    const other = await request(app).get('/api/account/activity').set('Cookie', viewer);
    expect(own.status).toBe(200);
    expect(own.body.data.items.map((item) => item.action)).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCESS', 'REGISTER']);
    expect(other.body.data.items).toHaveLength(2);
    expect((await request(app).get('/api/account/activity')).status).toBe(401);
  });

  it('chủ thấy chia sẻ, đăng nhập và lượt mở của viewer; viewer không đọc được nhật ký chủ', async () => {
    const owner = await account('owner@example.com');
    const viewer = await account('viewer@example.com');
    expect((await request(app).post('/api/my-devices/claim').set('Origin', ORIGIN)
      .set('Cookie', owner).send({ code: 'TRTM01', pairingSecret: 'private-pair-bin-12345' })).status).toBe(200);
    expect((await request(app).post('/api/my-devices/smart-bin/shares').set('Origin', ORIGIN)
      .set('Cookie', owner).send({ email: 'viewer@example.com' })).status).toBe(200);
    const viewerLogin = await request(app).post('/api/auth/login').set('Origin', ORIGIN)
      .send({ email: 'viewer@example.com', password: 'MatKhau@123' });
    expect(viewerLogin.status).toBe(200);
    expect((await request(app).get('/api/my-devices/smart-bin').set('Cookie', viewer)).status).toBe(200);
    expect((await request(app).get('/api/my-devices/smart-bin').set('Cookie', viewer)).status).toBe(200);
    const activity = await request(app).get('/api/my-devices/smart-bin/activity').set('Cookie', owner);
    expect(activity.status).toBe(200);
    expect(activity.body.data.items.map((item) => item.action)).toEqual(expect.arrayContaining([
      'DEVICE_SHARED', 'SHARED_VIEWER_LOGIN', 'SHARED_DEVICE_VIEW'
    ]));
    expect(activity.body.data.items.find((item) => item.action === 'SHARED_DEVICE_VIEW').actor.email).toBe('viewer@example.com');
    expect(activity.body.data.items.filter((item) => item.action === 'SHARED_DEVICE_VIEW')).toHaveLength(1);
    expect((await request(app).get('/api/my-devices/smart-bin/activity').set('Cookie', viewer)).status).toBe(404);
    expect((await request(app).get('/api/my-devices/smart-bin/activity')).status).toBe(401);
  });

  it('nhật ký của chủ cũ không lộ cho chủ mới sau khi gỡ và nhận lại thiết bị', async () => {
    const oldOwner = await account('old@example.com');
    const newOwner = await account('new@example.com');
    const claim = (cookie) => request(app).post('/api/my-devices/claim').set('Origin', ORIGIN)
      .set('Cookie', cookie).send({ code: 'TRTM01', pairingSecret: 'private-pair-bin-12345' });
    expect((await claim(oldOwner)).status).toBe(200);
    expect((await request(app).post('/api/my-devices/smart-bin/shares').set('Origin', ORIGIN)
      .set('Cookie', oldOwner).send({ email: 'new@example.com' })).status).toBe(200);
    expect((await request(app).post('/api/my-devices/smart-bin/unclaim').set('Origin', ORIGIN)
      .set('Cookie', oldOwner)).status).toBe(200);
    expect((await claim(newOwner)).status).toBe(200);
    const activity = await request(app).get('/api/my-devices/smart-bin/activity').set('Cookie', newOwner);
    expect(activity.status).toBe(200);
    expect(activity.body.data.items).toEqual([]);
    expect((await request(app).get('/api/my-devices/smart-bin/activity').set('Cookie', oldOwner)).status).toBe(404);
  });
});
