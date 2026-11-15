import { useLanguage } from '../../context/LanguageContext.jsx';

export default function SpeakerCommandList({ history = [] }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  return (
    <div className="speaker-list-card">
      <div className="speaker-list-header">
        <div className="speaker-list-title-group">
          <h3 className="speaker-list-title">
            {isEn ? 'Recent Voice Command History' : 'Lịch sử lệnh thoại gần nhất'}
          </h3>
          <span className="speaker-list-badge">
            {history.length} {isEn ? 'records' : 'bản ghi'}
          </span>
        </div>
      </div>

      <div className="speaker-list-disclaimer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'Execution Notice: "Gateway accepted" confirms receipt and MQTT dispatch, but does not verify physical mechanical actuation.'
            : 'Lưu ý vận hành: "Gateway nhận lệnh" xác nhận gateway đã chuyển tiếp lệnh vào MQTT, không khẳng định thiết bị cơ khí đã chấp hành xong.'}
        </span>
      </div>

      <div className="speaker-list-body" role="feed">
        {history.length === 0 ? (
          <div className="speaker-list-empty">
            <p>{isEn ? 'No voice commands logged yet in Gateway.' : 'Chưa có lệnh thoại nào được ghi nhận trong Gateway.'}</p>
          </div>
        ) : (
          history.map((item, idx) => {
            const res = item.result || {};
            const isQuery = item.command?.endsWith('_STATUS');
            const displayText = res.display || (res.action ? `${res.device}: ${res.action}` : (res.local ? 'Local action' : 'Dispatched'));

            return (
              <article key={idx} className="speaker-log-row">
                <div className="speaker-log-aside">
                  <span className="speaker-log-seq">#{item.sequence}</span>
                  <span className="speaker-log-time">{item.time}</span>
                </div>

                <div className="speaker-log-main">
                  <div className="speaker-log-cmd-wrap">
                    <span className={`speaker-log-cmd ${isQuery ? 'cmd-query' : 'cmd-actuator'}`}>
                      {item.command}
                    </span>
                    <span className="speaker-log-target">
                      {res.device ? `Target: ${res.device}` : (res.local ? 'Local light' : 'System')}
                    </span>
                  </div>

                  <div className="speaker-log-result">
                    <span className="speaker-result-label">{isEn ? 'Result / Display:' : 'Phản hồi / Màn hình:'}</span>
                    <span className="speaker-result-text">&quot;{displayText}&quot;</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

