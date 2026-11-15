import { apiRequest } from './authService.js';

export async function getMyDevices() {
  return await apiRequest('/api/my-devices', { method: 'GET' });
}

export async function claimDevice({ code, pairingSecret }) {
  return await apiRequest('/api/my-devices/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code?.trim().toUpperCase(), pairingSecret: pairingSecret?.trim() })
  });
}

export async function getDeviceShares(deviceId) {
  return await apiRequest(`/api/my-devices/${deviceId}/shares`, { method: 'GET' });
}

export async function shareDevice(deviceId, email) {
  return await apiRequest(`/api/my-devices/${deviceId}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email?.trim().toLowerCase() })
  });
}

export async function revokeDeviceShare(deviceId, userId) {
  return await apiRequest(`/api/my-devices/${deviceId}/shares/${userId}`, {
    method: 'DELETE'
  });
}

export async function updateDevice(deviceId, { customName }) {
  return await apiRequest(`/api/my-devices/${deviceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customName })
  });
}

export async function unclaimDevice(deviceId) {
  return await apiRequest(`/api/my-devices/${deviceId}/unclaim`, {
    method: 'POST'
  });
}
