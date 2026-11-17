import { apiRequest } from './client';

export async function getNotificationsApi(params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/notifications${query ? `?${query}` : ''}`;
  return await apiRequest(endpoint);
}

export async function markNotificationAsReadApi(notificationId) {
  return await apiRequest(`/api/notifications/${notificationId}/read`, {
    method: 'PATCH'
  });
}

export async function markAllNotificationsAsReadApi() {
  return await apiRequest('/api/notifications/read-all', {
    method: 'PATCH'
  });
}

export async function deleteNotificationApi(notificationId) {
  return await apiRequest(`/api/notifications/${notificationId}`, {
    method: 'DELETE'
  });
}
