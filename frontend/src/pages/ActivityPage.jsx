import { useAuthContext } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import ActivityLogPanel from '../shared/components/ActivityLogPanel.jsx';
import SecuritySettings from './Settings/SecuritySettings.jsx';
import './ActivityPage.css';

export default function ActivityPage() {
  const { currentUser } = useAuthContext();
  const { lang } = useLanguage();
  const en = lang === 'en';
  return <main className="activity-page">
    <header className="activity-page-heading">
      <span className="activity-page-eyebrow">{en ? 'ACCOUNT SECURITY' : 'BẢO MẬT TÀI KHOẢN'}</span>
      <h1>{en ? 'Activity & sessions' : 'Nhật ký & phiên hoạt động'}</h1>
      <p>{en ? 'Review sign-ins and the devices currently signed in to your account.' : 'Xem các lần đăng nhập và thiết bị đang duy trì phiên của tài khoản bạn.'}</p>
    </header>
    <ActivityLogPanel key={currentUser?.id || 'guest'} autoLoad />
    <SecuritySettings embedded />
  </main>;
}
