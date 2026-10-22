import { useLanguage } from '../../context/LanguageContext.jsx';

/**
 * Chỉ báo trạng thái kết nối Hub Trung tâm
 * Trạng thái hỗ trợ: 'online' | 'connecting' | 'offline' | 'not_connected'
 * Mặc định: 'not_connected' (do hệ thống hiện tại chưa kết nối MQTT/Hub thật)
 */
export default function HubStatusIndicator({ status = 'not_connected', className = '' }) {
  const { t } = useLanguage();

  const labels = {
    online: t('hub_status_online'),
    connecting: t('hub_status_connecting'),
    offline: t('hub_status_offline'),
    not_connected: t('hub_status_not_connected')
  };

  const labelText = labels[status] || labels.not_connected;

  return (
    <div
      className={`hub-status-indicator status-${status} ${className}`.trim()}
      role="status"
      aria-label={`${t('hub_status_aria')}: ${labelText}`}
    >
      <span className="hub-status-dot-wrapper" aria-hidden="true">
        <span className="hub-status-dot" />
        {status === 'online' && <span className="hub-status-pulse" />}
      </span>
      <span className="hub-status-label">{labelText}</span>
    </div>
  );
}
