import { useLanguage } from '../../context/LanguageContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatDateTime } from '../dateTimeFormatter.js';
import { CheckCircleIcon } from './AuthIcons.jsx';

/**
 * Hiển thị một thông báo đơn lẻ, dùng chung cho cả Dropdown xem nhanh và Trang /notifications.
 *
 * @param {object} props
 * @param {object} props.notification Dữ liệu thông báo
 * @param {Function} [props.onMarkAsRead] Callback khi bấm đánh dấu đã đọc
 * @param {boolean} [props.isMarking=false] Cờ cho biết đang gửi request đánh dấu đã đọc
 * @param {boolean} [props.isCompact=false] Thu gọn cho dropdown
 */
export default function NotificationItem({
  notification,
  onMarkAsRead,
  isMarking = false,
  isCompact = false
}) {
  const { t, lang } = useLanguage();
  const { currentSettings } = useSettings();

  if (!notification) return null;

  const { id, eventCode, severity, params, isRead, readAt, createdAt } = notification;

  // 1. Phân giải tiêu đề và nội dung theo eventCode an toàn
  let title = t('notif_event_fallback_title');
  let description = t('notif_event_fallback_desc');

  if (eventCode === 'SESSION_REVOKED') {
    title = t('notif_event_session_revoked_title');
    const device = (params && typeof params.deviceLabel === 'string' && params.deviceLabel.trim())
      ? params.deviceLabel.trim()
      : t('notif_unknown_device');
    const browser = (params && typeof params.browserLabel === 'string' && params.browserLabel.trim())
      ? params.browserLabel.trim()
      : t('notif_unknown_browser');

    description = `${t('notif_device_label')} ${device} • ${t('notif_browser_label')} ${browser}`;
  }

  if (eventCode === 'UNUSUAL_DATA_ACCESS') {
    title = lang === 'en' ? 'Unusual data access' : 'Truy cập dữ liệu bất thường';
    description = lang === 'en' ? `A denied attempt to read ${params?.deviceId || 'a device'} was recorded.`
      : `Đã ghi nhận lượt đọc bị từ chối đối với ${params?.deviceId || 'thiết bị'}.`;
  }
  if (eventCode === 'DEVICE_DISCONNECTED' || eventCode === 'DEVICE_ALERT') {
    const deviceId = typeof params?.deviceId === 'string' ? params.deviceId : '';
    const known = ['smart-door-lock', 'window-sensor', 'smart-bin', 'environment-sensor', 'smart-plug'];
    const device = known.includes(deviceId) ? deviceId : (lang === 'en' ? 'Unknown device' : 'Thiết bị chưa xác định');
    if (eventCode === 'DEVICE_DISCONNECTED') {
      title = lang === 'en' ? 'Device disconnected' : 'Thiết bị mất kết nối';
      description = lang === 'en' ? `${device} stopped sending fresh data.` : `${device} đã ngừng gửi dữ liệu mới.`;
    } else {
      title = lang === 'en' ? 'Device alert' : 'Cảnh báo thiết bị';
      const labels = {
        GAS_WARNING: ['Khí gas: mức cảnh báo cảm biến', 'Gas sensor warning level'],
        GAS_DANGER: ['Khí gas: mức nguy hiểm cảm biến', 'Gas sensor danger level'],
        WINDOW_ALARM: ['Cảnh báo cửa sổ', 'Window alarm'],
        FORCED_OPEN: ['Khóa cửa: tín hiệu mở cưỡng bức', 'Door lock forced-open signal'],
        HELD_OPEN: ['Khóa cửa: tín hiệu mở lâu', 'Door lock held-open signal'],
        TAMPER: ['Khóa cửa: tín hiệu can thiệp', 'Door lock tamper signal'],
        DOOR_ALARM: ['Khóa cửa: báo động', 'Door lock alarm']
      };
      const label = labels[params?.alertKind];
      description = `${device}: ${label ? label[lang === 'en' ? 1 : 0] : (lang === 'en' ? 'Alert received' : 'Đã nhận cảnh báo')}`;
    }
  }

  // 2. Định dạng ngày giờ theo cài đặt người dùng
  const formattedCreatedAt = formatDateTime(createdAt, {
    timeZone: currentSettings.timeZone,
    dateFormat: currentSettings.dateFormat,
    hourFormat: currentSettings.hourFormat
  });

  const formattedReadAt = readAt
    ? formatDateTime(readAt, {
        timeZone: currentSettings.timeZone,
        dateFormat: currentSettings.dateFormat,
        hourFormat: currentSettings.hourFormat
      })
    : null;

  // 3. Phân cấp mức độ nghiêm trọng
  const getSeverityBadge = () => {
    switch (severity) {
      case 'urgent':
        return <span className="notif-badge badge-urgent">{t('notif_badge_urgent')}</span>;
      case 'warning':
        return <span className="notif-badge badge-warning">{t('notif_badge_warning')}</span>;
      default:
        return <span className="notif-badge badge-info">{t('notif_badge_info')}</span>;
    }
  };

  return (
    <article
      className={`notification-item ${isRead ? 'read' : 'unread'} ${isCompact ? 'compact' : ''}`}
      data-notification-id={id}
    >
      <div className="notif-item-header">
        <div className="notif-item-title-wrap">
          {!isRead && <span className="unread-dot" aria-hidden="true" />}
          <h4 className="notif-item-title">{title}</h4>
        </div>
        <div className="notif-item-meta">
          {getSeverityBadge()}
          <time className="notif-item-time" dateTime={createdAt}>
            {formattedCreatedAt}
          </time>
        </div>
      </div>

      <div className="notif-item-body">
        <p className="notif-item-desc">{description}</p>
      </div>

      <div className="notif-item-footer">
        {isRead ? (
          <span className="notif-read-status">
            <span className="read-status-label">{t('notif_status_read')}</span>
            {formattedReadAt && (
              <span className="read-at-time">
                {' '}({t('notif_time_read_at')} {formattedReadAt})
              </span>
            )}
          </span>
        ) : (
          onMarkAsRead && (
            <button
              type="button"
              className="btn btn-sm btn-ghost notif-mark-read-btn"
              onClick={() => onMarkAsRead(id)}
              disabled={isMarking}
              aria-label={`${t('notif_btn_mark_read')}: ${title}`}
            >
              <CheckCircleIcon className="btn-icon-sm" />
              <span>{isMarking ? '...' : t('notif_btn_mark_read')}</span>
            </button>
          )
        )}
      </div>
    </article>
  );
}
