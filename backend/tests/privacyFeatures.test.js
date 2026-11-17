import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import DeviceObservation from '../src/models/DeviceObservation.js';
import ActivityLog from '../src/models/ActivityLog.js';
import Notification from '../src/models/Notification.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';
import { createDeviceObserver } from '../src/services/deviceObservationService.js';

const DB = 'smart_home_privacy_test';
const ORIGIN = 'http://localhost:5173';
const fixture = { 'smart-bin': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1,
  telemetry: { distanceCm: 9, fillPercent: 72, password: 'never-export' } } };
let app;

async function login(email) {
  expect((await request(app).post('/api/auth/register').set('Origin', ORIGIN)
    .send({ fullName: 'Privacy User', email, password: 'MatKhau@123' })).status).toBe(201);
  const response = await request(app).post('/api/auth/login').set('Origin', ORIGIN)
    .send({ email, password: 'MatKhau@123' });
  expect(response.status).toBe(200);
  return response.headers['set-cookie'];
}

describe('Privacy permissions, access audit and transparency report', () => {
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({ sessionSecret: 'privacy-features-test-secret-long-random-value',
      liveDeviceOptions: { fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(fixture) }) } });
  });
  afterAll(async () => { await disconnectDB(); });
  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await Promise.all([ActivityLog.deleteMany({}), DeviceObservation.deleteMany({}), Notification.deleteMany({}),
      RegisteredDevice.deleteMany({}), User.deleteMany({}), mongoose.connection.db.collection('sessions').deleteMany({})]);
    await RegisteredDevice.create({ code: 'TRTM01', deviceId: 'smart-bin',
      claimSecretHash: await hashPairingSecret('private-pair-bin-12345') });
  });

  it('does not persist telemetry before a device has an owner', async () => {
    const observer = createDeviceObserver({ fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(fixture) }) });
    expect(await observer.poll()).toBe(true);
    expect(await DeviceObservation.countDocuments({ deviceId: 'smart-bin' })).toBe(0);
  });

  it('does not return live readings when the access log cannot be written', async () => {
    const owner = await login('audit.owner@example.com');
    await request(app).post('/api/my-devices/claim').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ code: 'TRTM01', pairingSecret: 'private-pair-bin-12345' });
    await RegisteredDevice.updateOne({ deviceId: 'smart-bin' }, { $set: { claimedAt: new Date(Date.now() - 5000) } });
    const spy = vi.spyOn(ActivityLog, 'updateOne').mockRejectedValueOnce(new Error('audit store unavailable'));
    try {
      const result = await request(app).get('/api/live-devices').set('Cookie', owner);
      expect(result.status).toBe(503);
      expect(JSON.stringify(result.body)).not.toContain('fillPercent');
    } finally { spy.mockRestore(); }
  });

  it('only owner can pause collection; live/history hide readings and observer stops storing', async () => {
    const owner = await login('privacy.owner@example.com');
    const viewer = await login('privacy.viewer@example.com');
    expect((await request(app).post('/api/my-devices/claim').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ code: 'TRTM01', pairingSecret: 'private-pair-bin-12345' })).status).toBe(200);
    const cached = await request(app).get('/api/live-devices').set('Cookie', owner);
    expect(cached.body.data.devices.find(d => d.id === 'smart-bin')).toMatchObject({ data: null, awaitingNewReading: true });
    const cachedObserver = createDeviceObserver({ fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(fixture) }) });
    expect(await cachedObserver.poll()).toBe(true);
    expect(await DeviceObservation.countDocuments({ deviceId: 'smart-bin' })).toBe(0);
    await RegisteredDevice.updateOne({ deviceId: 'smart-bin' }, { $set: { claimedAt: new Date(Date.now() - 5000) } });
    expect((await request(app).post('/api/my-devices/smart-bin/shares').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ email: 'privacy.viewer@example.com' })).status).toBe(200);
    const read = await request(app).get('/api/live-devices').set('Cookie', viewer);
    expect(read.body.data.devices.find(d => d.id === 'smart-bin').data).toMatchObject({ fillPercent: 72 });
    expect((await request(app).patch('/api/my-devices/smart-bin/collection').set('Origin', ORIGIN).set('Cookie', viewer)
      .send({ enabled: false })).status).toBe(403);
    expect((await request(app).patch('/api/my-devices/smart-bin/collection').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ enabled: false })).status).toBe(200);
    const paused = await request(app).get('/api/live-devices').set('Cookie', viewer);
    expect(paused.body.data.devices.find(d => d.id === 'smart-bin')).toMatchObject({ data: null, collectionEnabled: false });
    const history = await request(app).get('/api/device-history/smart-bin').set('Cookie', viewer);
    expect(history.body.data.items).toEqual([]);
    const observer = createDeviceObserver({ fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(fixture) }) });
    expect(await observer.poll()).toBe(true);
    expect(await DeviceObservation.countDocuments({ deviceId: 'smart-bin' })).toBe(0);
    expect((await request(app).patch('/api/my-devices/smart-bin/collection').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ enabled: true })).status).toBe(200);
    expect(await observer.poll()).toBe(true);
    expect(await DeviceObservation.countDocuments({ deviceId: 'smart-bin' })).toBe(1);
  });

  it('records viewer reads, alerts owner after revoked access and scopes report to owner', async () => {
    const owner = await login('report.owner@example.com');
    const viewer = await login('report.viewer@example.com');
    await request(app).post('/api/my-devices/claim').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ code: 'TRTM01', pairingSecret: 'private-pair-bin-12345' });
    await RegisteredDevice.updateOne({ deviceId: 'smart-bin' }, { $set: { claimedAt: new Date(Date.now() - 5000) } });
    const viewerDoc = await User.findOne({ email: 'report.viewer@example.com' });
    await request(app).post('/api/my-devices/smart-bin/shares').set('Origin', ORIGIN).set('Cookie', owner)
      .send({ email: 'report.viewer@example.com' });
    await request(app).get('/api/live-devices').set('Cookie', viewer);
    const report = await request(app).get('/api/privacy-data/report').set('Cookie', owner);
    expect(report.status).toBe(200);
    expect(report.body.data.devices).toEqual([expect.objectContaining({ id: 'smart-bin', viewerCount: 1 })]);
    expect(report.body.data.sharingTimeline.at(-1).count).toBeGreaterThanOrEqual(1);
    expect(report.body.data.recentAccess).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'DEVICE_DATA_READ' })]));
    const csv = await request(app).get('/api/privacy-data/export.csv').set('Cookie', owner);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('collectedFields');
    expect(csv.text).toContain('DEVICE_DATA_READ');
    expect(csv.text).not.toContain('never-export');
    await request(app).delete(`/api/my-devices/smart-bin/shares/${viewerDoc._id}`).set('Origin', ORIGIN).set('Cookie', owner);
    expect((await request(app).get('/api/device-history/smart-bin').set('Cookie', viewer)).status).toBe(403);
    expect(await ActivityLog.countDocuments({ action: 'UNUSUAL_DATA_ACCESS', actorId: viewerDoc._id })).toBe(1);
    const ownerDoc = await User.findOne({ email: 'report.owner@example.com' });
    expect(await Notification.countDocuments({ userId: ownerDoc._id, eventCode: 'UNUSUAL_DATA_ACCESS' })).toBe(1);
    const otherReport = await request(app).get('/api/privacy-data/report').set('Cookie', viewer);
    expect(otherReport.body.data.devices).toEqual([]);
    expect(otherReport.body.data.recentAccess).toEqual([]);
  });
});
