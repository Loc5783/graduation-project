import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useNotificationContext } from '../../context/NotificationContext.jsx';
import { useLanguage, getErrorMessage } from '../../context/LanguageContext.jsx';
import { BellIcon, RefreshIcon } from './AuthIcons.jsx';
import NotificationItem from './NotificationItem.jsx';

/**
 * Nút Chuông Thông báo và Menu Dropdown xem nhanh trên Topbar.
 */
export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing,
    error,
    actionError,
    refresh,
    markAsRead,
    markingIds,
    clearActionError
  } = useNotificationContext();

  const { t } = useLanguage();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const bellBtnRef = useRef(null);

  // Đóng dropdown khi click bên ngoài
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Đóng dropdown bằng phím Escape và trả focus về nút chuông
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        bellBtnRef.current?.focus();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Đóng dropdown khi chuyển route
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const toggleDropdown = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      // Làm mới dữ liệu khi mở dropdown
      refresh();
    }
  };

  // Hiển thị badge: tối đa 99+
  const badgeLabel = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

  // Lấy tối đa 5 thông báo mới nhất cho dropdown
  const topNotifications = notifications.slice(0, 5);

  const bellAriaLabel = unreadCount > 0
    ? `${t('notif_bell_aria')} (${unreadCount} ${t('notif_status_unread')})`
    : t('notif_bell_aria');

  return (
    <div className="topbar-notification-area" ref={containerRef}>
      <button
        ref={bellBtnRef}
        type="button"
        className={`notification-bell-btn ${isOpen ? 'active' : ''}`}
        onClick={toggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={bellAriaLabel}
      >
        <BellIcon className="bell-icon" />
        {badgeLabel && (
          <span className="notification-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      <div
        className="notification-dropdown"
        hidden={!isOpen}
        style={!isOpen ? { display: 'none' } : undefined}
        role="region"
        aria-label={t('notif_dropdown_title')}
      >
        <div className="dropdown-header">
          <div className="dropdown-title-wrap">
            <h3 className="dropdown-title">{t('notif_dropdown_title')}</h3>
            {unreadCount > 0 && (
              <span className="unread-count-pill">
                {unreadCount} {t('notif_status_unread')}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-refresh-icon"
            onClick={refresh}
            disabled={isRefreshing}
            aria-label={t('notif_btn_refresh')}
            title={t('notif_btn_refresh')}
          >
            <RefreshIcon className={`refresh-svg ${isRefreshing ? 'spin' : ''}`} />
          </button>
        </div>

        <div className="dropdown-body">
          {actionError && (
            <div className="dropdown-action-error alert alert-danger" role="alert">
              <span>{getErrorMessage(actionError, t)}</span>
              <div className="notif-alert-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-outline notif-retry-btn"
                  onClick={() => {
                    clearActionError();
                    refresh();
                  }}
                >
                  {t('notif_btn_retry')}
                </button>
                <button
                  type="button"
                  className="btn-close-alert"
                  onClick={clearActionError}
                  aria-label={t('notif_btn_close_error') || t('close_notice')}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {error && notifications.length > 0 && (
            <div className="dropdown-refresh-error alert alert-warning" role="alert">
              <span>{getErrorMessage(error, t) || t('notif_load_error')}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline notif-retry-btn"
                onClick={refresh}
              >
                {t('notif_btn_retry')}
              </button>
            </div>
          )}

          {isLoading && notifications.length === 0 ? (
            <div className="dropdown-loading-state" role="status">
              <div className="spinner-sm" aria-hidden="true" />
              <span>{t('notif_loading')}</span>
            </div>
          ) : error && notifications.length === 0 ? (
            <div className="dropdown-error-state" role="alert">
              <p>{getErrorMessage(error, t) || t('notif_load_error')}</p>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={refresh}
              >
                {t('notif_btn_retry')}
              </button>
            </div>
          ) : topNotifications.length === 0 ? (
            <div className="dropdown-empty-state">
              <p className="empty-title">{t('notif_empty_title')}</p>
              <p className="empty-desc">{t('notif_empty_desc')}</p>
            </div>
          ) : (
            <div className="dropdown-list">
              {topNotifications.map((item, idx) => (
                <NotificationItem
                  key={item.id || idx}
                  notification={item}
                  onMarkAsRead={markAsRead}
                  isMarking={markingIds.has(item.id)}
                  isCompact={true}
                />
              ))}
            </div>
          )}
        </div>

        <div className="dropdown-footer">
          <Link
            to="/notifications"
            className="view-all-link"
            onClick={() => setIsOpen(false)}
          >
            {t('notif_btn_view_all')} →
          </Link>
        </div>
      </div>
    </div>
  );
}
