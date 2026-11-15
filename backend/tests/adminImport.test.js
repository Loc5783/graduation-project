import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import UserSession from '../src/models/UserSession.js';
import AuditLog from '../src/models/AuditLog.js';

const DB = 'smart_home_privacy_test';
const ORIGIN = 'http://localhost:5173'; // Established test allowlist; dev5180 is intentionally development-only.
describe('Selective backend admin import with legacy frontend login', () => {
  let server, passwordHash, admin, viewer;
  const assertTestDB = () => { if (mongoose.connection.name !== DB) throw new Error('Refusing non-test database'); };
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    assertTestDB();
    const app = await createApp({ sessionSecret: 'admin-import-test-secret-not-for-deployment' });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    passwordHash = await bcrypt.hash('ImportTestPassword123!', 4);
  });
  afterAll(async () => {
    if (server) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
    await disconnectDB();
  });
  beforeEach(async () => {
    assertTestDB();
    await User.deleteMany({}); await UserSession.deleteMany({}); await AuditLog.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});
    admin = await User.create({ name: 'Test Admin', email: 'admin.import@example.com', passwordHash, role: 'admin' });
    viewer = await User.create({ name: 'Test Viewer', email: 'viewer.import@example.com', passwordHash, role: 'viewer' });
  });
  const login = async user => {
    const agent = request.agent(server);
    const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'ImportTestPassword123!' });
    expect(res.status).toBe(200); expect(res.body.data.user.id).toBe(String(user._id));
    return agent;
  };
  it('denies unauthenticated access and viewer access', async () => {
    expect((await request(server).get('/api/admin/users')).status).toBe(401);
    const agent = await login(viewer);
    for (const path of ['users', 'audit-logs']) expect((await agent.get(`/api/admin/${path}`)).status).toBe(403);
  });
  it('preserves existing one-step login and lists actual users without password hashes', async () => {
    const agent = await login(admin);
    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(200); expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
  it('returns an empty actual audit history, not synthetic events', async () => {
    const agent = await login(admin);
    const res = await agent.get('/api/admin/audit-logs');
    expect(res.status).toBe(200); expect(res.body.data.logs).toEqual([]); expect(res.body.data.pagination.total).toBe(0);
  });
  it('treats audit search as literal text and rejects invalid filters', async () => {
    const agent = await login(admin);
    expect((await agent.get('/api/admin/audit-logs?search=.*')).body.data.pagination.total).toBe(0);
    expect((await agent.get('/api/admin/audit-logs?category=unknown')).status).toBe(400);
  });
  it('updates the role and records an actual audit event', async () => {
    const agent = await login(admin);
    const res = await agent.patch(`/api/admin/users/${viewer._id}/role`).set('Origin', ORIGIN).send({ role: 'member' });
    expect(res.status).toBe(200);
    expect((await User.findById(viewer._id)).role).toBe('member');
    const log = await AuditLog.findOne({ action: 'USER_ROLE_UPDATED' });
    expect(String(log.actorId)).toBe(String(admin._id));
    const logs = await agent.get('/api/admin/audit-logs?category=role');
    expect(logs.body.data.logs).toHaveLength(1);
  });
  it('protects role changes with Origin validation', async () => {
    const agent = await login(admin);
    const res = await agent.patch(`/api/admin/users/${viewer._id}/role`).set('Origin', 'https://untrusted.invalid').send({ role: 'admin' });
    expect(res.status).toBe(403); expect((await User.findById(viewer._id)).role).toBe('viewer');
  });
  it('creates an actual user compatible with existing login', async () => {
    const agent = await login(admin);
    const res = await agent.post('/api/admin/users').set('Origin', ORIGIN).send({ name: 'Created User', email: 'created.import@example.com', password: 'ImportTestPassword123!', role: 'viewer' });
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'created.import@example.com' });
    await login(user);
  });
  it('locks a user, rejects existing sessions and new login, then requires fresh login after unlock', async () => {
    const adminAgent = await login(admin);
    const viewerAgent = await login(viewer);
    const endpoint = `/api/admin/users/${viewer._id}/lock`;
    const lock = await adminAgent.patch(endpoint).set('Origin', ORIGIN).send({ locked: true });
    expect(lock.status).toBe(200);
    expect((await viewerAgent.get('/api/auth/me')).status).toBe(403);
    const lockedLogin = await request(server).post('/api/auth/login').set('Origin', ORIGIN)
      .send({ email: viewer.email, password: 'ImportTestPassword123!' });
    expect(lockedLogin.status).toBe(403);
    expect(lockedLogin.body.code).toBe('ACCOUNT_LOCKED');
    expect((await adminAgent.patch(endpoint).set('Origin', ORIGIN).send({ locked: false })).status).toBe(200);
    await login(viewer);
  });
  it('does not return fabricated device status', async () => {
    const agent = await login(admin);
    const response = await agent.get('/api/admin/system-status');
    expect([200, 503]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body.data.devices).toHaveLength(5);
      expect(JSON.stringify(response.body)).not.toMatch(/powerWatt|cpuUsage|volume|pinCode/i);
    } else {
      expect(response.body.code).toBe('GATEWAY_UNAVAILABLE');
    }
  });
});
