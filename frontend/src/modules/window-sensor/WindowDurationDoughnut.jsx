import { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useLanguage } from '../../context/LanguageContext.jsx';

ChartJS.register(ArcElement, Tooltip, Legend);

function formatDuration(sec, en) {
  if (sec === 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}h ${m}${en ? 'm' : 'p'} ${s}s`;
  }
  if (m > 0) {
    return `${m}${en ? 'm' : 'p'} ${s}s`;
  }
  return `${s}s`;
}

export default function WindowDurationDoughnut({ durations }) {
  const { lang } = useLanguage();
  const en = lang === 'en';

  const { openSeconds = 0, closedSeconds = 0, offlineSeconds = 0, totalSeconds = 0 } = durations || {};

  // Tính phần trăm theo thời lượng thực tế (Elapsed Time)
  const stats = useMemo(() => {
    if (totalSeconds < 3) return null;
    const openPct = Math.round((openSeconds / totalSeconds) * 100);
    const closedPct = Math.round((closedSeconds / totalSeconds) * 100);
    const offlinePct = Math.max(0, 100 - openPct - closedPct);

    return {
      openPct,
      closedPct,
      offlinePct,
      openFmt: formatDuration(openSeconds, en),
      closedFmt: formatDuration(closedSeconds, en),
      offlineFmt: formatDuration(offlineSeconds, en),
      totalFmt: formatDuration(totalSeconds, en)
    };
  }, [openSeconds, closedSeconds, offlineSeconds, totalSeconds, en]);

  const chartData = useMemo(() => {
    return {
      labels: [
        en ? 'Window Open' : 'Cửa mở',
        en ? 'Window Closed' : 'Cửa đóng',
        en ? 'Offline / Unknown' : 'Ngoại tuyến / Chưa rõ'
      ],
      datasets: [
        {
          data: [openSeconds, closedSeconds, offlineSeconds],
          backgroundColor: [
            '#06b6d4', // Cyan
            '#10b981', // Emerald
            '#64748b'  // Slate gray
          ],
          borderColor: '#0a1120',
          borderWidth: 2,
          hoverOffset: 4
        }
      ]
    };
  }, [openSeconds, closedSeconds, offlineSeconds, en]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: {
        duration: 300
      },
      plugins: {
        legend: {
          display: false // Sử dụng custom legend chi tiết bên dưới
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
              const val = ctx.raw || 0;
              const pct = totalSeconds > 0 ? Math.round((val / totalSeconds) * 100) : 0;
              return `${ctx.label}: ${formatDuration(val, en)} (${pct}%)`;
            }
          }
        }
      }
    };
  }, [en, totalSeconds]);

  return (
    <div className="window-doughnut-card">
      <div className="doughnut-header">
        <h3 className="card-section-title">{en ? 'Time Share Ratio (Full Session)' : 'Tỷ lệ Thời gian Mở/Đóng (Toàn phiên)'}</h3>
        <span className="card-subtitle">
          {en
            ? 'Scope: Full observation session (real elapsed time while fresh; stale counted as offline/unknown)'
            : 'Phạm vi: Toàn bộ phiên quan sát hiện tại (thời gian thực khi còn tươi; phần quá hạn tính là ngoại tuyến/chưa rõ)'}
        </span>
      </div>

      <div className="doughnut-body">
        {stats ? (
          <>
            <div className="doughnut-chart-container">
              <Doughnut data={chartData} options={chartOptions} />
              <div className="doughnut-center-info" aria-hidden="true">
                <span className="center-label">{en ? 'Total Time' : 'Tổng quan sát'}</span>
                <span className="center-value">{stats.totalFmt}</span>
              </div>
            </div>

            {/* Bảng chú giải chi tiết kèm thời lượng & tỷ lệ */}
            <div className="doughnut-legend-list">
              <div className="legend-item">
                <span className="legend-indicator dot-cyan"></span>
                <span className="legend-name">{en ? 'Window Open' : 'Cửa mở'}</span>
                <span className="legend-time">{stats.openFmt}</span>
                <span className="legend-pct pill-open">{stats.openPct}%</span>
              </div>

              <div className="legend-item">
                <span className="legend-indicator dot-emerald"></span>
                <span className="legend-name">{en ? 'Window Closed' : 'Cửa đóng'}</span>
                <span className="legend-time">{stats.closedFmt}</span>
                <span className="legend-pct pill-closed">{stats.closedPct}%</span>
              </div>

              {offlineSeconds > 0 && (
                <div className="legend-item">
                  <span className="legend-indicator dot-gray"></span>
                  <span className="legend-name">{en ? 'Offline' : 'Ngoại tuyến'}</span>
                  <span className="legend-time">{stats.offlineFmt}</span>
                  <span className="legend-pct pill-offline">{stats.offlinePct}%</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="chart-empty-state doughnut-empty">
            <span className="empty-icon" aria-hidden="true">⏱️</span>
            <p className="empty-msg">
              {en ? 'Awaiting observation data…' : 'Chưa đủ dữ liệu quan sát…'}
            </p>
            <small className="empty-hint">
              {en
                ? 'Time share calculates after at least 3 seconds of active observation.'
                : 'Tỷ lệ thời gian sẽ hiển thị sau ít nhất 3 giây quan sát.'}
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
