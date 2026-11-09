import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider, useLanguage } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider, useSettings } from '../context/SettingsContext.jsx';
import { NotificationProvider, useNotificationContext } from '../context/NotificationContext.jsx';
import * as notificationService from '../services/notificationService.js';
import * as authService from '../services/authService.js';

import Layout from '../shared/components/Layout.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Tiện ích tạo deferred promise có kiểm soát
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
 * Component cầu nối điều khiển để test các thao tác ngữ cảnh
 */
function TestControlBridge({ onBridgeReady }) {
  const { lang, setLang } = useLanguage();
  const { currentUser, checkSession, logout } = useAuthContext();
  const { currentSettings, updateAppearanceField } = useSettings();
  const notifContext = useNotificationContext();

  if (onBridgeReady) {
    onBridgeReady({
      lang,
      setLang,
      currentUser,
      checkSession,
      logout,
      currentSettings,
      updateAppearanceField,
      notifContext
    });
  }

  return null;
}

function TestAppRouter({
  initialEntry = '/notifications',
  initialLang = 'vi',
  onBridgeReady
}) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LanguageProvider initialLang={initialLang}>
        <AuthProvider enableDemoAuth={false}>
          <DeviceProvider>
            <SettingsProvider>
              <NotificationProvider>
                <TestControlBridge onBridgeReady={onBridgeReady} />
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="overview" element={<div data-testid="overview-page">Overview Page</div>} />
                  </Route>
                  <Route path="/login" element={<div data-testid="login-page">Trang Đăng Nhập</div>} />
                </Routes>
              </NotificationProvider>
            </SettingsProvider>
          </DeviceProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe('Giai đoạn 4D.2: Chuông và Hộp thư Thông báo Thật (Notifications Phase 4D.2)', () => {
  let container = null;
  let root = null;
  let bridge = null;

  const mockUserA = {
    id: 'usr_phase4d2_userA',
    name: 'Nguyễn Văn A',
    email: 'user_a@example.com',
    role: 'homeowner',
    owned: ['smart-door-lock'],
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  const mockUserB = {
    id: 'usr_phase4d2_userB',
    name: 'Trần Thị B',
    email: 'user_b@example.com',
    role: 'homeowner',
    owned: ['smart-lighting'],
    createdAt: '2026-02-01T00:00:00.000Z'
  };

  const sampleNotifications = [
    {
      id: 'notif_111111111111111111111111',
      eventCode: 'SESSION_REVOKED',
      type: 'permissionChanges',
      severity: 'warning',
      params: { deviceLabel: 'iPhone 15', browserLabel: 'Safari' },
      isRead: false,
      readAt: null,
      isSilent: false,
      createdAt: '2026-11-06T10:00:00.000Z'
    },
    {
      id: 'notif_222222222222222222222222',
      eventCode: 'SESSION_REVOKED',
      type: 'permissionChanges',
      severity: 'warning',
      params: { deviceLabel: 'Windows Desktop', browserLabel: 'Chrome' },
      isRead: false,
      readAt: null,
      isSilent: false,
      createdAt: '2026-11-06T09:00:00.000Z'
    },
    {
      id: 'notif_333333333333333333333333',
      eventCode: 'SESSION_REVOKED',
      type: 'permissionChanges',
      severity: 'warning',
      params: { deviceLabel: 'MacBook Pro', browserLabel: 'Firefox' },
      isRead: true,
      readAt: '2026-11-06T08:30:00.000Z',
      isSilent: false,
      createdAt: '2026-11-06T08:00:00.000Z'
    }
  ];

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    bridge = null;

    // Giả lập phiên đăng nhập mặc định là mockUserA
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      data: { user: { ...mockUserA } }
    });

    // Mặc định getNotificationsService trả về 3 thông báo mẫu
    vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      data: {
        items: [...sampleNotifications],
        nextCursor: null,
        unreadCount: 2
      }
    });
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
    bridge = null;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // NHÓM 1: NẠP DỮ LIỆU BAN ĐẦU, TRẠNG THÁI TẢI VÀ BADGE
  // =========================================================================
  describe('1. Nạp dữ liệu ban đầu, trạng thái tải và Badge', () => {
    it('danh sách rỗng hiển thị thông điệp rỗng và unreadCount = 0', async () => {
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { items: [], nextCursor: null, unreadCount: 0 }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(container.querySelector('.notif-page-empty')).not.toBeNull();
      // Badge không được hiển thị khi unreadCount = 0
      expect(container.querySelector('.notification-badge')).toBeNull();
    });

    it('hiển thị đúng badge số lượng chưa đọc trên chuông khi có thông báo chưa đọc', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const badge = container.querySelector('.notification-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('2');

      const bellBtn = container.querySelector('.notification-bell-btn');
      expect(bellBtn.getAttribute('aria-label')).toContain('2');
    });

    it('badge hiển thị "99+" khi số lượng chưa đọc vượt quá 99', async () => {
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { items: [...sampleNotifications], nextCursor: null, unreadCount: 150 }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const badge = container.querySelector('.notification-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('99+');
    });

    it('nạp thất bại hiển thị thông báo lỗi và nút Thử lại (Retry)', async () => {
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Lỗi kết nối máy chủ.',
        data: null
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(container.querySelector('.notif-page-error')).not.toBeNull();
      const retryBtn = container.querySelector('.notif-page-error button');
      expect(retryBtn).not.toBeNull();

      // Bấm nút thử lại
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { items: [...sampleNotifications], nextCursor: null, unreadCount: 2 }
      });

      await act(async () => {
        retryBtn.click();
      });

      expect(container.querySelector('.notif-items-list')).not.toBeNull();
    });

    it('chế độ xem trước (preview mode) không gọi API /api/notifications', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);
      const getSpy = vi.spyOn(notificationService, 'getNotificationsService');

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // NHÓM 2: CHUÔNG THÔNG BÁO VÀ DROPDOWN XEM NHANH
  // =========================================================================
  describe('2. Chuông thông báo và Dropdown xem nhanh', () => {
    it('bấm chuông mở dropdown xem nhanh tối đa 5 thông báo mới nhất', async () => {
      // Tạo 7 thông báo mẫu
      const manyNotifs = Array.from({ length: 7 }, (_, i) => ({
        id: `notif_${String(i).padStart(24, '0')}`,
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        params: { deviceLabel: `Thiết bị ${i + 1}`, browserLabel: 'Browser' },
        isRead: false,
        readAt: null,
        isSilent: false,
        createdAt: new Date(Date.now() - i * 60000).toISOString()
      }));

      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { items: manyNotifs, nextCursor: null, unreadCount: 7 }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const bellBtn = container.querySelector('.notification-bell-btn');
      const dropdown = container.querySelector('.notification-dropdown');
      expect(dropdown.hidden).toBe(true);
      expect(dropdown.style.display).toBe('none');

      // Bấm mở chuông
      await act(async () => {
        bellBtn.click();
      });

      expect(dropdown.hidden).toBe(false);
      expect(dropdown.style.display).toBe('');
      // Chỉ hiển thị tối đa 5 thông báo trong dropdown
      const itemsInDropdown = dropdown.querySelectorAll('.notification-item');
      expect(itemsInDropdown.length).toBe(5);
    });

    it('bấm ra ngoài đóng dropdown', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const bellBtn = container.querySelector('.notification-bell-btn');
      const dropdown = container.querySelector('.notification-dropdown');

      await act(async () => {
        bellBtn.click();
      });
      expect(dropdown.hidden).toBe(false);

      // Bấm click ra ngoài document
      await act(async () => {
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });

      expect(dropdown.hidden).toBe(true);
    });

    it('bấm Escape đóng dropdown và hoàn trả focus về nút chuông', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const bellBtn = container.querySelector('.notification-bell-btn');
      const dropdown = container.querySelector('.notification-dropdown');

      await act(async () => {
        bellBtn.click();
      });
      expect(dropdown.hidden).toBe(false);

      // Nhấn Escape
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(dropdown.hidden).toBe(true);
      expect(document.activeElement).toBe(bellBtn);
    });

    it('mở dropdown không tự động đánh dấu tất cả đã đọc', async () => {
      const markAllSpy = vi.spyOn(notificationService, 'markAllNotificationsAsReadService');

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const bellBtn = container.querySelector('.notification-bell-btn');
      await act(async () => {
        bellBtn.click();
      });

      // Tuyệt đối không gọi markAll
      expect(markAllSpy).not.toHaveBeenCalled();
      const badge = container.querySelector('.notification-badge');
      expect(badge.textContent).toBe('2');
    });

    it('đánh dấu đã đọc một mục từ dropdown: cập nhật trạng thái mục và giảm unreadCount', async () => {
      const markSpy = vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notification: {
            ...sampleNotifications[0],
            isRead: true,
            readAt: '2026-11-06T10:30:00.000Z'
          }
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const bellBtn = container.querySelector('.notification-bell-btn');
      await act(async () => {
        bellBtn.click();
      });

      const dropdown = container.querySelector('.notification-dropdown');
      const firstMarkBtn = dropdown.querySelector('.notif-mark-read-btn');
      expect(firstMarkBtn).not.toBeNull();

      await act(async () => {
        firstMarkBtn.click();
      });

      expect(markSpy).toHaveBeenCalledWith(sampleNotifications[0].id);

      // unreadCount giảm từ 2 xuống 1
      const badge = container.querySelector('.notification-badge');
      expect(badge.textContent).toBe('1');
    });
  });

  // =========================================================================
  // NHÓM 3: TRANG HỘP THƯ, PHÂN TRANG VÀ ĐÁNH DẤU TẤT CẢ
  // =========================================================================
  describe('3. Trang Hộp thư /notifications, Phân trang và Đánh dấu tất cả', () => {
    it('hiển thị danh sách thông báo với nhãn thiết bị và trình duyệt', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const items = container.querySelectorAll('.notif-items-list .notification-item');
      expect(items.length).toBe(3);

      // Kiểm tra nội dung mục 1
      const firstDesc = items[0].querySelector('.notif-item-desc').textContent;
      expect(firstDesc).toContain('iPhone 15');
      expect(firstDesc).toContain('Safari');
    });

    it('hiển thị nút "Tải thêm" khi nextCursor tồn tại và nạp thêm trang kế tiếp không tạo dòng trùng', async () => {
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0]],
            nextCursor: 'cursor_page_2',
            unreadCount: 2
          }
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[1], sampleNotifications[0]], // Trả về cả mục 0 (trùng) và mục 1
            nextCursor: null,
            unreadCount: 2
          }
        });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const loadMoreBtn = container.querySelector('.notif-load-more-btn');
      expect(loadMoreBtn).not.toBeNull();

      // Bấm tải thêm
      await act(async () => {
        loadMoreBtn.click();
      });

      const items = container.querySelectorAll('.notif-items-list .notification-item');
      // Đã khử trùng mục 0, chỉ có 2 mục duy nhất
      expect(items.length).toBe(2);
      // nextCursor = null nên nút Tải thêm biến mất
      expect(container.querySelector('.notif-load-more-btn')).toBeNull();
    });

    it('đánh dấu tất cả đã đọc (read-all) cập nhật trạng thái các mục và đồng bộ với server', async () => {
      const markAllSpy = vi.spyOn(notificationService, 'markAllNotificationsAsReadService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { updatedCount: 2 }
      });

      // Lần fetch 1: nạp ban đầu; Lần fetch 2: sync sau markAll
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [...sampleNotifications],
            nextCursor: null,
            unreadCount: 2
          }
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: sampleNotifications.map((i) => ({ ...i, isRead: true, readAt: '2026-11-06T10:00:00.000Z' })),
            nextCursor: null,
            unreadCount: 0
          }
        });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const markAllBtn = container.querySelector('.notif-header-actions button.btn-primary');
      expect(markAllBtn).not.toBeNull();

      await act(async () => {
        markAllBtn.click();
      });

      expect(markAllSpy).toHaveBeenCalled();
      // Badge biến mất vì unreadCount = 0
      expect(container.querySelector('.notification-badge')).toBeNull();
      // Nút markAll bị disable vì unreadCount = 0
      expect(markAllBtn.disabled).toBe(true);
    });

    it('nút Làm mới (Refresh) cập nhật danh sách mới nhất từ máy chủ', async () => {
      const refreshSpy = vi.spyOn(notificationService, 'getNotificationsService');

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const refreshBtn = container.querySelector('.notif-header-actions button.btn-outline');
      expect(refreshBtn).not.toBeNull();

      await act(async () => {
        refreshBtn.click();
      });

      expect(refreshSpy).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // NHÓM 4: CHỐNG DOUBLE CLICK VÀ XỬ LÝ ĐỒNG THỜI (RACE CONDITIONS)
  // =========================================================================
  describe('4. Chống Double Click và Xử lý Đồng thời (Race Conditions)', () => {
    it('double click nhanh vào nút đánh dấu đã đọc chỉ gửi đúng 1 request API', async () => {
      const def = deferred();
      const markSpy = vi.spyOn(notificationService, 'markNotificationAsReadService').mockReturnValue(def.promise);

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const firstMarkBtn = container.querySelector('.notif-items-list .notif-mark-read-btn');

      // Click liên tiếp 2 lần
      await act(async () => {
        firstMarkBtn.click();
        firstMarkBtn.click();
      });

      expect(markSpy).toHaveBeenCalledTimes(1);

      // Giải phóng request
      await act(async () => {
        def.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notification: {
              ...sampleNotifications[0],
              isRead: true,
              readAt: '2026-11-06T10:00:00.000Z'
            }
          }
        });
      });
    });

    it('gọi lại đánh dấu trên mục đã đọc KHÔNG làm giảm unreadCount lần nữa', async () => {
      // Mock trả về notification đã đọc từ trước
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notification: {
            ...sampleNotifications[2], // Mục 2 vốn đã có isRead = true
            isRead: true,
            readAt: '2026-11-06T08:30:00.000Z'
          }
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Gọi trực tiếp markAsRead với id của mục đã đọc
      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[2].id);
      });

      // unreadCount vẫn là 2, không bị trừ âm thành 1
      expect(bridge.notifContext.unreadCount).toBe(2);
    });

    it('refresh cạnh tranh vô hiệu hóa lượt loadMore cũ đang bay', async () => {
      const loadMoreDef = deferred();

      vi.spyOn(notificationService, 'getNotificationsService')
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0]],
            nextCursor: 'cursor_page_2',
            unreadCount: 1
          }
        });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Mock cho lần gọi loadMore (đang bay)
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(loadMoreDef.promise);

      const loadMoreBtn = container.querySelector('.notif-load-more-btn');
      await act(async () => {
        loadMoreBtn.click();
      });

      // Trong lúc loadMore đang bay, kích hoạt Refresh
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [sampleNotifications[1]], // Dữ liệu hoàn toàn mới sau refresh
          nextCursor: null,
          unreadCount: 1
        }
      });

      const refreshBtn = container.querySelector('.notif-header-actions button.btn-outline');
      await act(async () => {
        refreshBtn.click();
      });

      // Bây giờ loadMore cũ mới trả về
      await act(async () => {
        loadMoreDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[2]],
            nextCursor: null,
            unreadCount: 1
          }
        });
      });

      // Danh sách chỉ chứa dữ liệu của Refresh (mục 1), lượt loadMore cũ bị vô hiệu hóa
      const items = container.querySelectorAll('.notif-items-list .notification-item');
      expect(items.length).toBe(1);
      expect(items[0].getAttribute('data-notification-id')).toBe(sampleNotifications[1].id);
    });

    it('GET cũ không hoàn tác trạng thái đã đọc của mục vừa được cập nhật', async () => {
      const getDef = deferred();
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(getDef.promise);

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Đánh dấu đọc mục 0
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notification: {
            ...sampleNotifications[0],
            isRead: true,
            readAt: '2026-11-06T10:30:00.000Z'
          }
        }
      });

      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      // Response GET ban đầu (với isRead: false) bây giờ mới giải phóng
      await act(async () => {
        getDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [...sampleNotifications], // có isRead: false cho mục 0
            nextCursor: null,
            unreadCount: 2
          }
        });
      });

      // Mục 0 vẫn giữ nguyên trạng thái đã đọc
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);
    });

    it('response sai hợp đồng không báo thành công giả', async () => {
      // 1. Kiểm tra validator hợp đồng của Notification Item
      expect(notificationService.isValidNotificationItem(null)).toBe(false);
      expect(notificationService.isValidNotificationItem({ invalid: 'data' })).toBe(false);
      expect(notificationService.isValidNotificationItem({ id: '1', eventCode: 'SESSION_REVOKED', severity: 'invalid_sev' })).toBe(false);
      expect(notificationService.isValidNotificationItem({ id: '1', eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', isRead: 'not-bool' })).toBe(false);
      expect(notificationService.isValidNotificationItem({ id: '1', eventCode: 'SESSION_REVOKED', type: 'permissionChanges', severity: 'warning', isRead: false, isSilent: false, createdAt: 'invalid-date' })).toBe(false);

      // 2. Kiểm tra UI: khi service trả INVALID_RESPONSE -> hiển thị trạng thái lỗi, không báo thành công
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: false,
        status: 200,
        code: 'INVALID_RESPONSE',
        message: 'Phản hồi từ máy chủ không đúng định dạng dữ liệu.',
        data: null
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Không coi là thành công, hiển thị lỗi
      expect(container.querySelector('.notif-page-error')).not.toBeNull();
    });
  });

  // =========================================================================
  // NHÓM 5: VÒNG ĐỜI NGƯỜI DÙNG, ĐA NGÔN NGỮ VÀ TRỢ NĂNG
  // =========================================================================
  describe('5. Vòng đời người dùng, Đa ngôn ngữ và Trợ năng', () => {
    it('chuyển đổi tài khoản A -> B: xóa sạch hộp thư tài khoản A và nạp đúng hộp thư tài khoản B', async () => {
      const getSpy = vi.spyOn(notificationService, 'getNotificationsService');

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);

      // Chuyển sang User B
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: { ...mockUserB } }
      });

      await act(async () => {
        await bridge.checkSession();
      });

      // getNotificationsService được gọi lại cho User B
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('response 401 thuộc request của tài khoản cũ A không đăng xuất tài khoản mới B', async () => {
      const aDef = deferred();
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(aDef.promise);

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Đổi sang User B
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: { ...mockUserB } }
      });

      await act(async () => {
        await bridge.checkSession();
      });

      // Request cũ của User A bây giờ mới trả về 401
      await act(async () => {
        aDef.resolve({
          success: false,
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Phiên làm việc hết hạn.'
        });
      });

      // User B vẫn đang đăng nhập bình thường
      expect(bridge.currentUser.id).toBe(mockUserB.id);
      expect(container.querySelector('[data-testid="login-page"]')).toBeNull();
    });

    it('chuyển đổi ngôn ngữ VI / EN cập nhật văn bản ngay lập tức mà không làm mất danh sách', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const pageTitle = container.querySelector('.page-title');
      expect(pageTitle.textContent).toBe('Thông báo');

      // Chuyển sang tiếng Anh
      await act(async () => {
        bridge.setLang('en');
      });

      expect(pageTitle.textContent).toBe('Notifications');
      // Danh sách vẫn còn nguyên 3 mục
      const items = container.querySelectorAll('.notif-items-list .notification-item');
      expect(items.length).toBe(3);
    });

    it('trợ năng (Accessibility - a11y): có đầy đủ aria-label, role="feed" và role="region"', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const feed = container.querySelector('[role="feed"]');
      expect(feed).not.toBeNull();

      const bellBtn = container.querySelector('.notification-bell-btn');
      expect(bellBtn.getAttribute('aria-haspopup')).toBe('true');
      expect(bellBtn.getAttribute('aria-expanded')).toBe('false');

      const dropdown = container.querySelector('.notification-dropdown');
      expect(dropdown.getAttribute('role')).toBe('region');
    });
  });

  // =========================================================================
  // NHÓM 6: SỬA HẸP 4D.2: QUẢN LÝ TRẠNG THÁI KHÓA, ĐỒNG BỘ MUTATION VÀ BÁO LỖI
  // =========================================================================
  describe('6. Sửa hẹp 4D.2: Quản lý Trạng thái Khóa, Đồng bộ Mutation và Báo lỗi', () => {
    it('loadMore pending -> refresh -> loadMore cũ trả về -> tải thêm tiếp bằng cursor mới thành công', async () => {
      const loadMoreDef1 = deferred();
      const refreshDef = deferred();
      const loadMoreDef2 = deferred();

      // Initial load
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0]],
            nextCursor: 'cursor_page_1',
            unreadCount: 1
          }
        });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Mock cho loadMore đợt 1
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValueOnce(loadMoreDef1.promise);

      const loadMoreBtn = container.querySelector('.notif-load-more-btn');
      expect(loadMoreBtn).not.toBeNull();

      // Bắt đầu loadMore 1
      await act(async () => {
        loadMoreBtn.click();
      });
      expect(bridge.notifContext.isLoadingMore).toBe(true);

      // Mock cho refresh
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValueOnce(refreshDef.promise);

      // Người dùng bấm Refresh
      const refreshBtn = container.querySelector('.notif-header-actions button.btn-outline');
      await act(async () => {
        refreshBtn.click();
      });
      // isLoadingMore phải được giải phóng ngay khi refresh bắt đầu
      expect(bridge.notifContext.isLoadingMore).toBe(false);

      // Giải phóng refresh với cursor mới
      await act(async () => {
        refreshDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[1]],
            nextCursor: 'cursor_page_after_refresh',
            unreadCount: 1
          }
        });
      });

      // Bây giờ loadMore cũ trả về
      await act(async () => {
        loadMoreDef1.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0]],
            nextCursor: 'cursor_old_stale',
            unreadCount: 1
          }
        });
      });

      // Mock cho loadMore đợt 2 bằng cursor mới
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValueOnce(loadMoreDef2.promise);

      // Người dùng tải thêm tiếp bằng cursor mới
      const newLoadMoreBtn = container.querySelector('.notif-load-more-btn');
      expect(newLoadMoreBtn).not.toBeNull();
      expect(newLoadMoreBtn.disabled).toBe(false);

      await act(async () => {
        newLoadMoreBtn.click();
      });
      expect(bridge.notifContext.isLoadingMore).toBe(true);

      // Giải phóng loadMore đợt 2 thành công
      await act(async () => {
        loadMoreDef2.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[2]],
            nextCursor: null,
            unreadCount: 1
          }
        });
      });

      // Tải thêm thành công: danh sách có cả mục sau refresh (1) và mục tải thêm mới (2)
      expect(bridge.notifContext.isLoadingMore).toBe(false);
      const items = container.querySelectorAll('.notif-items-list .notification-item');
      expect(items.length).toBe(2);
      expect(items[0].getAttribute('data-notification-id')).toBe(sampleNotifications[1].id);
      expect(items[1].getAttribute('data-notification-id')).toBe(sampleNotifications[2].id);
    });

    it('hai lời gọi loadMore liên tiếp chỉ gửi đúng một request tới API', async () => {
      const loadMoreDef = deferred();
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0]],
            nextCursor: 'cursor_1',
            unreadCount: 1
          }
        });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const getSpy = vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValue(loadMoreDef.promise);

      // Gọi loadMore 2 lần liên tiếp trong cùng một chu kỳ đồng bộ
      await act(async () => {
        bridge.notifContext.loadMore();
        bridge.notifContext.loadMore();
      });

      expect(getSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        loadMoreDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: { items: [], nextCursor: null, unreadCount: 1 }
        });
      });
    });

    it('GET tải thêm trả về muộn sau markAsRead không khôi phục unreadCount hoặc trạng thái chưa đọc', async () => {
      const loadMoreDef = deferred();

      vi.spyOn(notificationService, 'getNotificationsService')
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0]],
            nextCursor: 'cursor_page_1',
            unreadCount: 2
          }
        });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(bridge.notifContext.unreadCount).toBe(2);

      // Bắt đầu loadMore
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(loadMoreDef.promise);
      await act(async () => {
        bridge.notifContext.loadMore();
      });

      // Trong lúc loadMore đang bay, người dùng đánh dấu đã đọc mục 0
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notification: {
            ...sampleNotifications[0],
            isRead: true,
            readAt: '2026-11-06T12:00:00.000Z'
          }
        }
      });

      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      // Sau khi markAsRead, unreadCount giảm còn 1
      expect(bridge.notifContext.unreadCount).toBe(1);
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);

      // Bây giờ loadMore (được gửi trước khi markAsRead) trả về với unreadCount cũ = 2
      await act(async () => {
        loadMoreDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [
              {
                id: 'notif_extra_999',
                eventCode: 'SESSION_REVOKED',
                type: 'permissionChanges',
                severity: 'warning',
                params: {},
                isRead: true,
                readAt: '2026-11-06T11:00:00.000Z',
                isSilent: false,
                createdAt: '2026-11-06T11:00:00.000Z'
              }
            ],
            nextCursor: null,
            unreadCount: 2 // unreadCount cũ từ trước mutation
          }
        });
      });

      // unreadCount KHÔNG bị khôi phục về 2, vẫn giữ 1
      expect(bridge.notifContext.unreadCount).toBe(1);
      // Mục 0 vẫn giữ trạng thái đã đọc
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);
    });

    it('trong lúc markAllAsRead đang chạy có thông báo chưa đọc mới đến, GET đồng bộ phản ánh đúng thông báo mới đó', async () => {
      const markAllDef = deferred();
      const syncGetDef = deferred();

      // Nạp 2 thông báo ban đầu
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [sampleNotifications[0], sampleNotifications[1]],
          nextCursor: null,
          unreadCount: 2
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(bridge.notifContext.unreadCount).toBe(2);

      // Khi bấm Mark All As Read
      vi.spyOn(notificationService, 'markAllNotificationsAsReadService')
        .mockReturnValueOnce(markAllDef.promise);

      // Chuẩn bị spy cho GET đồng bộ sau đó
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValueOnce(syncGetDef.promise);

      await act(async () => {
        bridge.notifContext.markAllAsRead();
      });
      expect(bridge.notifContext.isMarkingAll).toBe(true);

      // markAll thành công phía server
      await act(async () => {
        markAllDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: { updatedCount: 2 }
        });
      });

      // Server có thông báo mới (notif_new_post_cutoff) phát sinh sau mốc cutoff của markAll
      const newUnreadPostCutoff = {
        id: 'notif_new_post_cutoff',
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'urgent',
        params: { deviceLabel: 'Smart Lock' },
        isRead: false,
        readAt: null,
        isSilent: false,
        createdAt: '2026-11-06T15:00:00.000Z'
      };

      // GET đồng bộ trả về kết quả thật từ server
      await act(async () => {
        syncGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [
              newUnreadPostCutoff,
              { ...sampleNotifications[0], isRead: true, readAt: '2026-11-06T14:59:00.000Z' },
              { ...sampleNotifications[1], isRead: true, readAt: '2026-11-06T14:59:00.000Z' }
            ],
            nextCursor: null,
            unreadCount: 1 // Đúng 1 thông báo mới chưa đọc
          }
        });
      });

      // unreadCount được cập nhật đúng là 1 từ server (không bị ép về 0)
      expect(bridge.notifContext.unreadCount).toBe(1);
      // Mục mới vẫn chưa đọc
      const latestItem = bridge.notifContext.notifications.find(i => i.id === 'notif_new_post_cutoff');
      expect(latestItem).toBeDefined();
      expect(latestItem.isRead).toBe(false);
    });

    it('request của User A trả về sau khi đổi sang User B không giải phóng khóa của User B', async () => {
      const userALoadMoreDef = deferred();
      const userBLoadMoreDef = deferred();

      // User A nạp ban đầu
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [sampleNotifications[0]],
          nextCursor: 'cursor_user_a',
          unreadCount: 1
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // User A gửi loadMore
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(userALoadMoreDef.promise);
      await act(async () => {
        bridge.notifContext.loadMore();
      });
      expect(bridge.notifContext.isLoadingMore).toBe(true);

      // Đổi sang User B
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: { ...mockUserB } }
      });

      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [sampleNotifications[1]],
          nextCursor: 'cursor_user_b',
          unreadCount: 1
        }
      });

      await act(async () => {
        bridge.checkSession();
      });

      expect(bridge.currentUser.id).toBe(mockUserB.id);

      // User B gọi loadMore
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(userBLoadMoreDef.promise);
      await act(async () => {
        bridge.notifContext.loadMore();
      });
      expect(bridge.notifContext.isLoadingMore).toBe(true);

      // Bây giờ request loadMore của User A cũ mới trả về
      await act(async () => {
        userALoadMoreDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[2]],
            nextCursor: null,
            unreadCount: 0
          }
        });
      });

      // KHÔNG được giải phóng khóa của User B (User B vẫn đang loading)
      expect(bridge.notifContext.isLoadingMore).toBe(true);

      // User B hoàn tất
      await act(async () => {
        userBLoadMoreDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [],
            nextCursor: null,
            unreadCount: 1
          }
        });
      });

      expect(bridge.notifContext.isLoadingMore).toBe(false);
    });

    it('unmount khi mutation pending không kích hoạt GET đồng bộ tiếp theo và không cập nhật state sau khi hủy', async () => {
      const markAllDef = deferred();
      const getSpy = vi.spyOn(notificationService, 'getNotificationsService');

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      const initialGetCalls = getSpy.mock.calls.length;

      vi.spyOn(notificationService, 'markAllNotificationsAsReadService').mockReturnValueOnce(markAllDef.promise);

      // Bắt đầu mutation
      await act(async () => {
        bridge.notifContext.markAllAsRead();
      });

      // Unmount component trong lúc mutation đang bay
      await act(async () => {
        root.unmount();
        root = null;
      });

      // Bây giờ mutation mới resolve
      await act(async () => {
        markAllDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: { updatedCount: 2 }
        });
      });

      // Không có cuộc gọi GET đồng bộ nào được kích hoạt thêm
      expect(getSpy).toHaveBeenCalledTimes(initialGetCalls);
    });

    it('hiển thị actionError dịch đúng ở chuông và trang khi mutation thất bại', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Giả lập markAsRead thất bại
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'MARK_READ_FAILED',
        message: 'Không thể đánh dấu đã đọc thông báo. Vui lòng thử lại.'
      });

      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      // 1. Kiểm tra trên trang NotificationsPage
      const pageAlert = container.querySelector('.notif-action-error');
      expect(pageAlert).not.toBeNull();
      expect(pageAlert.textContent).toContain('Không thể đánh dấu đã đọc thông báo');

      // Nút đóng có aria-label dịch đúng
      const closeBtn = pageAlert.querySelector('.btn-close-alert');
      expect(closeBtn.getAttribute('aria-label')).toBe('Đóng thông báo lỗi');

      // 2. Mở chuông kiểm tra trong dropdown
      const bellBtn = container.querySelector('.notification-bell-btn');
      // Chặn refresh khi mở bell để giữ nguyên actionError
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { items: [...sampleNotifications], nextCursor: null, unreadCount: 2 }
      });

      await act(async () => {
        bellBtn.click();
      });

      const dropdownAlert = container.querySelector('.dropdown-action-error');
      expect(dropdownAlert).not.toBeNull();
      expect(dropdownAlert.textContent).toContain('Không thể đánh dấu đã đọc thông báo');

      // Bấm nút đóng xóa actionError
      await act(async () => {
        dropdownAlert.querySelector('.btn-close-alert').click();
      });
      expect(container.querySelector('.dropdown-action-error')).toBeNull();
      expect(container.querySelector('.notif-action-error')).toBeNull();

      // 3. Chuyển sang tiếng Anh và xác minh không hiển thị mã thô NETWORK_ERROR
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValueOnce({
        success: false,
        status: 0,
        code: 'NETWORK_ERROR'
      });

      await act(async () => {
        bridge.setLang('en');
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      const pageAlertEn = container.querySelector('.notif-action-error');
      expect(pageAlertEn).not.toBeNull();
      // Không hiển thị mã lỗi kỹ thuật thô
      expect(pageAlertEn.textContent).not.toContain('NETWORK_ERROR');
      expect(pageAlertEn.textContent).toContain('Cannot connect to server');
      const closeBtnEn = pageAlertEn.querySelector('.btn-close-alert');
      expect(closeBtnEn.getAttribute('aria-label')).toBe('Dismiss error notice');
    });

    it('refresh lỗi khi đã có dữ liệu: giữ danh sách và hiện banner retry', async () => {
      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      // Danh sách ban đầu có 3 mục
      expect(container.querySelectorAll('.notif-items-list .notification-item').length).toBe(3);

      // Refresh trả về lỗi
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'LOAD_NOTIFICATIONS_FAILED',
        message: 'Không thể tải thông báo từ máy chủ.'
      });

      const refreshBtn = container.querySelector('.notif-header-actions button.btn-outline');
      await act(async () => {
        refreshBtn.click();
      });

      // Danh sách vẫn được GIỮ NGUYÊN (không bị thay thế bởi notif-page-error)
      expect(container.querySelectorAll('.notif-items-list .notification-item').length).toBe(3);
      expect(container.querySelector('.notif-page-error')).toBeNull();

      // Hiện banner cảnh báo kèm nút thử lại
      const banner = container.querySelector('.notif-refresh-error-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('Không thể tải thông báo từ máy chủ.');

      const retryBtn = banner.querySelector('button.notif-retry-btn');
      expect(retryBtn).not.toBeNull();

      // Thử lại thành công
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { items: [...sampleNotifications], nextCursor: null, unreadCount: 2 }
      });

      await act(async () => {
        retryBtn.click();
      });

      // Banner biến mất
      expect(container.querySelector('.notif-refresh-error-banner')).toBeNull();
      expect(container.querySelectorAll('.notif-items-list .notification-item').length).toBe(3);
    });

    it('StrictMode an toàn: bọc trong React.StrictMode không làm giảm unreadCount hai lần khi markAsRead', async () => {
      await act(async () => {
        root.render(
          <React.StrictMode>
            <TestAppRouter onBridgeReady={(b) => { bridge = b; }} />
          </React.StrictMode>
        );
      });

      expect(bridge.notifContext.unreadCount).toBe(2);

      vi.spyOn(notificationService, 'markNotificationAsReadService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notification: {
            ...sampleNotifications[0],
            isRead: true,
            readAt: '2026-11-06T10:00:00.000Z'
          }
        }
      });

      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      // unreadCount chỉ giảm ĐÚNG 1 đơn vị: từ 2 xuống 1 (không bao giờ bị trừ 2 lần thành 0)
      expect(bridge.notifContext.unreadCount).toBe(1);
    });

    it('3A: PATCH mark-read pending -> GET refresh bắt đầu và giữ snapshot unreadCount cũ -> PATCH thành công -> GET cũ trả về: badge không tăng lại, mục không trở về chưa đọc', async () => {
      const patchDef = deferred();
      const getDef = deferred();

      // Nạp ban đầu: 2 thông báo chưa đọc (item0, item1)
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [sampleNotifications[0], sampleNotifications[1]],
          nextCursor: null,
          unreadCount: 2
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(bridge.notifContext.unreadCount).toBe(2);

      // 1. PATCH mark-read bắt đầu và pending
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockReturnValueOnce(patchDef.promise);
      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      // 2. Trong lúc PATCH đang pending, GET refresh bắt đầu và cũng pending
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(getDef.promise);
      await act(async () => {
        bridge.notifContext.refresh();
      });

      // 3. PATCH thành công: mục 0 thành đã đọc, unreadCount giảm còn 1
      await act(async () => {
        patchDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notification: {
              ...sampleNotifications[0],
              isRead: true,
              readAt: '2026-11-06T12:00:00.000Z'
            }
          }
        });
      });

      expect(bridge.notifContext.unreadCount).toBe(1);
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);

      // 4. GET cũ (khởi chạy trong lúc PATCH pending, mang snapshot cũ) bây giờ mới trả về
      await act(async () => {
        getDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [sampleNotifications[0], sampleNotifications[1]], // snapshot cũ: item0 có isRead: false
            nextCursor: null,
            unreadCount: 2 // snapshot cũ: unreadCount = 2
          }
        });
      });

      // KẾT QUẢ: badge không tăng lại về 2, mục 0 không trở về chưa đọc
      expect(bridge.notifContext.unreadCount).toBe(1);
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);
      const badge = container.querySelector('.notification-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('1');
    });

    it('3B: PATCH mark-read pending -> GET loadMore bắt đầu và giữ snapshot unreadCount cũ -> PATCH thành công -> GET cũ trả về: badge không tăng lại, mục không trở về chưa đọc', async () => {
      const patchDef = deferred();
      const loadMoreDef = deferred();

      // Nạp ban đầu: 2 thông báo chưa đọc, có nextCursor
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [sampleNotifications[0]],
          nextCursor: 'cursor_page_1',
          unreadCount: 2
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(bridge.notifContext.unreadCount).toBe(2);

      // 1. PATCH mark-read bắt đầu và pending
      vi.spyOn(notificationService, 'markNotificationAsReadService').mockReturnValueOnce(patchDef.promise);
      await act(async () => {
        bridge.notifContext.markAsRead(sampleNotifications[0].id);
      });

      // 2. Trong lúc PATCH đang pending, loadMore bắt đầu và pending
      vi.spyOn(notificationService, 'getNotificationsService').mockReturnValueOnce(loadMoreDef.promise);
      await act(async () => {
        bridge.notifContext.loadMore();
      });

      // 3. PATCH thành công: mục 0 thành đã đọc, unreadCount giảm còn 1
      await act(async () => {
        patchDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notification: {
              ...sampleNotifications[0],
              isRead: true,
              readAt: '2026-11-06T12:00:00.000Z'
            }
          }
        });
      });

      expect(bridge.notifContext.unreadCount).toBe(1);
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);

      // 4. GET loadMore cũ trả về với snapshot cũ unreadCount = 2
      await act(async () => {
        loadMoreDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [
              {
                id: 'notif_page2_item',
                eventCode: 'SESSION_REVOKED',
                type: 'permissionChanges',
                severity: 'info',
                params: {},
                isRead: true,
                readAt: '2026-11-06T09:00:00.000Z',
                isSilent: false,
                createdAt: '2026-11-06T09:00:00.000Z'
              }
            ],
            nextCursor: null,
            unreadCount: 2 // unreadCount cũ
          }
        });
      });

      // KẾT QUẢ: badge không tăng lại về 2, mục 0 không trở về chưa đọc
      expect(bridge.notifContext.unreadCount).toBe(1);
      expect(bridge.notifContext.notifications[0].isRead).toBe(true);
      const badge = container.querySelector('.notification-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('1');
    });

    it('3C: Read-all pending -> GET khác đưa thông báo mới sau cutoff vào danh sách -> read-all thành công -> GET đồng bộ thất bại: không ép thông báo mới thành đã đọc, không ép badge về 0, có cảnh báo và thử lại được, sau retry UI khớp dữ liệu server', async () => {
      const readAllDef = deferred();
      const initialOldNotif = {
        id: 'notif_old_1',
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        params: {},
        isRead: false,
        readAt: null,
        isSilent: false,
        createdAt: '2026-11-06T08:00:00.000Z'
      };

      const newPostCutoffNotif = {
        id: 'notif_post_cutoff_2',
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'urgent',
        params: {},
        isRead: false,
        readAt: null,
        isSilent: false,
        createdAt: '2026-11-06T12:30:00.000Z'
      };

      // 1. Nạp ban đầu: có 1 thông báo cũ chưa đọc
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [initialOldNotif],
          nextCursor: null,
          unreadCount: 1
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(bridge.notifContext.unreadCount).toBe(1);

      // 2. Read-all pending
      vi.spyOn(notificationService, 'markAllNotificationsAsReadService').mockReturnValueOnce(readAllDef.promise);
      await act(async () => {
        bridge.notifContext.markAllAsRead();
      });
      expect(bridge.notifContext.isMarkingAll).toBe(true);

      // 3. Trong lúc read-all đang pending, một GET khác đưa thông báo mới sau cutoff vào danh sách
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [initialOldNotif, newPostCutoffNotif],
          nextCursor: null,
          unreadCount: 2
        }
      });

      await act(async () => {
        bridge.notifContext.refresh();
      });

      // Danh sách hiện tại trên client có cả 2 mục chưa đọc, unreadCount = 2
      expect(bridge.notifContext.unreadCount).toBe(2);
      expect(bridge.notifContext.notifications.length).toBe(2);

      // 4. Chuẩn bị spy cho GET đồng bộ: giả lập GET đồng bộ sau read-all bị THẤT BẠI (500)
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'SYNC_NOTIFICATIONS_FAILED',
        message: 'Đã xử lý trên máy chủ nhưng chưa đồng bộ được hộp thư. Vui lòng thử lại.'
      });

      // Bây giờ read-all thành công trên backend (chỉ cập nhật 1 mục trước cutoff)
      await act(async () => {
        readAllDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: { updatedCount: 1 } // Đúng hợp đồng updatedCount
        });
      });

      // KẾT QUẢ KHI GET ĐỒNG BỘ THẤT BẠI:
      // Không ép thông báo mới sau cutoff thành đã đọc!
      const postCutoffItem = bridge.notifContext.notifications.find(i => i.id === newPostCutoffNotif.id);
      expect(postCutoffItem).toBeDefined();
      expect(postCutoffItem.isRead).toBe(false);

      // Không ép badge về 0! Giữ unreadCount gần nhất (2)
      expect(bridge.notifContext.unreadCount).toBe(2);

      // Có cảnh báo lỗi và nút thử lại
      const actionAlert = container.querySelector('.notif-action-error');
      expect(actionAlert).not.toBeNull();
      expect(actionAlert.textContent).toContain('Đã xử lý trên máy chủ nhưng chưa đồng bộ');

      const retryBtn = actionAlert.querySelector('.notif-retry-btn');
      expect(retryBtn).not.toBeNull();

      // 5. Bấm Thử lại (Retry) -> GET đồng bộ thành công
      // Phản ánh đúng dữ liệu server: mục cũ đã đọc, mục sau cutoff vẫn chưa đọc, unreadCount = 1
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [
            { ...initialOldNotif, isRead: true, readAt: '2026-11-06T12:00:00.000Z' },
            newPostCutoffNotif
          ],
          nextCursor: null,
          unreadCount: 1
        }
      });

      await act(async () => {
        retryBtn.click();
      });

      // Sau retry thành công: UI khớp dữ liệu server hoàn toàn
      expect(bridge.notifContext.unreadCount).toBe(1);
      const itemsAfterRetry = bridge.notifContext.notifications;
      expect(itemsAfterRetry[0].isRead).toBe(true);
      expect(itemsAfterRetry[1].isRead).toBe(false);
      expect(container.querySelector('.notif-action-error')).toBeNull();
    });

    it('read-all thành công -> GET đối soát pending -> refresh mới trả về có thông báo mới chưa đọc -> GET đối soát cũ trả về: giữ kết quả refresh mới', async () => {
      const readAllDef = deferred();
      const syncGetDef = deferred();
      const newRefreshDef = deferred();

      const item1 = {
        id: 'notif_item_1',
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'warning',
        params: {},
        isRead: false,
        readAt: null,
        isSilent: false,
        createdAt: '2026-11-06T08:00:00.000Z'
      };

      const itemNewFromRefresh = {
        id: 'notif_item_new_refresh',
        eventCode: 'SESSION_REVOKED',
        type: 'permissionChanges',
        severity: 'urgent',
        params: {},
        isRead: false,
        readAt: null,
        isSilent: false,
        createdAt: '2026-11-06T13:00:00.000Z'
      };

      // 1. Nạp ban đầu: có item1 (chưa đọc), unreadCount = 1
      vi.spyOn(notificationService, 'getNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          items: [item1],
          nextCursor: 'cursor_init',
          unreadCount: 1
        }
      });

      await act(async () => {
        root.render(<TestAppRouter onBridgeReady={(b) => { bridge = b; }} />);
      });

      expect(bridge.notifContext.unreadCount).toBe(1);

      // 2. Bắt đầu read-all
      vi.spyOn(notificationService, 'markAllNotificationsAsReadService')
        .mockReturnValueOnce(readAllDef.promise);

      await act(async () => {
        bridge.notifContext.markAllAsRead();
      });
      expect(bridge.notifContext.isMarkingAll).toBe(true);

      // Chuẩn bị cho GET đối soát của readAll
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValueOnce(syncGetDef.promise);

      // 3. read-all thành công trên máy chủ
      await act(async () => {
        readAllDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: { updatedCount: 1 }
        });
      });

      // Tại thời điểm này, GET đối soát đang PENDING (syncGetDef chưa resolve)

      // 4. Người dùng (hoặc giao diện) kích hoạt refresh mới
      vi.spyOn(notificationService, 'getNotificationsService')
        .mockReturnValueOnce(newRefreshDef.promise);

      await act(async () => {
        bridge.notifContext.refresh();
      });

      // 5. Refresh mới TRẢ VỀ TRƯỚC: có thông báo mới chưa đọc và cursor mới
      await act(async () => {
        newRefreshDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [
              { ...item1, isRead: true, readAt: '2026-11-06T12:00:00.000Z' },
              itemNewFromRefresh
            ],
            nextCursor: 'cursor_from_new_refresh',
            unreadCount: 1 // Đúng 1 thông báo mới chưa đọc
          }
        });
      });

      // UI đã nạp kết quả của refresh mới
      expect(bridge.notifContext.notifications.length).toBe(2);
      expect(bridge.notifContext.nextCursor).toBe('cursor_from_new_refresh');
      expect(bridge.notifContext.unreadCount).toBe(1);

      // 6. Bây giờ GET đối soát cũ mới trả về (mang dữ liệu cũ không có thông báo mới, unreadCount = 0)
      await act(async () => {
        syncGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            items: [
              { ...item1, isRead: true, readAt: '2026-11-06T11:59:00.000Z' }
            ],
            nextCursor: 'cursor_old_stale',
            unreadCount: 0
          }
        });
      });

      // KẾT QUẢ: Danh sách, cursor và unreadCount PHẢI GIỮ KẾT QUẢ REFRESH MỚI
      expect(bridge.notifContext.notifications.length).toBe(2);
      const postRefreshItem = bridge.notifContext.notifications.find(i => i.id === itemNewFromRefresh.id);
      expect(postRefreshItem).toBeDefined();
      expect(postRefreshItem.isRead).toBe(false);

      expect(bridge.notifContext.nextCursor).toBe('cursor_from_new_refresh');
      expect(bridge.notifContext.unreadCount).toBe(1);
    });
  });
});
