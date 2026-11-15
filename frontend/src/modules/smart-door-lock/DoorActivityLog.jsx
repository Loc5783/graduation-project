import { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function DoorActivityLog({ events = [] }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [filter, setFilter] = useState('all'); // 'all' | 'door' | 'bolt' | 'alarm' | 'connection'

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.category === filter);
  }, [events, filter]);

  return (
    <div className="door-log-card">
      <div className="door-log-header">
        <div className="door-log-title-group">
          <h3 className="door-log-title">
            {isEn ? 'Session Activity Log' : 'Nhật ký sự kiện phiên làm việc'}
          </h3>
          <span className="door-log-badge">
            {events.length} {isEn ? 'events' : 'sự kiện'}
          </span>
        </div>

        {/* Bộ lọc loại sự kiện */}
        <div className="door-log-filters" role="group" aria-label={isEn ? 'Event Filters' : 'Bộ lọc sự kiện'}>
          <button
            type="button"
            className={`door-filter-btn ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {isEn ? 'All' : 'Tất cả'}
          </button>
          <button
            type="button"
            className={`door-filter-btn ${filter === 'door' ? 'is-active' : ''}`}
            onClick={() => setFilter('door')}
          >
            {isEn ? 'Door' : 'Cửa'}
          </button>
          <button
            type="button"
            className={`door-filter-btn ${filter === 'bolt' ? 'is-active' : ''}`}
            onClick={() => setFilter('bolt')}
          >
            {isEn ? 'Bolt Cmd' : 'Lệnh chốt'}
          </button>
          <button
            type="button"
            className={`door-filter-btn ${filter === 'alarm' ? 'is-active' : ''}`}
            onClick={() => setFilter('alarm')}
          >
            {isEn ? 'Alarm' : 'Cảnh báo'}
          </button>
          <button
            type="button"
            className={`door-filter-btn ${filter === 'connection' ? 'is-active' : ''}`}
            onClick={() => setFilter('connection')}
          >
            {isEn ? 'Connection' : 'Kết nối'}
          </button>
        </div>
      </div>

      <div className="door-log-disclaimer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'In-memory observation history: Only records state transitions during current web session. Not stored on server.'
            : 'Nhật ký quan sát trong bộ nhớ: Chỉ ghi nhận chuyển đổi trạng thái trong phiên web hiện tại. Chưa lưu trên máy chủ.'}
        </span>
      </div>

      <div className="door-log-list" role="feed" aria-busy={false}>
        {filteredEvents.length === 0 ? (
          <div className="door-log-empty">
            <p>{isEn ? 'No events recorded in this category.' : 'Chưa có sự kiện nào trong danh mục này.'}</p>
          </div>
        ) : (
          filteredEvents.map((item) => {
            const timeStr = new Date(item.timestamp).toLocaleTimeString(isEn ? 'en-US' : 'vi-VN', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            return (
              <article key={item.id} className={`door-log-item log-level-${item.level || 'info'}`}>
                <div className="door-log-item-aside">
                  <span className="door-log-time">{timeStr}</span>
                  <span className={`door-level-tag tag-${item.level || 'info'}`}>
                    {item.level?.toUpperCase() || 'INFO'}
                  </span>
                </div>
                <div className="door-log-item-content">
                  <h4 className="door-log-item-title">
                    {isEn ? (item.titleEn || item.title) : item.title}
                  </h4>
                  <p className="door-log-item-detail">
                    {isEn ? (item.detailEn || item.detail) : item.detail}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
