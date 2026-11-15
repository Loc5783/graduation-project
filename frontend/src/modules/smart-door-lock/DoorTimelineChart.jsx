import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useLanguage } from '../../context/LanguageContext.jsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

export default function DoorTimelineChart({ timeline = [] }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [range, setRange] = useState('15m'); // '5m' | '15m' | 'all'
  const [showDoor, setShowDoor] = useState(true);
  const [showAlarm, setShowAlarm] = useState(true);

  // Lọc dữ liệu theo dải thời gian
  const filteredData = useMemo(() => {
    if (!timeline.length) return [];
    if (range === 'all') return timeline;
    const now = Date.now();
    const durationMs = (range === '5m' ? 5 : 15) * 60 * 1000;
    const cutoff = now - durationMs;
    return timeline.filter((p) => p.timestamp >= cutoff);
  }, [timeline, range]);

  const chartData = useMemo(() => {
    const labels = filteredData.map((p) => {
      const d = new Date(p.timestamp);
      return d.toLocaleTimeString(isEn ? 'en-US' : 'vi-VN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    });

    const doorSeries = filteredData.map((p) => (p.isLive ? p.doorOpen : null));
    const alarmSeries = filteredData.map((p) => (p.isLive ? p.alarm : null));

    const datasets = [];

    if (showDoor) {
      datasets.push({
        label: isEn ? 'Door Open (1=Open, 0=Closed)' : 'Cửa (1=Mở, 0=Đóng)',
        data: doorSeries,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        stepped: 'before',
        spanGaps: false, // Bắt buộc false để ngắt quãng khi offline
        borderWidth: 2.2,
        pointRadius: 2.5,
        pointHoverRadius: 5
      });
    }

    if (showAlarm) {
      datasets.push({
        label: isEn ? 'Alarm (1=Active, 0=Normal)' : 'Cảnh báo (1=Báo động, 0=Bình thường)',
        data: alarmSeries,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        stepped: 'before',
        spanGaps: false,
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 5
      });
    }

    return { labels, datasets };
  }, [filteredData, showDoor, showAlarm, isEn]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              const val = context.raw;
              if (val === null || val === undefined) {
                return `${context.dataset.label}: ${isEn ? 'Offline / No Signal' : 'Mất tín hiệu / Offline'}`;
              }
              if (context.datasetIndex === 0 && showDoor) {
                return `${isEn ? 'Door' : 'Cửa'}: ${val === 1 ? (isEn ? 'OPEN' : 'MỞ') : (isEn ? 'CLOSED' : 'ĐÓNG')}`;
              }
              return `${isEn ? 'Alarm' : 'Cảnh báo'}: ${val === 1 ? (isEn ? 'ACTIVE' : 'BÁO ĐỘNG') : (isEn ? 'Normal' : 'Bình thường')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(148, 163, 184, 0.1)'
          },
          ticks: {
            color: '#94a3b8',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7
          }
        },
        y: {
          min: -0.1,
          max: 1.2,
          ticks: {
            stepSize: 1,
            color: '#94a3b8',
            callback: function (val) {
              if (val === 0) return isEn ? '0 (Closed / Normal)' : '0 (Đóng / Chuẩn)';
              if (val === 1) return isEn ? '1 (Open / Alarm)' : '1 (Mở / Báo động)';
              return '';
            }
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)'
          }
        }
      }
    };
  }, [isEn, showDoor]);

  return (
    <div className="door-chart-card">
      <div className="door-chart-header">
        <div className="door-chart-title-wrap">
          <h3 className="door-chart-title">
            {isEn ? 'Door & Security Timeline (Selected Range)' : 'Biểu đồ trạng thái cửa & an ninh (Khoảng chọn)'}
          </h3>
          <p className="door-chart-subtitle">
            {isEn
              ? 'Stepped-line timeline for selected range. Breaks cleanly during offline gaps.'
              : 'Dạng đường bậc thang theo khoảng chọn (5m / 15m / Tất cả). Ngắt quãng rõ ràng khi mất kết nối.'}
          </p>
        </div>

        <div className="door-chart-controls">
          {/* Nút lọc chu kỳ */}
          <div className="door-btn-group" role="group" aria-label={isEn ? 'Time Range' : 'Dải thời gian'}>
            <button
              type="button"
              className={`door-range-btn ${range === '5m' ? 'is-active' : ''}`}
              onClick={() => setRange('5m')}
            >
              5m
            </button>
            <button
              type="button"
              className={`door-range-btn ${range === '15m' ? 'is-active' : ''}`}
              onClick={() => setRange('15m')}
            >
              15m
            </button>
            <button
              type="button"
              className={`door-range-btn ${range === 'all' ? 'is-active' : ''}`}
              onClick={() => setRange('all')}
            >
              {isEn ? 'All' : 'Tất cả'}
            </button>
          </div>

          {/* Toggle chuỗi dữ liệu */}
          <div className="door-legend-toggles">
            <button
              type="button"
              className={`door-toggle-pill pill-door ${showDoor ? 'is-visible' : 'is-hidden'}`}
              onClick={() => setShowDoor(!showDoor)}
              aria-pressed={showDoor}
            >
              <span className="door-legend-dot dot-door" />
              <span>{isEn ? 'Door State' : 'Trạng thái Cửa'}</span>
            </button>

            <button
              type="button"
              className={`door-toggle-pill pill-alarm ${showAlarm ? 'is-visible' : 'is-hidden'}`}
              onClick={() => setShowAlarm(!showAlarm)}
              aria-pressed={showAlarm}
            >
              <span className="door-legend-dot dot-alarm" />
              <span>{isEn ? 'Alarm' : 'Cảnh báo'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="door-chart-body">
        {filteredData.length === 0 ? (
          <div className="door-chart-empty">
            <p>{isEn ? 'Awaiting observation data...' : 'Chưa đủ dữ liệu quan sát...'}</p>
          </div>
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}
