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

export default function EnvironmentCharts({ timeline = [] }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [activeTab, setActiveTab] = useState('climate'); // 'climate' (Temp & Humidity) | 'gas' (Gas ADC)
  const [range, setRange] = useState('15m');

  const filteredData = useMemo(() => {
    if (!timeline.length) return [];
    if (range === 'all') return timeline;
    const now = Date.now();
    const durationMs = (range === '5m' ? 5 : 15) * 60 * 1000;
    const cutoff = now - durationMs;
    return timeline.filter((p) => p.timestamp >= cutoff);
  }, [timeline, range]);

  const labels = useMemo(() => {
    return filteredData.map((p) => {
      const d = new Date(p.timestamp);
      return d.toLocaleTimeString(isEn ? 'en-US' : 'vi-VN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    });
  }, [filteredData, isEn]);

  // Tab 1: Dữ liệu Khí hậu (Nhiệt độ °C + Độ ẩm %)
  const climateChartData = useMemo(() => {
    const tempSeries = filteredData.map((p) => (p.isLive ? p.temperature : null));
    const humSeries = filteredData.map((p) => (p.isLive ? p.humidity : null));

    return {
      labels,
      datasets: [
        {
          label: isEn ? 'Temperature (°C)' : 'Nhiệt độ (°C)',
          data: tempSeries,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          yAxisID: 'yTemp',
          spanGaps: false,
          tension: 0.25,
          borderWidth: 2.2,
          pointRadius: 2.5
        },
        {
          label: isEn ? 'Humidity (%)' : 'Độ ẩm (%)',
          data: humSeries,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          yAxisID: 'yHum',
          spanGaps: false,
          tension: 0.25,
          borderWidth: 2.2,
          pointRadius: 2.5
        }
      ]
    };
  }, [filteredData, labels, isEn]);

  const climateOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#94a3b8', font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function (context) {
              const val = context.raw;
              if (val === null || val === undefined) {
                return `${context.dataset.label}: ${isEn ? 'Offline' : 'Mất tín hiệu'}`;
              }
              const unit = context.datasetIndex === 0 ? '°C' : '%';
              return ` ${context.dataset.label}: ${val.toFixed(1)}${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
        },
        yTemp: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: '°C', color: '#f59e0b' },
          ticks: { color: '#f59e0b', stepSize: 5 },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        yHum: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: '%', color: '#06b6d4' },
          ticks: { color: '#06b6d4', stepSize: 10 },
          grid: { drawOnChartArea: false }
        }
      }
    };
  }, [isEn]);

  // Tab 2: Dữ liệu Gas ADC (0 - 4095 ADC)
  const gasChartData = useMemo(() => {
    const gasSeries = filteredData.map((p) => (p.isLive ? p.gasRaw : null));

    return {
      labels,
      datasets: [
        {
          label: isEn ? 'Gas Concentration (ADC)' : 'Nồng độ Gas (ADC)',
          data: gasSeries,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          fill: true,
          spanGaps: false,
          tension: 0.2,
          borderWidth: 2.2,
          pointRadius: 2.5
        }
      ]
    };
  }, [filteredData, labels, isEn]);

  const gasOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function (context) {
              const val = context.raw;
              if (val === null || val === undefined) {
                return `Gas: ${isEn ? 'Offline' : 'Mất tín hiệu'}`;
              }
              let level = isEn ? 'Safe' : 'Bình thường';
              if (val >= 2200) level = isEn ? 'DANGER' : 'NGUY HIỂM';
              else if (val >= 1200) level = isEn ? 'WARNING' : 'CẢNH BÁO';
              return ` Gas: ${val} ADC (${level})`;
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
          max: 4095,
          title: { display: true, text: 'ADC', color: '#ef4444' },
          ticks: { color: '#94a3b8', stepSize: 1000 },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    };
  }, [isEn]);

  return (
    <div className="env-chart-card">
      <div className="env-chart-header">
        <div className="env-chart-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'climate'}
            className={`env-tab-btn ${activeTab === 'climate' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('climate')}
          >
            {isEn ? 'Temperature & Humidity' : 'Nhiệt độ & Độ ẩm'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'gas'}
            className={`env-tab-btn ${activeTab === 'gas' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('gas')}
          >
            {isEn ? 'Gas (ADC)' : 'Khí Gas (ADC)'}
          </button>
        </div>

        <div className="env-btn-group" role="group" aria-label={isEn ? 'Time Range' : 'Dải thời gian'}>
          <button
            type="button"
            className={`env-range-btn ${range === '5m' ? 'is-active' : ''}`}
            onClick={() => setRange('5m')}
          >
            5m
          </button>
          <button
            type="button"
            className={`env-range-btn ${range === '15m' ? 'is-active' : ''}`}
            onClick={() => setRange('15m')}
          >
            15m
          </button>
          <button
            type="button"
            className={`env-range-btn ${range === 'all' ? 'is-active' : ''}`}
            onClick={() => setRange('all')}
          >
            {isEn ? 'All' : 'Tất cả'}
          </button>
        </div>
      </div>

      <div className="env-chart-body">
        {filteredData.length === 0 ? (
          <div className="env-chart-empty">
            <p>{isEn ? 'Awaiting observation data...' : 'Chưa đủ dữ liệu quan sát...'}</p>
          </div>
        ) : (
          activeTab === 'climate' ? (
            <Line data={climateChartData} options={climateOptions} />
          ) : (
            <Line data={gasChartData} options={gasOptions} />
          )
        )}
      </div>
    </div>
  );
}
