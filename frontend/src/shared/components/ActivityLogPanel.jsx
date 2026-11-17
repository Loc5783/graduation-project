import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { getAccountActivityService } from '../../services/accountService.js';
import { getDeviceActivity } from '../../services/myDeviceService.js';
import './ActivityLogPanel.css';

const LABELS = {
  REGISTER: ['Đăng ký tài khoản', 'Account registered'],
  LOGIN_SUCCESS: ['Đăng nhập thành công', 'Signed in'],
  LOGIN_FAILED: ['Đăng nhập thất bại', 'Sign-in failed'],
  DEVICE_SHARED: ['Đã chia sẻ quyền xem', 'View access shared'],
  DEVICE_SHARE_REVOKED: ['Đã thu hồi quyền xem', 'View access revoked'],
  SHARED_VIEWER_LOGIN: ['Người được chia sẻ đã đăng nhập', 'Shared viewer signed in'],
  SHARED_DEVICE_VIEW: ['Người được chia sẻ đã mở thiết bị', 'Shared viewer opened device'],
  DEVICE_DATA_READ: ['Đã đọc dữ liệu thiết bị', 'Device data read'],
  DEVICE_COLLECTION_CHANGED: ['Đã đổi quyền thu thập', 'Data collection changed'],
  UNUSUAL_DATA_ACCESS: ['Truy cập dữ liệu bị từ chối', 'Denied device data access']
};

export default function ActivityLogPanel({ deviceId, autoLoad = false }) {
  const { lang } = useLanguage();
  const en = lang === 'en';
  const [opened, setOpened] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = deviceId ? await getDeviceActivity(deviceId) : await getAccountActivityService();
      if (!response?.success || !Array.isArray(response.data?.items)) throw new Error('LOAD_FAILED');
      setItems(response.data.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (autoLoad) {
      setOpened(true);
      void load();
    }
  }, [autoLoad, load]);

  return <section className="activity-log-panel">
    <div className="activity-log-header">
      <div><h3>{deviceId ? (en ? 'Device activity' : 'Nhật ký thiết bị') : (en ? 'Account activity' : 'Nhật ký tài khoản')}</h3>
        <p>{deviceId ? (en ? 'Sharing and read-only access for this device.' : 'Lịch sử chia sẻ và truy cập chỉ xem của thiết bị này.') : (en ? 'Registration and sign-in attempts for your account.' : 'Lịch sử đăng ký và đăng nhập vào tài khoản của bạn.')}</p></div>
      <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => { if (!opened) setOpened(true); void load(); }}>
        {loading ? (en ? 'Loading…' : 'Đang tải…') : opened ? (en ? 'Refresh' : 'Làm mới') : (en ? 'View activity' : 'Xem nhật ký')}
      </button>
    </div>
    {opened && <div role="status" aria-live="polite">
      {error && <p className="activity-log-error">{en ? 'Could not load activity. Try again.' : 'Không tải được nhật ký. Hãy thử lại.'}</p>}
      {!loading && !error && (items.length === 0 ? <p className="activity-log-empty">{en ? 'No activity recorded yet.' : 'Chưa có hoạt động nào được ghi nhận.'}</p> :
        <ol className="activity-log-list">{items.map((item) => <li key={item.id}>
          <div><strong>{LABELS[item.action]?.[en ? 1 : 0] || item.action}</strong>
            {deviceId && <span className="activity-log-actor">{item.action === 'DEVICE_SHARED' || item.action === 'DEVICE_SHARE_REVOKED' ? item.subject?.name || item.subject?.email : item.actor?.name || item.actor?.email}</span>}
            {item.deviceLabel && <span className="activity-log-actor">{item.deviceLabel}{item.browserLabel ? ` · ${item.browserLabel}` : ''}</span>}
            {item.detail && <span className="activity-log-actor">{item.detail === 'enabled' ? (en ? 'Enabled' : 'Đã bật')
              : item.detail === 'disabled' ? (en ? 'Disabled' : 'Đã tắt') : item.detail}</span>}</div>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(en ? 'en-US' : 'vi-VN')}</time>
        </li>)}</ol>)}
    </div>}
  </section>;
}
