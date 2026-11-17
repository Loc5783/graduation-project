import { apiRequest } from './client';
import { setSessionCookie, setUserInfo } from '../utils/storage';

export async function loginApi({ email, password, remember = true }) {
  const res = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, remember })
  });

  if (res.success && res.data?.user) {
    await setUserInfo(res.data.user);
  }
  return res;
}

export async function registerApi({ fullName, email, password }) {
  return await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, password })
  });
}

export function verifyEmailApi({ email, code }) {
  return apiRequest('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code })
  });
}

export function resendVerificationApi({ email }) {
  return apiRequest('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export function cancelRegistrationApi({ email, cancellationToken }) {
  return apiRequest('/api/auth/cancel-registration', {
    method: 'POST',
    body: JSON.stringify({ email, cancellationToken })
  });
}

export async function getMeApi() {
  const res = await apiRequest('/api/auth/me');
  if (res.success && res.data?.user) {
    await setUserInfo(res.data.user);
  }
  return res;
}

export async function logoutApi() {
  const res = await apiRequest('/api/auth/logout', {
    method: 'POST'
  });
  await setSessionCookie(null);
  await setUserInfo(null);
  return res;
}

export async function testConnectionApi() {
  return await apiRequest('/api/health', { timeoutMs: 4000 });
}
