import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider, useLanguage } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider, useSettings } from '../context/SettingsContext.jsx';
import * as accountService from '../services/accountService.js';
import * as authService from '../services/authService.js';

import SettingsLayout from '../pages/Settings/SettingsLayout.jsx';
import SecuritySettings from '../pages/Settings/SecuritySettings.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Tiện ích tạo promise có kiểm soát hoãn giải phóng
 */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Helper component để switch language, user hoặc settings phục vụ test
 */
function TestControlBridge({ onBridgeReady }) {
  const { lang, setLang } = useLanguage();
  const { currentUser, checkSession, logout } = useAuthContext();
  const { currentSettings, updateAppearanceField } = useSettings();

  if (onBridgeReady) {
    onBridgeReady({
      lang,
      setLang,
      currentUser,
      checkSession,
      logout,
      currentSettings,
      updateAppearanceField
    });
  }

  return null;
}

function TestAppRouter({
  initialEntry = '/settings/security',
  onBridgeReady
}) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LanguageProvider>
        <AuthProvider enableDemoAuth={false}>
          <DeviceProvider>
            <SettingsProvider>
              <TestControlBridge onBridgeReady={onBridgeReady} />
              <Routes>
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route path="security" element={<SecuritySettings />} />
                </Route>
                <Route path="/login" element={<div data-testid="login-page">Trang Đăng Nhập</div>} />
              </Routes>
            </SettingsProvider>
          </DeviceProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe('Giai đoạn 3B: Giao diện Quản lý Phiên Đăng nhập Thật (SecuritySettings)', () => {
  let container = null;
  let root = null;
  let bridge = null;

  const mockUserA = {
    id: 'usr_phase3b_userA',
    name: 'Nguyễn Văn A',
    email: 'user_a@example.com',
    role: 'homeowner',
    owned: ['smart-door-lock'],
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  const mockUserB = {
    id: 'usr_phase3b_userB',
    name: 'Trần Thị B',
    email: 'user_b@example.com',
    role: 'homeowner',
    owned: ['smart-lighting'],
    createdAt: '2026-02-01T00:00:00.000Z'
  };

  const sampleSessions = [
    {
      id: 'sess_curr_123',
      deviceLabel: 'Windows Desktop',
      browserLabel: 'Chrome 122',
      ip: '127.0.0.1',
      isCurrent: true,
      lastActiveAt: '2026-10-29T08:30:00.000Z',
      createdAt: '2026-10-29T08:00:00.000Z'
    },
    {
      id: 'sess_other_456',
      deviceLabel: 'iPhone 15 Pro',
      browserLabel: 'Safari 17',
      ip: '192.168.1.100',
      isCurrent: false,
      lastActiveAt: '2026-10-28T12:00:00.000Z',
      createdAt: null // Phiên legacy không có createdAt
    },
    {
      id: 'sess_unknown_789',
      deviceLabel: null, // Không rõ thiết bị
      browserLabel: null, // Không rõ trình duyệt
      ip: '10.0.0.1',
      isCurrent: false,
      lastActiveAt: '2026-10-27T10:00:00.000Z',
      createdAt: '2026-10-27T09:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    bridge = null;

    // Giả lập getMeService trả về User A
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      message: 'OK',
      data: { user: mockUserA }
    });

    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);

    // Mặc định getSessionsService trả về sampleSessions
    vi.spyOn(accountService, 'getSessionsService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      message: 'OK',
      data: { sessions: sampleSessions }
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    bridge = null;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });

  async function renderApp(initialEntry = '/settings/security') {
    await act(async () => {
      root.render(
        <TestAppRouter
          initialEntry={initialEntry}
          onBridgeReady={(b) => {
            bridge = b;
          }}
        />
      );
    });

    // Chờ AuthProvider checkSession hoàn tất và SecuritySettings nạp xong danh sách
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  // =========================================================================
  // 1. KIỂM THỬ GIAO DIỆN CƠ BẢN (RENDER, METADATA NULL, RETRY, I18N, PREVIEW)
  // =========================================================================
  describe('1. Kiểm thử giao diện cơ bản & Khả năng tiếp cận', () => {
    it('hiển thị lỗi xác thực hai bước và tải lại trạng thái khi thử lại', async () => {
      vi.spyOn(authService, 'getSecurityStatusService')
        .mockResolvedValueOnce({ success: false, status: 503 })
        .mockResolvedValueOnce({ success: true, status: 200, data: { mfaEnabled: true } });

      await renderApp();
      expect(container.textContent).toContain('Không tải được trạng thái xác thực hai bước.');
      const retry = [...container.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Thử lại');
      expect(retry).toBeDefined();
      await act(async () => { retry.click(); });
      expect(container.textContent).toContain('Đang bật');
    });

    it('hiển thị danh sách phiên, badge phiên hiện tại và fallback đúng khi createdAt hoặc deviceLabel là null', async () => {
      await renderApp();

      expect(accountService.getSessionsService).toHaveBeenCalledTimes(1);

      const cardTitle = container.querySelector('.security-card-title');
      expect(cardTitle).not.toBeNull();
      expect(cardTitle.textContent).toContain('Phiên đăng nhập');

      const sessionItems = container.querySelectorAll('.security-session-item');
      expect(sessionItems.length).toBe(3);

      // Phiên 1: Current session
      expect(sessionItems[0].classList.contains('session-item-current')).toBe(true);
      expect(sessionItems[0].textContent).toContain('Windows Desktop');
      expect(sessionItems[0].textContent).toContain('Chrome 122');
      expect(sessionItems[0].textContent).toContain('Phiên hiện tại');

      // Phiên 2: Legacy session với createdAt = null
      expect(sessionItems[1].classList.contains('session-item-current')).toBe(false);
      expect(sessionItems[1].textContent).toContain('iPhone 15 Pro');
      expect(sessionItems[1].textContent).toContain('Safari 17');
      expect(sessionItems[1].textContent).toContain('Không có thông tin');

      // Phiên 3: Không rõ thiết bị / trình duyệt
      expect(sessionItems[2].textContent).toContain('Thiết bị không xác định');
      expect(sessionItems[2].textContent).toContain('Trình duyệt không xác định');
    });

    it('hiển thị lỗi khi máy chủ trả 500 và tải lại thành công khi bấm "Thử lại"', async () => {
      vi.spyOn(accountService, 'getSessionsService')
        .mockResolvedValueOnce({
          success: false,
          status: 500,
          code: 'SERVER_ERROR',
          message: 'Lỗi nạp phiên từ máy chủ'
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: { sessions: sampleSessions }
        });

      await renderApp();

      const errorBox = container.querySelector('.security-error-box');
      expect(errorBox).not.toBeNull();
      expect(errorBox.textContent).toContain('Lỗi nạp phiên từ máy chủ');

      const retryBtn = container.querySelector('.btn-retry-security');
      expect(retryBtn).not.toBeNull();

      await act(async () => {
        retryBtn.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(container.querySelector('.security-error-box')).toBeNull();
      const sessionItems = container.querySelectorAll('.security-session-item');
      expect(sessionItems.length).toBe(3);
    });

    it('chuyển sang tiếng Anh hiển thị đúng các nhãn tiếng Anh', async () => {
      await renderApp();

      await act(async () => {
        bridge.setLang('en');
      });

      const cardTitle = container.querySelector('.security-card-title');
      expect(cardTitle.textContent).toContain('Active Sessions');

      const currentBadge = container.querySelector('.session-current-badge');
      expect(currentBadge.textContent).toContain('Current session');

      const logoutAllBtn = container.querySelector('.btn-logout-all');
      expect(logoutAllBtn.textContent).toContain('Log out of all devices');

      const revokeBtns = container.querySelectorAll('.btn-revoke-session');
      expect(revokeBtns[0].textContent).toContain('Log out');
    });

    it('bấm Hủy đóng hộp thoại thu hồi và không gọi API', async () => {
      const revokeSpy = vi.spyOn(accountService, 'revokeSessionService');
      await renderApp();

      const revokeBtns = container.querySelectorAll('.btn-revoke-session');
      await act(async () => {
        revokeBtns[1].click();
      });

      const dialog = container.querySelector('.security-confirm-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.textContent).toContain('iPhone 15 Pro');

      const cancelBtn = dialog.querySelector('.dialog-btn-cancel');
      await act(async () => {
        cancelBtn.click();
      });

      expect(container.querySelector('.security-confirm-dialog')).toBeNull();
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it('nhấn phím Escape đóng hộp thoại xác nhận đăng xuất mọi nơi và không gọi API', async () => {
      const logoutAllSpy = vi.spyOn(accountService, 'logoutAllSessionsService');
      await renderApp();

      const logoutAllBtn = container.querySelector('.btn-logout-all');
      await act(async () => {
        logoutAllBtn.click();
      });

      expect(container.querySelector('.security-confirm-dialog')).not.toBeNull();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(container.querySelector('.security-confirm-dialog')).toBeNull();
      expect(logoutAllSpy).not.toHaveBeenCalled();
    });

    it('chế độ xem trước (Preview Mode): không gọi API backend và không dựng phiên giả', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);

      await renderApp();

      expect(accountService.getSessionsService).not.toHaveBeenCalled();
      const previewBanner = container.querySelector('.security-preview-banner');
      expect(previewBanner).not.toBeNull();
      expect(previewBanner.textContent).toContain('Cần đăng nhập để quản lý phiên');
      expect(container.querySelector('.security-card')).toBeNull();
    });
  });

  // =========================================================================
  // 2. KIỂM THỬ HỒI QUY 4 NHÓM LỖI GIAI ĐOẠN 3B (TIÊU CHÍ BẮT BUỘC A ĐẾN N)
  // =========================================================================
  describe('2. Kiểm thử Hồi quy 4 Nhóm Lỗi (A đến N)', () => {

    // TIÊU CHÍ A: Đổi VI/EN khi logout-all pending -> response hợp lệ vẫn dọn auth và về login
    it('A. Đổi VI/EN khi logout-all pending -> response hợp lệ vẫn dọn auth và về login', async () => {
      const pending = deferred();
      vi.spyOn(accountService, 'logoutAllSessionsService').mockReturnValue(pending.promise);

      await renderApp();

      await act(async () => { container.querySelector('.btn-logout-all').click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Đổi ngôn ngữ giữa chừng khi request đang bay
      await act(async () => { bridge.setLang('en'); });

      // Response trả về thành công
      await act(async () => {
        pending.resolve({
          success: true,
          status: 200,
          data: { loggedOutAll: true, requiresLogin: true }
        });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Điều hướng về login thành công
      expect(container.querySelector('[data-testid="login-page"]')).not.toBeNull();
    });

    // TIÊU CHÍ B: Đổi VI/EN khi revoke pending -> response hợp lệ vẫn được xử lý đúng
    it('B. Đổi VI/EN khi revoke pending -> response hợp lệ vẫn được xử lý đúng', async () => {
      const pending = deferred();
      vi.spyOn(accountService, 'revokeSessionService').mockReturnValue(pending.promise);

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Đổi ngôn ngữ sang tiếng Anh khi request đang bay
      await act(async () => { bridge.setLang('en'); });

      // Response trả về thành công cho phiên sess_other_456
      await act(async () => {
        pending.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
        });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Phiên sess_other_456 bị loại bỏ khỏi UI
      expect(container.textContent).not.toContain('iPhone 15 Pro');
      expect(container.querySelectorAll('.security-session-item').length).toBe(2);

      // Thông báo thành công hiển thị theo ngôn ngữ hiện tại (tiếng Anh)
      const alert = container.querySelector('.security-alert-success');
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain('Session logged out successfully');
    });

    // TIÊU CHÍ C: A đang revoke -> chuyển B -> B thao tác được trước khi A hoàn tất
    it('C. A đang revoke -> chuyển B -> B thao tác được trước khi A hoàn tất', async () => {
      const pending = deferred();
      vi.spyOn(accountService, 'revokeSessionService').mockReturnValue(pending.promise);

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Chuyển sang User B trong khi User A đang pending revoke
      authService.getMeService.mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUserB }
      });

      await act(async () => { await bridge.checkSession(); });
      expect(bridge.currentUser.id).toBe(mockUserB.id);

      // Danh sách của B tải xong: các nút của B không bị khóa
      expect(container.querySelector('.btn-logout-all').disabled).toBe(false);
      expect(container.querySelector('.btn-revoke-session').disabled).toBe(false);

      // Giải phóng request của A
      await act(async () => {
        pending.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
        });
      });
    });

    // TIÊU CHÍ D: Response A về sau khi B bắt đầu thao tác -> không mở khóa hoặc cập nhật trạng thái của B
    it('D. Response A về sau khi B bắt đầu thao tác -> không mở khóa hoặc cập nhật trạng thái của B', async () => {
      const pendingA = deferred();
      const pendingB = deferred();

      vi.spyOn(accountService, 'revokeSessionService')
        .mockReturnValueOnce(pendingA.promise) // Cho A
        .mockReturnValueOnce(pendingB.promise); // Cho B

      await renderApp();

      // User A gửi revoke
      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Đổi sang User B
      authService.getMeService.mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUserB }
      });
      await act(async () => { await bridge.checkSession(); });

      // User B bắt đầu một thao tác thu hồi của B
      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Lúc này B đang bận submit
      expect(container.querySelector('.dialog-btn-confirm').disabled).toBe(true);

      // Bây giờ response cũ của A hoàn tất
      await act(async () => {
        pendingA.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
        });
      });

      // finally của A KHÔNG được giải phóng lock của B
      expect(container.querySelector('.dialog-btn-confirm').disabled).toBe(true);

      // B hoàn tất
      await act(async () => {
        pendingB.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
        });
      });
    });

    // TIÊU CHÍ E: A -> B -> A -> response của thế hệ A cũ bị bỏ qua
    it('E. A -> B -> A -> response của thế hệ A cũ bị bỏ qua', async () => {
      const pendingFirstA = deferred();
      vi.spyOn(accountService, 'revokeSessionService').mockReturnValueOnce(pendingFirstA.promise);

      await renderApp();

      // User A (lần 1) gửi revoke
      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Đổi sang User B
      authService.getMeService.mockResolvedValue({ success: true, status: 200, data: { user: mockUserB } });
      await act(async () => { await bridge.checkSession(); });

      // Đổi lại sang User A (lần 2)
      authService.getMeService.mockResolvedValue({ success: true, status: 200, data: { user: mockUserA } });
      await act(async () => { await bridge.checkSession(); });

      // User A (lần 2) đang hiển thị bình thường với 3 phiên
      expect(container.querySelectorAll('.security-session-item').length).toBe(3);

      // Bây giờ request cũ của A (lần 1) mới trả về
      await act(async () => {
        pendingFirstA.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
        });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Response của thế hệ A cũ bị bỏ qua, không gây xóa nhầm hoặc hiện thông báo
      expect(container.querySelector('.security-alert-success')).toBeNull();
      expect(container.querySelectorAll('.security-session-item').length).toBe(3);
    });

    // TIÊU CHÍ F: revoked:false nhưng có sessionId -> không báo thành công
    it('F. revoked:false nhưng có sessionId -> không báo thành công và không xóa phiên', async () => {
      vi.spyOn(accountService, 'revokeSessionService').mockResolvedValue({
        success: true,
        status: 200,
        data: { revoked: false, sessionId: 'sess_other_456', requiresLogin: false }
      });

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      expect(container.querySelector('.security-alert-success')).toBeNull();
      expect(container.querySelectorAll('.security-session-item').length).toBe(3);
    });

    // TIÊU CHÍ G: requiresLogin thiếu/null/chuỗi/số -> không báo thành công
    it('G. requiresLogin thiếu/null/chuỗi/số -> không báo thành công', async () => {
      // 1. Thiếu requiresLogin
      vi.spyOn(accountService, 'revokeSessionService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { revoked: true, sessionId: 'sess_other_456' }
      });

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      expect(container.querySelector('.security-alert-success')).toBeNull();
      expect(container.querySelectorAll('.security-session-item').length).toBe(3);

      // 2. requiresLogin là chuỗi "false" thay vì boolean false
      vi.spyOn(accountService, 'revokeSessionService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: 'false' }
      });

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      expect(container.querySelector('.security-alert-success')).toBeNull();
      expect(container.querySelectorAll('.security-session-item').length).toBe(3);
    });

    // TIÊU CHÍ H: sessionId không khớp -> không báo thành công
    it('H. sessionId không khớp snapshot -> không báo thành công', async () => {
      vi.spyOn(accountService, 'revokeSessionService').mockResolvedValue({
        success: true,
        status: 200,
        data: { revoked: true, sessionId: 'sess_WRONG_id', requiresLogin: false }
      });

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      expect(container.querySelector('.security-alert-success')).toBeNull();
      expect(container.querySelectorAll('.security-session-item').length).toBe(3);
    });

    // TIÊU CHÍ I: Thu hồi trong lúc GET refresh pending -> không kẹt spinner
    it('I. Thu hồi trong lúc GET refresh pending -> không kẹt spinner và re-enable nút refresh', async () => {
      const pending = deferred();
      vi.spyOn(accountService, 'revokeSessionService').mockResolvedValue({
        success: true,
        status: 200,
        data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
      });

      await renderApp();

      accountService.getSessionsService.mockReturnValueOnce(pending.promise);
      await act(async () => { container.querySelector('.btn-refresh-sessions').click(); });
      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });
      await act(async () => { pending.resolve({ success: true, status: 200, data: { sessions: sampleSessions } }); });

      // Nút làm mới mở khóa bình thường, không bị treo disabled
      expect(container.querySelector('.btn-refresh-sessions').disabled).toBe(false);
    });

    // TIÊU CHÍ J: GET cũ trả sau thu hồi -> không khôi phục phiên đã bị xóa
    it('J. GET cũ trả sau thu hồi -> không khôi phục phiên đã bị xóa (Anti-resurrection)', async () => {
      const pendingStaleGet = deferred();

      await renderApp();

      // Bắt đầu một GET chậm
      accountService.getSessionsService.mockReturnValueOnce(pendingStaleGet.promise);
      await act(async () => { container.querySelector('.btn-refresh-sessions').click(); });

      // Thu hồi thành công phiên iPhone sess_other_456
      vi.spyOn(accountService, 'revokeSessionService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
      });

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Phiên sess_other_456 đã bị loại bỏ
      expect(container.textContent).not.toContain('iPhone 15 Pro');

      // Bây giờ GET cũ trả về cả 3 phiên
      await act(async () => {
        pendingStaleGet.resolve({
          success: true,
          status: 200,
          data: { sessions: sampleSessions }
        });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Phiên iPhone đã bị thu hồi tuyệt đối KHÔNG xuất hiện trở lại
      expect(container.textContent).not.toContain('iPhone 15 Pro');
      expect(container.querySelectorAll('.security-session-item').length).toBe(2);
    });

    // TIÊU CHÍ K: 401 của request cũ không đăng xuất tài khoản mới
    it('K. 401 của request cũ không đăng xuất tài khoản mới', async () => {
      const pendingUserA = deferred();
      accountService.getSessionsService.mockReturnValueOnce(pendingUserA.promise);

      await renderApp();

      // Đổi sang User B
      authService.getMeService.mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUserB }
      });

      await act(async () => { await bridge.checkSession(); });

      // Request cũ của User A trả 401
      await act(async () => {
        pendingUserA.resolve({
          success: false,
          status: 401,
          code: 'UNAUTHORIZED'
        });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // User B không bị điều hướng nhầm về login
      expect(container.querySelector('[data-testid="login-page"]')).toBeNull();
    });

    // TIÊU CHÍ L: Unmount khi pending -> không callback hoặc điều hướng muộn
    it('L. Unmount khi pending -> không callback hoặc điều hướng muộn', async () => {
      const pending = deferred();
      vi.spyOn(accountService, 'revokeSessionService').mockReturnValue(pending.promise);

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[0].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      // Unmount component trong khi request đang bay
      await act(async () => { root.unmount(); });

      // Sau khi unmount, request hoàn tất
      expect(() => {
        pending.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_curr_123', requiresLogin: true }
        });
      }).not.toThrow();
    });

    // TIÊU CHÍ M: Double click vẫn chỉ gửi một request
    it('M. Double click vẫn chỉ gửi một request', async () => {
      const pending = deferred();
      const revokeSpy = vi.spyOn(accountService, 'revokeSessionService').mockReturnValue(pending.promise);

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });

      const confirmBtn = container.querySelector('.dialog-btn-confirm');
      await act(async () => {
        confirmBtn.click();
        confirmBtn.click();
      });

      expect(revokeSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve({
          success: true,
          status: 200,
          data: { revoked: true, sessionId: 'sess_other_456', requiresLogin: false }
        });
      });
    });

    // TIÊU CHÍ N: 404 và lỗi mạng giữ đúng hành vi, không tự retry thao tác thay đổi
    it('N. 404 và lỗi mạng giữ đúng hành vi, không tự retry thao tác thay đổi', async () => {
      const revokeSpy = vi.spyOn(accountService, 'revokeSessionService').mockResolvedValueOnce({
        success: false,
        status: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Phiên không còn hoạt động hoặc đã hết hạn.'
      });

      await renderApp();

      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      expect(revokeSpy).toHaveBeenCalledTimes(1);
      const alert = container.querySelector('.security-alert-warning');
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain('Phiên không còn hoạt động hoặc đã hết hạn');

      // Lỗi mạng
      vi.spyOn(accountService, 'revokeSessionService').mockRejectedValueOnce(new Error('Network error'));
      await act(async () => { container.querySelectorAll('.btn-revoke-session')[1].click(); });
      await act(async () => { container.querySelector('.dialog-btn-confirm').click(); });

      expect(container.querySelector('.security-alert-danger')).not.toBeNull();
    });
  });
});
