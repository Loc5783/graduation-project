import { deviceConfigs } from '../modules/configs.js';
import { useDeviceContext } from '../context/DeviceContext.jsx';
import { useAuthContext } from '../context/AuthContext.jsx';
import { calculateShareScore, DEMO_DATE } from '../shared/mockData.js';
import { canExportReport } from '../shared/roles.js';

export default function Reports() {
  const { preferences } = useDeviceContext();
  const { currentUser } = useAuthContext();

  const userCanExport = canExportReport(currentUser);

  const handlePrint = () => {
    if (!userCanExport) {
      alert('Tài khoản của bạn (Viewer) không có quyền xuất hoặc in báo cáo.');
      return;
    }
    window.print();
  };

  return (
    <div className="reports-page">
      <div className="reports-header no-print">
        <div>
          <h1>Báo cáo minh bạch dữ liệu riêng tư</h1>
          <p className="page-desc">Mốc thời gian dữ liệu mô phỏng: <strong>{DEMO_DATE}</strong> (Asia/Ho_Chi_Minh)</p>
        </div>
        <div>
          <button
            type="button"
            disabled={!userCanExport}
            onClick={handlePrint}
            className="btn btn-primary"
            title={!userCanExport ? 'Chỉ quản trị viên hoặc thành viên mới có quyền in báo cáo' : 'In hoặc lưu báo cáo dưới dạng PDF'}
          >
            🖨️ Xuất PDF / In báo cáo
          </button>
        </div>
      </div>

      {!userCanExport && (
        <div className="alert alert-warning no-print">
          🔒 Bạn đang đăng nhập với vai trò Khách (Viewer). Nút in/xuất báo cáo đã bị vô hiệu hóa theo phân quyền hệ thống.
        </div>
      )}

      <div className="print-report-container">
        <div className="print-report-header">
          <h2>BÁO CÁO TỔNG HỢP QUYỀN RIÊNG TƯ DỮ LIỆU NHÀ THÔNG MINH</h2>
          <p>Ngày lập báo cáo demo: {DEMO_DATE} | Người xem: {currentUser?.name} ({currentUser?.role})</p>
        </div>

        <table className="report-table">
          <thead>
            <tr>
              <th>Thiết bị</th>
              <th>Chủ sở hữu</th>
              <th>Điểm chia sẻ</th>
              <th>Dữ liệu đang bật</th>
              <th>Dữ liệu đã tắt (Chặn)</th>
            </tr>
          </thead>
          <tbody>
            {deviceConfigs.map(config => {
              const devPrefs = preferences[config.id] || {};
              const score = calculateShareScore(config.dataTypes, devPrefs);
              const enabledList = [];
              const disabledList = [];

              for (const dt of config.dataTypes || []) {
                const isEnabled = devPrefs[dt.key] !== undefined ? devPrefs[dt.key] : dt.enabled;
                if (isEnabled) {
                  enabledList.push(dt.label);
                } else {
                  disabledList.push(dt.label);
                }
              }

              return (
                <tr key={config.id}>
                  <td><strong>{config.name}</strong></td>
                  <td>{config.owner}</td>
                  <td>{score}/100</td>
                  <td>{enabledList.join(', ') || 'Không có'}</td>
                  <td>{disabledList.join(', ') || 'Không có (Đang bật tất cả)'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
