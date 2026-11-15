import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useMyDevices } from '../../context/MyDevicesContext.jsx';
import DeviceShareManager from './DeviceShareManager.jsx';
import './DeviceGuard.css';

export default function DeviceGuard({ deviceId, children }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const myDevices = useMyDevices();

  if (!myDevices?.isProvided) {
    return children;
  }

  const { getDeviceAccess, loading } = myDevices;

  if (loading) {
    return (
      <div className="device-guard-loading" role="status">
        <div className="auth-spinner" aria-hidden="true"></div>
        <p>{isEn ? 'Checking device access…' : 'Đang kiểm tra quyền truy cập thiết bị…'}</p>
      </div>
    );
  }

  const access = getDeviceAccess(deviceId);

  if (!access) {
    return (
      <div className="device-guard-unauthorized" role="alert">
        <div className="unauthorized-card">
          <span className="unauthorized-icon" aria-hidden="true">🔒</span>
          <h2>{isEn ? 'Device Not Paired' : 'Thiết bị chưa được kết nối'}</h2>
          <p>
            {isEn
              ? 'You do not have access to this device. You need to claim it using its secret pairing code or have the owner share view access with you.'
              : 'Tài khoản của bạn chưa nhận thiết bị này hoặc chưa được chủ sở hữu chia sẻ quyền xem.'}
          </p>
          <div className="unauthorized-actions">
            <Link to="/overview" className="btn btn-primary">
              ← {isEn ? 'Return to Overview' : 'Quay lại Tổng quan'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isDeviceOwner = access === 'owner';

  return (
    <div className={`device-guard-container access-${access}`}>
      {/* Thanh hiển thị quyền truy cập */}
      <div className="device-access-banner" role="status">
        <span className={`access-pill ${isDeviceOwner ? 'access-pill-owner' : 'access-pill-viewer'}`}>
          {isDeviceOwner
            ? (isEn ? '★ My Device (Owner)' : '★ Thiết bị của tôi (Chủ sở hữu)')
            : (isEn ? '👁 Shared Access (Read-only)' : '👁 Được chia sẻ · Chỉ xem')}
        </span>
        {!isDeviceOwner && (
          <span className="viewer-restriction-hint">
            {isEn
              ? 'Controls and configurations are disabled for read-only viewers.'
              : 'Tài khoản chỉ xem không có quyền điều khiển hoặc đổi cấu hình.'}
          </span>
        )}
      </div>

      {/* Nội dung module thiết bị */}
      <div className="device-module-content">
        {children}
      </div>

      {/* Khu vực chia sẻ thiết bị (Chỉ hiển thị cho chủ sở hữu) */}
      {isDeviceOwner && (
        <section className="device-owner-share-section" aria-label={isEn ? 'Device sharing' : 'Chia sẻ thiết bị'}>
          <DeviceShareManager deviceId={deviceId} isOwner={true} />
        </section>
      )}
    </div>
  );
}
