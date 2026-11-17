import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip } from 'chart.js';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { getPrivacyReport } from '../../services/privacyDataService.js';
import { isPreviewMode } from '../../services/authService.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

export default function SharingTrendCard() {
  const { currentUser } = useAuthContext();
  const { lang } = useLanguage();
  const [state, setState] = useState({ loading: true, points: [], error: false });
  useEffect(() => {
    if (!currentUser?.id) return;
    if (isPreviewMode()) {
      setState({ loading: false, points: [], error: false });
      return;
    }
    let active = true;
    setState({ loading: true, points: [], error: false });
    getPrivacyReport().then(res => {
      if (!active) return;
      if (res.success && Array.isArray(res.data?.sharingTimeline)) {
        setState({ loading: false, points: res.data.sharingTimeline, error: false });
      } else setState({ loading: false, points: [], error: true });
    }).catch(() => { if (active) setState({ loading: false, points: [], error: true }); });
    return () => { active = false; };
  }, [currentUser?.id]);
  const en = lang === 'en';
  return <section className="settings-section-group" aria-label={en ? 'Data sharing over time' : 'Mức độ chia sẻ dữ liệu theo thời gian'}>
    <h3>{en ? 'Data sharing over time' : 'Mức độ chia sẻ dữ liệu theo thời gian'}</h3>
    <p>{en ? 'Recorded reads by people you shared devices with, over the last 14 days.' : 'Số lượt đọc được ghi của người được bạn chia sẻ thiết bị trong 14 ngày qua.'}</p>
    {state.loading ? <p role="status">{en ? 'Loading…' : 'Đang tải…'}</p>
      : state.error ? <p role="status">{en ? 'Could not load sharing data.' : 'Không tải được dữ liệu chia sẻ.'}</p>
      : state.points.every(point => point.count === 0) ? <p>{en ? 'No shared data reads recorded yet.' : 'Chưa ghi nhận lượt đọc dữ liệu được chia sẻ.'}</p>
      : <div className="privacy-sharing-chart"><Line data={{ labels: state.points.map(point => point.date.slice(5)),
        datasets: [{ label: en ? 'Viewer reads' : 'Lượt người xem', data: state.points.map(point => point.count),
          borderColor: '#047857', backgroundColor: '#047857', tension: 0.25 }] }}
        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} /></div>}
  </section>;
}
