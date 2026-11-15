import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useLanguage } from '../../context/LanguageContext.jsx';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function SpeakerCommandCharts({ stats = {} }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    total = 0,
    binCount = 0,
    doorCount = 0,
    windowCount = 0,
    gasCount = 0,
    plugCount = 0,
    lightCount = 0
  } = stats;

  const totalPlug = plugCount + lightCount;

  const chartData = useMemo(() => {
    if (total <= 0) {
      return {
        labels: [isEn ? 'No Commands' : 'Chưa có lệnh'],
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
        isEn ? 'Trash Bin' : 'Thùng rác',
        isEn ? 'Door Lock' : 'Khóa cửa',
        isEn ? 'Window' : 'Cửa sổ',
        isEn ? 'Gas & Climate' : 'Khí gas',
        isEn ? 'Plug & Light' : 'Ổ cắm & Đèn'
      ],
      datasets: [
        {
          data: [binCount, doorCount, windowCount, gasCount, totalPlug],
          backgroundColor: ['#06b6d4', '#10b981', '#3b82f6', '#ef4444', '#f59e0b'],
          borderColor: ['#0f172a', '#0f172a', '#0f172a', '#0f172a', '#0f172a'],
          borderWidth: 2,
          hoverOffset: 4
        }
      ]
    };
  }, [total, binCount, doorCount, windowCount, gasCount, totalPlug, isEn]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: total > 0,
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function (context) {
              const val = context.raw || 0;
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return ` ${context.label}: ${val} (${pct}%)`;
            }
          }
        }
      }
    };
  }, [total]);

  return (
    <div className="speaker-chart-card">
      <div className="speaker-chart-header">
        <h3 className="speaker-chart-title">
          {isEn ? 'Voice Command Breakdown' : 'Phân bố câu lệnh giọng nói'}
        </h3>
        <p className="speaker-chart-subtitle">
          {isEn
            ? 'Distribution of recognized commands received by Gateway.'
            : 'Tỷ lệ nhóm lệnh thoại thực tế được Gateway ghi nhận.'}
        </p>
      </div>

      <div className="speaker-chart-wrap">
        <div className="speaker-chart-canvas-wrap">
          <Doughnut data={chartData} options={options} />
          <div className="speaker-chart-center-label">
            <span className="speaker-chart-center-val">{total}</span>
            <span className="speaker-chart-center-sub">{isEn ? 'Commands' : 'Lệnh thoại'}</span>
          </div>
        </div>

        {total > 0 ? (
          <div className="speaker-chart-legend">
            <div className="speaker-legend-item">
              <div className="speaker-legend-head">
                <span className="speaker-legend-dot" style={{ backgroundColor: '#06b6d4' }} />
                <span>{isEn ? 'Smart Bin' : 'Thùng rác'}</span>
              </div>
              <span className="speaker-legend-val">{binCount}</span>
            </div>

            <div className="speaker-legend-item">
              <div className="speaker-legend-head">
                <span className="speaker-legend-dot" style={{ backgroundColor: '#10b981' }} />
                <span>{isEn ? 'Door Lock' : 'Khóa cửa'}</span>
              </div>
              <span className="speaker-legend-val">{doorCount}</span>
            </div>

            <div className="speaker-legend-item">
              <div className="speaker-legend-head">
                <span className="speaker-legend-dot" style={{ backgroundColor: '#3b82f6' }} />
                <span>{isEn ? 'Window' : 'Cửa sổ'}</span>
              </div>
              <span className="speaker-legend-val">{windowCount}</span>
            </div>

            <div className="speaker-legend-item">
              <div className="speaker-legend-head">
                <span className="speaker-legend-dot" style={{ backgroundColor: '#ef4444' }} />
                <span>{isEn ? 'Gas' : 'Khí gas'}</span>
              </div>
              <span className="speaker-legend-val">{gasCount}</span>
            </div>

            <div className="speaker-legend-item">
              <div className="speaker-legend-head">
                <span className="speaker-legend-dot" style={{ backgroundColor: '#f59e0b' }} />
                <span>{isEn ? 'Plug & Light' : 'Ổ cắm & Đèn'}</span>
              </div>
              <span className="speaker-legend-val">{totalPlug}</span>
            </div>
          </div>
        ) : (
          <div className="speaker-chart-empty">
            <p>{isEn ? 'No commands logged yet.' : 'Chưa có dữ liệu lệnh thoại.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
