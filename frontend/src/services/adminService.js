import { apiRequest } from './authService.js';

export const getAdminUsers = (signal) => apiRequest('/api/admin/users', { signal });
export const getAdminSystemStatus = (signal) => apiRequest('/api/admin/system-status', { signal });
export const getAdminAuditLogs = (signal) => apiRequest('/api/admin/audit-logs?limit=30', { signal });
export const updateAdminUser = (id, role) => apiRequest(`/api/admin/users/${encodeURIComponent(id)}/role`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role })
});
export const setAdminUserLock = (id, locked) => apiRequest(`/api/admin/users/${encodeURIComponent(id)}/lock`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locked })
});
