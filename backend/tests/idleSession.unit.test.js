import { afterEach, describe, expect, it, vi } from 'vitest';
import UserSession from '../src/models/UserSession.js';
import { requireAuth } from '../src/middleware/auth.js';

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    clearCookie: vi.fn()
  };
}

describe('server-side idle session expiry', () => {
  it('rejects a session idle for over 15 minutes before loading the user', async () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(UserSession, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    const req = { session: { userId: 'user', managedSessionId: 'session', lastUserActivityAt: Date.now() - 16 * 60 * 1000, destroy: vi.fn((callback) => callback()) } };
    const res = response();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].code).toBe('SESSION_IDLE_TIMEOUT');
    expect(req.session.destroy).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('requires a fresh login for a production session without an activity timestamp', async () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(UserSession, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    const req = { session: { userId: 'user', managedSessionId: 'session', destroy: vi.fn((callback) => callback()) } };
    const res = response();
    await requireAuth(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].code).toBe('SESSION_RELOGIN_REQUIRED');
  });
});
