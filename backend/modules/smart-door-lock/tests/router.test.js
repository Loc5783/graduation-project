import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSmartDoorLockRouter, isStreamSessionValid } from '../router.js';
import { SmartDoorLockTelemetry } from '../telemetry.js';
import { stateMessage } from './fixtures.js';
import session from 'express-session';
import { createApp } from '../../../src/app.js';

const resources = [];
afterEach(async () => {
  for (const { telemetry, server, controller } of resources.splice(0)) {
    controller?.abort();
    telemetry.close();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

function setup(options = {}) {
  const telemetry = new SmartDoorLockTelemetry({ sweepMs: 0 });
  const app = express();
  app.use('/api/smart-door-lock', createSmartDoorLockRouter(telemetry, options));
  const resource = { app, telemetry };
  resources.push(resource);
  return resource;
}
const authenticate = (req, res, next) => {
  req.session = { userId: 'test-user', cookie: { expires: new Date(Date.now() + 60000) } };
  next();
};

async function openStream(resource) {
  const server = resource.app.listen(0, '127.0.0.1');
  resource.server = server;
  await new Promise((resolve) => server.once('listening', resolve));
  const controller = new AbortController();
  resource.controller = controller;
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/smart-door-lock/events`, { signal: controller.signal });
  return { response, reader: response.body.getReader() };
}
async function readUntil(reader, needle) {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(needle)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  expect(text).toContain(needle);
  return text;
}

describe('authenticated Smart Door Lock API and stream', () => {
  it('requires the real session guard for snapshot and stream', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/smart-door-lock/state')).status).toBe(401);
    expect((await request(app).get('/api/smart-door-lock/events')).status).toBe(401);
  });

  it('returns the read-only snapshot and has no remote unlock route', async () => {
    const { app, telemetry } = setup({ authenticate });
    telemetry.setBrokerConnected(true);
    telemetry.ingestTelemetry(stateMessage());
    const response = await request(app).get('/api/smart-door-lock/state');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ success: true, data: { deviceId: 'smart-door-lock', fresh: true, state: { data: { doorOpen: false } } } });
    expect((await request(app).post('/api/smart-door-lock/command').send({ unlock: true })).status).toBe(404);
  });

  it('mounts protected module endpoints in the real app without changing the authentication routes', async () => {
    const telemetry = new SmartDoorLockTelemetry({ sweepMs: 0 });
    resources.push({ telemetry });
    const app = await createApp({
      sessionSecret: 'test-only-smartdoor-session-secret', skipUserInit: true,
      sessionStore: new session.MemoryStore(), smartDoorLockTelemetry: telemetry
    });
    expect((await request(app).get('/api/smart-door-lock/state')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('streams initial state and sensor changes, then closes on shutdown without leaked subscribers', async () => {
    const resource = setup({ authenticate, revalidateSession: async () => true });
    const { response, reader } = await openStream(resource);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await readUntil(reader, 'event: state')).toContain('"fresh":false');
    resource.telemetry.setBrokerConnected(true);
    resource.telemetry.ingestTelemetry(stateMessage({ data: { doorOpen: true } }));
    expect(await readUntil(reader, '"doorOpen":true')).toContain('"fresh":true');
    resource.telemetry.close();
    await reader.read();
    expect(resource.telemetry.listenerCount('change')).toBe(0);
  });

  it('ends an existing stream when its stored session is revoked', async () => {
    let valid = true;
    const resource = setup({ authenticate, revalidateSession: async () => valid, heartbeatMs: 20 });
    const { reader } = await openStream(resource);
    await readUntil(reader, 'event: state');
    valid = false;
    await readUntil(reader, 'event: session-expired');
    await vi.waitFor(() => expect(resource.telemetry.listenerCount('change')).toBe(0));
  });

  it('removes subscribers when a browser disconnects', async () => {
    const resource = setup({ authenticate, revalidateSession: async () => true });
    const { reader } = await openStream(resource);
    await readUntil(reader, 'event: state');
    expect(resource.telemetry.listenerCount('change')).toBe(1);
    resource.controller.abort();
    await vi.waitFor(() => expect(resource.telemetry.listenerCount('change')).toBe(0));
  });

  it('respects absolute session expiry even when heartbeats have not yet run', async () => {
    const shortSession = (req, res, next) => {
      req.session = { userId: 'test-user', cookie: { expires: new Date(Date.now() + 100) } };
      next();
    };
    const resource = setup({ authenticate: shortSession, revalidateSession: async () => true });
    const { reader } = await openStream(resource);
    await readUntil(reader, 'event: state');
    await readUntil(reader, 'event: session-expired');
    expect(resource.telemetry.listenerCount('change')).toBe(0);
  });
});

describe('stream session validation', () => {
  it('checks expiry and the persistent session identity', async () => {
    const session = { userId: 'a', cookie: { expires: new Date(Date.now() + 10000) } };
    const request = { session, sessionID: 'session-a', sessionStore: { get: (id, done) => done(null, session) } };
    expect(await isStreamSessionValid(request)).toBe(true);
    request.sessionStore.get = (id, done) => done(null, null);
    expect(await isStreamSessionValid(request)).toBe(false);
    request.session.cookie.expires = new Date(Date.now() - 1);
    expect(await isStreamSessionValid(request)).toBe(false);
  });
});
