import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateVerificationCode, hashVerificationCode, issueVerificationCode,
  matchesVerificationCode, VERIFICATION_TTL_MS
} from '../src/services/emailVerificationService.js';
import * as emailService from '../src/services/emailService.js';

describe('Email verification code', () => {
  const originalSecret = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-64a962cf88f66d836a7b5cf90c44b6cd87b9e4e341fd07bd';
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('creates a six-digit code and hashes it without storing the raw value', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashVerificationCode('user-1', code)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashVerificationCode('user-1', code)).not.toBe(code);
  });

  it('accepts only the correct nonexpired code within five attempts', () => {
    const now = new Date();
    const code = '123456';
    const user = { _id: 'user-1', emailVerificationHash: hashVerificationCode('user-1', code),
      emailVerificationExpiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS), emailVerificationAttempts: 0 };
    expect(matchesVerificationCode(user, code, now)).toBe(true);
    expect(matchesVerificationCode(user, '654321', now)).toBe(false);
    user.emailVerificationAttempts = 5;
    expect(matchesVerificationCode(user, code, now)).toBe(false);
    user.emailVerificationAttempts = 0;
    expect(matchesVerificationCode(user, code, user.emailVerificationExpiresAt)).toBe(false);
  });

  it('does not send or persist when SMTP is missing', async () => {
    vi.spyOn(emailService, 'isEmailConfigured').mockReturnValue(false);
    const user = { _id: 'user-1' };
    await expect(issueVerificationCode(user)).rejects.toThrow('EMAIL_NOT_CONFIGURED');
  });
});
