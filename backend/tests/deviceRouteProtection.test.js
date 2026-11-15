import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import http from 'http';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';

const DB = 'smart_home_privacy_test';
const ORIGIN = 'http://localhost:5173';
let app;

async function registerAndLogin(email, name = 'User') {
  const password = 'MatKhau@123';
  const reg = await request(app).post('/api/auth/register').set('Origin', ORIGIN).send({ fullName: name, email, password });
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
  expect(login.status).toBe(200);
  return { cookie: login.headers['set-cookie'], user: reg.body.data.user };
}

describe('Lock all read and control pathways according to RegisteredDevice RBAC', () => {
  const mockGatewayTelemetry = {
    'smart-bin': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 2, telemetry: { lidOpen: false, fillPercent: 45 } },
    'smart-door-lock': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1, telemetry: { doorOpen: false } },
    'smart-speaker': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1, telemetry: {} },
    'window-sensor': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1, telemetry: { doorOpen: false } },
    'smart-plug': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 2, telemetry: { relay: 'OFF', fan: 'OFF' } },
    'environment-sensor': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1, telemetry: { temperature: 27.5, humidity: 55 } }
  };

  const mockFetch = async (target) => {
    const url = String(target);
    if (url.includes('/api/devices')) {
      return { ok: true, text: async () => JSON.stringify(mockGatewayTelemetry) };
    }
    if (url.includes('/api/history')) {
      return { ok: true, text: async () => JSON.stringify([{ command: 'STATUS', sequence: 1, time: '2026-11-15' }]) };
    }
    return { ok: false, status: 404 };
  };

  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({
      sessionSecret: 'route-protection-test-secret-long-random-string',
      liveDeviceOptions: { fetchImpl: mockFetch },
      myDeviceOptions: { limiter: (_req, _res, next) => next() },
      environmentSensorOptions: { heartbeatMs: 60 }
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await RegisteredDevice.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});
  });

  it('1. Anonymous requests are rejected with 401 across all read and control endpoints', async () => {
    expect((await request(app).get('/api/live-devices')).status).toBe(401);
    expect((await request(app).get('/api/live-devices/speaker-history')).status).toBe(401);
    expect((await request(app).get('/api/device-history/smart-plug')).status).toBe(401);
    expect((await request(app).get('/api/devices/smart-plug/state')).status).toBe(401);
    expect((await request(app).get('/api/devices/smart-plug/history')).status).toBe(401);
    expect((await request(app).post('/api/devices/smart-plug/relay').set('Origin', ORIGIN).send({ state: 'ON' })).status).toBe(401);
    expect((await request(app).get('/api/environment-sensor/state')).status).toBe(401);
  });

  it('2. New account with no claimed devices receives empty live devices and 403 on specific devices', async () => {
    const { cookie } = await registerAndLogin('newbie@example.com', 'New User');

    // GET /api/live-devices returns empty array
    const live = await request(app).get('/api/live-devices').set('Cookie', cookie);
    expect(live.status).toBe(200);
    expect(live.body.data.devices).toEqual([]);

    // Specific endpoints return 403
    expect((await request(app).get('/api/live-devices/speaker-history').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/api/device-history/window-sensor').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/api/devices/smart-plug/state').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/api/devices/smart-plug/history').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).post('/api/devices/smart-plug/relay').set('Cookie', cookie).set('Origin', ORIGIN).send({ state: 'ON' })).status).toBe(403);
    expect((await request(app).get('/api/environment-sensor/state').set('Cookie', cookie)).status).toBe(403);
  });

  it('3. Owner sees only claimed devices; viewer gets read-only; revocation takes immediate effect', async () => {
    const owner = await registerAndLogin('owner@example.com', 'Owner User');
    const viewer = await registerAndLogin('viewer@example.com', 'Viewer User');

    // Provision smart-plug and smart-bin
    await RegisteredDevice.create({
      code: 'OCTM01',
      deviceId: 'smart-plug',
      claimSecretHash: await hashPairingSecret('pairing-secret-smart-plug-1234'),
      ownerUserId: owner.user.id,
      claimedAt: new Date()
    });
    await RegisteredDevice.create({
      code: 'TRTM01',
      deviceId: 'smart-bin',
      claimSecretHash: await hashPairingSecret('pairing-secret-smart-bin-1234'),
      ownerUserId: owner.user.id,
      claimedAt: new Date()
    });

    // Owner reads live-devices: sees ONLY smart-plug and smart-bin (not door-lock, speaker, window, env)
    const ownerLive = await request(app).get('/api/live-devices').set('Cookie', owner.cookie);
    expect(ownerLive.status).toBe(200);
    const ownerDeviceIds = ownerLive.body.data.devices.map((d) => d.id).sort();
    expect(ownerDeviceIds).toEqual(['smart-bin', 'smart-plug']);

    // Owner controls smart-plug relay -> 200
    const ownerRelay = await request(app).post('/api/devices/smart-plug/relay').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ state: 'ON' });
    expect(ownerRelay.status).toBe(200);

    // Viewer currently has 0 devices
    const viewerLiveBefore = await request(app).get('/api/live-devices').set('Cookie', viewer.cookie);
    expect(viewerLiveBefore.body.data.devices).toEqual([]);

    // Owner shares smart-plug with viewer
    const shareRes = await request(app).post('/api/my-devices/smart-plug/shares').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ email: 'viewer@example.com' });
    expect(shareRes.status).toBe(200);

    // Viewer now sees smart-plug in live-devices (and ONLY smart-plug)
    const viewerLiveAfter = await request(app).get('/api/live-devices').set('Cookie', viewer.cookie);
    expect(viewerLiveAfter.body.data.devices.map((d) => d.id)).toEqual(['smart-plug']);

    // Viewer can read smart-plug state
    const viewerState = await request(app).get('/api/devices/smart-plug/state').set('Cookie', viewer.cookie);
    expect(viewerState.status).toBe(200);

    // Viewer CANNOT control smart-plug relay -> 403 FORBIDDEN
    const viewerRelay = await request(app).post('/api/devices/smart-plug/relay').set('Cookie', viewer.cookie).set('Origin', ORIGIN).send({ state: 'OFF' });
    expect(viewerRelay.status).toBe(403);
    expect(viewerRelay.body.code).toBe('FORBIDDEN');

    // Owner revokes viewer
    const revokeRes = await request(app).delete(`/api/my-devices/smart-plug/shares/${viewer.user.id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN);
    expect(revokeRes.status).toBe(200);

    // Immediately on next request, viewer loses access:
    // GET /api/devices/smart-plug/state -> 403
    expect((await request(app).get('/api/devices/smart-plug/state').set('Cookie', viewer.cookie)).status).toBe(403);
    // GET /api/live-devices -> []
    expect((await request(app).get('/api/live-devices').set('Cookie', viewer.cookie)).body.data.devices).toEqual([]);
  });

  it('4. Admin does NOT automatically inherit access to devices of other users', async () => {
    const owner = await registerAndLogin('homeowner@example.com', 'Home Owner');
    const admin = await registerAndLogin('admin@example.com', 'System Admin');
    await User.updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } });

    await RegisteredDevice.create({
      code: 'CBMT01',
      deviceId: 'environment-sensor',
      claimSecretHash: await hashPairingSecret('pairing-secret-sensor-1234'),
      ownerUserId: owner.user.id,
      claimedAt: new Date()
    });

    // Admin calling live-devices receives empty array
    const adminLive = await request(app).get('/api/live-devices').set('Cookie', admin.cookie);
    expect(adminLive.status).toBe(200);
    expect(adminLive.body.data.devices).toEqual([]);

    // Admin calling environment-sensor/state receives 403
    const adminEnv = await request(app).get('/api/environment-sensor/state').set('Cookie', admin.cookie);
    expect(adminEnv.status).toBe(403);
    expect(adminEnv.body.code).toBe('FORBIDDEN');
  });

  it('5. Environment sensor SSE stream is closed on the next heartbeat when view access is revoked during hardware silence', async () => {
    const owner = await registerAndLogin('envowner@example.com', 'Env Owner');
    const viewer = await registerAndLogin('envviewer@example.com', 'Env Viewer');

    // Create environment sensor owned by owner and shared with viewer
    await RegisteredDevice.create({
      code: 'CBMT01',
      deviceId: 'environment-sensor',
      claimSecretHash: await hashPairingSecret('pairing-secret-sensor-5678'),
      ownerUserId: owner.user.id,
      viewerUserIds: [viewer.user.id],
      claimedAt: new Date()
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
      let receivedData = '';
      let streamEnded = false;

      const sseReq = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/environment-sensor/events',
        method: 'GET',
        headers: {
          Cookie: viewer.cookie,
          Accept: 'text/event-stream'
        }
      }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          receivedData += chunk;
        });
        res.on('end', () => {
          streamEnded = true;
        });
      });

      sseReq.end();

      // Đợi nhận bản tin khởi tạo retry/snapshot
      await new Promise((r) => setTimeout(r, 80));
      expect(receivedData).toContain('retry: 3000');

      // Trong khi phần cứng hoàn toàn IM LẶNG (không phát bất kỳ telemetry nào),
      // Chủ sở hữu thực hiện thu hồi quyền xem của viewer
      const revokeRes = await request(app)
        .delete(`/api/my-devices/environment-sensor/shares/${viewer.user.id}`)
        .set('Cookie', owner.cookie)
        .set('Origin', ORIGIN);
      expect(revokeRes.status).toBe(200);

      // Heartbeat tiếp theo (~60ms) định kỳ kiểm tra lại quyền, phát hiện mất quyền -> đóng luồng
      const startWait = Date.now();
      while (!streamEnded && Date.now() - startWait < 1500) {
        await new Promise((r) => setTimeout(r, 40));
      }

      expect(streamEnded).toBe(true);
      expect(receivedData).toContain('event: session-expired');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
