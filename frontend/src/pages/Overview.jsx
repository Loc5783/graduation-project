import { useState } from 'react';
import { Link } from 'react-router-dom';
import LiveDevicePanel from '../shared/components/LiveDevicePanel.jsx';
import ClaimDeviceModal from '../shared/components/ClaimDeviceModal.jsx';
import { deviceConfigs } from '../modules/configs.js';
import { useLanguage, getDeviceDisplayName } from '../context/LanguageContext.jsx';
import { useMyDevices } from '../context/MyDevicesContext.jsx';
import { getDeviceIcon, SignalIcon } from '../shared/components/AuthIcons.jsx';
import './Overview.css';

const SMART_BIN_CONFIG = {
  id: 'smart-bin',
  name: 'Thùng rác thông minh',
  owner: 'ESP32'
};

export default function Overview() {
  const { t, lang } = useLanguage();
  const isEn = lang === 'en';
  const myDevices = useMyDevices();
  const hasMyDevicesProvider = Boolean(myDevices?.isProvided);
  const devices = hasMyDevicesProvider
    ? myDevices.devices
    : deviceConfigs.map((c) => ({ id: c.id, code: c.id, access: 'owner' }));
  const loading = hasMyDevicesProvider ? myDevices.loading : false;
  const ownedDevices = devices.filter((device) => device.access === 'owner');
  const sharedDevices = devices.filter((device) => device.access === 'viewer');
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);

  const getDeviceConfig = (id) => {
    if (id === 'smart-bin') return SMART_BIN_CONFIG;
    return deviceConfigs.find((c) => c.id === id) || { id, name: id, owner: '' };
  };

  const renderDeviceGroup = (group, access) => {
    const shared = access === 'viewer';
    const title = shared
      ? (isEn ? 'Shared with me · View only' : 'Được chia sẻ · Chỉ xem')
      : (isEn ? 'My devices' : 'Thiết bị của tôi');
    return <section className={`overview-device-group ${shared ? 'overview-group-shared' : 'overview-group-owned'}`} aria-label={title}>
      <div className="overview-group-heading">
        <h2 className="section-title">{title} <span className="overview-group-count">{group.length}</span></h2>
        {shared && <p>{isEn ? 'You can view data; only the owner can change device settings.' : 'Bạn chỉ xem dữ liệu; chủ sở hữu mới có thể thay đổi thiết bị.'}</p>}
      </div>
      {group.length > 0 ? <>
        <LiveDevicePanel allowedDeviceIds={group.map((device) => device.id)} />
        <div className="overview-device-grid overview-grid">{group.map((dev) => {
          const config = getDeviceConfig(dev.id);
          return <div key={dev.id} className="overview-card module-card">
            <div className="module-card-header">
              <span className="module-icon-wrap" aria-hidden="true">{getDeviceIcon(dev.id)}</span>
              <div className="module-badges-wrap">
                <span className="module-id-badge"><code>{dev.code || dev.id}</code></span>
                <span className={`device-role-pill ${shared ? 'pill-viewer' : 'pill-owner'}`}>{shared ? (isEn ? 'Viewer' : 'Chỉ xem') : (isEn ? 'Owner' : 'Chủ sở hữu')}</span>
              </div>
            </div>
            <h3 className="module-name">{dev.customName || getDeviceDisplayName(dev.id, t, config.name)}</h3>
            <p className="module-owner-info">{shared
              ? (isEn ? 'Shared with you (read only)' : 'Được chia sẻ cho bạn (chỉ xem)')
              : hasMyDevicesProvider ? (isEn ? 'Your device' : 'Thiết bị của bạn') : <>{t('overview_owner_prefix')} <strong>{config.owner}</strong></>}</p>
            <div className="card-status-badge"><span className="status-indicator-icon" aria-hidden="true"><SignalIcon /></span><span>{t('overview_status_no_data')}</span></div>
            <div className="module-card-footer"><Link to={`/devices/${dev.id}`} className="btn btn-outline btn-sm">{t('overview_btn_details')}</Link></div>
          </div>;
        })}</div>
      </> : <p className="overview-group-empty">{shared ? (isEn ? 'No devices have been shared with you.' : 'Chưa có thiết bị nào được chia sẻ cho bạn.') : (isEn ? 'Add a device to start.' : 'Thêm thiết bị để bắt đầu.')}</p>}
    </section>;
  };

  return (
    <div className="overview-page">
      <header className="overview-header">
        <div className="overview-header-main">
          <div>
            <h1 className="overview-title">{t('overview_title')}</h1>
            <p className="overview-subtitle">
              {devices.length === 0
                ? (isEn ? 'No devices in your home yet.' : 'Chưa có thiết bị nào trong nhà bạn.')
                : (isEn
                  ? `Monitor and manage privacy data for ${devices.length} device${devices.length === 1 ? '' : 's'} in your home.`
                  : `Theo dõi và quản lý dữ liệu riêng tư của ${devices.length} thiết bị trong nhà bạn.`)}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-add-device"
            onClick={() => setIsClaimModalOpen(true)}
          >
            + {isEn ? 'Add Device' : 'Thêm thiết bị'}
          </button>
        </div>
      </header>

      {/* Trường hợp đang tải ban đầu */}
      {loading && devices.length === 0 && (
        <div className="overview-loading-state" role="status">
          <div className="auth-spinner" aria-hidden="true"></div>
          <p>{isEn ? 'Loading your devices…' : 'Đang tải danh sách thiết bị của bạn…'}</p>
        </div>
      )}

      {/* Trường hợp chưa nhận thiết bị: Hiển thị Tổng quan trống với nút Thêm thiết bị */}
      {!loading && devices.length === 0 && (
        <section className="overview-empty-state" aria-label={isEn ? 'No devices' : 'Chưa có thiết bị'}>
          <div className="empty-state-card">
            <div className="empty-state-icon" aria-hidden="true">📡</div>
            <h2 className="empty-state-title">
              {isEn ? 'No devices in your home yet' : 'Chưa có thiết bị nào trong nhà của bạn'}
            </h2>
            <p className="empty-state-desc">
              {isEn
                ? 'Your home is currently empty. Enter the Device Code (e.g. TRTM01) and private Pairing Secret to claim your first smart device.'
                : 'Tài khoản của bạn chưa kết nối thiết bị nào. Nhập mã nhận diện (VD: TRTM01) và mã ghép nối bí mật dán trên thiết bị để nhận quyền sở hữu.'}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-lg btn-claim-cta"
              onClick={() => setIsClaimModalOpen(true)}
            >
              + {isEn ? 'Add Device' : 'Thêm thiết bị'}
            </button>
          </div>
        </section>
      )}

      {/* Trường hợp đã có thiết bị: Hiển thị LivePanel và danh sách các thiết bị người dùng sở hữu/được chia sẻ */}
      {devices.length > 0 && <div className="overview-device-groups">
        {renderDeviceGroup(ownedDevices, 'owner')}
        {renderDeviceGroup(sharedDevices, 'viewer')}
      </div>}

      {/* Modal ghép nối / nhận thiết bị */}
      <ClaimDeviceModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
      />
    </div>
  );
}
