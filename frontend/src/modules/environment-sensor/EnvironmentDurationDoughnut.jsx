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

export default function EnvironmentDurationDoughnut({ durations = {} }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    safeSeconds = 0,
    warningSeconds = 0,
    dangerSeconds = 0,
    warmupSeconds = 0,
    offlineSeconds = 0,
    totalSeconds = 0
  } = durations;

  const shares = useMemo(() => {
    if (totalSeconds <= 0) {
      return { safePct: 0, warnPct: 0, dangPct: 0, warmPct: 0, offPct: 0 };
    }
    return {
      safePct: Math.round((safeSeconds / totalSeconds) * 100),
      warnPct: Math.round((warningSeconds / totalSeconds) * 100),
      dangPct: Math.round((dangerSeconds / totalSeconds) * 100),
      warmPct: Math.round((warmupSeconds / totalSeconds) * 100),
      offPct: Math.round((offlineSeconds / totalSeconds) * 100)
    };
  }, [safeSeconds, warningSeconds, dangerSeconds, warmupSeconds, offlineSeconds, totalSeconds]);

  const chartData = useMemo(() => {
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
        isEn ? 'Safe' : 'Bình thường',
        isEn ? 'Warning' : 'Cảnh báo',
        isEn ? 'Danger' : 'Nguy hiểm',
        isEn ? 'Warm-up' : 'Làm nóng',
        isEn ? 'Offline / Unknown' : 'Ngoại tuyến / Chưa rõ'
      ],
      datasets: [
        {
          data: [safeSeconds, warningSeconds, dangerSeconds, warmupSeconds, offlineSeconds],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#64748b'],
          borderColor: ['#0f172a', '#0f172a', '#0f172a', '#0f172a', '#0f172a'],
          borderWidth: 2,
          hoverOffset: 4
        }
      ]
    };
  }, [totalSeconds, safeSeconds, warningSeconds, dangerSeconds, warmupSeconds, offlineSeconds, isEn]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
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
              const sec = context.raw || 0;
              const pct = totalSeconds > 0 ? Math.round((sec / totalSeconds) * 100) : 0;
              return ` ${context.label}: ${formatDuration(sec)} (${pct}%)`;
            }
          }
        }
      }
    };
  }, [totalSeconds]);

  return (
    <div className="env-doughnut-card">
      <div className="env-doughnut-header">
        <h3 className="env-doughnut-title">
          {isEn ? 'Observed Gas State Ratio (Full Session)' : 'Tỷ lệ an toàn khí gas (Toàn phiên)'}
        </h3>
        <p className="env-doughnut-subtitle">
          {isEn
            ? 'Scope: Full observation session (real elapsed time while fresh; stale counted as offline/unknown).'
            : 'Phạm vi: Toàn bộ phiên quan sát hiện tại (thời gian thực khi còn tươi; phần quá hạn tính là ngoại tuyến/chưa rõ).'}
        </p>
      </div>

      <div className="env-doughnut-wrap">
        <div className="env-doughnut-canvas-wrap">
          <Doughnut data={chartData} options={options} />
          <div className="env-doughnut-center-label">
            <span className="env-doughnut-center-val">{formatDuration(totalSeconds)}</span>
            <span className="env-doughnut-center-sub">{isEn ? 'Observed' : 'Đã quan sát'}</span>
          </div>
        </div>

        <div className="env-doughnut-legend">
          <div className="env-legend-item">
            <div className="env-legend-item-head">
              <span className="env-legend-dot" style={{ backgroundColor: '#10b981' }} />
              <span className="env-legend-name">{isEn ? 'Safe' : 'Bình thường'}</span>
            </div>
            <div className="env-legend-item-stat">
              <span className="env-legend-sec">{formatDuration(safeSeconds)}</span>
              <span className="env-legend-pct">{shares.safePct}%</span>
            </div>
          </div>

          <div className="env-legend-item">
            <div className="env-legend-item-head">
              <span className="env-legend-dot" style={{ backgroundColor: '#f59e0b' }} />
              <span className="env-legend-name">{isEn ? 'Warning' : 'Cảnh báo'}</span>
            </div>
            <div className="env-legend-item-stat">
              <span className="env-legend-sec">{formatDuration(warningSeconds)}</span>
              <span className="env-legend-pct">{shares.warnPct}%</span>
            </div>
          </div>

          <div className="env-legend-item">
            <div className="env-legend-item-head">
              <span className="env-legend-dot" style={{ backgroundColor: '#ef4444' }} />
              <span className="env-legend-name">{isEn ? 'Danger' : 'Nguy hiểm'}</span>
            </div>
            <div className="env-legend-item-stat">
              <span className="env-legend-sec">{formatDuration(dangerSeconds)}</span>
              <span className="env-legend-pct">{shares.dangPct}%</span>
            </div>
          </div>

          <div className="env-legend-item">
            <div className="env-legend-item-head">
              <span className="env-legend-dot" style={{ backgroundColor: '#06b6d4' }} />
              <span className="env-legend-name">{isEn ? 'Warm-up' : 'Làm nóng'}</span>
            </div>
            <div className="env-legend-item-stat">
              <span className="env-legend-sec">{formatDuration(warmupSeconds)}</span>
              <span className="env-legend-pct">{shares.warmPct}%</span>
            </div>
          </div>

          <div className="env-legend-item">
            <div className="env-legend-item-head">
              <span className="env-legend-dot" style={{ backgroundColor: '#64748b' }} />
              <span className="env-legend-name">{isEn ? 'Offline / Unknown' : 'Ngoại tuyến / Chưa rõ'}</span>
            </div>
            <div className="env-legend-item-stat">
              <span className="env-legend-sec">{formatDuration(offlineSeconds)}</span>
              <span className="env-legend-pct">{shares.offPct}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
