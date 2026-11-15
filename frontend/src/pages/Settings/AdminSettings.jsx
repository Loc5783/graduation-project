import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { getAdminUsers, getAdminSystemStatus, getAdminAuditLogs, updateAdminUser, setAdminUserLock } from '../../services/adminService.js';

const COPY = {
  vi: { title: 'Quản trị', users: 'Người dùng', devices: 'Thiết bị', audit: 'Nhật ký', refresh: 'Tải lại',
    name: 'Tài khoản', role: 'Vai trò', save: 'Lưu vai trò', saved: 'Đã lưu',
    empty: 'Chưa có dữ liệu.', unavailable: 'Không lấy được dữ liệu. Vui lòng thử lại.',
    fresh: 'Trực tuyến', stale: 'Ngoại tuyến / dữ liệu cũ', unknown: 'Chưa có dữ liệu',
    time: 'Thời gian', actor: 'Người thực hiện', action: 'Hoạt động', target: 'Đối tượng',
    lock: 'Khóa', unlock: 'Mở khóa', lockConfirm: 'Xác nhận thay đổi trạng thái khóa tài khoản?', locked: 'Đã khóa' },
  en: { title: 'Administration', users: 'Users', devices: 'Devices', audit: 'Activity log', refresh: 'Refresh',
    name: 'Account', role: 'Role', save: 'Save role', saved: 'Saved',
    empty: 'No data yet.', unavailable: 'Data unavailable. Please retry.',
    fresh: 'Online', stale: 'Offline / stale data', unknown: 'No data yet',
    time: 'Time', actor: 'Actor', action: 'Activity', target: 'Target',
    lock: 'Lock', unlock: 'Unlock', lockConfirm: 'Confirm changing the account lock state?', locked: 'Locked' }
};

function UserRow({ user, onSaved, labels, currentUserId }) {
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await updateAdminUser(user.id, role);
    setBusy(false);
    if (result.success && result.data?.id === user.id) {
      setMessage(labels.saved);
      onSaved();
    } else setMessage(result.message || labels.unavailable);
  };
  const changeLock = async () => {
    if (busy || !window.confirm(labels.lockConfirm)) return;
    setBusy(true); setMessage('');
    const result = await setAdminUserLock(user.id, !user.isLocked);
    setBusy(false);
    if (result.success && result.data?.id === user.id) { setMessage(labels.saved); onSaved(); }
    else setMessage(result.message || labels.unavailable);
  };
  return <tr>
    <td><strong>{user.name}</strong> {user.isLocked ? `(${labels.locked})` : ''}<br /><small>{user.email}</small></td>
    <td><select aria-label={`${labels.role}: ${user.email}`} value={role} onChange={(event) => setRole(event.target.value)} disabled={busy}>
      <option value="viewer">Viewer</option><option value="member">Member</option><option value="admin">Admin</option>
    </select></td>
    <td><button type="button" className="btn btn-outline btn-xs" onClick={save} disabled={busy}>{labels.save}</button>{' '}
      {user.id !== currentUserId && <button type="button" className="btn btn-outline btn-xs" onClick={changeLock} disabled={busy}>{user.isLocked ? labels.unlock : labels.lock}</button>}
      <span role="status" aria-live="polite"> {message}</span></td>
  </tr>;
}

export default function AdminSettings() {
  const { currentUser } = useAuthContext();
  const { lang } = useLanguage();
  const labels = COPY[lang] || COPY.vi;
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('loading');
  const requestId = useRef(0);
  const load = useCallback(async (signal) => {
    const id = ++requestId.current;
    setStatus('loading');
    const result = tab === 'users' ? await getAdminUsers(signal) : tab === 'devices' ? await getAdminSystemStatus(signal) : await getAdminAuditLogs(signal);
    if (signal?.aborted || id !== requestId.current) return;
    if (!result.success) { setStatus('error'); return; }
    if (tab === 'users' && Array.isArray(result.data)) setUsers(result.data);
    else if (tab === 'devices' && Array.isArray(result.data?.devices)) setDevices(result.data.devices);
    else if (tab === 'audit' && Array.isArray(result.data?.logs)) setLogs(result.data.logs);
    else { setStatus('error'); return; }
    setStatus('ready');
  }, [tab]);
  useEffect(() => {
    if (currentUser?.role !== 'admin') return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); requestId.current += 1; };
  }, [currentUser?.id, currentUser?.role, load]);
  if (currentUser?.role !== 'admin') return <p role="alert">403</p>;
  return <div className="admin-settings-page">
    <h2 className="settings-page-title">{labels.title}</h2>
    <div className="btn-toggle-row" role="tablist" aria-label={labels.title} style={{ margin: '1rem 0' }}>
      {['users', 'devices', 'audit'].map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
        className={`btn-choice ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{labels[key]}</button>)}
    </div>
    <button type="button" className="btn btn-outline btn-xs" onClick={() => load()}>{labels.refresh}</button>
    {status === 'loading' && <p role="status">…</p>}
    {status === 'error' && <p role="alert">{labels.unavailable}</p>}
    {status === 'ready' && <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
      {tab === 'users' && (users.length ? <table className="settings-table" style={{ width: '100%' }}><thead><tr>
        <th>{labels.name}</th><th>{labels.role}</th><th></th>
      </tr></thead><tbody>{users.map((user) => <UserRow key={user.id} user={user} labels={labels} currentUserId={currentUser?.id} onSaved={() => load()} />)}</tbody></table> : <p>{labels.empty}</p>)}
      {tab === 'devices' && (devices.length ? <table className="settings-table" style={{ width: '100%' }}><thead><tr><th>{labels.devices}</th><th>{labels.time}</th><th>Status</th></tr></thead><tbody>
        {devices.map((device) => <tr key={device.id}><td>{device.id}</td><td>{device.ageSeconds == null ? '—' : `${Math.round(device.ageSeconds)}s`}</td><td>{device.fresh ? labels.fresh : device.ageSeconds == null ? labels.unknown : labels.stale}</td></tr>)}
      </tbody></table> : <p>{labels.empty}</p>)}
      {tab === 'audit' && (logs.length ? <table className="settings-table" style={{ width: '100%' }}><thead><tr><th>{labels.time}</th><th>{labels.actor}</th><th>{labels.action}</th><th>{labels.target}</th></tr></thead><tbody>
        {logs.map((log) => <tr key={log.id}><td>{log.createdAt ? new Date(log.createdAt).toLocaleString(lang) : '—'}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.target || '—'}</td></tr>)}
      </tbody></table> : <p>{labels.empty}</p>)}
    </div>}
  </div>;
}
