import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider } from '../context/SettingsContext.jsx';
import * as accountService from '../services/accountService.js';
import * as authService from '../services/authService.js';

import SettingsLayout from '../pages/Settings/SettingsLayout.jsx';
import AccountSettings from '../pages/Settings/AccountSettings.jsx';
import Login from '../pages/Login.jsx';
import ChangePasswordDialog, { getUtf8ByteLength } from '../pages/Settings/ChangePasswordDialog.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function changeInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
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

function TestAppRouter({
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
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route path="account" element={<AccountSettings />} />
                </Route>
                <Route path="/login" element={<Login />} />
              </Routes>
            </SettingsProvider>
          </DeviceProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe('Giai đoạn 2C: Giao diện Đổi mật khẩu kết nối backend thật', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Mặc định getMeService trả về user hợp lệ
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      message: 'OK',
      data: {
        user: {
          id: 'usr_change_pass_123',
          name: 'Đoàn Văn Hậu',
          email: 'vanhau@example.com',
          role: 'homeowner',
          owned: ['smart-door-lock'],
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      }
    });

    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    document.body.style.overflow = '';
  });

  async function renderAndHydrate() {
    await act(async () => {
      root.render(<TestAppRouter />);
    });
    // Chờ checkSession hoàn tất
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  // =========================================================================
  // 1. KIỂM THỬ GIAO DIỆN & KHẢ NĂNG TIẾP CẬN (ACCESSIBILITY & MODAL BEHAVIOR)
  // =========================================================================
  describe('1. Khả năng tiếp cận hộp thoại và Thao tác mở/đóng', () => {
    it('hiển thị khối Mật khẩu trên /settings/account với nút "Đổi mật khẩu"', async () => {
      await renderAndHydrate();

      const passwordCard = container.querySelector('.account-password-card');
      expect(passwordCard).not.toBeNull();

      const title = passwordCard.querySelector('.account-card-title');
      expect(title.textContent).toBe('Mật khẩu');

      const changeBtn = passwordCard.querySelector('.account-btn-change-password');
      expect(changeBtn).not.toBeNull();
      expect(changeBtn.textContent).toContain('Đổi mật khẩu');
    });

    it('bấm nút "Đổi mật khẩu" mở hộp thoại, focus vào trường mật khẩu hiện tại và khóa cuộn nền', async () => {
      await renderAndHydrate();

      const changeBtn = container.querySelector('.account-btn-change-password');
      act(() => {
        changeBtn.click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('change-password-title');
      expect(dialog.getAttribute('aria-describedby')).toBe('change-password-session-notice');
      expect(document.body.style.overflow).toBe('hidden');

      // Chờ focus timeout
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const currentPassInput = dialog.querySelector('#current-password-input');
      expect(document.activeElement).toBe(currentPassInput);
    });

    it('nút Hủy và phím Escape đóng hộp thoại và hoàn trả focus về nút trigger', async () => {
      await renderAndHydrate();

      const changeBtn = container.querySelector('.account-btn-change-password');
      act(() => {
        changeBtn.click();
      });

      let dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Bấm nút Hủy
      const cancelBtn = dialog.querySelector('.dialog-btn-cancel');
      act(() => {
        cancelBtn.click();
      });

      dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).toBeNull();
      expect(document.body.style.overflow).not.toBe('hidden');

      // Mở lại và thử đóng bằng phím Escape
      act(() => {
        changeBtn.click();
      });
      dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).toBeNull();
    });

    it('click vào nền backdrop đóng hộp thoại; click vào nội dung bên trong dialog không đóng', async () => {
      await renderAndHydrate();

      const changeBtn = container.querySelector('.account-btn-change-password');
      act(() => {
        changeBtn.click();
      });

      const backdrop = document.body.querySelector('.dialog-backdrop');
      const dialog = document.body.querySelector('.dialog-container');

      // Click vào bên trong dialog container: không đóng
      act(() => {
        dialog.click();
      });
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

      // Click vào backdrop: đóng
      act(() => {
        backdrop.click();
      });
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it('bẫy focus (Focus Trap) giữ phím Tab và Shift+Tab bên trong hộp thoại', async () => {
      await renderAndHydrate();

      const changeBtn = container.querySelector('.account-btn-change-password');
      act(() => {
        changeBtn.click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const focusables = dialog.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      // Đặt focus tại phần tử cuối cùng rồi nhấn Tab -> phải quay lại phần tử đầu tiên
      lastEl.focus();
      expect(document.activeElement).toBe(lastEl);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      });
      expect(document.activeElement).toBe(firstEl);

      // Đặt focus tại phần tử đầu tiên rồi nhấn Shift+Tab -> phải quay về phần tử cuối cùng
      firstEl.focus();
      expect(document.activeElement).toBe(firstEl);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      });
      expect(document.activeElement).toBe(lastEl);
    });

    it('nút hiện/ẩn mật khẩu hoạt động độc lập cho từng trường', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const curInput = dialog.querySelector('#current-password-input');
      const newInput = dialog.querySelector('#new-password-input');
      const confInput = dialog.querySelector('#confirm-password-input');

      const eyeBtns = dialog.querySelectorAll('.dialog-eye-btn');
      expect(eyeBtns.length).toBe(3);

      // Ban đầu cả 3 đều là type="password"
      expect(curInput.type).toBe('password');
      expect(newInput.type).toBe('password');
      expect(confInput.type).toBe('password');

      // Bật hiện cho mật khẩu mới
      act(() => {
        eyeBtns[1].click();
      });
      expect(curInput.type).toBe('password');
      expect(newInput.type).toBe('text');
      expect(confInput.type).toBe('password');
      expect(eyeBtns[1].getAttribute('aria-pressed')).toBe('true');

      // Tắt lại
      act(() => {
        eyeBtns[1].click();
      });
      expect(newInput.type).toBe('password');
      expect(eyeBtns[1].getAttribute('aria-pressed')).toBe('false');
    });
  });

  // =========================================================================
  // 2. VALIDATION DỮ LIỆU ĐẦU VÀO VÀ ĐỘ DÀI BYTE UTF-8
  // =========================================================================
  describe('2. Validation phía Client và Độ dài Byte UTF-8', () => {
    it('hàm getUtf8ByteLength tính đúng byte của ký tự ASCII và Unicode có dấu', () => {
      expect(getUtf8ByteLength('abc123')).toBe(6);
      expect(getUtf8ByteLength(' ')).toBe(1);
      // 'TiếngViệt': 9 ký tự JS nhưng 13 byte UTF-8
      expect('TiếngViệt'.length).toBe(9);
      expect(getUtf8ByteLength('TiếngViệt')).toBe(13);

      // 'TiếngViệt'.repeat(6): 54 ký tự JS nhưng 78 byte UTF-8 (> 72 byte)
      const unicodeOver72 = 'TiếngViệt'.repeat(6);
      expect(unicodeOver72.length).toBe(54);
      expect(getUtf8ByteLength(unicodeOver72)).toBe(78);
    });

    it('từ chối gửi và hiển thị lỗi tương ứng khi thiếu trường hoặc vi phạm quy tắc', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const submitBtn = dialog.querySelector('.dialog-btn-submit');
      const spyService = vi.spyOn(accountService, 'changePasswordService');

      // 1. Gửi form rỗng
      act(() => {
        submitBtn.click();
      });

      expect(spyService).not.toHaveBeenCalled();
      expect(dialog.querySelector('#current-password-error')).not.toBeNull();
      expect(dialog.querySelector('#new-password-error')).not.toBeNull();
      expect(dialog.querySelector('#confirm-password-error')).not.toBeNull();

      const curInput = dialog.querySelector('#current-password-input');
      const newInput = dialog.querySelector('#new-password-input');
      const confInput = dialog.querySelector('#confirm-password-input');

      // 2. Mật khẩu mới ngắn hơn 8 ký tự
      act(() => {
        changeInputValue(curInput, 'OldPassword@123');
        changeInputValue(newInput, 'Short');
        changeInputValue(confInput, 'Short');
        submitBtn.click();
      });
      expect(spyService).not.toHaveBeenCalled();
      expect(dialog.querySelector('#new-password-error').textContent).toContain('8 ký tự');

      // 3. Mật khẩu mới quá 72 byte UTF-8 (dù số ký tự JS < 72)
      act(() => {
        changeInputValue(newInput, 'TiếngViệt'.repeat(6)); // 84 bytes
        changeInputValue(confInput, 'TiếngViệt'.repeat(6));
        submitBtn.click();
      });
      expect(spyService).not.toHaveBeenCalled();
      expect(dialog.querySelector('#new-password-error').textContent).toContain('72 byte');

      // 4. Mật khẩu mới trùng mật khẩu hiện tại
      act(() => {
        changeInputValue(curInput, 'SamePassword@123');
        changeInputValue(newInput, 'SamePassword@123');
        changeInputValue(confInput, 'SamePassword@123');
        submitBtn.click();
      });
      expect(spyService).not.toHaveBeenCalled();
      expect(dialog.querySelector('#new-password-error').textContent).toContain('không được trùng');

      // 5. Mật khẩu xác nhận không khớp
      act(() => {
        changeInputValue(curInput, 'OldPassword@123');
        changeInputValue(newInput, 'ValidNewPassword@456');
        changeInputValue(confInput, 'DifferentConfirmation@789');
        submitBtn.click();
      });
      expect(spyService).not.toHaveBeenCalled();
      expect(dialog.querySelector('#confirm-password-error').textContent).toContain('không khớp');
    });

    it('bảo toàn nguyên vẹn khoảng trắng và tính độ mạnh mật khẩu (Strength Meter)', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const newInput = dialog.querySelector('#new-password-input');

      // Nhập mật khẩu yếu
      act(() => {
        changeInputValue(newInput, 'abcdefgh');
      });
      let badge = dialog.querySelector('.strength-badge');
      expect(badge.textContent).toBe('Yếu');

      // Nhập mật khẩu mạnh có khoảng trắng nguyên vẹn: '  P@ssw0rd Strong!  '
      act(() => {
        changeInputValue(newInput, '  P@ssw0rd Strong!  ');
      });
      badge = dialog.querySelector('.strength-badge');
      expect(badge.textContent).toBe('Mạnh');
      expect(newInput.value).toBe('  P@ssw0rd Strong!  '); // Không bị trim
    });
  });

  // =========================================================================
  // 3. SERVICE, REQUEST & XỬ LÝ CÁC LOẠI KẾT QUẢ THEO HỢP ĐỒNG BACKEND
  // =========================================================================
  describe('3. Service, Request & Xử lý Kết quả API', () => {
    it('payload gửi đi chỉ chứa currentPassword và newPassword, tuyệt đối không gửi confirmPassword', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const curInput = dialog.querySelector('#current-password-input');
      const newInput = dialog.querySelector('#new-password-input');
      const confInput = dialog.querySelector('#confirm-password-input');
      const submitBtn = dialog.querySelector('.dialog-btn-submit');

      const spyService = vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'PASSWORD_CHANGED',
        message: 'Đổi mật khẩu thành công.',
        data: {
          passwordChanged: true,
          requiresLogin: false
        }
      });

      await act(async () => {
        changeInputValue(curInput, 'CurrentSecret@123');
        changeInputValue(newInput, 'BrandNewPassword@456');
        changeInputValue(confInput, 'BrandNewPassword@456');
        submitBtn.click();
      });

      expect(spyService).toHaveBeenCalledTimes(1);
      const sentPayload = spyService.mock.calls[0][0];
      expect(sentPayload).toEqual({
        currentPassword: 'CurrentSecret@123',
        newPassword: 'BrandNewPassword@456'
      });
      expect(sentPayload.confirmPassword).toBeUndefined();
    });

    it('thành công bình thường: giữ phiên, đóng hộp thoại, hiển thị thông báo thành công và không gọi logout', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const spyService = vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'PASSWORD_CHANGED',
        message: 'Đổi mật khẩu thành công.',
        data: {
          passwordChanged: true,
          requiresLogin: false
        }
      });
      const spyLogout = vi.spyOn(authService, 'logoutService');

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentSecret@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'BrandNewPassword@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'BrandNewPassword@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Dialog đã đóng
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();

      // Thông báo thành công hiển thị ở AccountSettings bên ngoài hộp thoại
      const successBanner = container.querySelector('.account-password-success-alert');
      expect(successBanner).not.toBeNull();
      expect(successBanner.textContent).toContain('Đổi mật khẩu thành công');

      // Logout tuyệt đối không bị gọi
      expect(spyService).toHaveBeenCalledTimes(1);
      expect(spyLogout).not.toHaveBeenCalled();
    });

    it('khi requiresLogin: true: không hiển thị như lỗi, vô hiệu hóa phiên và điều hướng về /login với thông báo thành công', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
        message: 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.',
        data: {
          passwordChanged: true,
          requiresLogin: true
        }
      });

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentSecret@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'BrandNewPassword@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'BrandNewPassword@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Đã chuyển hướng sang trang đăng nhập (/login)
      const loginHeading = container.querySelector('.au-title');
      expect(loginHeading).not.toBeNull();
      expect(loginHeading.textContent).toBe('Đăng nhập');

      // Thông báo thành công trên trang đăng nhập
      const alert = container.querySelector('.au-alert-success');
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain('Đổi mật khẩu thành công. Vui lòng đăng nhập lại');
    });

    it('sai mật khẩu hiện tại INCORRECT_CURRENT_PASSWORD: hiện lỗi dưới trường hiện tại và không làm mất phiên', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: false,
        status: 400,
        code: 'INCORRECT_CURRENT_PASSWORD',
        message: 'Mật khẩu hiện tại không chính xác.',
        errors: { currentPassword: 'Mật khẩu hiện tại không chính xác.' }
      });

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'WrongPassword@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'BrandNewPassword@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'BrandNewPassword@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Dialog vẫn mở để sửa
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
      const curErr = dialog.querySelector('#current-password-error');
      expect(curErr).not.toBeNull();
      expect(curErr.textContent).toContain('không chính xác');

      // Không chuyển route sang /login
      expect(container.querySelector('.account-password-card')).not.toBeNull();
    });

    it('mật khẩu mới trùng PASSWORD_SAME_AS_CURRENT: hiện lỗi tại trường mật khẩu mới', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: false,
        status: 400,
        code: 'PASSWORD_SAME_AS_CURRENT',
        message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
        errors: { newPassword: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.' }
      });

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentPassword@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'CurrentPassword@123_diff');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'CurrentPassword@123_diff');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const newErr = dialog.querySelector('#new-password-error');
      expect(newErr).not.toBeNull();
      expect(newErr.textContent).toContain('không được trùng');
    });

    it('AUTH_CONFLICT: hiển thị thông báo thông tin xác thực đã thay đổi, không tự động retry', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const spyService = vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: false,
        status: 409,
        code: 'AUTH_CONFLICT',
        message: 'Thông tin xác thực đã bị thay đổi bởi một yêu cầu khác. Vui lòng thử lại.'
      });

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentPassword@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'BrandNewPassword@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'BrandNewPassword@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(spyService).toHaveBeenCalledTimes(1); // Không tự retry
      const alert = dialog.querySelector('.dialog-alert');
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain('Thông tin xác thực đã thay đổi');
    });

    it('khi mạng lỗi hoặc timeout: hiển thị cảnh báo chưa xác định kết quả, không khẳng định mật khẩu chưa đổi', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const spyService = vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'TIMEOUT',
        message: 'Hết thời gian chờ kết nối máy chủ.'
      });

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentPassword@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'BrandNewPassword@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'BrandNewPassword@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(spyService).toHaveBeenCalledTimes(1); // Không tự ý retry
      const alert = dialog.querySelector('.dialog-alert');
      expect(alert).not.toBeNull();
      // Không nói "chưa đổi", mà cảnh báo chưa xác định kết quả
      expect(alert.textContent).toContain('Chưa xác định được kết quả');
    });
  });

  // =========================================================================
  // 4. BẢO VỆ ĐỒNG THỜI & CÁCH LY REQUEST (CONCURRENCY & ISOLATION GUARDS)
  // =========================================================================
  describe('4. Bảo vệ Đồng thời và Cách ly Request', () => {
    it('double click hoặc nhấn Enter liên tiếp chỉ tạo 1 request duy nhất', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      let resolveRequest;
      const delayedPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });

      const spyService = vi.spyOn(accountService, 'changePasswordService').mockReturnValue(delayedPromise);

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentPassword@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'BrandNewPassword@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'BrandNewPassword@456');
      });

      const submitBtn = dialog.querySelector('.dialog-btn-submit');

      // Click liên tiếp 3 lần
      act(() => {
        submitBtn.click();
        submitBtn.click();
        submitBtn.click();
      });

      expect(spyService).toHaveBeenCalledTimes(1);

      // Giải phóng promise
      await act(async () => {
        resolveRequest({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: { passwordChanged: true, requiresLogin: false }
        });
      });
    });

    it('đóng và mở lại hộp thoại khi request cũ chưa về: response cũ bị bỏ qua hoàn toàn', async () => {
      await renderAndHydrate();

      const changeBtn = container.querySelector('.account-btn-change-password');
      act(() => {
        changeBtn.click();
      });

      let resolveOldReq;
      const oldPromise = new Promise((resolve) => {
        resolveOldReq = resolve;
      });
      vi.spyOn(accountService, 'changePasswordService').mockReturnValue(oldPromise);

      const dialog1 = document.body.querySelector('[role="dialog"]');
      act(() => {
        changeInputValue(dialog1.querySelector('#current-password-input'), 'OldPass@123');
        changeInputValue(dialog1.querySelector('#new-password-input'), 'NewPass@456');
        changeInputValue(dialog1.querySelector('#confirm-password-input'), 'NewPass@456');
        dialog1.querySelector('.dialog-btn-submit').click();
      });

      // Giả lập unmount / đóng dialog từ bên ngoài (ví dụ đổi route hoặc unmount)
      act(() => {
        // Unmount và render lại để giả lập mở phiên dialog mới
        root.render(<TestAppRouter />);
      });

      // Cho response cũ trả về thành công
      await act(async () => {
        resolveOldReq({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: { passwordChanged: true, requiresLogin: false }
        });
        await new Promise((r) => setTimeout(r, 60));
      });

      // Hộp thoại không tự mở lại hoặc gây crash
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it('đổi mật khẩu thành công không làm mất bản nháp họ tên đang gõ', async () => {
      await renderAndHydrate();

      // Nhập bản nháp họ tên mới ở phần Thông tin cá nhân
      const nameInput = container.querySelector('#account-fullname-input');
      expect(nameInput.value).toBe('Đoàn Văn Hậu');

      act(() => {
        changeInputValue(nameInput, 'Đoàn Văn Hậu (Bản Nháp)');
      });
      expect(nameInput.value).toBe('Đoàn Văn Hậu (Bản Nháp)');

      // Mở modal đổi mật khẩu
      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'PASSWORD_CHANGED',
        data: { passwordChanged: true, requiresLogin: false }
      });

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentPass@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewValidPass@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewValidPass@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Sau khi đổi mật khẩu thành công: Ô họ tên vẫn giữ nguyên bản nháp đang gõ
      expect(nameInput.value).toBe('Đoàn Văn Hậu (Bản Nháp)');
    });

    it('chế độ xem trước (Preview Mode): không gọi API thật và hiển thị thông báo cần đăng nhập thật', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);

      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const spyService = vi.spyOn(accountService, 'changePasswordService');

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'CurrentPass@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewValidPass@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewValidPass@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      expect(spyService).not.toHaveBeenCalled();
      const alert = dialog.querySelector('.dialog-alert');
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain('Chế độ xem trước');
    });
  });

  // =========================================================================
  // 4. CÁCH LY TÀI KHOẢN, VÒNG ĐỜI REQUEST VÀ KIỂM TRA HỢP ĐỒNG RESPONSE
  // =========================================================================
  describe('4. Cách ly tài khoản, vòng đời request và kiểm tra hợp đồng response', () => {
    it('response requiresLogin của user cũ KHÔNG làm đăng xuất user mới hoặc điều hướng sang /login', async () => {
      await renderAndHydrate();

      // Mở modal khi đang là User A (Đoàn Văn Hậu, id: usr_change_pass_123)
      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      let resolveUserAReq;
      const userAPromise = new Promise((resolve) => {
        resolveUserAReq = resolve;
      });
      vi.spyOn(accountService, 'changePasswordService').mockReturnValue(userAPromise);

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'PassA@1234');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewPassA@5678');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPassA@5678');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      // Chuyển sang User B (Nguyễn Thị Mai, id: usr_user_b_456)
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        message: 'OK',
        data: {
          user: {
            id: 'usr_user_b_456',
            name: 'Nguyễn Thị Mai',
            email: 'mainguyen@example.com',
            role: 'viewer',
            owned: [],
            createdAt: '2026-02-01T00:00:00.000Z'
          }
        }
      });

      // Kích hoạt checkSession để AuthContext cập nhật sang User B
      await act(async () => {
        container.querySelector('[data-testid="test-check-session"]').click();
        await new Promise((r) => setTimeout(r, 60));
      });

      // Hộp thoại đã tự động đóng khi phát hiện đổi tài khoản
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();

      // Bây giờ response đổi mật khẩu của User A mới trả về với requiresLogin: true
      await act(async () => {
        resolveUserAReq({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: true,
            requiresLogin: true
          }
        });
        await new Promise((r) => setTimeout(r, 60));
      });

      // User B KHÔNG bị đăng xuất, thông tin User B vẫn hiển thị trên trang
      const nameInput = container.querySelector('#account-fullname-input');
      expect(nameInput).not.toBeNull();
      expect(nameInput.value).toBe('Nguyễn Thị Mai');

      // Không bị điều hướng về /login (vẫn ở trên /settings/account)
      expect(container.querySelector('.account-settings-page')).not.toBeNull();
      expect(container.querySelector('.login-page')).toBeNull();
    });

    it('response thành công bình thường của user cũ KHÔNG hiển thị banner thành công cho user mới', async () => {
      await renderAndHydrate();

      // Mở modal khi đang là User A
      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      let resolveUserAReq;
      const userAPromise = new Promise((resolve) => {
        resolveUserAReq = resolve;
      });
      vi.spyOn(accountService, 'changePasswordService').mockReturnValue(userAPromise);

      const dialog = document.body.querySelector('[role="dialog"]');
      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'PassA@1234');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewPassA@5678');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPassA@5678');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      // Chuyển sang User B
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        message: 'OK',
        data: {
          user: {
            id: 'usr_user_b_789',
            name: 'Lê Văn C',
            email: 'levanc@example.com',
            role: 'viewer',
            owned: [],
            createdAt: '2026-03-01T00:00:00.000Z'
          }
        }
      });

      await act(async () => {
        container.querySelector('[data-testid="test-check-session"]').click();
        await new Promise((r) => setTimeout(r, 60));
      });

      // User A response trả về thành công bình thường
      await act(async () => {
        resolveUserAReq({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: true,
            requiresLogin: false
          }
        });
        await new Promise((r) => setTimeout(r, 60));
      });

      // User B KHÔNG thấy banner thông báo đổi mật khẩu thành công
      const successNotice = container.querySelector('.account-password-success-alert');
      expect(successNotice).toBeNull();
    });

    it('unmount component khi request đang bay: giải phóng an toàn, không ném ngoại lệ hoặc gọi callback', async () => {
      await renderAndHydrate();

      act(() => {
        container.querySelector('.account-btn-change-password').click();
      });

      let resolveReq;
      const pendingPromise = new Promise((resolve) => {
        resolveReq = resolve;
      });
      vi.spyOn(accountService, 'changePasswordService').mockReturnValue(pendingPromise);

      const dialog = document.body.querySelector('[role="dialog"]');
      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
        dialog.querySelector('.dialog-btn-submit').click();
      });

      // Unmount root khi request vẫn đang pending
      act(() => {
        root.unmount();
      });

      // Response trả về sau khi đã unmount
      await act(async () => {
        resolveReq({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: { passwordChanged: true, requiresLogin: true }
        });
        await new Promise((r) => setTimeout(r, 60));
      });

      // Không phát sinh lỗi hoặc cảnh báo unmounted component
      expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('response của request cũ giải phóng KHÔNG làm mất khóa gửi (isSubmittingRef) của request mới', async () => {
      // Dựng một Host component để kiểm soát việc đóng/mở trên cùng một instance ChangePasswordDialog
      function DialogHarness() {
        const [isOpen, setIsOpen] = useState(false);
        return (
          <LanguageProvider>
            <AuthProvider enableDemoAuth={false}>
              <button
                type="button"
                data-testid="toggle-dialog"
                onClick={() => setIsOpen((prev) => !prev)}
              >
                Toggle
              </button>
              <ChangePasswordDialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                onSuccess={() => {}}
                onRequiresLogin={() => {}}
              />
            </AuthProvider>
          </LanguageProvider>
        );
      }

      await act(async () => {
        root.render(<DialogHarness />);
        await new Promise((r) => setTimeout(r, 60));
      });

      let resolveReq1;
      const promise1 = new Promise((resolve) => {
        resolveReq1 = resolve;
      });

      let resolveReq2;
      const promise2 = new Promise((resolve) => {
        resolveReq2 = resolve;
      });

      let reqCount = 0;
      vi.spyOn(accountService, 'changePasswordService').mockImplementation(() => {
        reqCount++;
        return reqCount === 1 ? promise1 : promise2;
      });

      // Mở dialog lần 1 sau khi AuthContext đã nạp xong phiên
      act(() => {
        container.querySelector('[data-testid="toggle-dialog"]').click();
      });

      let dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Gửi Request 1
      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'Pass1@1234');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass1@5678');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass1@5678');
        dialog.querySelector('.dialog-btn-submit').click();
      });
      expect(reqCount).toBe(1);

      // Đóng dialog từ cha bằng cách bấm Toggle (isOpen = false)
      act(() => {
        container.querySelector('[data-testid="toggle-dialog"]').click();
      });
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();

      // Mở lại dialog bằng cách bấm Toggle (isOpen = true)
      act(() => {
        container.querySelector('[data-testid="toggle-dialog"]').click();
      });
      dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Gửi Request 2
      act(() => {
        changeInputValue(dialog.querySelector('#current-password-input'), 'Pass2@1234');
        changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass2@5678');
        changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass2@5678');
        dialog.querySelector('.dialog-btn-submit').click();
      });
      expect(reqCount).toBe(2);

      const submitBtn = dialog.querySelector('.dialog-btn-submit');
      expect(submitBtn.disabled).toBe(true);

      // Cho Request 1 hoàn tất (request cũ của generation trước)
      await act(async () => {
        resolveReq1({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: { passwordChanged: true, requiresLogin: false }
        });
        await new Promise((r) => setTimeout(r, 60));
      });

      // Nút submit của Request 2 VẪN PHẢI BỊ KHÓA vì Request 2 vẫn đang chạy!
      expect(submitBtn.disabled).toBe(true);

      // Cho Request 2 hoàn tất
      await act(async () => {
        resolveReq2({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: { passwordChanged: true, requiresLogin: false }
        });
        await new Promise((r) => setTimeout(r, 60));
      });

      // Sau khi Request 2 hoàn tất, dialog đóng thành công
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();

      // Mở lại dialog: Nút submit ở trạng thái sẵn sàng, không bị khóa
      act(() => {
        container.querySelector('[data-testid="toggle-dialog"]').click();
      });
      dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('.dialog-btn-submit').disabled).toBe(false);
    });

    describe('Kiểm tra hợp đồng response nghiêm ngặt (Strict Contract Validation)', () => {
      it('thiếu trường requiresLogin (undefined) -> coi là không xác định, không đóng modal, không điều hướng', async () => {
        await renderAndHydrate();

        act(() => {
          container.querySelector('.account-btn-change-password').click();
        });

        vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: true
            // requiresLogin cố tình bị thiếu
          }
        });

        const dialog = document.body.querySelector('[role="dialog"]');
        act(() => {
          changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
          changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
          changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
          dialog.querySelector('.dialog-btn-submit').click();
        });

        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        // Hộp thoại không đóng
        expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

        // Hiển thị cảnh báo không xác định
        const alert = dialog.querySelector('.dialog-alert');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chưa xác định được kết quả do gián đoạn kết nối');

        // Không hiển thị banner thành công bên ngoài
        expect(container.querySelector('.account-password-success-alert')).toBeNull();

        // Không bị điều hướng sang /login
        expect(container.querySelector('.account-settings-page')).not.toBeNull();
      });

      it('requiresLogin là null -> coi là không xác định', async () => {
        await renderAndHydrate();

        act(() => {
          container.querySelector('.account-btn-change-password').click();
        });

        vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: true,
            requiresLogin: null
          }
        });

        const dialog = document.body.querySelector('[role="dialog"]');
        act(() => {
          changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
          changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
          changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
          dialog.querySelector('.dialog-btn-submit').click();
        });

        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        const alert = dialog.querySelector('.dialog-alert');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chưa xác định được kết quả do gián đoạn kết nối');
      });

      it('requiresLogin là chuỗi "false" -> coi là không xác định (phải là boolean false)', async () => {
        await renderAndHydrate();

        act(() => {
          container.querySelector('.account-btn-change-password').click();
        });

        vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: true,
            requiresLogin: 'false'
          }
        });

        const dialog = document.body.querySelector('[role="dialog"]');
        act(() => {
          changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
          changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
          changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
          dialog.querySelector('.dialog-btn-submit').click();
        });

        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        const alert = dialog.querySelector('.dialog-alert');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chưa xác định được kết quả do gián đoạn kết nối');
      });

      it('requiresLogin là số 0 -> coi là không xác định', async () => {
        await renderAndHydrate();

        act(() => {
          container.querySelector('.account-btn-change-password').click();
        });

        vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: true,
            requiresLogin: 0
          }
        });

        const dialog = document.body.querySelector('[role="dialog"]');
        act(() => {
          changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
          changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
          changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
          dialog.querySelector('.dialog-btn-submit').click();
        });

        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        const alert = dialog.querySelector('.dialog-alert');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chưa xác định được kết quả do gián đoạn kết nối');
      });

      it('passwordChanged không phải boolean true -> coi là không xác định', async () => {
        await renderAndHydrate();

        act(() => {
          container.querySelector('.account-btn-change-password').click();
        });

        vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
          success: true,
          status: 200,
          code: 'PASSWORD_CHANGED',
          data: {
            passwordChanged: false,
            requiresLogin: false
          }
        });

        const dialog = document.body.querySelector('[role="dialog"]');
        act(() => {
          changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
          changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
          changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
          dialog.querySelector('.dialog-btn-submit').click();
        });

        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        const alert = dialog.querySelector('.dialog-alert');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chưa xác định được kết quả do gián đoạn kết nối');
      });

      it('lỗi mạng (isNetworkError: true) -> hiển thị cảnh báo không xác định, không tự động đóng modal', async () => {
        await renderAndHydrate();

        act(() => {
          container.querySelector('.account-btn-change-password').click();
        });

        vi.spyOn(accountService, 'changePasswordService').mockResolvedValue({
          success: false,
          isNetworkError: true,
          code: 'NETWORK_ERROR',
          message: 'Failed to fetch'
        });

        const dialog = document.body.querySelector('[role="dialog"]');
        act(() => {
          changeInputValue(dialog.querySelector('#current-password-input'), 'OldPass@123');
          changeInputValue(dialog.querySelector('#new-password-input'), 'NewPass@456');
          changeInputValue(dialog.querySelector('#confirm-password-input'), 'NewPass@456');
          dialog.querySelector('.dialog-btn-submit').click();
        });

        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        const alert = dialog.querySelector('.dialog-alert');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Chưa xác định được kết quả do gián đoạn kết nối');
      });
    });
  });
});
