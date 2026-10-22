import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuthContext } from './context/AuthContext.jsx';
import { DeviceProvider } from './context/DeviceContext.jsx';
import { LanguageProvider, useLanguage, getErrorMessage } from './context/LanguageContext.jsx';
import { deviceRegistry } from './modules/registry.js';
import { isPreviewMode } from './services/authService.js';

import Layout from './shared/components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Overview from './pages/Overview.jsx';
import NotFound from './pages/NotFound.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isCheckingSession, sessionError, retryCheckSession } = useAuthContext();
  const { t } = useLanguage();
  const location = useLocation();

  // 1. Đang kiểm tra phiên với backend: hiển thị màn hình chờ, không nháy dashboard hoặc chuyển nhầm login
  if (isCheckingSession) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-spinner" aria-hidden="true"></div>
        <p>{t('session_checking')}</p>
      </div>
    );
  }

  // 2. Lỗi mạng hoặc lỗi máy chủ khi kiểm tra phiên: hiển thị lỗi và cho phép thử lại
  if (sessionError && !isAuthenticated && !isPreviewMode()) {
    return (
      <div className="auth-error-screen" role="alert">
        <div className="auth-error-card">
          <span className="auth-error-icon" aria-hidden="true">⚠️</span>
          <h2>{t('session_error_title')}</h2>
          <p>{getErrorMessage(sessionError, t)}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={retryCheckSession}
          >
            {t('btn_retry')}
          </button>
        </div>
      </div>
    );
  }

  // 3. Chưa đăng nhập và không bật chế độ xem trước: chuyển hướng về login
  if (!isAuthenticated && !isPreviewMode()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function PublicAuthRoute({ children }) {
  const { isAuthenticated, isCheckingSession } = useAuthContext();
  const { t } = useLanguage();

  // Đang kiểm tra phiên: chờ để biết chắc chắn trạng thái trước khi chuyển hướng
  if (isCheckingSession) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-spinner" aria-hidden="true"></div>
        <p>{t('session_loading')}</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/overview" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <DeviceProvider>
            <Routes>
              {/* Tuyến công khai (Auth) */}
              <Route
                path="/login"
                element={
                  <PublicAuthRoute>
                    <Login />
                  </PublicAuthRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicAuthRoute>
                    <Register />
                  </PublicAuthRoute>
                }
              />

              {/* Tuyến có bảo vệ đăng nhập */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/overview" replace />} />
                <Route path="overview" element={<Overview />} />

                {/* Tự động nạp đủ 5 route thiết bị từ registry */}
                {deviceRegistry.map((item) => (
                  <Route
                    key={item.id}
                    path={`devices/${item.id}`}
                    element={<item.Component />}
                  />
                ))}
              </Route>

              {/* Tuyến 404 cho các đường dẫn không tồn tại */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DeviceProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
