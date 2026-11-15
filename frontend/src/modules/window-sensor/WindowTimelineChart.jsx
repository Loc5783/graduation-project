import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useLanguage } from '../../context/LanguageContext.jsx';

// Đăng ký các module Chart.js cần thiết
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function WindowTimelineChart({ timeline = [] }) {
  const { lang } = useLanguage();
  const en = lang === 'en';

  const [range, setRange] = useState('5m'); // '5m' | '15m' | 'all'
  const [showDoor, setShowDoor] = useState(true);
  const [showMotion, setShowMotion] = useState(true);
  const [showAlarm, setShowAlarm] = useState(false);

  // Lọc dữ liệu theo khoảng thời gian được chọn
  const filteredTimeline = useMemo(() => {
    if (!timeline.length) return [];
    const now = Date.now();
    let cutoff = 0;
    if (range === '5m') cutoff = now - 5 * 60 * 1000;
    else if (range === '15m') cutoff = now - 15 * 60 * 1000;
    return timeline.filter((p) => p.time >= cutoff);
  }, [timeline, range]);

  // Chuẩn bị nhãn thời gian và datasets
  const chartData = useMemo(() => {
    const labels = filteredTimeline.map((p) => {
      const d = new Date(p.time);
      return d.toLocaleTimeString(en ? 'en-US' : 'vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    });

    const datasets = [];

    if (showDoor) {
      datasets.push({
        label: en ? 'Window State (1=Open, 0=Closed)' : 'Trạng thái Cửa (1=Mở, 0=Đóng)',
        data: filteredTimeline.map((p) => p.doorOpen),
        borderColor: '#06b6d4', // Cyan
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        stepped: 'before',
        spanGaps: false, // TUYỆT ĐỐI không nối đường qua khoảng offline (giá trị null)
        borderWidth: 2.5,
        pointRadius: filteredTimeline.length > 30 ? 1.5 : 3,
        pointHoverRadius: 5
      });
    }

    if (showMotion) {
      datasets.push({
        label: en ? 'PIR Motion (1=Detected, 0=None)' : 'Chuyển động PIR (1=Có, 0=Không)',
        data: filteredTimeline.map((p) => p.motion),
        borderColor: '#10b981', // Emerald
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        stepped: 'before',
        spanGaps: false,
        borderWidth: 2,
        pointRadius: filteredTimeline.length > 30 ? 1.5 : 3,
        pointHoverRadius: 5
      });
    }

    if (showAlarm) {
      datasets.push({
        label: en ? 'Alarm (1=Active, 0=Normal)' : 'Cảnh báo (1=Báo động, 0=Bình thường)',
        data: filteredTimeline.map((p) => p.alarm),
        borderColor: '#ef4444', // Red
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        stepped: 'before',
        spanGaps: false,
        borderWidth: 2,
        borderDash: [4, 4],
        pointRadius: 2,
        pointHoverRadius: 4
      });
    }

    return { labels, datasets };
  }, [filteredTimeline, showDoor, showMotion, showAlarm, en]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 14,
            padding: 12,
            color: '#94a3b8',
            font: { size: 12 }
          }
        },
        tooltip: {
          backgroundColor: '#0a1120',
          titleColor: '#f1f5f9',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              if (val === null || val === undefined) {
                return `${ctx.dataset.label.split('(')[0]}: ${en ? 'Offline / Disconnected' : 'Mất kết nối / Ngoại tuyến'}`;
              }
              const datasetIdx = ctx.datasetIndex;
              if (datasetIdx === 0 && showDoor) {
                return `${en ? 'Window' : 'Cửa sổ'}: ${val === 1 ? (en ? 'Open' : 'Đang mở') : (en ? 'Closed' : 'Đang đóng')}`;
              }
              if (showMotion && ((datasetIdx === 1 && showDoor) || (datasetIdx === 0 && !showDoor))) {
                return `${en ? 'Motion' : 'Chuyển động'}: ${val === 1 ? (en ? 'Detected' : 'Có chuyển động') : (en ? 'None' : 'Không có')}`;
              }
              return `${en ? 'Alarm' : 'Cảnh báo'}: ${val === 1 ? (en ? 'ACTIVE' : 'BÁO ĐỘNG') : (en ? 'Normal' : 'Bình thường')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#94a3b8',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            font: { size: 11 }
          }
        },
        y: {
          min: -0.15,
          max: 1.25,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            stepSize: 1,
            color: '#94a3b8',
            font: { size: 11 },
            callback: (val) => {
              if (val === 1) return en ? '1 (Open / Motion)' : '1 (Mở / Có CĐ)';
              if (val === 0) return en ? '0 (Closed / Calm)' : '0 (Đóng / Yên tĩnh)';
              return '';
            }
          }
        }
      }
    };
  }, [en, showDoor, showMotion]);

  const hasPoints = filteredTimeline.length > 0;

  return (
    <div className="window-timeline-card">
      <div className="timeline-header">
        <div className="timeline-title-wrap">
          <h3 className="card-section-title">{en ? 'Timeline Activity (Selected Range)' : 'Biểu đồ Hoạt động theo Thời gian (Khoảng chọn)'}</h3>
          <span className="card-subtitle">
            {en ? 'Stepped-line boolean telemetry for selected range (5m / 15m / Session)' : 'Dạng đường bậc thang theo khoảng chọn (5m / 15m / Toàn phiên)'}
          </span>
        </div>

        {/* Bộ lọc khoảng thời gian */}
        <div className="timeline-controls">
          <div className="btn-group-range" role="group" aria-label={en ? 'Time range' : 'Khoảng thời gian'}>
            <button
              type="button"
              className={`range-btn ${range === '5m' ? 'active' : ''}`}
              onClick={() => setRange('5m')}
            >
              5m
            </button>
            <button
              type="button"
              className={`range-btn ${range === '15m' ? 'active' : ''}`}
              onClick={() => setRange('15m')}
            >
              15m
            </button>
            <button
              type="button"
              className={`range-btn ${range === 'all' ? 'active' : ''}`}
              onClick={() => setRange('all')}
            >
              {en ? 'Session' : 'Toàn phiên'}
            </button>
          </div>
        </div>
      </div>

      {/* Tùy chọn bật tắt chuỗi dữ liệu */}
      <div className="series-toggles">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showDoor}
            onChange={(e) => setShowDoor(e.target.checked)}
          />
          <span className="color-dot dot-cyan"></span>
          <span>{en ? 'Window (Door)' : 'Cửa sổ'}</span>
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showMotion}
            onChange={(e) => setShowMotion(e.target.checked)}
          />
          <span className="color-dot dot-emerald"></span>
          <span>{en ? 'Motion (PIR)' : 'Chuyển động'}</span>
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showAlarm}
            onChange={(e) => setShowAlarm(e.target.checked)}
          />
          <span className="color-dot dot-red"></span>
          <span>{en ? 'Alarm' : 'Cảnh báo'}</span>
        </label>
      </div>

      {/* Vùng vẽ biểu đồ */}
      <div className="timeline-chart-body">
        {hasPoints ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div className="chart-empty-state">
            <span className="empty-icon" aria-hidden="true">📊</span>
            <p className="empty-msg">
              {en
                ? 'Collecting telemetry points from live sensor…'
                : 'Đang thu thập dữ liệu quan sát thời gian thực…'}
            </p>
            <small className="empty-hint">
              {en
                ? 'Points appear automatically when telemetry packets arrive.'
                : 'Biểu đồ tự động vẽ khi có bản tin telemetry gửi về.'}
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
