import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useLanguage } from '../../context/LanguageContext.jsx';

ChartJS.register(ArcElement, Tooltip, Legend);

function formatDuration(totalSec) {
  if (!totalSec || totalSec <= 0) return '0s';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DoorDurationDoughnut({ durations = {} }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    openSeconds = 0,
    closedSeconds = 0,
    offlineSeconds = 0,
    totalSeconds = 0
  } = durations;

  const shares = useMemo(() => {
    if (totalSeconds <= 0) {
      return { openPct: 0, closedPct: 0, offlinePct: 0 };
    }
    return {
      openPct: Math.round((openSeconds / totalSeconds) * 100),
      closedPct: Math.round((closedSeconds / totalSeconds) * 100),
      offlinePct: Math.round((offlineSeconds / totalSeconds) * 100)
    };
  }, [openSeconds, closedSeconds, offlineSeconds, totalSeconds]);

  const chartData = useMemo(() => {
    // Nếu chưa có giây quan sát nào, vẽ vòng tròn rỗng
    if (totalSeconds <= 0) {
      return {
        labels: [isEn ? 'No Data' : 'Chưa có dữ liệu'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['rgba(148, 163, 184, 0.2)'],
            borderColor: ['transparent'],
            borderWidth: 0
          }
        ]
      };
    }

    return {
      labels: [
        isEn ? 'Door Closed' : 'Cửa đóng',
        isEn ? 'Door Open' : 'Cửa mở',
        isEn ? 'Offline / Unknown' : 'Ngoại tuyến / Chưa rõ'
      ],
      datasets: [
        {
          data: [closedSeconds, openSeconds, offlineSeconds],
          backgroundColor: ['#10b981', '#f59e0b', '#64748b'],
          borderColor: ['#0f172a', '#0f172a', '#0f172a'],
          borderWidth: 2,
          hoverOffset: 4
        }
      ]
    };
  }, [totalSeconds, closedSeconds, openSeconds, offlineSeconds, isEn]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: totalSeconds > 0,
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function (context) {
              const label = context.label || '';
              const sec = context.raw || 0;
              const pct = totalSeconds > 0 ? Math.round((sec / totalSeconds) * 100) : 0;
              return ` ${label}: ${formatDuration(sec)} (${pct}%)`;
            }
          }
        }
      }
    };
  }, [totalSeconds]);

  return (
    <div className="door-doughnut-card">
      <div className="door-doughnut-header">
        <h3 className="door-doughnut-title">
          {isEn ? 'Observed Door State Ratio (Full Session)' : 'Tỷ lệ thời gian quan sát (Toàn phiên)'}
        </h3>
        <p className="door-doughnut-subtitle">
          {isEn
            ? 'Scope: Full observation session (real elapsed time while fresh; stale counted as offline/unknown).'
            : 'Phạm vi: Toàn bộ phiên quan sát hiện tại (thời gian thực khi còn tươi; phần quá hạn tính là ngoại tuyến/chưa rõ).'}
        </p>
      </div>

      <div className="door-doughnut-wrap">
        <div className="door-doughnut-canvas-wrap">
          <Doughnut data={chartData} options={options} />
          <div className="door-doughnut-center-label">
            <span className="door-doughnut-center-val">{formatDuration(totalSeconds)}</span>
            <span className="door-doughnut-center-sub">{isEn ? 'Observed' : 'Đã quan sát'}</span>
          </div>
        </div>

        <div className="door-doughnut-legend">
          <div className="door-legend-item">
            <div className="door-legend-item-head">
              <span className="door-legend-dot" style={{ backgroundColor: '#10b981' }} />
              <span className="door-legend-name">{isEn ? 'Closed' : 'Cửa đóng'}</span>
            </div>
            <div className="door-legend-item-stat">
              <span className="door-legend-sec">{formatDuration(closedSeconds)}</span>
              <span className="door-legend-pct">{shares.closedPct}%</span>
            </div>
          </div>

          <div className="door-legend-item">
            <div className="door-legend-item-head">
              <span className="door-legend-dot" style={{ backgroundColor: '#f59e0b' }} />
              <span className="door-legend-name">{isEn ? 'Open' : 'Cửa mở'}</span>
            </div>
            <div className="door-legend-item-stat">
              <span className="door-legend-sec">{formatDuration(openSeconds)}</span>
              <span className="door-legend-pct">{shares.openPct}%</span>
            </div>
          </div>

          <div className="door-legend-item">
            <div className="door-legend-item-head">
              <span className="door-legend-dot" style={{ backgroundColor: '#64748b' }} />
              <span className="door-legend-name">{isEn ? 'Offline / Unknown' : 'Ngoại tuyến / Chưa rõ'}</span>
            </div>
            <div className="door-legend-item-stat">
              <span className="door-legend-sec">{formatDuration(offlineSeconds)}</span>
              <span className="door-legend-pct">{shares.offlinePct}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
