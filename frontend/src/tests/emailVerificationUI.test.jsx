import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const { register, verifyEmailService } = vi.hoisted(() => ({ register: vi.fn(), verifyEmailService: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({
  useAuthContext: () => ({ register }),
  calculatePasswordStrength: () => 1
}));
vi.mock('../context/LanguageContext.jsx', () => ({
  useLanguage: () => ({ t: (key) => key }),
  getErrorMessage: (notice) => notice.message || notice.code
}));
vi.mock('../services/authService.js', () => ({ verifyEmailService, resendVerificationService: vi.fn() }));

import Register from '../pages/Register.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe('Registration email verification screen', () => {
  it('shows the code form for an existing pending registration and verifies it', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    verifyEmailService.mockResolvedValue({ success: true });
    await act(async () => root.render(
      <MemoryRouter initialEntries={[{ pathname: '/register', state: { verificationEmail: 'user@example.com' } }]}>
        <Register />
      </MemoryRouter>
    ));
    expect(host.textContent).toContain('user@example.com');
    const code = host.querySelector('#verification-code');
    await act(async () => Simulate.change(code, { target: { value: '123456' } }));
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(verifyEmailService).toHaveBeenCalledWith({ email: 'user@example.com', code: '123456' });
    expect(host.textContent).toContain('register_success_title');
  });
});
