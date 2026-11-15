import { apiRequest } from './authService.js';

export const getPrivacyReport = (signal) => apiRequest('/api/privacy-data/report', { signal });
export const deleteOwnNotifications = () => apiRequest('/api/privacy-data/notifications', {
  method: 'DELETE', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ confirmation: 'DELETE_NOTIFICATIONS' })
});

export async function downloadPrivacyCsv(signal) {
  const response = await fetch('/api/privacy-data/export.csv', { credentials: 'include', headers: { Accept: 'text/csv' }, signal });
  if (!response.ok) return { success: false, status: response.status };
  const blob = await response.blob();
  if (signal?.aborted) return { success: false, status: 0 };
  if (blob.size === 0 || blob.size > 20 * 1024 * 1024) return { success: false, status: 413 };
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'my-privacy-data.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { success: true };
}
