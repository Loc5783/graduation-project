import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { createDeviceObserver } from '../src/services/deviceObservationService.js';
import DeviceObservation from '../src/models/DeviceObservation.js';
import User from '../src/models/User.js';
import Notification from '../src/models/Notification.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';

const DB = 'smart_home_privacy_test';
let app;

describe('durable device observations', () => {
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({ sessionSecret: 'device-history-test-secret-long-random-value' });
  });
  afterAll(async () => { await disconnectDB(); });
  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await DeviceObservation.deleteMany({});
    await Notification.deleteMany({});
    await User.deleteMany({});
    await RegisteredDevice.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});
  });

  it('records genuine allowlisted gateway readings and serves them after observer recreation', async () => {
    const password = 'MatKhau@123';
    await request(app).post('/api/auth/register').set('Origin', 'http://localhost:5173')
      .send({ fullName: 'History User', email: 'history.user@example.com', password });
    const login = await request(app).post('/api/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'history.user@example.com', password });
    const userDoc = await User.findOne({ email: 'history.user@example.com' });
    expect((await request(app).get('/api/device-history/window-sensor').set('Cookie', login.headers['set-cookie'])).status).toBe(403);
    await RegisteredDevice.create({ code: 'CBCC01', deviceId: 'window-sensor',
      claimSecretHash: await hashPairingSecret('pairing-secret-window-1234'),
      ownerUserId: userDoc._id, claimedAt: new Date(Date.now() - 60000) });
    const body = { 'window-sensor': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1,
      telemetry: { doorOpen: true, motion: false, password: 'never-export' } } };
    const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify(body) });
    const observer = createDeviceObserver({ fetchImpl });
    expect(await observer.poll()).toBe(true);
    expect(await DeviceObservation.countDocuments({ deviceId: 'window-sensor' })).toBe(1);
    expect(await observer.poll()).toBe(true);
    expect(await DeviceObservation.countDocuments({ deviceId: 'window-sensor' })).toBe(1);
    expect((await request(app).get('/api/device-history/window-sensor')).status).toBe(401);
    const result = await request(app).get('/api/device-history/window-sensor').set('Cookie', login.headers['set-cookie']);
    expect(result.status).toBe(200);
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.items[0].data).toMatchObject({ doorOpen: true, motion: false });
    expect(JSON.stringify(result.body)).not.toContain('never-export');
  });

  it('stores an offline transition without inventing an offline reading', async () => {
    await RegisteredDevice.create({ code: 'CBCC01', deviceId: 'window-sensor',
      claimSecretHash: await hashPairingSecret('pairing-secret-window-1234'),
      ownerUserId: new mongoose.Types.ObjectId(), claimedAt: new Date(Date.now() - 60000) });
    let live = true;
    const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({
      'window-sensor': { brokerConnected: true, fresh: live, telemetryAgeSeconds: live ? 1 : 16,
        telemetry: { doorOpen: false } }
    }) });
    const observer = createDeviceObserver({ fetchImpl });
    await observer.poll();
    live = false;
    await observer.poll();
    const rows = await DeviceObservation.find({ deviceId: 'window-sensor' }).sort({ observedAt: 1 }).lean();
    expect(rows).toHaveLength(2);
    expect(rows[1].fresh).toBe(false);
    expect(rows[1].data.doorOpen).toBe(false); // last known value, explicitly marked stale
  });

  it('notifies only responsible users for a real alert and an offline transition', async () => {
    const admin = await User.create({ name: 'History Admin', email: 'history.admin@example.com', passwordHash: 'test-hash', role: 'admin' });
    const owner = await User.create({ name: 'Window Owner', email: 'history.owner@example.com', passwordHash: 'test-hash', role: 'member', owned: [] });
    const sharedViewer = await User.create({ name: 'Shared Viewer', email: 'shared.viewer@example.com', passwordHash: 'test-hash', role: 'viewer' });
    const otherViewer = await User.create({ name: 'Other Viewer', email: 'history.viewer@example.com', passwordHash: 'test-hash', role: 'viewer' });

    await RegisteredDevice.create({
      code: 'CBCC01',
      deviceId: 'window-sensor',
      claimSecretHash: await hashPairingSecret('pairing-secret-window-1234'),
      ownerUserId: owner._id,
      viewerUserIds: [sharedViewer._id],
      claimedAt: new Date()
    });

    let alarm = false;
    let fresh = true;
    const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({ 'window-sensor': {
      brokerConnected: true, fresh, telemetryAgeSeconds: fresh ? 1 : 16,
      telemetry: { doorOpen: true, alarm }
    } }) });
    const observer = createDeviceObserver({ fetchImpl });
    await observer.poll();
    alarm = true;
    await observer.poll();
    fresh = false;
    await observer.poll();

    // Chủ sở hữu và người được chia sẻ nhận được 2 thông báo (cảnh báo + mất kết nối)
    expect(await Notification.countDocuments({ userId: owner._id })).toBe(2);
    expect(await Notification.countDocuments({ userId: sharedViewer._id })).toBe(2);

    // Admin và người dùng khác KHÔNG nhận thông báo thiết bị của người khác
    expect(await Notification.countDocuments({ userId: admin._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: otherViewer._id })).toBe(0);

    const alert = await Notification.findOne({ userId: owner._id, eventCode: 'DEVICE_ALERT' });
    expect(alert.params).toMatchObject({ deviceId: 'window-sensor', alertKind: 'WINDOW_ALARM' });
  });
});
