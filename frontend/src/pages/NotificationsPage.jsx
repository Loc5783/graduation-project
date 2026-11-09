import { useNotificationContext } from '../context/NotificationContext.jsx';
import { useLanguage, getErrorMessage } from '../context/LanguageContext.jsx';
import { RefreshIcon, CheckCircleIcon } from '../shared/components/AuthIcons.jsx';
import NotificationItem from '../shared/components/NotificationItem.jsx';

/**
 * Trang Hộp thư thông báo (/notifications).
 */
export default function NotificationsPage() {
  const {
    notifications,
    nextCursor,
    unreadCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    isMarkingAll,
    markingIds,
    error,
    actionError,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    clearActionError
  } = useNotificationContext();

  const { t } = useLanguage();

  return (
    <div className="notifications-page">
      <header className="page-header notif-page-header">
        <div className="page-header-content">
          <div className="notif-title-area">
            <h1 className="page-title">{t('notif_page_title')}</h1>
            {unreadCount > 0 && (
              <span className="unread-badge-pill" aria-label={`${unreadCount} ${t('notif_status_unread')}`}>
                {unreadCount} {t('notif_status_unread')}
              </span>
            )}
          </div>
          <p className="page-subtitle">{t('notif_page_subtitle')}</p>
        </div>

        <div className="notif-header-actions">
          <button
            type="button"
            className="btn btn-outline notif-action-btn"
            onClick={refresh}
            disabled={isRefreshing || isLoading}
            aria-label={t('notif_btn_refresh')}
          >
            <RefreshIcon className={`btn-icon ${isRefreshing ? 'spin' : ''}`} />
            <span>{t('notif_btn_refresh')}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary notif-action-btn"
            onClick={markAllAsRead}
            disabled={isMarkingAll || unreadCount === 0 || notifications.length === 0}
            aria-label={t('notif_btn_mark_all_read')}
          >
            <CheckCircleIcon className="btn-icon" />
            <span>{isMarkingAll ? '...' : t('notif_btn_mark_all_read')}</span>
          </button>
        </div>
      </header>

      {/* Thông báo lỗi thao tác (nếu có) */}
      {actionError && (
        <div className="alert alert-danger notif-action-error" role="alert">
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

      {/* Khi làm mới lỗi nhưng đã có dữ liệu: giữ danh sách và hiện banner cảnh báo kèm nút thử lại */}
      {error && notifications.length > 0 && (
        <div className="alert alert-warning notif-refresh-error-banner" role="alert">
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

      {/* Trạng thái tải lần đầu */}
      {isLoading && notifications.length === 0 ? (
        <div className="notif-page-loading" role="status">
          <div className="spinner-md" aria-hidden="true" />
          <p>{t('notif_loading')}</p>
        </div>
      ) : error && notifications.length === 0 ? (
        <div className="notif-page-error card" role="alert">
          <p className="error-title">{getErrorMessage(error, t) || t('notif_load_error')}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={refresh}
          >
            {t('notif_btn_retry')}
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="notif-page-empty card">
          <div className="empty-icon" aria-hidden="true">🔔</div>
          <h2 className="empty-title">{t('notif_empty_title')}</h2>
          <p className="empty-desc">{t('notif_empty_desc')}</p>
        </div>
      ) : (
        <div className="notif-page-content">
          <div className="notif-items-list" role="feed" aria-busy={isLoadingMore}>
            {notifications.map((item, idx) => (
              <NotificationItem
                key={item.id || idx}
                notification={item}
                onMarkAsRead={markAsRead}
                isMarking={markingIds.has(item.id)}
                isCompact={false}
              />
            ))}
          </div>

          {/* Nút tải thêm phân trang */}
          {nextCursor && (
            <div className="notif-load-more-wrap">
              <button
                type="button"
                className="btn btn-outline notif-load-more-btn"
                onClick={loadMore}
                disabled={isLoadingMore}
                aria-label={t('notif_btn_load_more')}
              >
                {isLoadingMore ? (
                  <>
                    <span className="spinner-sm" aria-hidden="true" />
                    <span>{t('notif_btn_loading_more')}</span>
                  </>
                ) : (
                  <span>{t('notif_btn_load_more')}</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
