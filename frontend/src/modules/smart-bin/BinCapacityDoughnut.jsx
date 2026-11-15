import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useLanguage } from '../../context/LanguageContext.jsx';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function BinCapacityDoughnut({ fillPercent = null, isMeasurementValid = false, isLive = false }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const hasValidReading = Boolean(isLive && isMeasurementValid && fillPercent !== null);

  const { clampedFill, freeCapacity } = useMemo(() => {
    if (!hasValidReading) return { clampedFill: 0, freeCapacity: 100 };
    const filled = Math.max(0, Math.min(100, fillPercent));
    return {
      clampedFill: filled,
      freeCapacity: 100 - filled
    };
  }, [hasValidReading, fillPercent]);

  const chartData = useMemo(() => {
    if (!hasValidReading) {
      return {
        labels: [isEn ? 'Unreadable' : 'Không có số đo'],
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

    const isFull = clampedFill >= 80;
    const isMedium = clampedFill >= 40 && clampedFill < 80;
    const fillColor = isFull ? '#ef4444' : (isMedium ? '#f59e0b' : '#10b981');

    return {
      labels: [
        isEn ? 'Trash Filled' : 'Đã chứa',
        isEn ? 'Remaining Capacity' : 'Còn trống'
      ],
      datasets: [
        {
          data: [Math.round(clampedFill), Math.round(freeCapacity)],
          backgroundColor: [fillColor, 'rgba(148, 163, 184, 0.15)'],
          borderColor: ['#0f172a', '#0f172a'],
          borderWidth: 2,
          hoverOffset: 4
        }
      ]
    };
  }, [hasValidReading, clampedFill, freeCapacity, isEn]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: hasValidReading,
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function (context) {
              return ` ${context.label}: ${context.raw}%`;
            }
          }
        }
      }
    };
  }, [hasValidReading]);

  return (
    <div className="bin-doughnut-card">
      <div className="bin-doughnut-header">
        <h3 className="bin-doughnut-title">
          {isEn ? 'Current Capacity' : 'Dung tích hiện tại'}
        </h3>
        <p className="bin-doughnut-subtitle">
          {isEn
            ? 'Real-time ratio from HC-SR04 ultrasonic echo.'
            : 'Tỷ lệ thực tế từ sóng siêu âm phản hồi HC-SR04.'}
        </p>
      </div>

      <div className="bin-doughnut-wrap">
        <div className="bin-doughnut-canvas-wrap">
          <Doughnut data={chartData} options={options} />
          <div className="bin-doughnut-center-label">
            {hasValidReading ? (
              <>
                <span className="bin-doughnut-center-val">{Math.round(clampedFill)}%</span>
                <span className="bin-doughnut-center-sub">{isEn ? 'Filled' : 'Đã đầy'}</span>
              </>
            ) : (
              <>
                <span className="bin-doughnut-center-val" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>--</span>
                <span className="bin-doughnut-center-sub">{isEn ? 'No Echo' : 'Mất tín hiệu'}</span>
              </>
            )}
          </div>
        </div>

        {hasValidReading ? (
          <div className="bin-doughnut-legend">
            <div className="bin-legend-item">
              <div className="bin-legend-item-head">
                <span className="bin-legend-dot" style={{ backgroundColor: clampedFill >= 80 ? '#ef4444' : (clampedFill >= 40 ? '#f59e0b' : '#10b981') }} />
                <span className="bin-legend-name">{isEn ? 'Trash Filled' : 'Đã chứa'}</span>
              </div>
              <span className="bin-legend-pct">{Math.round(clampedFill)}%</span>
            </div>

            <div className="bin-legend-item">
              <div className="bin-legend-item-head">
                <span className="bin-legend-dot" style={{ backgroundColor: 'rgba(148, 163, 184, 0.4)' }} />
                <span className="bin-legend-name">{isEn ? 'Remaining Capacity' : 'Dung tích trống'}</span>
              </div>
              <span className="bin-legend-pct">{Math.round(freeCapacity)}%</span>
            </div>
          </div>
        ) : (
          <div className="bin-doughnut-empty-note">
            <span>{isEn ? 'Awaiting valid sensor echo to calculate capacity.' : 'Chưa có số đo hợp lệ để tính dung tích.'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
