import { apiRequest } from './client';

export async function getMyDevicesApi() {
  return await apiRequest('/api/my-devices');
}

export async function getLiveDevicesApi() {
  return await apiRequest('/api/live-devices');
}

export async function claimDeviceApi({ code, pairingSecret }) {
  return await apiRequest('/api/my-devices/claim', {
    method: 'POST',
    body: JSON.stringify({ code, pairingSecret })
  });
}

export async function updateDeviceApi(deviceId, { customName }) {
  return await apiRequest(`/api/my-devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ customName })
  });
}

export async function unclaimDeviceApi(deviceId) {
  return await apiRequest(`/api/my-devices/${deviceId}/unclaim`, {
    method: 'POST'
  });
}

// Điều khiển Smart Plug
export async function togglePlugRelayApi(state) {
  return await apiRequest('/api/devices/smart-plug/relay', {
    method: 'POST',
    body: JSON.stringify({ state })
  });
}

export async function resetPlugOverloadApi() {
  return await apiRequest('/api/devices/smart-plug/reset-overload', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

// Chia sẻ thiết bị
export async function getDeviceSharesApi(deviceId) {
  return await apiRequest(`/api/my-devices/${deviceId}/shares`);
}

export async function shareDeviceApi(deviceId, email) {
  return await apiRequest(`/api/my-devices/${deviceId}/shares`, {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function revokeDeviceShareApi(deviceId, userId) {
  return await apiRequest(`/api/my-devices/${deviceId}/shares/${userId}`, {
    method: 'DELETE'
  });
}

export async function getDeviceActivityApi(deviceId) {
  return await apiRequest(`/api/my-devices/${deviceId}/activity`);
}

// Lịch sử thiết bị
export async function getDeviceHistoryApi(deviceId, limit = 50) {
  return await apiRequest(`/api/device-history/${deviceId}?limit=${limit}`);
}
