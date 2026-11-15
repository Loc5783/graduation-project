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

export default function BinTimelineChart({ timeline = [] }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [range, setRange] = useState('15m');

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

    const fillSeries = filteredData.map((p) => (p.isLive ? p.fillPercent : null));

    return {
      labels,
      datasets: [
        {
          label: isEn ? 'Fill Level (%)' : 'Mức đầy rác (%)',
          data: fillSeries,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.15)',
          fill: true,
          tension: 0.2,
          spanGaps: false, // Ngắt quãng khi offline hoặc mất tín hiệu echo
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 5
        }
      ]
    };
  }, [filteredData, isEn]);

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
                return `${isEn ? 'Fill Level' : 'Mức đầy'}: ${isEn ? 'Unreadable / Offline' : 'Không đọc được / Mất tín hiệu'}`;
              }
              return `${isEn ? 'Fill Level' : 'Mức đầy'}: ${Math.round(val)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            color: '#94a3b8',
            callback: (v) => `${v}%`
          },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    };
  }, [isEn]);

  return (
    <div className="bin-chart-card">
      <div className="bin-chart-header">
        <div className="bin-chart-title-wrap">
          <h3 className="bin-chart-title">
            {isEn ? 'Trash Fill Level Timeline (Selected Range)' : 'Biến thiên mức đầy theo thời gian (Khoảng chọn)'}
          </h3>
          <p className="bin-chart-subtitle">
            {isEn
              ? 'Continuous HC-SR04 monitoring for selected range. Breaks cleanly when echo drops.'
              : 'Đo lường siêu âm HC-SR04 theo khoảng chọn (5m / 15m / Tất cả). Ngắt quãng khi mất tín hiệu.'}
          </p>
        </div>

        <div className="bin-btn-group" role="group" aria-label={isEn ? 'Time Range' : 'Dải thời gian'}>
          <button
            type="button"
            className={`bin-range-btn ${range === '5m' ? 'is-active' : ''}`}
            onClick={() => setRange('5m')}
          >
            5m
          </button>
          <button
            type="button"
            className={`bin-range-btn ${range === '15m' ? 'is-active' : ''}`}
            onClick={() => setRange('15m')}
          >
            15m
          </button>
          <button
            type="button"
            className={`bin-range-btn ${range === 'all' ? 'is-active' : ''}`}
            onClick={() => setRange('all')}
          >
            {isEn ? 'All' : 'Tất cả'}
          </button>
        </div>
      </div>

      <div className="bin-chart-body">
        {filteredData.length === 0 ? (
          <div className="bin-chart-empty">
            <p>{isEn ? 'Awaiting observation data...' : 'Chưa đủ dữ liệu quan sát...'}</p>
          </div>
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}
