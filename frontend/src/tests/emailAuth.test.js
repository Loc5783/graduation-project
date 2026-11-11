import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginService, registerService, verifyLoginService, verifyRegistrationService } from '../services/authService.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('email code authentication API', () => {
  it('accepts registration and login challenges without treating them as malformed users', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ success: true, code: 'EMAIL_VERIFICATION_REQUIRED', data: { challengeId: 'registration-id' } }) })
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ success: true, code: 'LOGIN_CODE_REQUIRED', data: { challengeId: 'login-id' } }) });

    const registration = await registerService({ fullName: 'New User', email: 'new@example.com', password: 'password123' });
    const login = await loginService({ email: 'new@example.com', password: 'password123' });
    expect(registration).toMatchObject({ success: true, code: 'EMAIL_VERIFICATION_REQUIRED', data: { challengeId: 'registration-id' } });
    expect(login).toMatchObject({ success: true, code: 'LOGIN_CODE_REQUIRED', data: { challengeId: 'login-id' } });
  });

  it('posts the code to the matching verification endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) });
    await verifyRegistrationService('register-id', '123456');
    await verifyLoginService('login-id', '654321');
    expect(global.fetch.mock.calls[0][0]).toBe('/api/auth/register/verify');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ challengeId: 'register-id', code: '123456' });
    expect(global.fetch.mock.calls[1][0]).toBe('/api/auth/login/verify');
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ challengeId: 'login-id', code: '654321' });
  });
});
