import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider, useLanguage } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider } from '../context/SettingsContext.jsx';
import * as settingsService from '../services/settingsService.js';
import * as authService from '../services/authService.js';

import PrivacySettings from '../pages/Settings/PrivacySettings.jsx';
import { isValidPrivacyContract } from '../pages/Settings/usePrivacySettings.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function TestControlBridge({ onBridgeReady }) {
  const { lang, setLang } = useLanguage();
  const { currentUser, checkSession, logout } = useAuthContext();

  if (onBridgeReady) {
    onBridgeReady({
      lang,
      setLang,
      currentUser,
      checkSession,
      logout
    });
  }
  return null;
}

describe('Phase 5B Frontend Privacy Settings Tests (PrivacySettings & usePrivacySettings)', () => {
  let container;
  let root;
  let bridge;
  let hookInstance;

  const mockUser1 = {
    id: 'user-001',
    name: 'Thành Viên 1',
    email: 'user1@example.com',
    role: 'viewer',
    owned: []
  };

  const mockUser2 = {
    id: 'user-002',
    name: 'Thành Viên 2',
    email: 'user2@example.com',
    role: 'member',
    owned: []
  };

  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    bridge = null;
    hookInstance = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  async function renderPrivacyPage({ initialUser = mockUser1, initialLang = 'vi', isPreview = false } = {}) {
    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(isPreview);

    if (isPreview) {
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED'
      });
    } else if (initialUser) {
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: initialUser }
      });
    } else {
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED'
      });
    }

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings/privacy']}>
          <LanguageProvider initialLang={initialLang}>
            <AuthProvider>
              <DeviceProvider>
                <SettingsProvider>
                  <TestControlBridge onBridgeReady={(b) => { bridge = b; }} />
                  <Routes>
                    <Route
                      path="/settings/privacy"
                      element={<PrivacySettings onHookReady={(h) => { hookInstance = h; }} />}
                    />
                  </Routes>
                </SettingsProvider>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });
  }

  describe('1. Hợp đồng dữ liệu (isValidPrivacyContract)', () => {
    it('1.1. Chấp nhận dữ liệu hợp lệ { retentionDays: 7 | 30 | 90 }', () => {
      expect(isValidPrivacyContract({ retentionDays: 7 })).toBe(true);
      expect(isValidPrivacyContract({ retentionDays: 30 })).toBe(true);
      expect(isValidPrivacyContract({ retentionDays: 90 })).toBe(true);
    });

    it('1.2. Từ chối chuỗi, boolean, float, mảng, null hoặc giá trị lạ', () => {
      expect(isValidPrivacyContract({ retentionDays: '7' })).toBe(false);
      expect(isValidPrivacyContract({ retentionDays: true })).toBe(false);
      expect(isValidPrivacyContract({ retentionDays: 7.5 })).toBe(false);
      expect(isValidPrivacyContract({ retentionDays: 15 })).toBe(false);
      expect(isValidPrivacyContract({ retentionDays: 0 })).toBe(false);
      expect(isValidPrivacyContract(null)).toBe(false);
      expect(isValidPrivacyContract({})).toBe(false);
      expect(isValidPrivacyContract([])).toBe(false);
    });
  });

  describe('2. Nạp và lưu lựa chọn thật (Load & Save Flow)', () => {
    it('2.1. Nạp thành công giá trị retentionDays từ máy chủ và hiển thị radio tương ứng', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: {
          privacy: { retentionDays: 30 }
        }
      });

      await renderPrivacyPage();

      expect(hookInstance.loadStatus).toBe('success');
      expect(hookInstance.retentionDays).toBe(30);

      const radios = container.querySelectorAll('[role="radio"]');
      expect(radios.length).toBe(3);

      const radio30 = Array.from(radios).find((r) => r.textContent.includes('30'));
      expect(radio30.getAttribute('aria-checked')).toBe('true');
      expect(radio30.classList.contains('active')).toBe(true);
    });

    it('2.2. Chọn giá trị mới -> gửi PATCH và hiển thị trạng thái Đã lưu', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: {
          privacy: { retentionDays: 30 }
        }
      });

      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: true,
        status: 200,
        data: {
          privacy: { retentionDays: 7 }
        }
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      await act(async () => {
        radio7.click();
      });

      expect(patchSpy).toHaveBeenCalledWith({ retentionDays: 7 });
      expect(hookInstance.saveStatus).toBe('saved');
      expect(hookInstance.persistedDays).toBe(7);

      const statusBar = container.querySelector('.settings-status-bar');
      expect(statusBar.textContent).toContain('Đã lưu');
    });
  });

  describe('3. Đổi nhanh khi PATCH đang chờ (Rapid Change Coalescing)', () => {
    it('3.1. Bấm 7 rồi nhanh tay bấm 90: chỉ chạy 1 PATCH tại một thời điểm, kết thúc lưu giá trị 90', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: {
          privacy: { retentionDays: 30 }
        }
      });

      const patchDef1 = deferred();
      const patchDef2 = deferred();

      let callCount = 0;
      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockImplementation(({ retentionDays }) => {
        callCount++;
        if (callCount === 1) {
          expect(retentionDays).toBe(7);
          return patchDef1.promise;
        }
        if (callCount === 2) {
          expect(retentionDays).toBe(90);
          return patchDef2.promise;
        }
        return Promise.resolve({ success: true, data: { privacy: { retentionDays } } });
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));
      const radio90 = Array.from(radios).find((r) => r.textContent.includes('90'));

      // 1. Bấm 7 -> PATCH(7) phát hành và đang chờ
      await act(async () => {
        radio7.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(hookInstance.saveStatus).toBe('saving');

      // 2. Nhanh tay bấm 90 khi PATCH(7) chưa hoàn thành
      await act(async () => {
        radio90.click();
      });

      // Vẫn chỉ có 1 request đang chạy, request 90 được hoãn
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 3. Giải phóng PATCH(7)
      await act(async () => {
        patchDef1.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 7 } }
        });
      });

      // Ngay sau khi PATCH(7) xong, PATCH(90) lập tức được phát hành
      expect(patchSpy).toHaveBeenCalledTimes(2);

      // 4. Giải phóng PATCH(90)
      await act(async () => {
        patchDef2.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 90 } }
        });
      });

      expect(hookInstance.saveStatus).toBe('saved');
      expect(hookInstance.persistedDays).toBe(90);
      expect(hookInstance.retentionDays).toBe(90);
    });
  });

  describe('4. Sửa hẹp 5B: Khóa chung cho PATCH & GET đối soát, và đối soát thất bại phải dừng', () => {
    it('4.1. Retry GET pending → người dùng đổi 7 sang 90 → GET trả 7: không báo Đã lưu cho 90, chỉ một PATCH lưu 90', async () => {
      // Thiết lập ban đầu: user đang ở 30 ngày
      let serverSavedValue = 30;
      vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: serverSavedValue } }
      }));

      // PATCH ban đầu sang 7 bị lỗi mạng
      vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValueOnce({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'NETWORK_ERROR'
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));
      const radio90 = Array.from(radios).find((r) => r.textContent.includes('90'));

      // Người dùng bấm 7 -> gặp lỗi mạng
      await act(async () => {
        radio7.click();
      });
      expect(hookInstance.saveStatus).toBe('error');

      // Chuẩn bị GET đối soát dạng deferred
      const reconcileGetDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValueOnce(reconcileGetDef.promise);

      // Bấm nút Thử lại -> bắt đầu đối soát GET và đang pending
      const retryBtn = container.querySelector('.btn-retry-save');
      await act(async () => {
        retryBtn.click();
      });
      expect(hookInstance.saveStatus).toBe('saving');

      // Trong lúc GET đối soát đang pending, người dùng bấm chọn 90 ngày
      await act(async () => {
        radio90.click();
      });
      expect(hookInstance.retentionDays).toBe(90);

      // Mock PATCH kế tiếp để nhận 90
      const patch90Spy = vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 90 } }
      });

      // GET đối soát hoàn thành trả về 7 (server đã lưu 7 từ trước)
      await act(async () => {
        reconcileGetDef.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 7 } }
        });
      });

      // Kiểm tra: Không báo "Đã lưu" cho 90 khi server mới trả 7; ngay sau đó gửi đúng 1 PATCH cho 90
      expect(patch90Spy).toHaveBeenCalledTimes(1);
      expect(patch90Spy).toHaveBeenCalledWith({ retentionDays: 90 });
      expect(hookInstance.saveStatus).toBe('saved');
      expect(hookInstance.persistedDays).toBe(90);
      expect(hookInstance.retentionDays).toBe(90);
    });

    it('4.2. Double click retry chỉ kích hoạt một lượt đối soát', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'NETWORK_ERROR'
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      await act(async () => {
        radio7.click();
      });
      expect(hookInstance.saveStatus).toBe('error');

      // Mock GET đối soát giữ pending
      const reconcileDef = deferred();
      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockReturnValue(reconcileDef.promise);

      // Double click nhanh nút Thử lại
      await act(async () => {
        hookInstance.retrySave();
        hookInstance.retrySave();
      });

      // Chỉ phát sinh đúng 1 cuộc gọi đối soát
      expect(getSpy).toHaveBeenCalledTimes(1);

      // Giải phóng đối soát
      await act(async () => {
        reconcileDef.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 7 } }
        });
      });

      expect(hookInstance.saveStatus).toBe('saved');
      expect(hookInstance.persistedDays).toBe(7);
    });

    it('4.3. GET đối soát lỗi mạng / 500 / sai hợp đồng: DỪNG LẠI và KHÔNG phát sinh PATCH', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'NETWORK_ERROR'
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      await act(async () => {
        radio7.click();
      });
      expect(hookInstance.saveStatus).toBe('error');
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 1. GET đối soát bị lỗi 500
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'SERVER_ERROR',
        message: 'Lỗi máy chủ'
      });

      await act(async () => {
        hookInstance.retrySave();
      });

      // Kiểm tra: Giữ lỗi, không được phát sinh thêm PATCH
      expect(hookInstance.saveStatus).toBe('error');
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 2. GET đối soát bị sai hợp đồng
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 'not_a_number' } }
      });

      await act(async () => {
        hookInstance.retrySave();
      });

      expect(hookInstance.saveStatus).toBe('error');
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    it('4.4. GET đối soát trả về 401: xử lý hết phiên và KHÔNG gửi PATCH tiếp', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'NETWORK_ERROR'
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      await act(async () => {
        radio7.click();
      });
      expect(hookInstance.saveStatus).toBe('error');
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // GET đối soát trả về 401
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED'
      });

      await act(async () => {
        hookInstance.retrySave();
      });

      // Phiên của user bị hủy bỏ bởi handleUnauthorized
      expect(bridge.currentUser).toBeNull();
      // Không gửi thêm PATCH nào
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    it('4.5. PATCH gặp lỗi chưa xác định khi còn draft mới: KHÔNG tự gửi PATCH nối tiếp', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      const patchDef = deferred();
      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockReturnValue(patchDef.promise);

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));
      const radio90 = Array.from(radios).find((r) => r.textContent.includes('90'));

      // 1. Bấm 7 -> PATCH(7) bay
      await act(async () => {
        radio7.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 2. Người dùng đổi sang 90 trong lúc PATCH(7) đang bay
      await act(async () => {
        radio90.click();
      });

      // 3. PATCH(7) thất bại với lỗi mạng chưa xác định
      await act(async () => {
        patchDef.resolve({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'NETWORK_ERROR'
        });
      });

      // Kiểm tra: Dừng lại với trạng thái lỗi, KHÔNG tự động phát hành PATCH(90)
      expect(hookInstance.saveStatus).toBe('error');
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(hookInstance.retentionDays).toBe(90); // draft vẫn giữ 90
    });

    it('4.6. Sau PATCH lỗi mạng: đổi sang 90 (không bấm Retry) -> đối soát trước, không PATCH 90 trước khi đối soát thành công, sau đó mới lưu 90', async () => {
      let serverDays = 30;
      vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: serverDays } }
      }));

      // Lần 1: PATCH 7 bị lỗi mạng
      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValueOnce({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'NETWORK_ERROR'
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));
      const radio90 = Array.from(radios).find((r) => r.textContent.includes('90'));

      // 1. Người dùng bấm 7 -> PATCH 7 thất bại với lỗi mạng
      await act(async () => {
        radio7.click();
      });

      expect(hookInstance.saveStatus).toBe('error');
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith({ retentionDays: 7 });

      // 2. Chuẩn bị GET đối soát dạng deferred để kiểm tra trạng thái trước khi đối soát hoàn tất
      const reconcileDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValueOnce(reconcileDef.promise);

      // Người dùng bấm 90 (KHÔNG BẤM RETRY)
      await act(async () => {
        radio90.click();
      });

      // Draft trên UI đã cập nhật thành 90
      expect(hookInstance.retentionDays).toBe(90);

      // XÁC MINH: Chưa có PATCH nào cho 90 trước khi đối soát thành công (patchSpy vẫn chỉ là 1 lần gọi cho 7)
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(hookInstance.saveStatus).toBe('saving');

      // Chuẩn bị response cho PATCH 90 sau khi đối soát xong
      patchSpy.mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 90 } }
      });

      // 3. Giải phóng GET đối soát (server trả về 7 do PATCH 7 đã ghi trước khi mất mạng)
      await act(async () => {
        reconcileDef.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 7 } }
        });
      });

      // Sau khi đối soát xong, server trả về 7 trong khi draft là 90:
      // Hook KHÔNG được báo Đã lưu cho 90 trước khi PATCH 90 xong
      // Và hook phải gửi đúng 1 PATCH cho 90 (lần gọi thứ 2 của patchSpy)
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenLastCalledWith({ retentionDays: 90 });

      // Kết thúc: đã lưu thành công giá trị 90
      expect(hookInstance.saveStatus).toBe('saved');
      expect(hookInstance.persistedDays).toBe(90);
      expect(hookInstance.retentionDays).toBe(90);
    });
  });

  describe('5. Response sai hợp đồng (Malformed Contract)', () => {
    it('5.1. Response status 200 nhưng retentionDays sai/thiếu -> KHÔNG báo Đã lưu, đặt trạng thái error', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: true,
        status: 200,
        data: {
          privacy: { retentionDays: 'wrong_string' }
        }
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      await act(async () => {
        radio7.click();
      });

      expect(hookInstance.saveStatus).toBe('error');
      expect(hookInstance.saveError?.code).toBe('INVALID_RESPONSE');
      expect(container.querySelector('.settings-status-bar').textContent).not.toContain('Đã lưu');
    });
  });

  describe('6. Phân lập tài khoản & Khóa thao tác khi đang tải (Account Switch)', () => {
    it('6.1. Response của User 1 trả về sau khi đã đổi sang User 2 không ghi đè state của User 2', async () => {
      let currentBackendDays = 30;
      vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: currentBackendDays } }
      }));

      const patchDef = deferred();
      vi.spyOn(settingsService, 'updatePrivacyService').mockReturnValue(patchDef.promise);

      await renderPrivacyPage({ initialUser: mockUser1 });

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      // User 1 bấm 7 -> request đang chờ
      await act(async () => {
        radio7.click();
      });

      expect(hookInstance.saveStatus).toBe('saving');

      // Giả lập chuyển sang User 2 có cấu hình là 90 ngày
      currentBackendDays = 90;
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser2 }
      });

      await act(async () => {
        await bridge.checkSession();
      });

      // Bây giờ response muộn của User 1 mới về
      await act(async () => {
        patchDef.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 7 } }
        });
      });

      // User 2 phải nạp đúng giá trị 90 của User 2, không bị response 7 của User 1 ghi đè
      expect(hookInstance.retentionDays).toBe(90);
      expect(hookInstance.persistedDays).toBe(90);
    });

    it('6.2. Đổi tài khoản reset saveStatus và không cho lưu khi tài khoản mới đang tải', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      vi.spyOn(settingsService, 'updatePrivacyService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 7 } }
      });

      await renderPrivacyPage({ initialUser: mockUser1 });

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      // User 1 lưu thành công 7 ngày -> saveStatus = 'saved'
      await act(async () => {
        radio7.click();
      });
      expect(hookInstance.saveStatus).toBe('saved');

      // Chuẩn bị chuyển sang User 2 với GET bị hoãn (đang tải)
      const user2GetDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValue(user2GetDef.promise);
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        data: { user: mockUser2 }
      });

      await act(async () => {
        await bridge.checkSession();
      });

      // Trạng thái lưu phải được reset về 'idle', không mang 'saved' của User 1
      expect(hookInstance.saveStatus).toBe('idle');
      expect(hookInstance.loadStatus).toBe('loading');

      // Trong lúc đang tải, cố tình gọi changeRetentionDays: không được phát sinh PATCH
      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService');
      act(() => {
        hookInstance.changeRetentionDays(90);
      });
      expect(patchSpy).not.toHaveBeenCalled();

      // Giải phóng nạp User 2
      await act(async () => {
        user2GetDef.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 30 } }
        });
      });

      expect(hookInstance.loadStatus).toBe('success');
      expect(hookInstance.retentionDays).toBe(30);
    });
  });

  describe('7. Hiển thị song ngữ và Chú thích chưa dọn dữ liệu', () => {
    it('7.1. Tiếng Việt: hiển thị tiêu đề và chú thích trung thực chưa dọn dữ liệu', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      await renderPrivacyPage({ initialLang: 'vi' });

      expect(container.textContent).toContain('Quyền riêng tư và dữ liệu');
      expect(container.textContent).toContain('Hiện chỉ lưu lựa chọn. Chức năng tự dọn dữ liệu chưa được bật.');
      expect(container.textContent).toContain('Chưa khả dụng');
    });

    it('7.2. Tiếng Anh: hiển thị song ngữ tương ứng', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: 30 } }
      });

      await renderPrivacyPage({ initialLang: 'en' });

      expect(container.textContent).toContain('Privacy & Data');
      expect(container.textContent).toContain('Currently only saves your preference. Automatic data cleanup is not yet enabled.');
      expect(container.textContent).toContain('Not available yet');
    });
  });

  describe('8. Chế độ xem trước (Preview Mode)', () => {
    it('8.1. Trong preview mode: đổi lựa chọn cập nhật draft nội bộ, không gọi API ghi và không báo Đã lưu máy chủ', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService');

      await renderPrivacyPage({ isPreview: true });

      expect(hookInstance.isPreview).toBe(true);
      expect(container.textContent).toContain('Chế độ xem trước');

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = Array.from(radios).find((r) => r.textContent.includes('7'));

      await act(async () => {
        radio7.click();
      });

      expect(hookInstance.retentionDays).toBe(7);
      expect(patchSpy).not.toHaveBeenCalled();
      expect(hookInstance.saveStatus).toBe('idle');
      expect(container.querySelector('.settings-status-bar').textContent).not.toContain('Đã lưu');
    });
  });

  describe('9. Điều hướng bàn phím (Keyboard Navigation & Focus Management)', () => {
    it('9.1. Phím mũi tên chuyển cả lựa chọn, focus (document.activeElement), aria-checked và kích hoạt tự lưu', async () => {
      let serverDays = 30;
      vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => ({
        success: true,
        status: 200,
        data: { privacy: { retentionDays: serverDays } }
      }));

      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService').mockImplementation(async ({ retentionDays }) => {
        serverDays = retentionDays;
        return {
          success: true,
          status: 200,
          data: { privacy: { retentionDays } }
        };
      });

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio7 = radios[0]; // 7 days
      const radio30 = radios[1]; // 30 days (mặc định được chọn)
      const radio90 = radios[2]; // 90 days

      expect(radio30.getAttribute('aria-checked')).toBe('true');
      expect(radio30.getAttribute('tabindex')).toBe('0');
      expect(radio7.getAttribute('aria-checked')).toBe('false');
      expect(radio7.getAttribute('tabindex')).toBe('-1');

      // Focus ban đầu vào radio đang chọn
      radio30.focus();
      expect(document.activeElement).toBe(radio30);

      // 1. Nhấn ArrowRight từ 30 -> chuyển sang 90
      await act(async () => {
        radio30.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });

      // Kiểm tra: focus chuyển sang radio90, aria-checked cập nhật, PATCH(90) được gọi
      expect(document.activeElement).toBe(radio90);
      expect(radio90.getAttribute('aria-checked')).toBe('true');
      expect(radio90.getAttribute('tabindex')).toBe('0');
      expect(radio30.getAttribute('aria-checked')).toBe('false');
      expect(patchSpy).toHaveBeenCalledWith({ retentionDays: 90 });

      // 2. Nhấn ArrowLeft từ 90 -> chuyển về 30
      await act(async () => {
        radio90.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      });

      expect(document.activeElement).toBe(radio30);
      expect(radio30.getAttribute('aria-checked')).toBe('true');
      expect(patchSpy).toHaveBeenCalledWith({ retentionDays: 30 });

      // 3. Nhấn ArrowLeft từ 30 -> chuyển sang 7
      await act(async () => {
        radio30.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      });

      expect(document.activeElement).toBe(radio7);
      expect(radio7.getAttribute('aria-checked')).toBe('true');
      expect(patchSpy).toHaveBeenCalledWith({ retentionDays: 7 });

      // 4. Nhấn ArrowUp từ 7 -> vòng quay lại 90 (wrap around)
      await act(async () => {
        radio7.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      });

      expect(document.activeElement).toBe(radio90);
      expect(radio90.getAttribute('aria-checked')).toBe('true');
      expect(patchSpy).toHaveBeenCalledWith({ retentionDays: 90 });
    });

    it('9.2. Khi trạng thái đang tải (isBlocked): phím mũi tên bị chặn, không thay đổi lựa chọn hay gửi PATCH', async () => {
      const getDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValue(getDef.promise);
      const patchSpy = vi.spyOn(settingsService, 'updatePrivacyService');

      await renderPrivacyPage();

      const radios = container.querySelectorAll('[role="radio"]');
      const radio30 = radios[1];

      expect(radio30.hasAttribute('disabled')).toBe(true);

      // Thử nhấn ArrowRight khi đang tải
      await act(async () => {
        radio30.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });

      // Không có PATCH nào được gửi, giá trị vẫn là 30
      expect(patchSpy).not.toHaveBeenCalled();
      expect(hookInstance.retentionDays).toBe(30);

      // Giải phóng loading
      await act(async () => {
        getDef.resolve({
          success: true,
          status: 200,
          data: { privacy: { retentionDays: 30 } }
        });
      });
    });
  });
});
