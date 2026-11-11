import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('../src/models/EmailChallenge.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn()
  }
}));

import EmailChallenge from '../src/models/EmailChallenge.js';
import { issueEmailChallenge, consumeEmailChallenge } from '../src/services/emailAuth.js';

describe('email verification codes', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-verification-codes';
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'security@example.com';
    vi.clearAllMocks();
    EmailChallenge.findOne.mockResolvedValue(null);
    EmailChallenge.create.mockResolvedValue({ _id: 'stored-challenge' });
    EmailChallenge.deleteOne.mockResolvedValue({ deletedCount: 1 });
    EmailChallenge.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries({ SESSION_SECRET: originalSecret, RESEND_API_KEY: originalKey, EMAIL_FROM: originalFrom })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('sends a six-digit code and stores only its HMAC in MongoDB', async () => {
    let sentCode;
    global.fetch = vi.fn(async (_url, options) => {
      sentCode = JSON.parse(options.body).text.match(/\b\d{6}\b/)[0];
      return { ok: true };
    });
    const result = await issueEmailChallenge({ _id: 'user-id', email: 'user@example.com' }, 'register');
    const stored = EmailChallenge.create.mock.calls[0][0];
    expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).not.toHaveProperty('code');
    expect(stored).not.toHaveProperty('code');
    expect(stored.codeHash).toBe(crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`${result.challengeId}:${sentCode}`).digest('hex'));
    expect(stored.expiresAt.getTime() - stored.sentAt.getTime()).toBe(600000);
  });

  it('rejects a bad code and atomically consumes a matching code', async () => {
    EmailChallenge.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 'user-id' });
    expect(await consumeEmailChallenge(crypto.randomUUID(), '123456', 'login')).toBeNull();
    expect(EmailChallenge.updateOne).toHaveBeenCalledWith(expect.objectContaining({ attempts: { $lt: 5 } }), { $inc: { attempts: 1 } });
    expect(await consumeEmailChallenge(crypto.randomUUID(), '123456', 'login')).toEqual({ userId: 'user-id' });
    expect(EmailChallenge.findOneAndUpdate.mock.calls[1][0]).toMatchObject({ consumedAt: null, attempts: { $lt: 5 } });
  });

  it('removes the challenge when email delivery fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    await expect(issueEmailChallenge({ _id: 'user-id', email: 'user@example.com' }, 'login')).rejects.toThrow('HTTP 503');
    expect(EmailChallenge.deleteOne).toHaveBeenCalledWith({ _id: 'stored-challenge' });
  });
});
