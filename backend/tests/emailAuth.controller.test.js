import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('../src/models/User.js', () => ({ default: {
  findOne: vi.fn(), create: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn()
} }));
vi.mock('../src/models/UserSession.js', () => ({ default: { create: vi.fn(), updateMany: vi.fn(), deleteOne: vi.fn() } }));
vi.mock('../src/models/EmailChallenge.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../src/services/emailAuth.js', () => ({
  emailAuthEnabled: () => true,
  issueEmailChallenge: vi.fn(),
  consumeEmailChallenge: vi.fn(),
  resendEmailChallenge: vi.fn()
}));

import User from '../src/models/User.js';
import UserSession from '../src/models/UserSession.js';
import { issueEmailChallenge, consumeEmailChallenge } from '../src/services/emailAuth.js';
import { register, login, verifyRegistration, verifyLogin, finishMfaChange } from '../src/controllers/authController.js';

const originalNodeEnv = process.env.NODE_ENV;
const userId = '507f1f77bcf86cd799439011';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), clearCookie: vi.fn() };
}

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  vi.clearAllMocks();
  User.findOne.mockResolvedValue(null);
  UserSession.create.mockResolvedValue({});
  issueEmailChallenge.mockResolvedValue({ challengeId: 'challenge-id', expiresInSeconds: 600 });
});
afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe('email authentication controller', () => {
  it('creates a pending account and does not open a session before email verification', async () => {
    User.create.mockImplementation(async (data) => ({ ...data, _id: userId }));
    const req = { body: { fullName: 'New User', email: 'USER@example.com', password: 'password123' } };
    const res = response();
    await register(req, res, vi.fn());
    expect(User.create.mock.calls[0][0]).toMatchObject({ email: 'user@example.com', role: 'viewer', emailVerificationRequired: true, mfaEnabled: true });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'EMAIL_VERIFICATION_REQUIRED', data: { challengeId: 'challenge-id' } });
  });

  it('requires the email code after a correct password and creates no session yet', async () => {
    const passwordHash = await bcrypt.hash('password123', 4);
    User.findOne.mockResolvedValue({ _id: userId, passwordHash, emailVerificationRequired: false, mfaEnabled: true, authVersion: 0 });
    const req = { body: { email: 'user@example.com', password: 'password123', remember: false } };
    const res = response();
    await login(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json.mock.calls[0][0].code).toBe('LOGIN_CODE_REQUIRED');
    expect(UserSession.create).not.toHaveBeenCalled();
  });

  it('marks the new account verified only after the registration code', async () => {
    consumeEmailChallenge.mockResolvedValue({ userId });
    User.findOneAndUpdate.mockResolvedValue({ id: userId, name: 'New User', email: 'user@example.com', role: 'viewer', owned: [] });
    const res = response();
    await verifyRegistration({ body: { challengeId: 'challenge-id', code: '123456' } }, res, vi.fn());
    expect(User.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { emailVerifiedAt: expect.any(Date), emailVerificationRequired: false } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('creates the MongoDB-backed session only after a valid login code', async () => {
    consumeEmailChallenge.mockResolvedValue({ userId, authVersion: 0, remember: false });
    User.findById.mockResolvedValue({ _id: userId, name: 'New User', email: 'user@example.com', role: 'viewer', owned: [], mfaEnabled: true, authVersion: 0, emailVerificationRequired: false });
    const session = { cookie: {}, regenerate: vi.fn((callback) => callback()), save: vi.fn((callback) => callback()) };
    const req = { body: { challengeId: 'challenge-id', code: '123456' }, session, sessionID: 'store-id', headers: {} };
    const res = response();
    await verifyLogin(req, res, vi.fn());
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(200));
    expect(UserSession.create).toHaveBeenCalledOnce();
    expect(session.lastUserActivityAt).toBeTypeOf('number');
  });

  it('enables two-step verification for a legacy account after its email code', async () => {
    consumeEmailChallenge.mockResolvedValue({ userId, authVersion: 0 });
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    UserSession.updateMany.mockResolvedValue({ modifiedCount: 0 });
    const res = response();
    await finishMfaChange({ body: { challengeId: 'challenge-id', code: '123456', purpose: 'enable_mfa' }, user: { _id: userId }, sessionID: 'current-store' }, res, vi.fn());
    expect(User.updateOne.mock.calls[0][0].$and).toContainEqual({ mfaEnabled: { $ne: true } });
    expect(User.updateOne.mock.calls[0][1].$set).toMatchObject({ mfaEnabled: true, emailVerificationRequired: false });
    expect(res.json.mock.calls[0][0].data.mfaEnabled).toBe(true);
  });
});
