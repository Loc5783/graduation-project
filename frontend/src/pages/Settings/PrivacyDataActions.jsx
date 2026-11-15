import { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { isPreviewMode } from '../../services/authService.js';
import { deleteOwnNotifications, downloadPrivacyCsv, getPrivacyReport } from '../../services/privacyDataService.js';
import { useNotificationContext } from '../../context/NotificationContext.jsx';

const COPY = {
  vi: { exportTitle: 'Tải dữ liệu của tôi', exportDesc: 'CSV gồm hồ sơ, phiên đăng nhập và thông báo đã lưu.', csv: 'Tải CSV',
    pdf: 'In / Lưu PDF tóm tắt', report: 'Tóm tắt dữ liệu tài khoản', generated: 'Tạo lúc', name: 'Họ tên', email: 'Email', role: 'Vai trò', owned: 'Thiết bị phụ trách', retention: 'Lưu thông báo (ngày)', notifications: 'Số thông báo', sessions: 'Phiên còn hiệu lực', print: 'In / Lưu PDF', close: 'Đóng',
    deleteTitle: 'Xóa lịch sử thông báo', deleteDesc: 'Chỉ xóa các thông báo của tài khoản này. Tài khoản, phiên bảo mật và nhật ký quản trị được giữ lại.',
    delete: 'Xóa thông báo', confirm: 'Bạn chắc chắn muốn xóa toàn bộ thông báo của mình?', cancel: 'Hủy', deleted: 'Đã xóa lịch sử thông báo.', error: 'Thao tác thất bại. Vui lòng thử lại.', preview: 'Không khả dụng ở chế độ xem trước.',
    retentionNote: 'Hệ thống tự dọn thông báo theo số ngày đã chọn. Phiên bảo mật và nhật ký quản trị có chính sách lưu riêng.' },
  en: { exportTitle: 'Download my data', exportDesc: 'CSV includes your profile, login sessions and stored notifications.', csv: 'Download CSV',
    pdf: 'Print / Save summary PDF', report: 'Account data summary', generated: 'Generated', name: 'Name', email: 'Email', role: 'Role', owned: 'Assigned devices', retention: 'Notification retention (days)', notifications: 'Notifications', sessions: 'Active sessions', print: 'Print / Save PDF', close: 'Close',
    deleteTitle: 'Delete notification history', deleteDesc: 'Only this account’s notifications are deleted. The account, security sessions and administration audit log remain.',
    delete: 'Delete notifications', confirm: 'Are you sure you want to delete all your notifications?', cancel: 'Cancel', deleted: 'Notification history deleted.', error: 'The action failed. Please retry.', preview: 'Unavailable in preview mode.',
    retentionNote: 'Notifications are pruned according to your selected retention period. Security sessions and audit logs have separate policies.' }
};

export default function PrivacyDataActions({ kind }) {
  const { lang } = useLanguage();
  const { currentUser, handleUnauthorized } = useAuthContext();
  const { refresh: refreshNotifications } = useNotificationContext();
  const copy = COPY[lang] || COPY.vi;
  const preview = isPreviewMode();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [report, setReport] = useState(null);
  const opSeqRef = useRef(0);
  const exportControllerRef = useRef(null);
  const userIdRef = useRef(currentUser?.id);
  userIdRef.current = currentUser?.id;
  useEffect(() => {
    opSeqRef.current += 1; setBusy(false); setReport(null); setConfirming(false); setMessage('');
    return () => { opSeqRef.current += 1; exportControllerRef.current?.abort(); };
  }, [currentUser?.id]);

  const csv = async () => {
    if (busy || preview) return;
    const mySeq = ++opSeqRef.current;
    const reqUserId = currentUser?.id;
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setBusy(true); setMessage('');
    try {
      const result = await downloadPrivacyCsv(controller.signal);
      if (mySeq !== opSeqRef.current || reqUserId !== userIdRef.current) return;
      if (!result.success) {
        if (result.status === 401) handleUnauthorized(reqUserId);
        setMessage(copy.error);
      }
    } catch { if (mySeq === opSeqRef.current && reqUserId === userIdRef.current) setMessage(copy.error); }
    finally { if (exportControllerRef.current === controller) exportControllerRef.current = null;
      if (mySeq === opSeqRef.current && reqUserId === userIdRef.current) setBusy(false); }
  };
  const showReport = async () => {
    if (busy || preview) return;
    const mySeq = ++opSeqRef.current;
    const reqUserId = currentUser?.id;
    setBusy(true); setMessage('');
    const result = await getPrivacyReport();
    if (mySeq !== opSeqRef.current || reqUserId !== userIdRef.current) return;
    setBusy(false);
    if (result.success && result.data?.profile) setReport(result.data);
    else { if (result.status === 401) handleUnauthorized(reqUserId); setMessage(copy.error); }
  };
  const remove = async () => {
    if (busy || preview || !confirming) return;
    const mySeq = ++opSeqRef.current;
    const reqUserId = currentUser?.id;
    setBusy(true); setMessage('');
    const result = await deleteOwnNotifications();
    if (mySeq !== opSeqRef.current || reqUserId !== userIdRef.current) return;
    setBusy(false); setConfirming(false);
    if (result.success && Number.isInteger(result.data?.deletedCount)) { setMessage(copy.deleted); void refreshNotifications(); }
    else { if (result.status === 401) handleUnauthorized(reqUserId); setMessage(copy.error); }
  };

  if (kind === 'retention') return <p className="settings-disclaimer-note" role="note">ℹ️ {copy.retentionNote}</p>;
  if (kind === 'export') return <section className="settings-section-group">
    <h3>{copy.exportTitle}</h3><p>{copy.exportDesc}</p>
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-primary" onClick={csv} disabled={busy || preview}>{copy.csv}</button>
      <button type="button" className="btn btn-outline" onClick={showReport} disabled={busy || preview}>{copy.pdf}</button>
    </div>
    {preview && <p>{copy.preview}</p>}
    {message && <p role="status">{message}</p>}
    {report && <div className="privacy-report-wrap" style={{ marginTop: '1rem' }}>
      <div className="privacy-print-sheet" style={{ background: '#fff', color: '#17251f', padding: '1.25rem', border: '1px solid #bccbc4' }}>
        <h2>{copy.report}</h2><p>{copy.generated}: {new Date(report.generatedAt).toLocaleString(lang)}</p>
        <dl>{[[copy.name, report.profile.name], [copy.email, report.profile.email], [copy.role, report.profile.role],
          [copy.owned, report.profile.owned.join(', ') || '—'], [copy.retention, report.retentionDays],
          [copy.notifications, report.notificationCount], [copy.sessions, report.activeSessionCount]].map(([label, value]) =>
          <div key={label}><dt style={{ fontWeight: 600 }}>{label}</dt><dd style={{ margin: '0 0 0.5rem' }}>{value}</dd></div>)}</dl>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>{copy.print}</button>
        <button type="button" className="btn btn-outline" onClick={() => setReport(null)}>{copy.close}</button>
      </div>
      <style>{'@media print { body * { visibility: hidden !important; } .privacy-print-sheet, .privacy-print-sheet * { visibility: visible !important; } .privacy-print-sheet { position: fixed; inset: 0; border: 0 !important; } }'}</style>
    </div>}
  </section>;
  return <section className="settings-section-group" style={{ border: '1px solid var(--color-danger)', borderRadius: '8px', padding: '1rem' }}>
    <h3>{copy.deleteTitle}</h3><p>{copy.deleteDesc}</p>
    {!confirming ? <button type="button" className="btn btn-outline" onClick={() => setConfirming(true)} disabled={busy || preview}>{copy.delete}</button>
      : <div role="alert"><p>{copy.confirm}</p><button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{copy.delete}</button>{' '}
        <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)} disabled={busy}>{copy.cancel}</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
