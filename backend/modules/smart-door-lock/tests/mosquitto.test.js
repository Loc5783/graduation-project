import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import mqtt from 'mqtt';
import { expect, it, vi } from 'vitest';
import { createSmartDoorLockBridge } from '../bridge.js';
import { createSmartDoorLockRouter } from '../router.js';
import { SmartDoorLockTelemetry, STATUS_TOPIC, TELEMETRY_TOPIC } from '../telemetry.js';
import { eventMessage, stateMessage, statusMessage } from './fixtures.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const publish = (client, topic, payload, options = {}) => new Promise((resolve, reject) => {
  client.publish(topic, JSON.stringify(payload), { qos: 1, ...options }, (error) => error ? reject(error) : resolve());
});
const endClient = (client) => client ? new Promise((resolve) => client.end(true, {}, resolve)) : Promise.resolve();

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function brokerReady(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ready = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (ready) return;
    await delay(50);
  }
  throw new Error('Temporary loopback Mosquitto broker did not start.');
}

async function readUntil(reader, predicate) {
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error('SSE ended before the expected sensor state.');
    buffered += decoder.decode(value, { stream: true });
    const frames = buffered.split('\n\n');
    buffered = frames.pop();
    for (const frame of frames) {
      const match = frame.match(/^data: (.+)$/m);
      if (match) {
        const snapshot = JSON.parse(match[1]);
        if (predicate(snapshot)) return snapshot;
      }
    }
  }
}

// Optional real-broker verification; all normal unit/API tests run without installing Mosquitto.
it.skipIf(!process.env.MOSQUITTO_BIN)('simulates ESP32 -> real Mosquitto -> bridge -> authenticated HTTP/SSE', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'smartdoor-mqtt-'));
  const telemetry = new SmartDoorLockTelemetry({ freshnessMs: 800, sweepMs: 20 });
  let broker;
  let bridge;
  let publisher;
  let server;
  let controller;
  try {
    const port = await freePort();
    const config = path.join(folder, 'mosquitto.conf');
    writeFileSync(config, `listener ${port} 127.0.0.1\nallow_anonymous true\npersistence false\n`, 'utf8');
    broker = spawn(process.env.MOSQUITTO_BIN, ['-c', config], { windowsHide: true, stdio: 'ignore' });
    await once(broker, 'spawn');
    await brokerReady(port);
    const url = `mqtt://127.0.0.1:${port}`;
    publisher = mqtt.connect(url, { clientId: 'simulated-door-test', reconnectPeriod: 0 });
    publisher.on('error', () => {}); // Broker shutdown is an intentional test case.
    await once(publisher, 'connect');

    // Pre-existing retained events must not appear as new activity after a web restart.
    await publish(publisher, TELEMETRY_TOPIC, eventMessage({ sequence: 99 }), { retain: true });
    await publish(publisher, STATUS_TOPIC, statusMessage(), { retain: true });
    bridge = createSmartDoorLockBridge(telemetry, { env: { MQTT_URL: url }, logger: { warn() {} } });
    bridge.start();
    await vi.waitFor(() => expect(telemetry.getSnapshot().brokerConnected).toBe(true));
    await delay(50);
    expect(telemetry.getSnapshot()).toMatchObject({ fresh: false, state: null, events: [] });

    const app = express();
    app.use('/api/smart-door-lock', createSmartDoorLockRouter(telemetry, {
      authenticate(req, res, next) {
        req.session = { userId: 'test-only', cookie: { expires: new Date(Date.now() + 10000) } };
        next();
      },
      revalidateSession: async () => true
    }));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/smart-door-lock`;
    controller = new AbortController();
    const stream = await fetch(`${base}/events`, { signal: controller.signal });
    const reader = stream.body.getReader();
    await readUntil(reader, (snapshot) => snapshot.state === null);

    const first = stateMessage({ pin: 'TEST_SECRET_MUST_NOT_PASS', data: {
      uid: 'TEST_SECRET_MUST_NOT_PASS', template: 'TEST_SECRET_MUST_NOT_PASS'
    } });
    await publish(publisher, TELEMETRY_TOPIC, first);
    const initial = await readUntil(reader, (snapshot) => snapshot.state?.sequence === 1);
    expect(initial).toMatchObject({ fresh: true, state: { data: { doorOpen: false, cdsRaw: 1 } } });
    expect(JSON.stringify(initial)).not.toContain('TEST_SECRET_MUST_NOT_PASS');

    await publish(publisher, TELEMETRY_TOPIC, stateMessage({ sequence: 2, data: {
      doorOpen: true, doorRaw: 1, insidePressed: true, cdsRaw: 0,
      boltCommand: 'unlocked', servoPulseUs: 2400, buzzerOn: true, forcedOpen: true,
      vibration: { installed: true, raw: 0, active: true, triggerCount: 3 },
      fingerprintOnline: false, rfidDetected: false, wifiRssi: -71
    } }));
    const changed = await readUntil(reader, (snapshot) => snapshot.state?.sequence === 2);
    expect(changed.state.data).toMatchObject({
      doorOpen: true, doorRaw: 1, insidePressed: true, cdsRaw: 0, buzzerOn: true,
      vibration: { installed: true, raw: 0, active: true, triggerCount: 3 },
      fingerprintOnline: false, rfidDetected: false, wifiRssi: -71
    });
    const http = await (await fetch(`${base}/state`)).json();
    expect(http).toMatchObject({ success: true, data: { fresh: true, state: { sequence: 2, data: { doorOpen: true } } } });

    const stale = await readUntil(reader, (snapshot) => snapshot.availability === 'offline');
    expect(stale).toMatchObject({ brokerConnected: true, fresh: false, state: { sequence: 2 } });
    broker.kill();
    await readUntil(reader, (snapshot) => snapshot.brokerConnected === false);
    expect(telemetry.getSnapshot()).toMatchObject({ brokerConnected: false, availability: 'offline', fresh: false });
  } finally {
    controller?.abort();
    await bridge?.close();
    telemetry.close();
    await endClient(publisher);
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (broker && broker.exitCode === null && broker.signalCode === null) {
      broker.kill();
      await Promise.race([once(broker, 'exit'), delay(2000)]);
    }
    // Only remove the exact temporary directory created by this test.
    const relative = path.relative(tmpdir(), folder);
    if (!path.isAbsolute(relative) && !relative.startsWith('..') && path.basename(folder).startsWith('smartdoor-mqtt-')) {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}, 10000);
