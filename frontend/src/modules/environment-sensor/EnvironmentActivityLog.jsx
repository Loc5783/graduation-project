import { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function EnvironmentActivityLog({ events = [] }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [filter, setFilter] = useState('all');

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.category === filter);
  }, [events, filter]);

  return (
    <div className="env-log-card">
      <div className="env-log-header">
        <div className="env-log-title-group">
          <h3 className="env-log-title">
            {isEn ? 'Environment Activity Log' : 'Nhật ký sự kiện môi trường'}
          </h3>
          <span className="env-log-badge">
            {events.length} {isEn ? 'events' : 'sự kiện'}
          </span>
        </div>

        <div className="env-log-filters" role="group" aria-label={isEn ? 'Event Filters' : 'Bộ lọc sự kiện'}>
          <button
            type="button"
            className={`env-filter-btn ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {isEn ? 'All' : 'Tất cả'}
          </button>
          <button
            type="button"
            className={`env-filter-btn ${filter === 'alert' ? 'is-active' : ''}`}
            onClick={() => setFilter('alert')}
          >
            {isEn ? 'Gas Alerts' : 'Cảnh báo Gas'}
          </button>
          <button
            type="button"
            className={`env-filter-btn ${filter === 'buzzer' ? 'is-active' : ''}`}
            onClick={() => setFilter('buzzer')}
          >
            {isEn ? 'Buzzer' : 'Còi'}
          </button>
          <button
            type="button"
            className={`env-filter-btn ${filter === 'connection' ? 'is-active' : ''}`}
            onClick={() => setFilter('connection')}
          >
            {isEn ? 'Connection' : 'Kết nối'}
          </button>
        </div>
      </div>

      <div className="env-log-disclaimer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'In-memory observation history: Only records alert level transitions and buzzer changes. Minor ADC noise is ignored.'
            : 'Nhật ký quan sát trong bộ nhớ: Chỉ ghi nhận chuyển dịch mức cảnh báo và còi buzzer. Dao động ADC nhỏ được bỏ qua.'}
        </span>
      </div>

      <div className="env-log-list" role="feed" aria-busy={false}>
        {filteredEvents.length === 0 ? (
          <div className="env-log-empty">
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
              <article key={item.id} className={`env-log-item log-level-${item.level || 'info'}`}>
                <div className="env-log-item-aside">
                  <span className="env-log-time">{timeStr}</span>
                  <span className={`env-level-tag tag-${item.level || 'info'}`}>
                    {item.level?.toUpperCase() || 'INFO'}
                  </span>
                </div>
                <div className="env-log-item-content">
                  <h4 className="env-log-item-title">
                    {isEn ? (item.titleEn || item.title) : item.title}
                  </h4>
                  <p className="env-log-item-detail">
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
