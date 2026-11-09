import { apiRequest } from './authService.js';

/**
 * Service giao tiếp API cho Ổ cắm thông minh (Smart Plug)
 * Người phụ trách: Nhật Anh (nhatanh)
 */

/**
 * Lấy trạng thái hiện tại của ổ cắm từ Backend
 */
export async function getSmartPlugState() {
  return await apiRequest('/api/devices/smart-plug/state', {
    method: 'GET'
  });
}

/**
 * Điều khiển bật/ngắt rơ-le ổ cắm
 * @param {'ON' | 'OFF'} state Trạng thái mong muốn
 */
export async function toggleSmartPlugRelay(state) {
  return await apiRequest('/api/devices/smart-plug/relay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ state })
  });
}

/**
 * Lấy lịch sử đo đạc điện năng phục vụ vẽ biểu đồ
 * @param {number} limit Số lượng bản ghi
 */
export async function getSmartPlugHistory(limit = 20) {
  return await apiRequest(`/api/devices/smart-plug/history?limit=${limit}`, {
    method: 'GET'
  });
}

/**
 * Gửi bản tin đo lường lên backend
 */
export async function postSmartPlugTelemetry(telemetryData) {
  return await apiRequest('/api/devices/smart-plug/telemetry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(telemetryData)
  });
}

/**
 * Khôi phục trạng thái quá tải an toàn
 */
export async function resetSmartPlugOverload() {
  return await apiRequest('/api/devices/smart-plug/reset-overload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
}
