import { afterEach, describe, expect, it } from 'vitest';
import { normalizeTelemetry, normalizeStatus, SmartDoorLockTelemetry } from '../telemetry.js';
import { stateMessage, eventMessage, statusMessage } from './fixtures.js';

const stores = [];
function createStore(options) {
  const store = new SmartDoorLockTelemetry({ sweepMs: 0, ...options });
  stores.push(store);
  store.setBrokerConnected(true);
  return store;
}
afterEach(() => stores.splice(0).forEach((store) => store.close()));

describe('Smart Door Lock allowlisted telemetry contract', () => {
  it('preserves every supported sensor and drops credential/unknown fields at all levels', () => {
    const input = stateMessage({ pin: 'DO_NOT_EXPORT', data: {
      pin: 'DO_NOT_EXPORT', uid: 'DO_NOT_EXPORT', template: 'DO_NOT_EXPORT',
      vibration: { installed: true, raw: 0, active: true, triggerCount: 2, secret: 'DO_NOT_EXPORT' }
    } });
    const result = normalizeTelemetry(Buffer.from(JSON.stringify(input)));
    expect(result.data.vibration).toEqual({ installed: true, raw: 0, active: true, triggerCount: 2 });
    expect(result.data).toMatchObject({ doorRaw: 0, cdsRaw: 1, rfidCards: 2, fingerprintCount: 1 });
    expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPORT');
    expect(normalizeTelemetry(eventMessage({ uid: 'DO_NOT_EXPORT' }))).toEqual(eventMessage());
  });

  it.each([
    stateMessage({ schemaVersion: 2 }), stateMessage({ deviceId: 'window-sensor' }),
    stateMessage({ bootId: '../../bad' }), stateMessage({ sequence: -1 }),
    stateMessage({ uptimeMs: 0x100000000 }), stateMessage({ data: { doorOpen: 'false' } }),
    stateMessage({ data: { fingerprintCount: 128 } }), stateMessage({ data: { rfidCards: 25 } }),
    stateMessage({ data: { boltFeedbackAvailable: true } }), stateMessage({ data: { keypadConfigured: false } }),
    stateMessage({ data: { vibration: { installed: false, raw: 0, active: false, triggerCount: 0 } } }),
    stateMessage({ data: { firmware: '<script>' } }), eventMessage({ code: 'UNKNOWN_CARD_AD8ECA06' }),
    '{"broken":', Buffer.alloc(8193)
  ])('rejects malformed or unsupported payload %#', (payload) => {
    expect(normalizeTelemetry(payload)).toBeNull();
  });

  it('validates status and strips extra data', () => {
    expect(normalizeStatus(statusMessage({ pin: 'secret' }))).toEqual(statusMessage());
    expect(normalizeStatus(statusMessage({ online: 'true' }))).toBeNull();
  });
});

describe('live read model freshness and ordering', () => {
  it('never treats retained status, retained telemetry, or events as a fresh sensor heartbeat', () => {
    let now = 100000;
    const store = createStore({ now: () => now });
    store.ingestStatus(statusMessage());
    expect(store.getSnapshot()).toMatchObject({ brokerConnected: true, availability: 'online', fresh: false, state: null });
    expect(store.ingestTelemetry(stateMessage(), { retain: true })).toBe(false);
    store.ingestTelemetry(eventMessage());
    expect(store.getSnapshot().fresh).toBe(false);
    store.ingestTelemetry(stateMessage({ sequence: 3 }));
    expect(store.getSnapshot().fresh).toBe(true);
    now += 7000;
    store.expire();
    expect(store.getSnapshot()).toMatchObject({ availability: 'offline', fresh: false });
    store.ingestStatus(statusMessage());
    expect(store.getSnapshot().fresh).toBe(false);
  });

  it('ignores duplicates, old messages/boots and supports uint32 wrap', () => {
    const store = createStore();
    expect(store.ingestTelemetry(stateMessage({ sequence: 0xfffffffe }))).toBe(true);
    expect(store.ingestTelemetry(eventMessage({ sequence: 0xffffffff }))).toBe(true);
    expect(store.ingestTelemetry(stateMessage({ sequence: 0 }))).toBe(true);
    expect(store.ingestTelemetry(stateMessage({ sequence: 0 }))).toBe(false);
    expect(store.ingestTelemetry(eventMessage({ sequence: 0xfffffffd }))).toBe(false);
    expect(store.ingestTelemetry(stateMessage({ bootId: '11223344' }))).toBe(true);
    expect(store.ingestTelemetry(stateMessage({ sequence: 2 }))).toBe(false);
    expect(store.ingestStatus(statusMessage({ online: false }))).toBe(false);
    expect(store.getSnapshot().state.bootId).toBe('11223344');
  });

  it('marks disconnection offline and requires a new state on reconnect', () => {
    const store = createStore();
    store.ingestTelemetry(stateMessage());
    store.setBrokerConnected(false);
    expect(store.getSnapshot()).toMatchObject({ brokerConnected: false, availability: 'offline', fresh: false });
    store.setBrokerConnected(true);
    store.ingestStatus(statusMessage());
    expect(store.getSnapshot().fresh).toBe(false);
    store.ingestTelemetry(stateMessage({ sequence: 2 }));
    expect(store.getSnapshot().fresh).toBe(true);
  });

  it('limits history to 64 events and prevents a consumer from mutating the store', () => {
    const store = createStore();
    store.ingestTelemetry(stateMessage());
    for (let sequence = 2; sequence <= 80; sequence++) store.ingestTelemetry(eventMessage({ sequence }));
    const snapshot = store.getSnapshot();
    expect(snapshot.events).toHaveLength(64);
    expect(snapshot.events[0].sequence).toBe(80);
    snapshot.events.length = 0;
    snapshot.state.data.doorOpen = true;
    expect(store.getSnapshot().events).toHaveLength(64);
    expect(store.getSnapshot().state.data.doorOpen).toBe(false);
  });
});
