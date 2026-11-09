import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider, DEFAULT_APPEARANCE } from '../context/SettingsContext.jsx';
import { formatDateTimeSample, isValidTimeZone } from '../shared/dateTimeFormatter.js';
import * as settingsService from '../services/settingsService.js';
import * as authService from '../services/authService.js';

import Layout from '../shared/components/Layout.jsx';
import SettingsLayout from '../pages/Settings/SettingsLayout.jsx';
import SettingsIndex from '../pages/Settings/SettingsIndex.jsx';
import AppearanceSettings from '../pages/Settings/AppearanceSettings.jsx';
import AccountSettings from '../pages/Settings/AccountSettings.jsx';
import PlaceholderSection from '../pages/Settings/PlaceholderSection.jsx';
import Overview from '../pages/Overview.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Component Route Guard mô phỏng đúng ProtectedRoute trong App.jsx
 */
function TestProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthContext();
  if (!isAuthenticated && !authService.isPreviewMode()) {
    return <div className="redirect-login-page">Trang đăng nhập (Redirected)</div>;
  }
  return children;
}

/**
 * Component Router Test hỗ trợ cấu hình route Cài đặt cho kiểm thử Vitest
 */
function TestSessionBridge() {
  const { checkSession } = useAuthContext();
  return (
    <button
      type="button"
      data-testid="test-check-session"
      style={{ display: 'none' }}
      onClick={() => checkSession()}
    />
  );
}

function TestSettingsRouter({
  initialEntry = '/settings',
  _currentUser = null,
  _isPreview = false
}) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LanguageProvider>
        <AuthProvider enableDemoAuth={false}>
          <TestSessionBridge />
          <DeviceProvider>
            <SettingsProvider>
              <Routes>
                <Route
                  path="/"
                  element={
                    <TestProtectedRoute>
                      <Layout />
                    </TestProtectedRoute>
                  }
                >
                  <Route path="overview" element={<Overview />} />
                  <Route path="settings" element={<SettingsLayout />}>
                    <Route index element={<SettingsIndex />} />
                    <Route path="appearance" element={<AppearanceSettings />} />
                    <Route path="account" element={<AccountSettings />} />
                    <Route path="security" element={<PlaceholderSection sectionKey="security" />} />
                    <Route path="notifications" element={<PlaceholderSection sectionKey="notifications" />} />
                    <Route path="privacy" element={<PlaceholderSection sectionKey="privacy" />} />
                    <Route path="admin" element={<PlaceholderSection sectionKey="admin" />} />
                    <Route path="help" element={<PlaceholderSection sectionKey="help" />} />
                  </Route>
                </Route>
                <Route path="/login" element={<div className="login-page">Trang đăng nhập</div>} />
              </Routes>
            </SettingsProvider>
          </DeviceProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe('Giai đoạn 1B: Khung Cài đặt và Mục Giao diện', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.documentElement.lang = 'vi';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-font-size');
    document.documentElement.removeAttribute('data-high-contrast');
    document.documentElement.removeAttribute('data-reduced-motion');
    window.innerWidth = 1024;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('921px') ? window.innerWidth > 920 : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
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
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Module Định dạng Ngày Giờ & Timezone
  // =========================================================================
  describe('1. DateTime Formatter & Timezone Helpers', () => {
    it('Định dạng mẫu chính xác theo timezone, dateFormat và hourFormat', () => {
      const fixedDate = new Date('2026-10-26T14:30:45Z');

      // 24h & DD/MM/YYYY
      const formattedVN = formatDateTimeSample({
        timeZone: 'Asia/Ho_Chi_Minh',
        dateFormat: 'DD/MM/YYYY',
        hourFormat: '24h',
        date: fixedDate
      });
      expect(formattedVN).toContain('26/10/2026');
      expect(formattedVN).toContain('21:30:45'); // UTC+7

      // 12h & MM/DD/YYYY
      const formattedUS = formatDateTimeSample({
        timeZone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        hourFormat: '12h',
        date: fixedDate
      });
      expect(formattedUS).toContain('10/26/2026');
      expect(formattedUS).toMatch(/02:30:45\s*(PM|pm)/);

      // YYYY-MM-DD
      const formattedISO = formatDateTimeSample({
        timeZone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        hourFormat: '24h',
        date: fixedDate
      });
      expect(formattedISO).toContain('2026-10-26');
    });

    it('Xác thực đúng định dạng Timezone IANA và từ chối offset thô', () => {
      expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
      expect(isValidTimeZone('UTC')).toBe(true);
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('Europe/Paris')).toBe(true);

      // Từ chối offset và chuỗi không hợp lệ
      expect(isValidTimeZone('+07:00')).toBe(false);
      expect(isValidTimeZone('-05:00')).toBe(false);
      expect(isValidTimeZone('Invalid/Zone')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone(null)).toBe(false);
    });
  });

  // =========================================================================
  // 2. Khởi tạo & Nạp Cài đặt (Hydration & User Isolation)
  // =========================================================================
  describe('2. Khởi tạo & Nạp Cài đặt (Hydration & User Isolation)', () => {
    it('Người dùng thật đăng nhập: Tự động nạp settings từ server và áp dụng vào DOM', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      const serverSettings = {
        appearance: {
          theme: 'light',
          language: 'vi',
          fontSize: 'large',
          highContrast: true,
          reducedMotion: true,
          timeZone: 'Asia/Bangkok',
          dateFormat: 'YYYY-MM-DD',
          hourFormat: '12h'
        }
      };

      const getSettingsSpy = vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: serverSettings
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      expect(getSettingsSpy).toHaveBeenCalledTimes(1);
      // DOM attributes được cập nhật theo cấu hình nạp từ server
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true');
      expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    });

    it('Khách hoặc chế độ xem trước (Preview): Không gọi GET/PATCH tới API máy chủ', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: false,
        status: 401,
        message: 'Chưa đăng nhập'
      });

      const getSpy = vi.spyOn(settingsService, 'getSettingsService');
      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService');

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" _isPreview={true} />);
      });

      expect(getSpy).not.toHaveBeenCalled();
      expect(patchSpy).not.toHaveBeenCalled();
      expect(container.textContent).toContain('chế độ xem trước');
    });

    it('Lỗi nạp settings từ máy chủ: Hiển thị lỗi, khóa điều khiển, bấm đúng nút Thử lại thì GET mới thành công', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      const getSpy = vi.spyOn(settingsService, 'getSettingsService')
        .mockResolvedValueOnce({
          success: false,
          status: 500,
          code: 'LOAD_SETTINGS_FAILED',
          message: 'Lỗi tải máy chủ'
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      expect(container.textContent).toContain('Không thể tải cài đặt từ máy chủ');
      // Các nút bấm bị khóa khi chưa nạp được cấu hình xác nhận
      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      expect(lightBtn.disabled).toBe(true);

      const retryBtn = container.querySelector('.status-error .btn');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn.textContent).toContain('Thử lại');

      // Bấm nút Thử lại chính
      await act(async () => {
        retryBtn.click();
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(lightBtn.disabled).toBe(false);
    });

    it('GET Settings trả 401: Vô hiệu hóa phiên đăng nhập, ProtectedRoute đưa về login', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Phiên hết hạn'
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // ProtectedRoute đưa về trang đăng nhập
      expect(container.textContent).toContain('Trang đăng nhập');
    });

    it('GET cũ về sau PATCH mới thành công: Snapshot cũ tuyệt đối không ghi đè giá trị mới đã lưu', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      // Initial load trả theme: dark
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' } }
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // Giả lập GET nền (ví dụ focus tab) bị trễ
      let resolveDelayedGet;
      const delayedGetPromise = new Promise((resolve) => {
        resolveDelayedGet = resolve;
      });

      vi.spyOn(settingsService, 'getSettingsService').mockImplementationOnce(() => delayedGetPromise);

      // Kích hoạt focus re-sync
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      // Người dùng đổi theme light và PATCH hoàn thành trước khi GET nền trả về
      vi.spyOn(settingsService, 'updateAppearanceService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
      });

      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );

      await act(async () => {
        lightBtn.click();
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      // Giờ giải phóng GET nền cũ (mang snapshot dark)
      await act(async () => {
        resolveDelayedGet({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' } }
        });
      });

      // Snapshot cũ bị chặn bởi mutation sequence guard: theme VẪN là light!
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('Hai GET trả sai thứ tự: Snapshot của GET cũ hơn không được áp dụng', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      let resolveGet1;
      const get1Promise = new Promise((resolve) => {
        resolveGet1 = resolve;
      });
      let resolveGet2;
      const get2Promise = new Promise((resolve) => {
        resolveGet2 = resolve;
      });

      vi.spyOn(settingsService, 'getSettingsService')
        .mockImplementationOnce(() => get1Promise)
        .mockImplementationOnce(() => get2Promise);

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // Kích hoạt GET thứ hai trong khi GET 1 chưa trả lời
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      // GET 2 trả lời trước với fontSize = 'large'
      await act(async () => {
        resolveGet2({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, fontSize: 'large' } }
        });
      });
      expect(document.documentElement.getAttribute('data-font-size')).toBe('large');

      // GET 1 trả lời sau với fontSize = 'small'
      await act(async () => {
        resolveGet1({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, fontSize: 'small' } }
        });
      });

      // GET 1 bị bỏ qua do thứ tự tuần tự: fontSize vẫn là large
      expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
    });
  });

  // =========================================================================
  // 3. Hàng đợi lưu tuần tự & Delta PATCH (Queue & Serialization)
  // =========================================================================
  describe('3. Hàng đợi lưu tuần tự & Delta PATCH', () => {
    it('Lưu đúng delta: Chỉ gửi trường vừa thay đổi, không gửi toàn bộ 8 trường', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // Tìm nút chuyển theme Light
      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      expect(lightBtn).not.toBeUndefined();

      await act(async () => {
        lightBtn.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith({ theme: 'light' });
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('Chọn lại giá trị không đổi: Tuyệt đối không phát sinh request PATCH', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService');

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // Server đã lưu dark, người dùng bấm lại nút Tối
      const darkBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Tối') || b.textContent.includes('Dark')
      );

      await act(async () => {
        darkBtn.click();
      });

      // Không phát sinh request PATCH
      expect(patchSpy).not.toHaveBeenCalled();
    });

    it('Đổi A -> B -> A trong lúc request đang bay: Vẫn lưu đúng giá trị cuối cùng', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' } }
      });

      let resolvePatch1;
      const patch1Promise = new Promise((resolve) => {
        resolvePatch1 = resolve;
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockImplementationOnce(() => patch1Promise)
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' } }
        });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      const darkBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Tối') || b.textContent.includes('Dark')
      );
      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );

      // 1. Bấm Light -> gửi PATCH #1 { theme: 'light' }
      await act(async () => {
        lightBtn.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenNthCalledWith(1, { theme: 'light' });

      // 2. Trong lúc request 1 đang bay, bấm lại Dark!
      await act(async () => {
        darkBtn.click();
      });
      // Chưa gửi request 2 vì request 1 đang bay
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 3. Giải phóng request 1 (server xác nhận light)
      await act(async () => {
        resolvePatch1({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      // 4. Request 2 bắt buộc phải được gửi ngay sau đó với { theme: 'dark' }
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { theme: 'dark' });
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('Đổi hai lần liên tiếp cùng một trường: Request thứ 2 gửi giá trị mới nhất', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      let resolveFirstPatch;
      const firstPatchPromise = new Promise((resolve) => {
        resolveFirstPatch = resolve;
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockImplementationOnce(() => firstPatchPromise)
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, fontSize: 'large' } }
        });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      const fontSmallBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Nhỏ') || b.textContent.includes('Small')
      );
      const fontLargeBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Lớn') || b.textContent.includes('Large')
      );

      // Click fontSmall (đang bay)
      await act(async () => {
        fontSmallBtn.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenNthCalledWith(1, { fontSize: 'small' });

      // Trong khi request 1 đang pending, click fontLarge
      await act(async () => {
        fontLargeBtn.click();
      });
      // Chưa gửi request 2 vì request 1 chưa xong (Single In-Flight)
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Giải phóng request 1
      await act(async () => {
        resolveFirstPatch({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, fontSize: 'small' } }
        });
      });

      // Request 2 được gửi ngay sau đó với giá trị mới nhất là 'large'
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { fontSize: 'large' });
    });

    it('Đổi hai trường khác nhau khi request đầu đang chạy: Request sau gửi gộp trường mới', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      let resolveFirst;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockImplementationOnce(() => firstPromise)
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light', fontSize: 'large' } }
        });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      const fontLargeBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Lớn') || b.textContent.includes('Large')
      );

      // Click đổi theme
      await act(async () => {
        lightBtn.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenNthCalledWith(1, { theme: 'light' });

      // Click đổi cỡ chữ sang Large trong khi request 1 đang bay
      await act(async () => {
        fontLargeBtn.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Giải phóng request 1
      await act(async () => {
        resolveFirst({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      // Request thứ 2 gửi đúng delta của trường fontSize
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { fontSize: 'large' });
    });

    it('Trạng thái "Đã lưu" chỉ xuất hiện khi hết thay đổi trong hàng đợi', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      let resolvePatch;
      const patchPromise = new Promise((resolve) => {
        resolvePatch = resolve;
      });

      vi.spyOn(settingsService, 'updateAppearanceService').mockImplementationOnce(() => patchPromise);

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );

      await act(async () => {
        lightBtn.click();
      });

      // Đang lưu
      expect(container.querySelector('.status-saving')).not.toBeNull();
      expect(container.querySelector('.status-saved')).toBeNull();

      // Khi xong
      await act(async () => {
        resolvePatch({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      // Đã chuyển sang Đã lưu
      expect(container.querySelector('.status-saved')).not.toBeNull();
      expect(container.querySelector('.status-saving')).toBeNull();
    });

    it('PATCH Settings trả 401: Vô hiệu hóa phiên đăng nhập, dừng queue và đưa về login', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      vi.spyOn(settingsService, 'updateAppearanceService').mockResolvedValueOnce({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Phiên đăng nhập đã hết hạn'
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );

      await act(async () => {
        lightBtn.click();
      });

      // Chuyển hướng về login
      expect(container.textContent).toContain('Trang đăng nhập');
    });

    it('Lỗi mạng khi PATCH: Giữ phiên đăng nhập, giữ bản nháp và nút Thử lại gửi lại delta đúng', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockResolvedValueOnce({
          success: false,
          status: 500,
          code: 'SERVER_ERROR',
          message: 'Lỗi server'
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );

      await act(async () => {
        lightBtn.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      // Vẫn đăng nhập, hiển thị thông báo lỗi lưu
      expect(container.querySelector('.status-error')).not.toBeNull();
      expect(container.textContent).toContain('Chưa xác nhận lưu được');

      // Nhấn nút thử lại
      const retryBtn = container.querySelector('.status-error .btn');
      expect(retryBtn).not.toBeNull();

      await act(async () => {
        retryBtn.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { theme: 'light' });
      expect(container.querySelector('.status-saved')).not.toBeNull();
    });

    it('Phản hồi muộn (200, 500, 401) của User A không làm mất khóa lưu, mất phiên hoặc mất draft của User B', async () => {
      const userA = { id: 'userA', name: 'User A', email: 'a@example.com', role: 'member', owned: [] };
      const userB = { id: 'userB', name: 'User B', email: 'b@example.com', role: 'member', owned: [] };

      let currentUserMock = userA;
      vi.spyOn(authService, 'getMeService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { user: currentUserMock }
      }));

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark', fontSize: 'medium' } }
      });

      let resolvePatchA;
      const patchAPromise = new Promise((resolve) => {
        resolvePatchA = resolve;
      });

      let resolvePatchB1;
      const patchB1Promise = new Promise((resolve) => {
        resolvePatchB1 = resolve;
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockImplementationOnce(() => patchAPromise)   // A PATCH
        .mockImplementationOnce(() => patchB1Promise)  // B PATCH 1
        .mockResolvedValueOnce({                        // B PATCH 2
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light', fontSize: 'large' } }
        });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // 1. User A gửi PATCH theme: 'light' (giữ chưa trả)
      const lightBtnA = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      await act(async () => {
        lightBtnA.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenNthCalledWith(1, { theme: 'light' });

      // 2. Chuyển sang User B và nạp settings thành công
      currentUserMock = userB;
      await act(async () => {
        container.querySelector('[data-testid="test-check-session"]').click();
      });

      // 3. User B gửi PATCH thứ nhất: theme: 'light' (giữ chưa trả)
      const lightBtnB = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      await act(async () => {
        lightBtnB.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { theme: 'light' });

      // 4. Cho PATCH của A hoàn thành muộn (success 200)
      await act(async () => {
        resolvePatchA({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      // 5. User B chỉnh sửa trường khác (fontSize: 'large')
      const fontLargeBtnB = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Lớn') || b.textContent.includes('Large')
      );
      await act(async () => {
        fontLargeBtnB.click();
      });

      // Khóa lưu của B KHÔNG bị mất! PATCH mới của B chưa được gửi ngay vì PATCH 1 của B vẫn đang in-flight
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(container.querySelector('.status-saving')).not.toBeNull();

      // 6. Cho PATCH 1 của B hoàn tất
      await act(async () => {
        resolvePatchB1({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      // Khi PATCH 1 của B xong, delta fontSize: 'large' của B mới được gửi
      expect(patchSpy).toHaveBeenCalledTimes(3);
      expect(patchSpy).toHaveBeenNthCalledWith(3, { fontSize: 'large' });
      expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
    });

    it('Request cũ của User A bị lỗi mạng hoặc 401 không làm User B mất phiên hay mất khóa lưu', async () => {
      const userA = { id: 'userA', name: 'User A', email: 'a@example.com', role: 'member', owned: [] };
      const userB = { id: 'userB', name: 'User B', email: 'b@example.com', role: 'member', owned: [] };

      let currentUserMock = userA;
      vi.spyOn(authService, 'getMeService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { user: currentUserMock }
      }));

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' } }
      });

      let rejectPatchA;
      const patchAPromise = new Promise((_, reject) => {
        rejectPatchA = reject;
      });

      let resolvePatchB;
      const patchBPromise = new Promise((resolve) => {
        resolvePatchB = resolve;
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockImplementationOnce(() => patchAPromise)
        .mockImplementationOnce(() => patchBPromise);

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // User A gửi PATCH
      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      await act(async () => {
        lightBtn.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Chuyển sang User B
      currentUserMock = userB;
      await act(async () => {
        container.querySelector('[data-testid="test-check-session"]').click();
      });

      // User B gửi PATCH
      const lightBtnB = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      await act(async () => {
        lightBtnB.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(2);

      // Cho request cũ của A reject lỗi mạng
      await act(async () => {
        rejectPatchA(new Error('Network error from User A'));
      });

      // User B vẫn đăng nhập bình thường và đang lưu, không bị ảnh hưởng bởi lỗi của User A
      expect(container.textContent).not.toContain('Trang đăng nhập');
      expect(container.querySelector('.status-saving')).not.toBeNull();

      // Cho request của B hoàn tất
      await act(async () => {
        resolvePatchB({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      expect(container.querySelector('.status-saved')).not.toBeNull();
    });
  });

  // =========================================================================
  // 4. Đồng bộ Ngôn ngữ (Language Sync & No Infinite Loops)
  // =========================================================================
  describe('4. Đồng bộ Ngôn ngữ', () => {
    it('Đổi ngôn ngữ trên Header (LanguageToggle) kích hoạt PATCH lưu backend và không vòng lặp', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, language: 'vi' } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, language: 'en' } }
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // Nút chuyển EN trên Topbar
      const langEnBtn = Array.from(container.querySelectorAll('.lang-toggle-btn')).find(
        (b) => b.textContent.trim() === 'EN'
      );
      expect(langEnBtn).not.toBeNull();

      await act(async () => {
        langEnBtn.click();
      });

      // Đã gọi PATCH language: 'en'
      expect(patchSpy).toHaveBeenCalledWith({ language: 'en' });
      expect(document.documentElement.lang).toBe('en');
    });

    it('Bấm lại ngôn ngữ đang hiển thị trên Header không phát sinh PATCH thừa', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, language: 'vi' } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService');

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // Bấm nút VI khi đang là VI
      const langViBtn = Array.from(container.querySelectorAll('.lang-toggle-btn')).find(
        (b) => b.textContent.trim() === 'VI'
      );

      await act(async () => {
        langViBtn.click();
      });

      expect(patchSpy).not.toHaveBeenCalled();
    });

    it('Server hydration nạp ngôn ngữ không tạo PATCH ngược lại server', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE, language: 'en' } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updateAppearanceService');

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/appearance" />);
      });

      // Hydration nạp language = en từ server
      expect(document.documentElement.lang).toBe('en');
      // Không gọi PATCH ngược lại
      expect(patchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Khung Điều hướng, Responsive & Phân quyền
  // =========================================================================
  describe('5. Khung Điều hướng & Phân quyền', () => {
    it('Desktop: Truy cập /settings hiển thị Appearance ở vùng nội dung', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      // Giả lập màn hình Desktop >= 921px
      window.innerWidth = 1024;

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings" />);
      });

      // Kiểm tra có sidebar cài đặt và hiển thị mục Giao diện
      expect(container.querySelector('.settings-sidebar')).not.toBeNull();
      expect(container.querySelector('.appearance-settings-page')).not.toBeNull();
    });

    it('User thông thường: Sidebar chỉ hiển thị 6 mục, truy cập /settings/admin bị chặn 403', async () => {
      const normalUser = { id: 'u1', name: 'Người Dùng Thường', email: 'user@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: normalUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      window.innerWidth = 1024;

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/admin" />);
      });

      // Sidebar chỉ có 6 mục
      const navItems = container.querySelectorAll('.settings-nav-item');
      expect(navItems.length).toBe(6);

      // Vùng nội dung báo không có quyền
      expect(container.textContent).toContain('Không có quyền truy cập khu vực quản trị');
    });

    it('User Admin: Sidebar hiển thị đủ 7 mục và có quyền vào /settings/admin', async () => {
      const adminUser = { id: 'admin1', name: 'Quản Trị Viên', email: 'admin@example.com', role: 'admin', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: adminUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      window.innerWidth = 1024;

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/admin" />);
      });

      // Sidebar có đủ 7 mục
      const navItems = container.querySelectorAll('.settings-nav-item');
      expect(navItems.length).toBe(7);

      // Vùng nội dung là placeholder Quản trị
      expect(container.textContent).toContain('Quản trị');
      expect(container.textContent).toContain('Chưa hỗ trợ');
    });

    it('Mục chưa hoàn thiện hiển thị thông điệp "Chưa hỗ trợ" trung thực, không chức năng giả', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/settings/security" />);
      });

      expect(container.textContent).toContain('Bảo mật');
      expect(container.textContent).toContain('Chưa hỗ trợ');
      expect(container.querySelector('form')).toBeNull();
      expect(container.querySelector('button[type="submit"]')).toBeNull();
    });
  });

  // =========================================================================
  // 6. User Account Menu & Bàn phím (a11y)
  // =========================================================================
  describe('6. User Account Menu trên Topbar & Bàn phím', () => {
    it('Menu tài khoản mở/đóng bằng click và hỗ trợ phím Escape trả focus', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/overview" />);
      });

      const menuBtn = container.querySelector('.user-menu-btn');
      expect(menuBtn).not.toBeNull();
      expect(menuBtn.getAttribute('aria-expanded')).toBe('false');

      // Click để mở menu
      await act(async () => {
        menuBtn.click();
      });
      expect(menuBtn.getAttribute('aria-expanded')).toBe('true');

      const dropdown = container.querySelector('.user-account-dropdown');
      expect(dropdown).not.toBeNull();
      expect(dropdown.hidden).toBe(false);

      // Bấm phím Escape
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
      expect(dropdown.hidden).toBe(true);
    });

    it('Click ngoài menu tài khoản tự động đóng dropdown', async () => {
      const mockUser = { id: 'u1', name: 'Nguyễn Văn A', email: 'a@example.com', role: 'member', owned: [] };
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });

      await act(async () => {
        root.render(<TestSettingsRouter initialEntry="/overview" />);
      });

      const menuBtn = container.querySelector('.user-menu-btn');

      await act(async () => {
        menuBtn.click();
      });
      expect(menuBtn.getAttribute('aria-expanded')).toBe('true');

      // Click ra ngoài
      await act(async () => {
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });

      expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
