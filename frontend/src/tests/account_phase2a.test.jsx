import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider, DEFAULT_APPEARANCE } from '../context/SettingsContext.jsx';
import * as accountService from '../services/accountService.js';
import * as settingsService from '../services/settingsService.js';
import * as authService from '../services/authService.js';

import Layout from '../shared/components/Layout.jsx';
import SettingsLayout from '../pages/Settings/SettingsLayout.jsx';
import SettingsIndex from '../pages/Settings/SettingsIndex.jsx';
import AppearanceSettings from '../pages/Settings/AppearanceSettings.jsx';
import AccountSettings, { getAvatarInitials } from '../pages/Settings/AccountSettings.jsx';
import Overview from '../pages/Overview.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function TestProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthContext();
  if (!isAuthenticated && !authService.isPreviewMode()) {
    return <div className="redirect-login-page">Trang đăng nhập (Redirected)</div>;
  }
  return children;
}

function changeInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function blurInput(input) {
  input.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

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

function TestAccountRouter({
  initialEntry = '/settings/account'
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

describe('Giai đoạn 2A: Thông tin Tài khoản thật & Cập nhật Hồ sơ', () => {
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
    window.innerWidth = 1024;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Hiển thị thông tin tài khoản thật & Nhận diện
  // =========================================================================
  describe('1. Hiển thị thông tin tài khoản thật & Quyền', () => {
    it('Avatar trích xuất đúng chữ cái tên Unicode và có fallback an toàn', () => {
      expect(getAvatarInitials('Nguyễn Văn An')).toBe('A');
      expect(getAvatarInitials('Đỗ Thúy Quỳnh')).toBe('Q');
      expect(getAvatarInitials('Admin')).toBe('A');
      expect(getAvatarInitials('   Trần Đức   ')).toBe('Đ');
      expect(getAvatarInitials('')).toBe('?');
      expect(getAvatarInitials(null)).toBe('?');
    });

    it('Hiển thị đúng thông tin tài khoản thật, email và vai trò là chỉ đọc', async () => {
      const mockUser = {
        id: 'u101',
        name: 'Nguyễn Văn A',
        email: 'nguyenvana@example.com',
        role: 'member',
        owned: ['smart-door-lock']
      };

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
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      // Kiểm tra tên, email và vai trò hiển thị
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn A');
      expect(container.querySelector('.account-identity-email').textContent).toBe('nguyenvana@example.com');
      expect(container.querySelector('.account-avatar').textContent).toBe('A');
      expect(container.textContent).toContain('Thành viên');

      // Email phải là trường chỉ đọc (readOnly cho phép chọn và sao chép văn bản, không dùng disabled)
      const emailInput = container.querySelector('#account-email-input');
      expect(emailInput.value).toBe('nguyenvana@example.com');
      expect(emailInput.readOnly).toBe(true);
      expect(emailInput.disabled).toBe(false);
    });

    it('User chưa được phân công thiết bị: Hiển thị thông điệp trung thực "Bạn chưa được phân công thiết bị."', async () => {
      const mockAdmin = {
        id: 'u_admin',
        name: 'Quản Trị Viên',
        email: 'admin@example.com',
        role: 'admin',
        owned: [] // Admin có owned rỗng
      };

      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockAdmin }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      // Hiển thị vai trò Quản trị viên
      expect(container.textContent).toContain('Quản trị viên');
      // Không crash và hiển thị thông điệp chưa phân công thiết bị
      expect(container.querySelector('.account-no-devices').textContent).toContain('Bạn chưa được phân công thiết bị.');
    });

    it('User có thiết bị phụ trách: Hiển thị danh sách thiết bị thật và nút mở trang thiết bị', async () => {
      const mockUser = {
        id: 'u_member',
        name: 'Trần Văn Lộc',
        email: 'loc@example.com',
        role: 'member',
        owned: ['smart-speaker', 'smart-plug']
      };

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
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const deviceItems = container.querySelectorAll('.account-device-item');
      expect(deviceItems.length).toBe(2);
      expect(container.textContent).toContain('Loa thông minh');
      expect(container.textContent).toContain('Ổ cắm thông minh');

      // Có link tới /devices/smart-speaker
      const links = Array.from(container.querySelectorAll('.account-dev-link'));
      expect(links.some((l) => l.getAttribute('href') === '/devices/smart-speaker')).toBe(true);
    });

    it('ID thiết bị lạ không có trong registry: Hiển thị fallback an toàn, không làm ứng dụng crash', async () => {
      const mockUser = {
        id: 'u_member2',
        name: 'Người Dùng Test',
        email: 'test@example.com',
        role: 'member',
        owned: ['unknown-device-xyz']
      };

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
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      expect(container.querySelector('.fallback-item')).not.toBeNull();
      expect(container.textContent).toContain('unknown-device-xyz');
    });
  });

  // =========================================================================
  // 2. Luồng chỉnh sửa và Lưu họ tên (Save Profile Flow)
  // =========================================================================
  describe('2. Luồng chỉnh sửa và Lưu họ tên', () => {
    it('Gõ tên chỉ cập nhật bản nháp cục bộ, chưa gửi API; blur mới gửi PATCH', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: { ...mockUser, name: 'Nguyễn Văn B' } }
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      // Gõ thay đổi tên: KHÔNG được gọi API
      await act(async () => {
        changeInputValue(nameInput, 'Nguyễn Văn B');
      });
      expect(patchProfileSpy).not.toHaveBeenCalled();

      // Rời trường (blur): Gửi PATCH
      await act(async () => {
        blurInput(nameInput);
      });

      expect(patchProfileSpy).toHaveBeenCalledTimes(1);
      expect(patchProfileSpy).toHaveBeenCalledWith({ name: 'Nguyễn Văn B' });
      expect(container.querySelector('.status-saved')).not.toBeNull();
    });

    it('Tên không thay đổi so với hiện tại: blur không gọi API', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService');

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      // Blur khi tên vẫn là 'Nguyễn Văn A'
      await act(async () => {
        blurInput(nameInput);
      });

      expect(patchProfileSpy).not.toHaveBeenCalled();
    });

    it('Nhấn Enter rồi blur không phát sinh 2 request', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: { ...mockUser, name: 'Nguyễn Văn C' } }
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      await act(async () => {
        changeInputValue(nameInput, 'Nguyễn Văn C');
      });

      // Nhấn phím Enter (kích hoạt blur)
      await act(async () => {
        nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      // Chỉ gửi đúng 1 request duy nhất
      expect(patchProfileSpy).toHaveBeenCalledTimes(1);
      expect(patchProfileSpy).toHaveBeenCalledWith({ name: 'Nguyễn Văn C' });
    });

    it('Tên không hợp lệ (< 2 ký tự hoặc toàn khoảng trắng): Báo lỗi validation và không gọi API', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService');

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      // Nhập 1 ký tự
      await act(async () => {
        changeInputValue(nameInput, 'X');
        blurInput(nameInput);
      });

      expect(patchProfileSpy).not.toHaveBeenCalled();
      expect(container.querySelector('.field-error-message')).not.toBeNull();
      expect(container.querySelector('.field-error-message').textContent).toContain('tối thiểu 2 ký tự');
    });

    it('Lưu tên thành công: Cập nhật ngay tên mới trên Header, Topbar, Account Menu và Avatar', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      vi.spyOn(accountService, 'updateProfileService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: { ...mockUser, name: 'Nguyễn Văn Thành Đạt' } }
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      await act(async () => {
        changeInputValue(nameInput, 'Nguyễn Văn Thành Đạt');
        blurInput(nameInput);
      });

      // Tên mới đã cập nhật trên trang Tài khoản
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn Thành Đạt');
      expect(container.querySelector('.account-avatar').textContent).toBe('Đ');

      // Tên mới cập nhật trên Header/Topbar menu
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn Thành Đạt');
      expect(container.querySelector('.dropdown-user-name').textContent).toBe('Nguyễn Văn Thành Đạt');
    });

    it('Lưu tên thất bại (lỗi mạng/500): Giữ bản nháp, Header giữ tên cũ; nút Thử lại gửi lại bản nháp mới nhất', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      const patchSpy = vi.spyOn(accountService, 'updateProfileService')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { user: { ...mockUser, name: 'Tên Nháp Thử Lại' } }
        });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      await act(async () => {
        changeInputValue(nameInput, 'Tên Nháp Thử Lại');
        blurInput(nameInput);
      });

      // Lỗi lưu: Header vẫn giữ tên đã xác nhận
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn A');
      // Thông báo lỗi xuất hiện
      expect(container.querySelector('.status-error')).not.toBeNull();
      // Input vẫn giữ bản nháp
      expect(nameInput.value).toBe('Tên Nháp Thử Lại');

      // Bấm nút Thử lại
      const retryBtn = container.querySelector('.btn-retry-account');
      await act(async () => {
        retryBtn.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { name: 'Tên Nháp Thử Lại' });
      expect(container.querySelector('.status-saved')).not.toBeNull();
      expect(container.querySelector('.user-name').textContent).toBe('Tên Nháp Thử Lại');
    });

    it('PATCH tài khoản trả 401: Vô hiệu hóa phiên và chuyển về màn hình đăng nhập', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      vi.spyOn(accountService, 'updateProfileService').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Phiên làm việc đã hết hạn.'
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      await act(async () => {
        changeInputValue(nameInput, 'Tên Cập Nhật Khi 401');
        blurInput(nameInput);
      });

      // Kiểm tra phiên bị hủy và chuyển hướng về đăng nhập
      expect(container.querySelector('.redirect-login-page')).not.toBeNull();
    });

    it('Response cũ của request trước không đè lên bản nháp mới hơn của người dùng', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      let resolveFirstReq;
      const firstPromise = new Promise((resolve) => {
        resolveFirstReq = resolve;
      });

      const patchSpy = vi.spyOn(accountService, 'updateProfileService')
        .mockImplementationOnce(() => firstPromise)
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { user: { ...mockUser, name: 'Nguyễn Văn Bản Nháp 2' } }
        });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      // Gửi request 1: 'Nguyễn Văn Bản Nháp 1' (giữ pending)
      await act(async () => {
        changeInputValue(nameInput, 'Nguyễn Văn Bản Nháp 1');
        blurInput(nameInput);
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Người dùng gõ tiếp bản nháp mới hơn: 'Nguyễn Văn Bản Nháp 2'
      await act(async () => {
        changeInputValue(nameInput, 'Nguyễn Văn Bản Nháp 2');
        blurInput(nameInput);
      });
      // Chưa gửi request 2 vì request 1 đang bay
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Giải phóng request 1
      await act(async () => {
        resolveFirstReq({
          success: true,
          status: 200,
          data: { user: { ...mockUser, name: 'Nguyễn Văn Bản Nháp 1' } }
        });
      });

      // Request 2 được gửi tự động với bản nháp mới nhất
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, { name: 'Nguyễn Văn Bản Nháp 2' });
      // Tên hiển thị cuối cùng là Bản Nháp 2, không bị response 1 đè
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn Bản Nháp 2');
    });

    it('Đổi tài khoản khi request đổi tên đang chạy: Response cũ không đè vào tài khoản mới', async () => {
      const userA = { id: 'u_a', name: 'User A', email: 'a@example.com', role: 'member', owned: [] };
      const userB = { id: 'u_b', name: 'User B', email: 'b@example.com', role: 'member', owned: [] };

      let currentUserMock = userA;
      vi.spyOn(authService, 'getMeService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { user: currentUserMock }
      }));

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: { ...DEFAULT_APPEARANCE } }
      });

      let resolvePatchA;
      const patchAPromise = new Promise((resolve) => {
        resolvePatchA = resolve;
      });

      const patchSpy = vi.spyOn(accountService, 'updateProfileService')
        .mockImplementationOnce(() => patchAPromise);

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const nameInput = container.querySelector('#account-fullname-input');

      // User A gửi PATCH tên (giữ pending)
      await act(async () => {
        changeInputValue(nameInput, 'User A Đã Đổi Tên');
        blurInput(nameInput);
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Chuyển sang User B
      currentUserMock = userB;
      await act(async () => {
        container.querySelector('[data-testid="test-check-session"]').click();
      });

      expect(container.querySelector('.account-identity-name').textContent).toBe('User B');

      // Giải phóng request của User A
      await act(async () => {
        resolvePatchA({
          success: true,
          status: 200,
          data: { user: { ...userA, name: 'User A Đã Đổi Tên' } }
        });
      });

      // User B hoàn toàn không bị ảnh hưởng, giữ nguyên tên User B
      expect(container.querySelector('.account-identity-name').textContent).toBe('User B');
      expect(container.querySelector('#account-fullname-input').value).toBe('User B');
    });

    it('Không để thanh trạng thái Settings hiển thị "Đã lưu" của Appearance khi ở trang /settings/account', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      // Tại /settings/account: thanh trạng thái SettingsLayout không hiển thị trạng thái của Appearance
      expect(container.querySelector('.settings-status-bar')).toBeNull();
    });
  });

  // =========================================================================
  // 3. Bảo toàn Hàng đợi Appearance khi cùng user đổi tên
  // =========================================================================
  describe('3. Bảo toàn Hàng đợi Appearance khi cùng user đổi tên', () => {
    it('Appearance đang có request bay hoặc bản nháp: Cập nhật tên thành công KHÔNG làm reset hàng đợi Appearance', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

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

      let resolvePatchAppearance;
      const patchAppearancePromise = new Promise((resolve) => {
        resolvePatchAppearance = resolve;
      });

      const patchAppearanceSpy = vi.spyOn(settingsService, 'updateAppearanceService')
        .mockImplementationOnce(() => patchAppearancePromise)
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light', fontSize: 'large' } }
        });

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: { ...mockUser, name: 'Nguyễn Văn A Mới' } }
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/appearance" />);
      });

      // 1. Kích hoạt PATCH Appearance theme: 'light' (giữ pending)
      const lightBtn = Array.from(container.querySelectorAll('.btn-choice')).find(
        (b) => b.textContent.includes('Sáng') || b.textContent.includes('Light')
      );
      await act(async () => {
        lightBtn.click();
      });
      expect(patchAppearanceSpy).toHaveBeenCalledTimes(1);

      // 2. Chuyển sang /settings/account bằng cách click link trên sidebar và sửa tên
      const accountLink = Array.from(container.querySelectorAll('.settings-nav-item')).find(
        (el) => el.getAttribute('href') === '/settings/account'
      );
      await act(async () => {
        accountLink.click();
      });

      const nameInput = container.querySelector('#account-fullname-input');
      await act(async () => {
        changeInputValue(nameInput, 'Nguyễn Văn A Mới');
        blurInput(nameInput);
      });

      expect(patchProfileSpy).toHaveBeenCalledTimes(1);
      // Tên đã cập nhật trên Header
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn A Mới');

      // 3. Khóa lưu Appearance VẪN CÒN NGUYÊN VẸN!
      // Không bị reset generation hay hủy bỏ PATCH in-flight
      await act(async () => {
        resolvePatchAppearance({
          success: true,
          status: 200,
          data: { appearance: { ...DEFAULT_APPEARANCE, theme: 'light' } }
        });
      });

      // Hàng đợi Appearance hoàn tất suôn sẻ
      expect(patchAppearanceSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Đa ngôn ngữ VI / EN
  // =========================================================================
  describe('4. Đa ngôn ngữ VI / EN trên trang Tài khoản', () => {
    it('Chuyển ngôn ngữ sang EN: Toàn bộ nhãn, tiêu đề, và nút chuyển đổi sang tiếng Anh chính xác', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: ['smart-door-lock']
      };

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

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      // Bấm nút chuyển sang EN trên Header
      const enBtn = Array.from(container.querySelectorAll('.lang-btn')).find(
        (b) => b.textContent.trim() === 'EN'
      );
      if (enBtn) {
        await act(async () => {
          enBtn.click();
        });
      }

      expect(container.textContent).toContain('Account Profile');
      expect(container.textContent).toContain('Personal Information');
      expect(container.textContent).toContain('Permissions & Assignments');
      expect(container.textContent).toContain('Read-only');
      expect(container.textContent).toContain('Assigned Devices');
      expect(container.textContent).toContain('Smart Door Lock');
    });
  });

  // =========================================================================
  // 5. Chế độ Xem trước (Preview Mode)
  // =========================================================================
  describe('5. Chế độ Xem trước (Preview Mode)', () => {
    it('Ở chế độ xem trước: Input bị khóa hoặc không gọi API lưu hồ sơ, hiển thị thông báo trung thực', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);
      const patchSpy = vi.spyOn(accountService, 'updateProfileService');

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      expect(container.querySelector('.account-preview-notice')).not.toBeNull();
      const nameInput = container.querySelector('#account-fullname-input');
      expect(nameInput.disabled).toBe(true);

      // Thử gọi blur giả lập
      await act(async () => {
        nameInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(patchSpy).not.toHaveBeenCalled();
      expect(container.querySelector('.status-saved')).toBeNull();
    });
  });

  // =========================================================================
  // 6. Kiểm thử hồi quy hẹp cho 3 lỗi lưu họ tên (Phase 2A Narrow Fixes)
  // =========================================================================
  describe('6. Kiểm thử hồi quy hẹp cho 3 lỗi lưu họ tên (Phase 2A Narrow Fixes)', () => {
    it('Lỗi 1: Response của PATCH trước không được ghi đè bản nháp C đang gõ dở trong input', async () => {
      const mockUser = {
        id: 'u-user-1',
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'member',
        owned: []
      };

      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: DEFAULT_APPEARANCE }
      });

      let resolvePatchB;
      const patchPromiseB = new Promise((resolve) => {
        resolvePatchB = resolve;
      });

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService').mockImplementation(async ({ name }) => {
        if (name === 'Nguyễn Văn B') {
          return patchPromiseB;
        }
        return {
          success: true,
          status: 200,
          data: { user: { ...mockUser, name } }
        };
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const input = container.querySelector('#account-fullname-input');
      expect(input.value).toBe('Nguyễn Văn A');

      // 1. Nhập B và blur -> PATCH B đang pending
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn B');
        blurInput(input);
      });

      expect(patchProfileSpy).toHaveBeenCalledTimes(1);
      expect(patchProfileSpy).toHaveBeenLastCalledWith({ name: 'Nguyễn Văn B' });

      // 2. Nhập C vào input nhưng CHƯA blur
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn C');
      });
      expect(input.value).toBe('Nguyễn Văn C');

      // 3. Response của PATCH B trả về thành công 200
      await act(async () => {
        resolvePatchB({
          success: true,
          status: 200,
          data: { user: { ...mockUser, name: 'Nguyễn Văn B' } }
        });
      });

      // - Header và khối nhận diện phải cập nhật 'Nguyễn Văn B' do server xác nhận
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn B');
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn B');

      // - Ô nhập PHẢI GIỮ 'Nguyễn Văn C', không bị đổi về B!
      expect(input.value).toBe('Nguyễn Văn C');

      // - Chưa blur/Enter thì KHÔNG tự gửi PATCH C (vẫn chỉ 1 lần gọi)
      expect(patchProfileSpy).toHaveBeenCalledTimes(1);

      // - Không hiển thị "Đã lưu" khi input đang là C
      expect(container.querySelector('.status-saved')).toBeNull();

      // 4. Khi người dùng blur input C -> PATCH C mới được gửi đi
      await act(async () => {
        blurInput(input);
      });

      expect(patchProfileSpy).toHaveBeenCalledTimes(2);
      expect(patchProfileSpy).toHaveBeenLastCalledWith({ name: 'Nguyễn Văn C' });

      // Header và Identity Card chuyển thành C, trạng thái "Đã lưu" hiển thị
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn C');
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn C');
      expect(container.querySelector('.status-saved')).not.toBeNull();
    });

    it('Lỗi 2: Đổi về tên ban đầu khi PATCH đang bay phải được xếp hàng và tự động gửi sau khi PATCH trước hoàn tất', async () => {
      const mockUser = {
        id: 'u-user-2',
        name: 'Nguyễn Văn A',
        email: 'a2@example.com',
        role: 'member',
        owned: []
      };

      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: DEFAULT_APPEARANCE }
      });

      let resolvePatchB;
      const patchPromiseB = new Promise((resolve) => {
        resolvePatchB = resolve;
      });

      let inFlightCount = 0;
      let maxConcurrent = 0;

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService').mockImplementation(async ({ name }) => {
        inFlightCount += 1;
        if (inFlightCount > maxConcurrent) maxConcurrent = inFlightCount;

        try {
          if (name === 'Nguyễn Văn B') {
            return await patchPromiseB;
          }
          return {
            success: true,
            status: 200,
            data: { user: { ...mockUser, name } }
          };
        } finally {
          inFlightCount -= 1;
        }
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const input = container.querySelector('#account-fullname-input');
      expect(input.value).toBe('Nguyễn Văn A');

      // 1. Nhập B và blur -> PATCH B đang gửi
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn B');
        blurInput(input);
      });

      expect(patchProfileSpy).toHaveBeenCalledTimes(1);
      expect(patchProfileSpy).toHaveBeenLastCalledWith({ name: 'Nguyễn Văn B' });

      // 2. Trong lúc PATCH B chưa xong, người dùng đổi ý gõ lại A và blur
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn A');
        blurInput(input);
      });

      // Vẫn chỉ có 1 request in-flight, A được xếp vào queuedDraft
      expect(patchProfileSpy).toHaveBeenCalledTimes(1);

      // 3. Cho PATCH B hoàn tất thành công 200
      await act(async () => {
        resolvePatchB({
          success: true,
          status: 200,
          data: { user: { ...mockUser, name: 'Nguyễn Văn B' } }
        });
      });

      // Hệ thống phải tự động gửi tiếp PATCH A
      expect(patchProfileSpy).toHaveBeenCalledTimes(2);
      expect(patchProfileSpy).toHaveBeenLastCalledWith({ name: 'Nguyễn Văn A' });

      // Đảm bảo không bao giờ có 2 request chạy đồng thời
      expect(maxConcurrent).toBe(1);

      // Cuối cùng server, header và ô nhập đều là 'Nguyễn Văn A'
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn A');
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn A');
      expect(input.value).toBe('Nguyễn Văn A');
      expect(container.querySelector('.status-saved')).not.toBeNull();

      // 4. Khi không có request nào đang bay: blur lại với A KHÔNG được gọi API thừa
      await act(async () => {
        blurInput(input);
      });
      expect(patchProfileSpy).toHaveBeenCalledTimes(2);
    });

    it('Lỗi 3: Khi PATCH thất bại và người dùng sửa bản nháp mới rồi Retry, không được phát lại bản nháp cũ', async () => {
      const mockUser = {
        id: 'u-user-3',
        name: 'Nguyễn Văn A',
        email: 'a3@example.com',
        role: 'member',
        owned: []
      };

      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser }
      });
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { appearance: DEFAULT_APPEARANCE }
      });

      let rejectPatchB;
      const patchPromiseB = new Promise((_, reject) => {
        rejectPatchB = reject;
      });

      const patchProfileSpy = vi.spyOn(accountService, 'updateProfileService').mockImplementation(async ({ name }) => {
        if (name === 'Nguyễn Văn B') {
          return patchPromiseB;
        }
        return {
          success: true,
          status: 200,
          data: { user: { ...mockUser, name } }
        };
      });

      await act(async () => {
        root.render(<TestAccountRouter initialEntry="/settings/account" />);
      });

      const input = container.querySelector('#account-fullname-input');

      // 1. Nhập B và blur -> PATCH B đang gửi
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn B');
        blurInput(input);
      });

      expect(patchProfileSpy).toHaveBeenCalledTimes(1);
      expect(patchProfileSpy).toHaveBeenLastCalledWith({ name: 'Nguyễn Văn B' });

      // 2. Nhập C và blur -> C được xếp hàng
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn C');
        blurInput(input);
      });
      expect(patchProfileSpy).toHaveBeenCalledTimes(1);

      // 3. Request B thất bại (Network error)
      await act(async () => {
        rejectPatchB(new Error('Network error 500'));
      });

      expect(container.querySelector('.status-error')).not.toBeNull();
      const retryBtn = container.querySelector('.btn-retry-account');
      expect(retryBtn).not.toBeNull();

      // 4. Người dùng sửa ô nhập thành D ('Nguyễn Văn D') và bấm Retry
      await act(async () => {
        changeInputValue(input, 'Nguyễn Văn D');
      });

      await act(async () => {
        retryBtn.click();
      });

      // PATCH D được gửi đi
      expect(patchProfileSpy).toHaveBeenCalledTimes(2);
      expect(patchProfileSpy).toHaveBeenLastCalledWith({ name: 'Nguyễn Văn D' });

      // Sau khi D thành công, C KHÔNG được tự động gửi tiếp
      expect(patchProfileSpy).toHaveBeenCalledTimes(2);
      expect(container.querySelector('.user-name').textContent).toBe('Nguyễn Văn D');
      expect(container.querySelector('.account-identity-name').textContent).toBe('Nguyễn Văn D');
      expect(input.value).toBe('Nguyễn Văn D');
      expect(container.querySelector('.status-saved')).not.toBeNull();
    });
  });
});
