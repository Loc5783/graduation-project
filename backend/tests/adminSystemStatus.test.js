import { describe, expect, it } from 'vitest';
import { createSystemStatusHandler } from '../src/controllers/adminSystemController.js';

function makeRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

describe('admin live system status', () => {
  it('reports gateway-derived freshness only, with no invented measurements', async () => {
    const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({
      'window-sensor': { brokerConnected: true, fresh: true, telemetryAgeSeconds: 2, telemetry: { doorOpen: false } }
    }) });
    const res = makeRes();
    await createSystemStatusHandler({ fetchImpl })({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.devices).toHaveLength(5);
    expect(res.body.data.devices.find((x) => x.id === 'window-sensor')).toMatchObject({ fresh: true, ageSeconds: 2 });
    expect(res.body.data.devices.find((x) => x.id === 'smart-bin')).toMatchObject({ fresh: false, ageSeconds: null });
    expect(JSON.stringify(res.body)).not.toMatch(/powerWatt|cpuUsage|volume|pinCode/i);
  });
  it('returns 503 when gateway cannot be checked', async () => {
    const res = makeRes();
    await createSystemStatusHandler({ fetchImpl: async () => { throw new Error('offline'); } })({}, res);
    expect(res.statusCode).toBe(503);
  });
});
