import { apiRequest } from './authService.js';

export async function getMyDevices(options = {}) {
  return await apiRequest('/api/my-devices', { method: 'GET', ...options });
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

export async function getDeviceDetails(deviceId, options = {}) {
  return await apiRequest(`/api/my-devices/${deviceId}`, { method: 'GET', ...options });
}

export async function getDeviceActivity(deviceId) {
  return await apiRequest(`/api/my-devices/${deviceId}/activity`, { method: 'GET' });
}

export async function setDeviceCollection(deviceId, enabled) {
  return await apiRequest(`/api/my-devices/${deviceId}/collection`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
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
