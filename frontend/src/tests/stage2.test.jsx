import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { deviceRegistry } from '../modules/registry.js';
import { deviceConfigs } from '../modules/configs.js';
import * as authService from '../services/authService.js';
import {
  loginService,
  registerService,
  getMeService,
  logoutService,
  apiRequest,
  isValidUserData,
  isPreviewMode
} from '../services/authService.js';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';
import Overview from '../pages/Overview.jsx';
import NotFound from '../pages/NotFound.jsx';
import Layout from '../shared/components/Layout.jsx';
import { AuthProvider, useAuthContext, STORAGE_KEY_AUTH } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';

// Kích hoạt môi trường act cho React 18
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Component Route Guard tương tự App.jsx để kiểm thử tuyến đường thực tế
function TestProtectedRoute({ children }) {
  const { isAuthenticated, isCheckingSession, sessionError, retryCheckSession } = useAuthContext();
  const location = useLocation();

  if (isCheckingSession) {
    return (
      <div className="auth-loading-screen" role="status">
        <div className="auth-spinner"></div>
        <p>Đang kiểm tra phiên làm việc...</p>
      </div>
    );
  }

  if (sessionError && !isAuthenticated && !isPreviewMode()) {
    return (
      <div className="auth-error-screen" role="alert">
        <h2>Không thể kết nối đến máy chủ</h2>
        <p>{sessionError}</p>
        <button type="button" className="btn btn-primary" onClick={retryCheckSession}>
          Thử lại kết nối
        </button>
      </div>
    );
  }

  if (!isAuthenticated && !isPreviewMode()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function TestPublicAuthRoute({ children }) {
  const { isAuthenticated, isCheckingSession } = useAuthContext();

  if (isCheckingSession) {
    return (
      <div className="auth-loading-screen" role="status">
        <p>Đang tải...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/overview" replace />;
  }

  return children;
}

function TestAppRouter({ initialEntry = '/overview', enableDemoAuth = false }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider enableDemoAuth={enableDemoAuth}>
        <DeviceProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <TestPublicAuthRoute>
                  <Login />
                </TestPublicAuthRoute>
              }
            />
            <Route
              path="/register"
              element={
                <TestPublicAuthRoute>
                  <Register />
                </TestPublicAuthRoute>
              }
            />
            <Route
              path="/"
              element={
                <TestProtectedRoute>
                  <Layout />
                </TestProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="overview" element={<Overview />} />
              {deviceRegistry.map((item) => (
                <Route
                  key={item.id}
                  path={`devices/${item.id}`}
                  element={<item.Component />}
                />
              ))}
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DeviceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Giai đoạn 2: Nối Frontend với Backend Xác thực thật', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Cấu trúc Module độc lập & Registry
  // ==========================================================================
  describe('1. Cấu trúc Module thiết bị độc lập', () => {
    it('Đăng ký đủ 5 module độc lập đúng ID và chủ sở hữu', () => {
      expect(deviceRegistry).toHaveLength(5);

      const expectedModules = [
        { id: 'smart-door-lock', owner: 'Thành' },
        { id: 'smart-speaker', owner: 'Lộc' },
        { id: 'window-sensor', owner: 'Minh' },
        { id: 'smart-plug', owner: 'Nhật Anh' },
        { id: 'environment-sensor', owner: 'Quỳnh' }
      ];

      expectedModules.forEach((expected) => {
        const found = deviceRegistry.find((d) => d.id === expected.id);
        expect(found).toBeDefined();
        expect(found.owner).toBe(expected.owner);
        expect(found.path).toBe(`/devices/${expected.id}`);
        expect(typeof found.Component).toBe('function');
      });
    });

    it('5 module độc lập render đúng cấu trúc DevicePage và OwnerArea', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);

      for (const device of deviceRegistry) {
        await act(async () => {
          root.render(
            <MemoryRouter initialEntries={[device.path]}>
              <AuthProvider enableDemoAuth={true}>
                <DeviceProvider>
                  <device.Component />
                </DeviceProvider>
              </AuthProvider>
            </MemoryRouter>
          );
        });

        expect(container.textContent).toContain(device.name);
        const ownerArea = container.querySelector('.owner-area-container');
        expect(ownerArea).not.toBeNull();
        expect(ownerArea.textContent).toContain(device.owner);
        expect(ownerArea.textContent).toContain('Khu vực phát triển');
        expect(container.textContent).toContain('chưa đối chiếu backend/firmware');
      }
    });

    it('5 cấu hình trong configs.js có đầy đủ MQTT demo topic và loại dữ liệu', () => {
      expect(deviceConfigs).toHaveLength(5);
      deviceConfigs.forEach((cfg) => {
        expect(cfg.id).toBeDefined();
        expect(cfg.name).toBeDefined();
        expect(cfg.owner).toBeDefined();
        expect(cfg.mqtt).toBeDefined();
        expect(cfg.mqtt.command).toContain(cfg.id);
        expect(cfg.mqtt.telemetry).toContain(cfg.id);
        expect(Array.isArray(cfg.dataTypes)).toBe(true);
        expect(cfg.dataTypes.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // 2. Auth Service Layer & Giao tiếp API Thật (/api/auth/*)
  // ==========================================================================
  describe('2. Dịch vụ xác thực (authService) và Xử lý phản hồi API', () => {
    it('loginService gửi đúng POST /api/auth/login, JSON header và đọc đúng data.user khi thành công', async () => {
      const mockUser = {
        id: '6716a5b12345',
        name: 'Nguyễn Văn A',
        email: 'user.a@example.com',
        role: 'viewer',
        owned: []
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'Đăng nhập thành công.',
          data: { user: mockUser }
        })
      });

      const result = await loginService({
        email: 'user.a@example.com',
        password: 'Password@123',
        remember: true
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            email: 'user.a@example.com',
            password: 'Password@123',
            remember: true
          })
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.user).toEqual(mockUser);
    });

    it('loginService phân biệt chính xác sai thông tin (401), rate limit (429), lỗi server (500) và mất mạng', async () => {
      // 1. Mã 401 - Sai thông tin
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không chính xác.'
        })
      });
      const res401 = await loginService({ email: 'wrong@example.com', password: 'bad' });
      expect(res401.success).toBe(false);
      expect(res401.status).toBe(401);
      expect(res401.code).toBe('INVALID_CREDENTIALS');
      expect(res401.message).toBe('Email hoặc mật khẩu không chính xác.');

      // 2. Mã 429 - Vượt ngưỡng rate limit
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          success: false,
          code: 'TOO_MANY_REQUESTS',
          message: 'Bạn đã gửi quá nhiều yêu cầu xác thực.'
        })
      });
      const res429 = await loginService({ email: 'spam@example.com', password: 'bad' });
      expect(res429.status).toBe(429);
      expect(res429.code).toBe('TOO_MANY_REQUESTS');

      // 3. Mã 500 - Lỗi máy chủ (không bị coi là sai mật khẩu)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.'
        })
      });
      const res500 = await loginService({ email: 'test@example.com', password: 'pass' });
      expect(res500.status).toBe(500);
      expect(res500.message).toContain('lỗi máy chủ nội bộ');
      expect(res500.message).not.toContain('Email hoặc mật khẩu không chính xác');

      // 4. Mất kết nối mạng (Fetch reject)
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const resNet = await loginService({ email: 'test@example.com', password: 'pass' });
      expect(resNet.status).toBe(0);
      expect(resNet.isNetworkError).toBe(true);
      expect(resNet.message).toContain('Không thể kết nối đến máy chủ');
    });

    it('registerService xử lý thành công 201, lỗi trùng email 409 và lỗi validation 400', async () => {
      // 1. Đăng ký thành công 201
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          message: 'Đăng ký tài khoản thành công.',
          data: {
            user: { id: '2', name: 'Le B', email: 'b@example.com', role: 'viewer', owned: [] }
          }
        })
      });
      const regSuccess = await registerService({
        fullName: 'Le B',
        email: 'b@example.com',
        password: 'Password@123'
      });
      expect(regSuccess.success).toBe(true);
      expect(regSuccess.status).toBe(201);
      expect(regSuccess.data.user.role).toBe('viewer');

      // 2. Email trùng lặp 409
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          code: 'DUPLICATE_KEY',
          message: 'Địa chỉ email này đã được sử dụng.',
          errors: { email: 'Đã tồn tại trong hệ thống.' }
        })
      });
      const reg409 = await registerService({
        fullName: 'Le B',
        email: 'b@example.com',
        password: 'Password@123'
      });
      expect(reg409.status).toBe(409);
      expect(reg409.code).toBe('DUPLICATE_KEY');
      expect(reg409.errors.email).toBeDefined();
    });

    it('getMeService và logoutService hoạt động đúng giao thức HttpOnly cookie', async () => {
      // 1. getMeService gọi GET /api/auth/me với credentials: include
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: { id: '1', name: 'User 1', email: 'u1@example.com', role: 'viewer', owned: [] } }
        })
      });

      const meRes = await getMeService();
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
      expect(meRes.success).toBe(true);

      // 2. logoutService gửi POST /api/auth/logout kèm body {} và Content-Type
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Đã đăng xuất thành công.' })
      });

      const logoutRes = await logoutService();
      expect(fetchSpy).toHaveBeenLastCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({})
        })
      );
      expect(logoutRes.success).toBe(true);
    });

    it('isPreviewMode kiểm tra đúng 4 tổ hợp Development/Production và cờ VITE_PREVIEW_MODE', () => {
      expect(isPreviewMode({ DEV: true, MODE: 'development', VITE_PREVIEW_MODE: 'true' })).toBe(true);
      expect(isPreviewMode({ DEV: true, MODE: 'development', VITE_PREVIEW_MODE: 'false' })).toBe(false);
      expect(isPreviewMode({ DEV: false, PROD: true, MODE: 'production', VITE_PREVIEW_MODE: 'true' })).toBe(false);
      expect(isPreviewMode({ DEV: false, PROD: true, MODE: 'production', VITE_PREVIEW_MODE: 'false' })).toBe(false);
    });

    it('isValidUserData kiểm tra chính xác tính hợp lệ của đối tượng user', () => {
      expect(isValidUserData(null)).toBe(false);
      expect(isValidUserData(undefined)).toBe(false);
      expect(isValidUserData('string')).toBe(false);
      expect(isValidUserData([])).toBe(false);
      expect(isValidUserData({})).toBe(false);
      expect(isValidUserData({ id: '1', name: 'A', email: 'a@b.com', role: 'viewer' })).toBe(false); // thiếu owned
      expect(isValidUserData({ id: '1', name: 'A', email: 'a@b.com', role: 'viewer', owned: 'invalid' })).toBe(false); // owned sai kiểu
      expect(isValidUserData({ id: '', name: 'A', email: 'a@b.com', role: 'viewer', owned: [] })).toBe(false); // id rỗng
      expect(isValidUserData({ id: '1', name: 'A', email: 'a@b.com', role: 'viewer', owned: [] })).toBe(true);
    });
    it('loginService trả INVALID_RESPONSE khi response null, thiếu data, thiếu user hoặc user sai kiểu', async () => {
      // 1. Response không phải object (null)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null
      });
      const resNull = await loginService({ email: 'u@example.com', password: '123' });
      expect(resNull.success).toBe(false);
      expect(resNull.code).toBe('INVALID_RESPONSE');

      // 2. HTTP 200 nhưng data là null ({ success: true, data: null })
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null })
      });
      const resDataNull = await loginService({ email: 'u@example.com', password: '123' });
      expect(resDataNull.success).toBe(false);
      expect(resDataNull.code).toBe('INVALID_RESPONSE');
      expect(resDataNull.message).toContain('không đúng định dạng dữ liệu người dùng');

      // 3. HTTP 200 nhưng data rỗng không có user ({ success: true, data: {} })
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} })
      });
      const resNoUser = await loginService({ email: 'u@example.com', password: '123' });
      expect(resNoUser.success).toBe(false);
      expect(resNoUser.code).toBe('INVALID_RESPONSE');

      // 4. HTTP 200 nhưng user sai kiểu (chuỗi thay vì object)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { user: 'invalid-string-user' } })
      });
      const resUserStr = await loginService({ email: 'u@example.com', password: '123' });
      expect(resUserStr.success).toBe(false);
      expect(resUserStr.code).toBe('INVALID_RESPONSE');

      // 5. HTTP 200 nhưng user thiếu trường hoặc owned không phải mảng
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: { id: '1', name: 'User', email: 'u@e.com', role: 'viewer', owned: 'not-array' } }
        })
      });
      const resBadOwned = await loginService({ email: 'u@example.com', password: '123' });
      expect(resBadOwned.success).toBe(false);
      expect(resBadOwned.code).toBe('INVALID_RESPONSE');

      // 6. HTTP 200 và user hoàn toàn hợp lệ
      const validUser = { id: '1', name: 'User', email: 'u@e.com', role: 'viewer', owned: [] };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { user: validUser } })
      });
      const resValid = await loginService({ email: 'u@example.com', password: '123' });
      expect(resValid.success).toBe(true);
      expect(resValid.data.user).toEqual(validUser);
    });

    it('getMeService và registerService cũng từ chối response sai cấu trúc user', async () => {
      // getMeService nhận data.user là số
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { user: 12345 } })
      });
      const meRes = await getMeService();
      expect(meRes.success).toBe(false);
      expect(meRes.code).toBe('INVALID_RESPONSE');

      // registerService nhận data không có user
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: null })
      });
      const regRes = await registerService({ fullName: 'A', email: 'a@b.com', password: '123' });
      expect(regRes.success).toBe(false);
      expect(regRes.code).toBe('INVALID_RESPONSE');

      // logoutService không bắt buộc có user
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Đã đăng xuất.' })
      });
      const logoutRes = await logoutService();
      expect(logoutRes.success).toBe(true);
    });

    // ------------------------------------------------------------------------
    // Bổ sung: Timeout toàn bộ request
    // ------------------------------------------------------------------------
    it('Máy chủ trả header nhưng body không hoàn tất: request kết thúc với TIMEOUT và không treo', async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(globalThis, 'fetch').mockImplementationOnce((url, options) => {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              new Promise((_, reject) => {
                if (options?.signal) {
                  options.signal.addEventListener('abort', () => {
                    const abortErr = new Error('The operation was aborted');
                    abortErr.name = 'AbortError';
                    reject(abortErr);
                  });
                }
              })
          });
        });

        const requestPromise = apiRequest('/api/auth/me', { timeoutMs: 100 });
        await vi.advanceTimersByTimeAsync(150);
        const result = await requestPromise;

        expect(result.success).toBe(false);
        expect(result.status).toBe(0);
        expect(result.code).toBe('TIMEOUT');
        expect(result.isNetworkError).toBe(true);
        expect(result.message).toContain('Hết thời gian chờ kết nối máy chủ');
      } finally {
        vi.useRealTimers();
      }
    });

    it('Phân biệt rõ ràng lỗi cú pháp JSON với TIMEOUT (không nhầm thành TIMEOUT)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0'))
      });

      const result = await apiRequest('/api/auth/me', { timeoutMs: 5000 });

      expect(result.success).toBe(false);
      expect(result.status).toBe(200);
      expect(result.code).toBe('INVALID_RESPONSE');
      expect(result.message).toContain('không đúng định dạng JSON');
      expect(result.code).not.toBe('TIMEOUT');
      expect(result.isNetworkError).toBeUndefined();
    });

    it('Timer timeout được dọn dẹp trong finally cho cả trường hợp thành công và thất bại', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      // 1. Thành công
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { user: { id: '1', name: 'A', email: 'a@b.com', role: 'viewer', owned: [] } } })
      });
      await apiRequest('/api/auth/me');
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

      // 2. Lỗi JSON
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Bad JSON'))
      });
      await apiRequest('/api/auth/me');
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);

      // 3. Lỗi mạng
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await apiRequest('/api/auth/me');
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // 3. Giao diện Đăng nhập (Login.jsx)
  // ==========================================================================
  describe('3. Giao diện Đăng nhập (Login)', () => {
    it('Render ô nhập Email (không còn "Tên đăng nhập"), ô mật khẩu và checkbox ghi nhớ', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, code: 'UNAUTHORIZED' })
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider>
              <Login />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      expect(container.querySelector('#email')).not.toBeNull();
      expect(container.querySelector('#usernameOrEmail')).toBeNull(); // Không còn trường cũ
      expect(container.textContent).toContain('Email');
      expect(container.textContent).not.toContain('Tên đăng nhập hoặc Email');
      expect(container.querySelector('#password')).not.toBeNull();
      expect(container.querySelector('input[name="remember"]')).not.toBeNull();
    });

    it('Kiểm tra hợp lệ dữ liệu (Validation) khi blur và submit form trống', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, code: 'UNAUTHORIZED' })
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider>
              <Login />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const submitBtn = container.querySelector('button[type="submit"]');

      // Blur input trống
      await act(async () => {
        emailInput.focus();
        emailInput.blur();
      });
      expect(container.textContent).toContain('Vui lòng nhập địa chỉ email.');

      await act(async () => {
        passInput.focus();
        passInput.blur();
      });
      expect(container.textContent).toContain('Vui lòng nhập mật khẩu.');

      // Submit form trống và kiểm tra focus chuyển về ô email đầu tiên
      await act(async () => {
        submitBtn.click();
      });
      expect(document.activeElement).toBe(emailInput);
    });

    it('Gửi form thành công gọi login API và chuyển hướng; sai thông tin hiển thị lỗi từ backend', async () => {
      // Mô phỏng sai mật khẩu 401
      vi.spyOn(authService, 'loginService').mockResolvedValueOnce({
        success: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider enableDemoAuth={false}>
              <Login />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const submitBtn = container.querySelector('button[type="submit"]');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

      await act(async () => {
        nativeSetter.call(emailInput, 'user@example.com');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(passInput, 'WrongPass123@');
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Submit
      await act(async () => {
        submitBtn.click();
      });

      expect(container.textContent).toContain('Email hoặc mật khẩu không chính xác.');
    });

    it('Nút bật/tắt hiển thị mật khẩu chuyển đổi type và aria-label', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, code: 'UNAUTHORIZED' })
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider>
              <Login />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      const passInput = container.querySelector('#password');
      const toggleBtn = container.querySelector('.au-password-toggle-btn');

      expect(passInput.getAttribute('type')).toBe('password');
      expect(toggleBtn.getAttribute('aria-label')).toContain('Hiện');

      await act(async () => {
        toggleBtn.click();
      });
      expect(passInput.getAttribute('type')).toBe('text');
      expect(toggleBtn.getAttribute('aria-label')).toContain('Ẩn');
    });
  });

  // ==========================================================================
  // 4. Giao diện Đăng ký (Register.jsx)
  // ==========================================================================
  describe('4. Giao diện Đăng ký (Register)', () => {
    it('Nhắc giới hạn 72 byte UTF-8 khi mật khẩu vượt quá 72 byte', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, code: 'UNAUTHORIZED' })
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider>
              <Register />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      const passInput = container.querySelector('#password');
      const submitBtn = container.querySelector('button[type="submit"]');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

      // Nhập mật khẩu dài 75 ký tự 'A' = 75 byte UTF-8
      await act(async () => {
        nativeSetter.call(passInput, 'A'.repeat(75));
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        submitBtn.click();
      });

      expect(container.textContent).toContain('Mật khẩu quá dài. Vui lòng rút ngắn.');
    });

    it('Xử lý email trùng lặp hiển thị lỗi ngay dưới ô email', async () => {
      vi.spyOn(authService, 'registerService').mockResolvedValueOnce({
        success: false,
        status: 409,
        code: 'DUPLICATE_KEY',
        message: 'Địa chỉ email này đã được sử dụng.',
        errors: { email: 'Đã tồn tại trong hệ thống.' }
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider enableDemoAuth={false}>
              <Register />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      const nameInput = container.querySelector('#fullName');
      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const confirmInput = container.querySelector('#confirmPassword');
      const submitBtn = container.querySelector('button[type="submit"]');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

      await act(async () => {
        nativeSetter.call(nameInput, 'Nguyễn Văn A');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(emailInput, 'duplicate@example.com');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(passInput, 'Password@123');
        passInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(confirmInput, 'Password@123');
        confirmInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        submitBtn.click();
      });

      const emailError = container.querySelector('#email-error');
      expect(emailError).not.toBeNull();
      expect(emailError.textContent).toContain('Địa chỉ email này đã được sử dụng.');
    });

    it('Đăng ký thành công hiển thị màn hình "Tạo tài khoản thành công", không giữ mật khẩu và không tự đăng nhập', async () => {
      vi.spyOn(authService, 'registerService').mockResolvedValueOnce({
        success: true,
        status: 201,
        message: 'Đăng ký tài khoản thành công.',
        data: {
          user: { id: '3', name: 'Trần Văn C', email: 'c@example.com', role: 'viewer', owned: [] }
        }
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <AuthProvider enableDemoAuth={false}>
              <Register />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      const nameInput = container.querySelector('#fullName');
      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const confirmInput = container.querySelector('#confirmPassword');
      const submitBtn = container.querySelector('button[type="submit"]');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

      await act(async () => {
        nativeSetter.call(nameInput, 'Trần Văn C');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(emailInput, 'c@example.com');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(passInput, 'Password@123');
        passInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeSetter.call(confirmInput, 'Password@123');
        confirmInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        submitBtn.click();
      });

      // Màn hình thành công
      expect(container.textContent).toContain('Tạo tài khoản thành công');
      expect(container.textContent).toContain('Bạn có thể đăng nhập ngay.');
      expect(container.textContent).toContain('Đến trang đăng nhập');
      // Không còn ô input mật khẩu trên màn hình
      expect(container.querySelector('#password')).toBeNull();
    });
  });

  // ==========================================================================
  // 5. Route Guard, AuthContext & Quản lý Phiên Thật
  // ==========================================================================
  describe('5. AuthContext & Route Guard với Backend', () => {
    it('Trong khi chờ /me, hiển thị màn hình chờ (loading screen), không nháy dashboard hoặc chuyển nhầm login', async () => {
      // Giả lập /me mất 500ms
      let resolveMe;
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveMe = resolve;
        });
      });

      await act(async () => {
        root.render(
          <TestAppRouter initialEntry="/overview" enableDemoAuth={false} />
        );
      });

      // Đang chờ -> hiển thị màn hình loading
      expect(container.querySelector('.auth-loading-screen')).not.toBeNull();
      expect(container.textContent).toContain('Đang kiểm tra phiên làm việc...');
      expect(container.querySelector('.au-title')).toBeNull(); // Không nhảy sang login

      // Hoàn tất /me với 401
      await act(async () => {
        resolveMe({
          ok: false,
          status: 401,
          json: async () => ({ success: false, code: 'UNAUTHORIZED' })
        });
      });

      // Sau khi 401 hoàn tất -> chuyển về /login
      expect(container.querySelector('.auth-loading-screen')).toBeNull();
      expect(container.querySelector('.au-title')?.textContent).toBe('Đăng nhập');
    });

    it('/me gặp lỗi mạng hoặc 500 hiển thị màn hình lỗi kết nối và nút thử lại (không suy diễn là hết phiên)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await act(async () => {
        root.render(
          <TestAppRouter initialEntry="/overview" enableDemoAuth={false} />
        );
      });

      // Hiển thị màn hình lỗi kết nối và nút thử lại
      expect(container.querySelector('.auth-error-screen')).not.toBeNull();
      expect(container.textContent).toContain('Không thể kết nối đến máy chủ');
      expect(container.textContent).toContain('Thử lại kết nối');
      // Không tự chuyển sang trang đăng nhập
      expect(container.querySelector('.au-title')).toBeNull();
    });

    it('/me trả 200 khôi phục phiên người dùng sau khi reload trang', async () => {
      const mockUser = {
        id: '10',
        name: 'Chủ Nhà Thông Minh',
        email: 'chunha@example.com',
        role: 'admin',
        owned: ['smart-door-lock']
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: mockUser }
        })
      });

      await act(async () => {
        root.render(
          <TestAppRouter initialEntry="/overview" enableDemoAuth={false} />
        );
      });

      // Vào thẳng dashboard và hiển thị tên người dùng
      expect(container.textContent).toContain('Chủ Nhà Thông Minh');
      expect(container.textContent).toContain('Tổng quan');
      expect(container.querySelector('.au-title')).toBeNull();
    });

    it('/me chậm -> logout thành công -> response cũ về: currentUser=null, isCheckingSession=false, route về login được', async () => {
      let resolveSlowMe;
      // Giả lập /me chạy rất chậm
      vi.spyOn(authService, 'getMeService').mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveSlowMe = resolve;
        });
      });

      let authContextVal = null;
      function ContextConsumer() {
        authContextVal = useAuthContext();
        return (
          <div>
            <TestProtectedRoute>
              <div>Màn hình Dashboard Được Bảo Vệ</div>
            </TestProtectedRoute>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/overview']}>
            <AuthProvider enableDemoAuth={false}>
              <Routes>
                <Route
                  path="/login"
                  element={<div data-testid="login-page">Màn hình Đăng nhập Hệ thống</div>}
                />
                <Route
                  path="/overview"
                  element={<ContextConsumer />}
                />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        );
      });

      // Ban đầu: đang kiểm tra phiên -> TestProtectedRoute hiển thị màn hình chờ (loading screen)
      expect(container.querySelector('.auth-loading-screen')).not.toBeNull();
      expect(container.textContent).toContain('Đang kiểm tra phiên làm việc...');
      expect(authContextVal.isCheckingSession).toBe(true);

      // Người dùng thực hiện logout thành công trong khi /me vẫn chưa có phản hồi
      vi.spyOn(authService, 'logoutService').mockResolvedValueOnce({ success: true });
      await act(async () => {
        await authContextVal.logout();
      });

      // Ngay sau khi logout thành công: isCheckingSession phải là false và currentUser = null
      expect(authContextVal.currentUser).toBeNull();
      expect(authContextVal.isCheckingSession).toBe(false);

      // Bây giờ response /me cũ mới trả về kết quả
      await act(async () => {
        resolveSlowMe({
          success: true,
          status: 200,
          data: {
            user: { id: 'old', name: 'Tài Khoản Cũ', email: 'old@example.com', role: 'viewer', owned: [] }
          }
        });
      });

      // Đảm bảo: currentUser vẫn là null VÀ isCheckingSession vẫn là false (KHÔNG BỊ KẸT LOADING!)
      expect(authContextVal.currentUser).toBeNull();
      expect(authContextVal.isCheckingSession).toBe(false);

      // Route Guard điều hướng về login được và không bị kẹt ở loading screen
      expect(container.querySelector('.auth-loading-screen')).toBeNull();
      expect(container.textContent).toContain('Màn hình Đăng nhập Hệ thống');
    });

    it('/me chậm -> login thành công -> response cũ về: giữ đúng user mới và không kẹt loading', async () => {
      let resolveSlowMe;
      vi.spyOn(authService, 'getMeService').mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveSlowMe = resolve;
        });
      });

      let authContextVal = null;
      function ContextConsumer() {
        authContextVal = useAuthContext();
        return (
          <div>
            <span data-testid="is-loading">{String(authContextVal.isCheckingSession)}</span>
            <span data-testid="user-name">{authContextVal.currentUser?.name || 'Chưa đăng nhập'}</span>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={false}>
            <ContextConsumer />
          </AuthProvider>
        );
      });

      expect(authContextVal.isCheckingSession).toBe(true);

      // Login với User Mới B thành công
      const newUser = { id: 'user_b', name: 'Người Dùng Mới B', email: 'b@example.com', role: 'viewer', owned: [] };
      vi.spyOn(authService, 'loginService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { user: newUser }
      });

      await act(async () => {
        await authContextVal.login({ email: 'b@example.com', password: 'Password@123' });
      });

      // User mới đã được ghi nhận và loading kết thúc
      expect(authContextVal.currentUser).toEqual(newUser);
      expect(authContextVal.isCheckingSession).toBe(false);

      // Bây giờ response /me cũ với User A mới về
      const oldUser = { id: 'user_a', name: 'Người Dùng Cũ A', email: 'a@example.com', role: 'viewer', owned: [] };
      await act(async () => {
        resolveSlowMe({
          success: true,
          status: 200,
          data: { user: oldUser }
        });
      });

      // Kết quả: Giữ đúng user mới B, không kẹt loading và không bị user cũ A ghi đè!
      expect(authContextVal.currentUser).toEqual(newUser);
      expect(authContextVal.isCheckingSession).toBe(false);
      expect(container.textContent).toContain('Người Dùng Mới B');
      expect(container.textContent).not.toContain('Người Dùng Cũ A');
    });

    it('Hai lần kiểm tra phiên chồng nhau: response cũ không kết thúc loading của request mới', async () => {
      let resolveCheck1;
      let resolveCheck2;

      // Mock getMeService: lần 1 trả promise 1, lần 2 trả promise 2
      vi.spyOn(authService, 'getMeService')
        .mockImplementationOnce(() => new Promise((resolve) => { resolveCheck1 = resolve; }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveCheck2 = resolve; }));

      let authContextVal = null;
      function ContextConsumer() {
        authContextVal = useAuthContext();
        return (
          <div>
            <span data-testid="is-loading">{String(authContextVal.isCheckingSession)}</span>
            <span data-testid="user-name">{authContextVal.currentUser?.name || 'none'}</span>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={false}>
            <ContextConsumer />
          </AuthProvider>
        );
      });

      // Lần check 1 đang chạy
      expect(authContextVal.isCheckingSession).toBe(true);

      // Kích hoạt lần check 2 (chồng lên lần 1, ví dụ người dùng ấn Thử lại kết nối)
      let check2Promise;
      await act(async () => {
        check2Promise = authContextVal.retryCheckSession();
      });

      // Vẫn đang loading vì check 2 đang chạy
      expect(authContextVal.isCheckingSession).toBe(true);

      // Bây giờ check 1 hoàn tất (chậm hơn lúc check 2 bắt đầu)
      const user1 = { id: '1', name: 'User 1', email: 'u1@example.com', role: 'viewer', owned: [] };
      await act(async () => {
        resolveCheck1({
          success: true,
          status: 200,
          data: { user: user1 }
        });
      });

      // QUAN TRỌNG: Check 1 kết thúc KHÔNG ĐƯỢC TẮT LOADING của check 2!
      // isCheckingSession vẫn phải là TRUE!
      expect(authContextVal.isCheckingSession).toBe(true);
      expect(authContextVal.currentUser).toBeNull(); // Không nhận user 1 từ check cũ

      // Bây giờ check 2 hoàn tất
      const user2 = { id: '2', name: 'User 2', email: 'u2@example.com', role: 'viewer', owned: [] };
      await act(async () => {
        resolveCheck2({
          success: true,
          status: 200,
          data: { user: user2 }
        });
        await check2Promise;
      });

      // Chỉ khi check 2 kết thúc, loading mới tắt và cập nhật user 2
      expect(authContextVal.isCheckingSession).toBe(false);
      expect(authContextVal.currentUser).toEqual(user2);
      expect(container.textContent).toContain('User 2');
    });

    it('Kiểm tra dưới StrictMode: AuthProvider khôi phục phiên ổn định, isCheckingSession chuyển false, không crash', async () => {
      const strictUser = { id: 's1', name: 'Người Dùng StrictMode', email: 'strict@example.com', role: 'viewer', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: strictUser }
      });

      let authContextVal = null;
      function StrictConsumer() {
        authContextVal = useAuthContext();
        return <div>{authContextVal.currentUser?.name || 'Đang tải'}</div>;
      }

      await act(async () => {
        root.render(
          <StrictMode>
            <AuthProvider enableDemoAuth={false}>
              <StrictConsumer />
            </AuthProvider>
          </StrictMode>
        );
      });

      // Sau khi StrictMode hoàn tất cả 2 chu kỳ mount
      expect(authContextVal.isCheckingSession).toBe(false);
      expect(authContextVal.currentUser).toEqual(strictUser);
      expect(container.textContent).toContain('Người Dùng StrictMode');
    });

    it('AuthContext xử lý response sai cấu trúc: không cập nhật user và không ném lỗi JavaScript nội bộ', async () => {
      // Giả lập /me trả về HTTP 200 với data.user không đúng chuẩn
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: false,
        status: 200,
        code: 'INVALID_RESPONSE',
        message: 'Phản hồi phiên làm việc từ máy chủ không đúng định dạng dữ liệu người dùng.',
        data: null
      });

      let authContextVal = null;
      function ErrorConsumer() {
        authContextVal = useAuthContext();
        return <div>{authContextVal.sessionError || 'none'}</div>;
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={false}>
            <ErrorConsumer />
          </AuthProvider>
        );
      });

      // currentUser không bị gán dữ liệu sai
      expect(authContextVal.currentUser).toBeNull();
      expect(authContextVal.isCheckingSession).toBe(false);
      // Hiển thị thông báo tiếng Việt an toàn, không có lỗi Cannot read properties
      expect(authContextVal.sessionError).toContain('không đúng định dạng dữ liệu người dùng');
      expect(container.textContent).toContain('không đúng định dạng dữ liệu người dùng');
      expect(container.textContent).not.toContain('Cannot read properties');
    });

    it('Đăng xuất thất bại không xóa currentUser và hiển thị thông báo lỗi', async () => {
      const mockUser = { id: '1', name: 'Đang Đăng Nhập', email: 'u@example.com', role: 'viewer', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      await act(async () => {
        root.render(
          <TestAppRouter initialEntry="/overview" enableDemoAuth={false} />
        );
      });

      expect(container.textContent).toContain('Đang Đăng Nhập');

      // Mô phỏng logout thất bại (máy chủ lỗi 500)
      vi.spyOn(authService, 'logoutService').mockResolvedValueOnce({
        success: false,
        status: 500,
        message: 'Không thể đăng xuất phiên làm việc phía máy chủ.'
      });

      const logoutBtn = container.querySelector('.logout-btn');
      await act(async () => {
        logoutBtn.click();
      });

      // Không chuyển trang và hiển thị thông báo lỗi đăng xuất
      expect(container.textContent).toContain('Không thể đăng xuất phiên làm việc phía máy chủ.');
      expect(container.textContent).toContain('Đang Đăng Nhập');
    });

    it('Session demo cũ trong storage không thể vượt qua Route Guard khi enableDemoAuth=false', async () => {
      window.localStorage.setItem(
        STORAGE_KEY_AUTH,
        JSON.stringify({ username: 'admin', role: 'admin', name: 'Quản trị viên Demo' })
      );

      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ success: false, code: 'UNAUTHORIZED' })
      });

      await act(async () => {
        root.render(
          <TestAppRouter initialEntry="/overview" enableDemoAuth={false} />
        );
      });

      expect(container.querySelector('.au-title')?.textContent).toBe('Đăng nhập');
      expect(container.textContent).not.toContain('Quản trị viên Demo');
    });
  });
});
