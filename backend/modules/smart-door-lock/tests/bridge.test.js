import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSmartDoorLockBridge } from '../bridge.js';
import { SmartDoorLockTelemetry, STATUS_TOPIC, TELEMETRY_TOPIC } from '../telemetry.js';
import { stateMessage, statusMessage } from './fixtures.js';

const stores = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));

function setup(env = { MQTT_URL: 'mqtt://127.0.0.1:1883' }) {
  const telemetry = new SmartDoorLockTelemetry({ sweepMs: 0 });
  stores.push(telemetry);
  const client = new EventEmitter();
  client.subscribe = vi.fn((topics, options, callback) => callback(null, topics.map((topic) => ({ topic, qos: options.qos }))));
  client.end = vi.fn((force, options, callback) => callback());
  client.publish = vi.fn();
  const connect = vi.fn(() => client);
  const bridge = createSmartDoorLockBridge(telemetry, { env, connect, logger: { warn: vi.fn() } });
  return { telemetry, client, connect, bridge };
}

describe('read-only MQTT bridge', () => {
  it('stays disabled without an explicitly configured broker', async () => {
    const { bridge, connect, telemetry } = setup({});
    expect(bridge.start()).toBe(false);
    expect(connect).not.toHaveBeenCalled();
    expect(telemetry.getSnapshot()).toMatchObject({ brokerConnected: false, availability: 'unknown' });
    await bridge.close();
  });

  it('subscribes only to registered sensor topics, ignores retained telemetry and never publishes', async () => {
    const { bridge, client, connect, telemetry } = setup();
    expect(bridge.start()).toBe(true);
    expect(connect).toHaveBeenCalledWith('mqtt://127.0.0.1:1883', expect.objectContaining({ clean: true, rejectUnauthorized: true, queueQoSZero: false }));
    client.emit('connect');
    expect(client.subscribe).toHaveBeenCalledWith([STATUS_TOPIC, TELEMETRY_TOPIC], { qos: 1 }, expect.any(Function));
    client.emit('message', STATUS_TOPIC, Buffer.from(JSON.stringify(statusMessage())), { retain: true });
    expect(telemetry.getSnapshot().fresh).toBe(false);
    client.emit('message', TELEMETRY_TOPIC, Buffer.from(JSON.stringify(stateMessage())), { retain: true });
    expect(telemetry.getSnapshot().state).toBeNull();
    client.emit('message', TELEMETRY_TOPIC, Buffer.from(JSON.stringify(stateMessage())), { retain: false });
    expect(telemetry.getSnapshot().fresh).toBe(true);
    client.emit('offline');
    expect(telemetry.getSnapshot()).toMatchObject({ brokerConnected: false, fresh: false });
    expect(client.publish).not.toHaveBeenCalled();
    await bridge.close();
    expect(client.end).toHaveBeenCalledWith(true, {}, expect.any(Function));
    expect(client.listenerCount('message')).toBe(0);
  });

  it('does not call a refused subscription connected, or accept credential-bearing URLs', async () => {
    const { bridge, client, telemetry } = setup();
    client.subscribe.mockImplementation((topics, options, callback) => callback(null, topics.map((topic) => ({ topic, qos: 128 }))));
    bridge.start();
    client.emit('connect');
    expect(telemetry.getSnapshot().brokerConnected).toBe(false);
    await bridge.close();
    const invalid = setup({ MQTT_URL: 'mqtt://user:secret@localhost' });
    expect(() => invalid.bridge.start()).toThrow('MQTT_USERNAME');
    expect(invalid.connect).not.toHaveBeenCalled();
  });
});
