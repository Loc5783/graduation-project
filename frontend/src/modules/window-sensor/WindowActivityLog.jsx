import { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function WindowActivityLog({ events = [] }) {
  const { lang } = useLanguage();
  const en = lang === 'en';

  const [filter, setFilter] = useState('all'); // 'all' | 'connection' | 'door' | 'motion' | 'alarm'

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.category === filter);
  }, [events, filter]);

  const getEventIcon = (type) => {
    switch (type) {
      case 'door_open':
      case 'door_closed':
        return (
          <svg viewBox="0 0 24 24" className="log-icon door-icon" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <line x1="12" x2="12" y1="3" y2="21" />
          </svg>
        );
      case 'motion_start':
      case 'motion_end':
        return (
          <svg viewBox="0 0 24 24" className="log-icon motion-icon" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="7" r="4" />
            <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2" />
          </svg>
        );
      case 'alarm_active':
      case 'alarm_cleared':
        return (
          <svg viewBox="0 0 24 24" className="log-icon alarm-icon" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'online':
      case 'offline':
      case 'session_start':
      default:
        return (
          <svg viewBox="0 0 24 24" className="log-icon conn-icon" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 20h.01" />
            <path d="M7 20v-4" />
            <path d="M12 20v-8" />
            <path d="M17 20V8" />
            <path d="M22 4v16" />
          </svg>
        );
    }
  };

  const getLevelBadge = (level) => {
    switch (level) {
      case 'danger':
        return <span className="level-badge badge-danger">{en ? 'Warning/Alert' : 'Cảnh báo'}</span>;
      case 'warning':
        return <span className="level-badge badge-warning">{en ? 'Notice' : 'Lưu ý'}</span>;
      case 'info':
      default:
        return <span className="level-badge badge-info">{en ? 'Info' : 'Thông tin'}</span>;
    }
  };

  return (
    <div className="window-activity-log-card">
      <div className="log-card-header">
        <div className="log-title-wrap">
          <h3 className="card-section-title">{en ? 'Activity Log' : 'Nhật ký Hoạt động Quan sát'}</h3>
          <span className="card-subtitle">
            {en ? 'Realtime transition events in current session' : 'Ghi nhận các chuyển đổi trạng thái thực tế'}
          </span>
        </div>

        {/* Bộ lọc loại sự kiện */}
        <div className="log-filters" role="group" aria-label={en ? 'Event filters' : 'Bộ lọc nhật ký'}>
          <button
            type="button"
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {en ? 'All' : 'Tất cả'} ({events.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'connection' ? 'active' : ''}`}
            onClick={() => setFilter('connection')}
          >
            {en ? 'Connection' : 'Kết nối'}
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'door' ? 'active' : ''}`}
            onClick={() => setFilter('door')}
          >
            {en ? 'Door' : 'Cửa sổ'}
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'motion' ? 'active' : ''}`}
            onClick={() => setFilter('motion')}
          >
            {en ? 'Motion' : 'Chuyển động'}
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'alarm' ? 'active' : ''}`}
            onClick={() => setFilter('alarm')}
          >
            {en ? 'Alarm' : 'Cảnh báo'}
          </button>
        </div>
      </div>

      {/* Danh sách sự kiện */}
      <div className="log-list-container">
        {filteredEvents.length > 0 ? (
          <ul className="log-events-list">
            {filteredEvents.map((ev) => {
              const timeStr = new Date(ev.timestamp).toLocaleTimeString(en ? 'en-US' : 'vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              });
              return (
                <li key={ev.id} className={`log-event-row log-level-${ev.level}`}>
                  <div className="event-icon-cell" aria-hidden="true">
                    {getEventIcon(ev.type)}
                  </div>

                  <div className="event-content-cell">
                    <div className="event-main-line">
                      <span className="event-title">{en ? (ev.titleEn || ev.title) : ev.title}</span>
                      {getLevelBadge(ev.level)}
                    </div>
                    <p className="event-detail">{en ? (ev.detailEn || ev.detail) : ev.detail}</p>
                  </div>

                  <div className="event-time-cell">
                    <span className="time-val">{timeStr}</span>
                    <small className="time-label">{en ? 'Observed time' : 'Thời gian ghi nhận'}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="log-empty-state">
            <span className="empty-icon" aria-hidden="true">📋</span>
            <p className="empty-msg">
              {en ? 'No events recorded in this category.' : 'Chưa có sự kiện nào trong danh mục đã chọn.'}
            </p>
          </div>
        )}
      </div>

      {/* Chú thích giới hạn phiên làm việc */}
      <div className="log-footer-notice">
        <span className="notice-icon" aria-hidden="true">ℹ️</span>
        <span className="notice-text">
          {en
            ? 'History is kept in-memory for the current browser session only (not saved on server). Refreshing the page (F5) starts a new observation session.'
            : 'Lịch sử từ lúc mở trang, chưa lưu trên máy chủ. Tải lại trang (F5) bắt đầu phiên quan sát mới.'}
        </span>
      </div>
    </div>
  );
}
