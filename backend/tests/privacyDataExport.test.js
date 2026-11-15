import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Notification from '../src/models/Notification.js';
import { csvCell } from '../src/routes/privacyDataRoutes.js';
import { pruneExpiredNotifications } from '../src/services/privacyRetention.js';

const DB = 'smart_home_privacy_test';
let app;

async function login(email) {
  const password = 'MatKhau@123';
  await request(app).post('/api/auth/register').set('Origin', 'http://localhost:5173')
    .send({ fullName: 'Export User', email, password });
  const response = await request(app).post('/api/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email, password });
  expect(response.status).toBe(200);
  return response.headers['set-cookie'];
}

describe('privacy data CSV', () => {
  beforeAll(async () => {
    await connectDB(`mongodb://127.0.0.1:27017/${DB}`);
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    app = await createApp({ sessionSecret: 'privacy-export-test-secret-long-random-value' });
  });
  afterAll(async () => { await disconnectDB(); });
  beforeEach(async () => {
    if (mongoose.connection.name !== DB) throw new Error('Wrong test database');
    await User.deleteMany({});
    await Notification.deleteMany({});
    await mongoose.connection.db.collection('sessions').deleteMany({});
  });

  it('requires a valid session and exports only the current user', async () => {
    const a = await login('export.a@example.com');
    const b = await login('export.b@example.com');
    const ua = await User.findOne({ email: 'export.a@example.com' });
    const ub = await User.findOne({ email: 'export.b@example.com' });
    await Notification.create({ userId: ua._id, eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', dedupKey: 'export-a' });
    await Notification.create({ userId: ub._id, eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', dedupKey: 'export-b' });
    expect((await request(app).get('/api/privacy-data/export.csv')).status).toBe(401);
    const result = await request(app).get('/api/privacy-data/export.csv').set('Cookie', a);
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/csv');
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.text).toContain('export.a@example.com');
    expect(result.text).not.toContain('export-a'); // internal dedup key never exported
    expect(result.text).not.toContain('export.b@example.com');
    expect(result.text).not.toContain(String(ub._id));
    expect(result.text).not.toContain('passwordHash');
    expect(result.text).not.toContain('sessionStoreId');
    expect(b).toBeDefined();
  });

  it('neutralizes spreadsheet formulas and quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('  @SUM(1)')).toBe('"\'  @SUM(1)"');
  });

  it('prints a real account summary without sensitive session identifiers', async () => {
    const cookies = await login('report.a@example.com');
    const user = await User.findOne({ email: 'report.a@example.com' });
    await Notification.create({ userId: user._id, eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', dedupKey: 'report-one' });
    const result = await request(app).get('/api/privacy-data/report').set('Cookie', cookies);
    expect(result.status).toBe(200);
    expect(result.body.data.profile.email).toBe('report.a@example.com');
    expect(result.body.data.notificationCount).toBe(1);
    expect(result.body.data.retentionDays).toBe(30);
    expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|sessionStoreId|dedupKey/);
  });

  it('deletes only own inbox with an explicit confirmation', async () => {
    const a = await login('delete.a@example.com');
    await login('delete.b@example.com');
    const ua = await User.findOne({ email: 'delete.a@example.com' });
    const ub = await User.findOne({ email: 'delete.b@example.com' });
    for (const [userId, dedupKey] of [[ua._id, 'delete-a'], [ub._id, 'delete-b']]) {
      await Notification.create({ userId, eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', dedupKey });
    }
    const endpoint = '/api/privacy-data/notifications';
    expect((await request(app).delete(endpoint).set('Cookie', a).send({ confirmation: 'DELETE_NOTIFICATIONS' })).status).toBe(403);
    expect((await request(app).delete(endpoint).set('Cookie', a).set('Origin', 'http://localhost:5173').send({ confirmation: 'wrong' })).status).toBe(400);
    const result = await request(app).delete(endpoint).set('Cookie', a).set('Origin', 'http://localhost:5173')
      .send({ confirmation: 'DELETE_NOTIFICATIONS' });
    expect(result.status).toBe(200);
    expect(result.body.data.deletedCount).toBe(1);
    expect(await Notification.countDocuments({ userId: ub._id })).toBe(1);
  });

  it('prunes each inbox by its own retention choice without touching session metadata', async () => {
    await login('retention.a@example.com');
    await login('retention.b@example.com');
    const ua = await User.findOne({ email: 'retention.a@example.com' });
    const ub = await User.findOne({ email: 'retention.b@example.com' });
    ua.settings.privacy.retentionDays = 7;
    ub.settings.privacy.retentionDays = 90;
    await Promise.all([ua.save(), ub.save()]);
    const now = new Date('2026-11-15T00:00:00.000Z');
    for (const [userId, dedupKey, ageDays] of [
      [ua._id, 'a-old', 8], [ua._id, 'a-new', 6], [ub._id, 'b-old', 8]
    ]) {
      await Notification.create({ userId, eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', dedupKey,
        createdAt: new Date(now.getTime() - ageDays * 86400000) });
    }
    const sessionCount = await mongoose.connection.db.collection('user_sessions').countDocuments({});
    expect(await pruneExpiredNotifications(now)).toBe(1);
    expect((await Notification.find({}).select('dedupKey').lean()).map((x) => x.dedupKey).sort()).toEqual(['a-new', 'b-old']);
    expect(await mongoose.connection.db.collection('user_sessions').countDocuments({})).toBe(sessionCount);
  });
});
