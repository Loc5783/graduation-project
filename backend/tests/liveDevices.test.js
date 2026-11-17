import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLiveDeviceRouter, normalizeLiveDevices } from '../src/routes/liveDeviceRoutes.js';

const sample = age => ({ 'environment-sensor': { brokerConnected: true, fresh: true, telemetryAgeSeconds: age,
  telemetry: { data: { temperature: 28.9, humidity: 49.6, gasRaw: 326, alertLevel: 1, password: 'never-export', battery: 98 } } } });
describe('Authenticated local gateway device readings', () => {
  it('keeps actual values, strips unknown/private fields and does not fabricate missing readings', () => {
    const list = normalizeLiveDevices(sample(1));
    expect(list.find(d => d.id === 'environment-sensor').data).toEqual({ temperature: 28.9, humidity: 49.6, gasRaw: 326, alertLevel: 1 });
    expect(list.find(d => d.id === 'window-sensor')).toMatchObject({ fresh: false, data: null });
  });
  it('marks stale or disconnected telemetry offline, retaining last actual readings', () => {
    expect(normalizeLiveDevices(sample(15)).find(d => d.id === 'environment-sensor').fresh).toBe(false);
    const raw = sample(1); raw['environment-sensor'].brokerConnected = false;
    expect(normalizeLiveDevices(raw).find(d => d.id === 'environment-sensor')).toMatchObject({ fresh: false, data: { gasRaw: 326 } });
  });
  it('passes door fingerprint health and count but never exports fingerprint templates', () => {
    const raw = { 'smart-door-lock': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 1,
      telemetry: { data: { fingerprintOnline: true, fingerprintBusy: false, fingerprintCount: 2,
        fingerprintTemplate: 'private', fingerprintImage: 'private' } } } };
    const door = normalizeLiveDevices(raw).find(d => d.id === 'smart-door-lock');
    expect(door.data).toEqual({ fingerprintOnline: true, fingerprintBusy: false, fingerprintCount: 2 });
  });
  it('rejects invalid gateway envelope', () => {
    expect(() => normalizeLiveDevices([])).toThrow();
  });
  it('requires real login before fetching the gateway', async () => {
    let called = false;
    const app = express();
    app.use((req, _res, next) => { req.session = {}; next(); });
    app.use('/api/live-devices', createLiveDeviceRouter({ fetchImpl: async () => { called = true; } }));
    // requireAuth expects session middleware; an empty unauthenticated session is sufficient.
    const result = await request(app).get('/api/live-devices');
    expect(result.status).toBe(401);
    expect(called).toBe(false);
  });
  it('returns 503 on gateway failure rather than fake live data', async () => {
    const app = express();
    app.use('/api/live-devices', createLiveDeviceRouter({ auth: (_req, _res, next) => next(), fetchImpl: async () => { throw new Error('offline'); } }));
    const res = await request(app).get('/api/live-devices');
    expect(res.status).toBe(503); expect(res.body.code).toBe('GATEWAY_UNAVAILABLE');
  });
  it('uses the fixed gateway URL and no-store response', async () => {
    let url;
    const app = express();
    app.use('/api/live-devices', createLiveDeviceRouter({ auth: (_req, _res, next) => next(), fetchImpl: async target => {
      url = String(target); return { ok: true, text: async () => JSON.stringify(sample(2)) };
    } }));
    const res = await request(app).get('/api/live-devices?url=http://evil.invalid');
    expect(url).toBe('http://127.0.0.1:8001/api/devices');
    expect(res.headers['cache-control']).toBe('no-store'); expect(res.status).toBe(200);
  });
  it('strips assumed smart-plug metrics (voltage, powerWatt, lightLux) and keeps relay/fan state', () => {
    const raw = {
      'smart-plug': {
        brokerConnected: true,
        fresh: true,
        telemetryAgeSeconds: 2,
        telemetry: {
          relay: 'ON',
          fan: 'OFF',
          auto: true,
          voltage: 220.0,
          powerWatt: 45.0,
          lightLux: 450
        }
      }
    };
    const list = normalizeLiveDevices(raw);
    const plug = list.find(d => d.id === 'smart-plug');
    expect(plug.data).toEqual({ relay: 'ON', fan: 'OFF', auto: true });
    expect(plug.data.voltage).toBeUndefined();
    expect(plug.data.powerWatt).toBeUndefined();
    expect(plug.data.lightLux).toBeUndefined();
  });
  it('proxies authenticated speaker history and strips private fields without allowing write operations', async () => {
    const rawHistory = [
      {
        command: 'BIN_OPEN',
        sequence: 12,
        time: '2026-11-15 13:00:00',
        result: { sent: true, device: 'smart-bin', action: 'open', secretToken: 'forbidden-leak' }
      }
    ];
    let url;
    const app = express();
    app.use('/api/live-devices', createLiveDeviceRouter({
      auth: (_req, _res, next) => next(),
      fetchImpl: async (target) => {
        url = String(target);
        return { ok: true, text: async () => JSON.stringify(rawHistory) };
      }
    }));
    const res = await request(app).get('/api/live-devices/speaker-history');
    expect(url).toBe('http://127.0.0.1:8001/api/history');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.history[0].command).toBe('BIN_OPEN');
    expect(res.body.data.history[0].sequence).toBe(12);
    expect(res.body.data.history[0].result.secretToken).toBeUndefined();
    expect(res.body.data.history[0].result.note).toContain('mechanical execution not confirmed');
  });
});
