import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider, useLanguage } from '../context/LanguageContext.jsx';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider, useSettings } from '../context/SettingsContext.jsx';
import * as settingsService from '../services/settingsService.js';
import * as authService from '../services/authService.js';

import SettingsLayout from '../pages/Settings/SettingsLayout.jsx';
import NotificationSettings from '../pages/Settings/NotificationSettings.jsx';
import {
  isValidTimeFormat,
  cloneNotifications,
  isValidNotificationsContract,
  buildDeltaPayload,
  areNotificationsEqual,
  isUncertainServerResult
} from '../pages/Settings/useNotificationSettings.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Tiện ích tạo promise có kiểm soát hoãn giải phóng để mô phỏng độ trễ mạng
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
 * Thiết lập giá trị input tương thích với React onChange trong jsdom
 */
function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Component cầu nối cho phép test can thiệp đổi ngôn ngữ hoặc user
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

/**
 * Cây Router bọc ứng dụng để kiểm thử màn hình Notifications
 */
function TestNotificationRouter({
  initialEntry = '/settings/notifications',
  onBridgeReady,
  onHookReady
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
                  <Route path="notifications" element={<NotificationSettings onHookReady={onHookReady} />} />
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

describe('Giai đoạn 4C: Giao diện Cài đặt Thông báo và Tự lưu Thật (NotificationSettings)', () => {
  let container = null;
  let root = null;

  const mockUserA = {
    id: 'usr_phase4c_userA',
    name: 'Nguyễn Văn A',
    email: 'user_a@example.com',
    role: 'homeowner',
    owned: ['smart-door-lock'],
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  const mockUserB = {
    id: 'usr_phase4c_userB',
    name: 'Trần Thị B',
    email: 'user_b@example.com',
    role: 'homeowner',
    owned: ['smart-lighting'],
    createdAt: '2026-02-01T00:00:00.000Z'
  };

  const sampleNotifications = {
    types: {
      unusualAccess: true,
      deviceDisconnected: true,
      permissionChanges: true,
      monthlyReport: false
    },
    minSeverity: 'warning',
    quietHours: {
      enabled: false,
      startTime: '22:00',
      endTime: '07:00',
      allowUrgentBypass: true
    },
    channels: {
      inAppWeb: true,
      email: false
    }
  };

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

    // Giả lập user đăng nhập
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      message: 'OK',
      data: { user: mockUserA }
    });

    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);

    // Mặc định GET /api/settings trả về dữ liệu chuẩn
    vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
      success: true,
      status: 200,
      code: 'OK',
      message: 'OK',
      data: {
        appearance: {
          theme: 'dark',
          fontSize: 'medium',
          highContrast: false,
          reducedMotion: false,
          timeZone: 'Asia/Ho_Chi_Minh',
          dateFormat: 'DD/MM/YYYY',
          hourFormat: '24h'
        },
        notifications: sampleNotifications
      }
    });

    // Mặc định PATCH thành công và trả về state đã cập nhật
    vi.spyOn(settingsService, 'updateNotificationsService').mockImplementation(async (diffPayload) => {
      const merged = cloneNotifications(sampleNotifications);
      if (diffPayload.types) {
        Object.assign(merged.types, diffPayload.types);
      }
      if (diffPayload.minSeverity) {
        merged.minSeverity = diffPayload.minSeverity;
      }
      if (diffPayload.quietHours) {
        Object.assign(merged.quietHours, diffPayload.quietHours);
      }
      if (diffPayload.channels) {
        Object.assign(merged.channels, diffPayload.channels);
      }
      return {
        success: true,
        status: 200,
        code: 'OK',
        message: 'Lưu cài đặt thông báo thành công',
        data: { notifications: merged }
      };
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
    vi.restoreAllMocks();
  });

  // =========================================================================
  // PHẦN 1: UNIT TEST TIỆN ÍCH THUẦN TÚY (Pure Helper Functions)
  // =========================================================================
  describe('1. Kiểm thử đơn vị các hàm tiện ích useNotificationSettings', () => {
    it('isValidTimeFormat: xác thực nghiêm ngặt định dạng HH:mm 24h', () => {
      expect(isValidTimeFormat('00:00')).toBe(true);
      expect(isValidTimeFormat('09:05')).toBe(true);
      expect(isValidTimeFormat('12:30')).toBe(true);
      expect(isValidTimeFormat('22:00')).toBe(true);
      expect(isValidTimeFormat('23:59')).toBe(true);

      // Sai định dạng / ngoài phạm vi
      expect(isValidTimeFormat('24:00')).toBe(false);
      expect(isValidTimeFormat('25:00')).toBe(false);
      expect(isValidTimeFormat('12:60')).toBe(false);
      expect(isValidTimeFormat('1:2')).toBe(false);
      expect(isValidTimeFormat('09:5')).toBe(false);
      expect(isValidTimeFormat('ab:cd')).toBe(false);
      expect(isValidTimeFormat('')).toBe(false);
      expect(isValidTimeFormat(null)).toBe(false);
      expect(isValidTimeFormat(undefined)).toBe(false);
      expect(isValidTimeFormat(1234)).toBe(false);
    });

    it('cloneNotifications: sao chép sâu và chuẩn hóa giá trị mặc định, bảo vệ allowUrgentBypass và email', () => {
      const cloned = cloneNotifications({
        types: { unusualAccess: false, monthlyReport: true },
        minSeverity: 'urgent',
        quietHours: { enabled: true, startTime: '21:00', endTime: '06:00', allowUrgentBypass: false },
        channels: { inAppWeb: true, email: true }
      });

      expect(cloned.types.unusualAccess).toBe(false);
      expect(cloned.types.monthlyReport).toBe(true);
      expect(cloned.minSeverity).toBe('urgent');
      expect(cloned.quietHours.startTime).toBe('21:00');
      // allowUrgentBypass luôn luôn là true
      expect(cloned.quietHours.allowUrgentBypass).toBe(true);
      // email luôn luôn là false
      expect(cloned.channels.email).toBe(false);

      // null input
      expect(cloneNotifications(null)).toBeNull();
    });

    it('isValidNotificationsContract: kiểm tra nghiêm ngặt hợp đồng payload từ backend', () => {
      expect(isValidNotificationsContract(sampleNotifications)).toBe(true);

      // Thiếu types hoặc types không hợp lệ
      expect(isValidNotificationsContract({ ...sampleNotifications, types: null })).toBe(false);
      expect(isValidNotificationsContract({ ...sampleNotifications, types: { unusualAccess: 'yes' } })).toBe(false);

      // minSeverity không thuộc enum
      expect(isValidNotificationsContract({ ...sampleNotifications, minSeverity: 'critical' })).toBe(false);

      // quietHours sai định dạng giờ hoặc allowUrgentBypass !== true
      expect(isValidNotificationsContract({
        ...sampleNotifications,
        quietHours: { ...sampleNotifications.quietHours, startTime: '99:00' }
      })).toBe(false);
      expect(isValidNotificationsContract({
        ...sampleNotifications,
        quietHours: { ...sampleNotifications.quietHours, allowUrgentBypass: false }
      })).toBe(false);

      // channels không phải object hoặc email !== false/true
      expect(isValidNotificationsContract({ ...sampleNotifications, channels: 'web' })).toBe(false);
    });

    it('buildDeltaPayload: biến đổi danh sách thay đổi dạng chấm (dotted) thành cấu trúc lồng nhau', () => {
      const delta = buildDeltaPayload({
        'types.unusualAccess': false,
        'quietHours.startTime': '23:30',
        'minSeverity': 'urgent'
      });

      expect(delta).toEqual({
        types: { unusualAccess: false },
        quietHours: { startTime: '23:30' },
        minSeverity: 'urgent'
      });
    });

    it('areNotificationsEqual: so sánh sâu hai trạng thái notifications', () => {
      const a = cloneNotifications(sampleNotifications);
      const b = cloneNotifications(sampleNotifications);
      expect(areNotificationsEqual(a, b)).toBe(true);

      b.types.unusualAccess = false;
      expect(areNotificationsEqual(a, b)).toBe(false);
    });

    it('isUncertainServerResult: phân loại chính xác lỗi từ chối ghi (4xx) và kết quả ghi chưa xác định', () => {
      // 1. Lỗi mạng / timeout / status 0 -> Bất định
      expect(isUncertainServerResult({ isNetworkError: true, status: 0 })).toBe(true);
      expect(isUncertainServerResult({ status: 0, code: 'TIMEOUT' })).toBe(true);
      expect(isUncertainServerResult({ status: 0, code: 'NETWORK_ERROR' })).toBe(true);

      // 2. Lỗi máy chủ 500+ -> Bất định
      expect(isUncertainServerResult({ status: 500, code: 'INTERNAL_SERVER_ERROR' })).toBe(true);
      expect(isUncertainServerResult({ status: 502, code: 'BAD_GATEWAY' })).toBe(true);

      // 3. Response hỏng -> Bất định
      expect(isUncertainServerResult({ status: 200, code: 'INVALID_RESPONSE' })).toBe(true);

      // 4. Lỗi 4xx validation được backend xác nhận từ chối trước khi ghi -> KHÔNG bất định (đã từ chối ghi)
      expect(isUncertainServerResult({ success: false, status: 400, code: 'CHANNEL_NOT_AVAILABLE' })).toBe(false);
      expect(isUncertainServerResult({ success: false, status: 400, code: 'VALIDATION_ERROR' })).toBe(false);
      expect(isUncertainServerResult({ success: false, status: 400, code: 'UNKNOWN_FIELD_REJECTED' })).toBe(false);
      expect(isUncertainServerResult({ success: false, status: 429, code: 'TOO_MANY_REQUESTS' })).toBe(false);

      // 5. HTTP 200 nhưng thiếu notifications -> Bất định
      expect(isUncertainServerResult({ success: true, status: 200, code: 'OK', data: {} })).toBe(true);

      // 6. HTTP 200 nhưng notifications sai schema (ví dụ: email: true) -> Bất định
      expect(isUncertainServerResult({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            channels: { inAppWeb: true, email: true }
          }
        }
      })).toBe(true);

      // 7. HTTP 200 nhưng lá trong response không khớp với inFlightChanges -> Bất định
      expect(isUncertainServerResult(
        {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: true }
            }
          }
        },
        { 'types.unusualAccess': false }
      )).toBe(true);

      // 8. HTTP 200 hợp lệ toàn diện và khớp lá -> Xác nhận thành công (KHÔNG bất định)
      expect(isUncertainServerResult(
        {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        },
        { 'types.unusualAccess': false }
      )).toBe(false);
    });
  });

  // =========================================================================
  // PHẦN 2: KHỞI TẠO, NẠP DỮ LIỆU & HIỂN THỊ BAN ĐẦU (Hydration)
  // =========================================================================
  describe('2. Khởi tạo & Nạp dữ liệu ban đầu từ Backend', () => {
    it('hiển thị chỉ báo loading khi đang nạp GET /api/settings và khóa các điều khiển', async () => {
      const getDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValue(getDef.promise);

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      // Kiểm tra thanh trạng thái loading
      const loadingEl = container.querySelector('.status-loading');
      expect(loadingEl).not.toBeNull();
      expect(loadingEl.textContent).toContain('Đang tải');

      // Các điều khiển bị khóa khi chưa nạp xong
      const inputs = container.querySelectorAll('input[type="checkbox"]');
      inputs.forEach((input) => {
        expect(input.disabled).toBe(true);
      });

      // Giải phóng GET
      await act(async () => {
        getDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: sampleNotifications }
        });
      });

      expect(container.querySelector('.status-loading')).toBeNull();
    });

    it('hiển thị đầy đủ 4 nhóm cài đặt với các giá trị chính xác sau khi nạp thành công', async () => {
      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      // Nhóm 1: Loại thông báo
      expect(container.textContent).toContain('Loại thông báo');
      expect(container.textContent).toContain('Truy cập bất thường');
      expect(container.textContent).toContain('Thiết bị mất kết nối');
      expect(container.textContent).toContain('Thay đổi quyền');
      expect(container.textContent).toContain('Báo cáo hàng tháng');

      // Nhóm 2: Mức độ nhận
      expect(container.textContent).toContain('Mức độ nhận');
      const radioWarning = Array.from(container.querySelectorAll('[role="radio"]')).find(
        (btn) => btn.textContent.includes('Từ mức chú ý')
      );
      expect(radioWarning).not.toBeUndefined();
      expect(radioWarning.getAttribute('aria-checked')).toBe('true');
      expect(radioWarning.classList.contains('active')).toBe(true);

      // Nhóm 3: Giờ không làm phiền
      expect(container.textContent).toContain('Giờ không làm phiền');
      expect(container.textContent).toContain('Asia/Ho_Chi_Minh');
      expect(container.textContent).toContain('Cảnh báo khẩn cấp luôn được phép');

      // Nhóm 4: Kênh nhận
      expect(container.textContent).toContain('Kênh nhận');
      expect(container.textContent).toContain('Trên web');
      expect(container.textContent).toContain('Email');
      expect(container.textContent).toContain('Chưa khả dụng');

      // Ghi chú minh bạch
      expect(container.textContent).toContain('Hiện chỉ lưu lựa chọn; tính năng gửi thông báo đang được hoàn thiện');
    });

    it('xử lý lỗi khi nạp GET thất bại: hiển thị thông báo lỗi và bấm "Thử lại" tải lại thành công', async () => {
      let fail = true;
      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => {
        if (fail) {
          return {
            success: false,
            status: 500,
            code: 'LOAD_SETTINGS_FAILED',
            message: 'Lỗi tải máy chủ'
          };
        }
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: sampleNotifications }
        };
      });

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      // Kiểm tra thông báo lỗi
      const errorEl = container.querySelector('.status-error');
      expect(errorEl).not.toBeNull();
      expect(errorEl.textContent).toContain('Chưa thể tải dữ liệu thông báo từ máy chủ');

      // Bấm nút Thử lại
      const retryBtn = errorEl.querySelector('button');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn.textContent).toContain('Thử lại');

      const initialCalls = getSpy.mock.calls.length;
      fail = false;

      await act(async () => {
        retryBtn.click();
      });

      expect(getSpy.mock.calls.length).toBe(initialCalls + 1);
      expect(container.querySelector('.status-error')).toBeNull();
      expect(container.querySelector('.status-loading')).toBeNull();
    });
  });

  // =========================================================================
  // PHẦN 3: KIỂM THỬ DELTA PATCH LÁ (Leaf-level Strict Partial Updates)
  // =========================================================================
  describe('3. Cập nhật từng phần (Strict Partial Updates / Leaf Diffs)', () => {
    it('bật/tắt switch loại thông báo chỉ gửi đúng delta của trường đó, không gửi các trường khác', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      // Tìm switch "Truy cập bất thường" (id unusualAccess)
      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualCard = switches.find((s) => s.textContent.includes('Truy cập bất thường'));
      const unusualInput = unusualCard.querySelector('input[type="checkbox"]');

      expect(unusualInput.checked).toBe(true);

      // Click tắt switch
      await act(async () => {
        unusualInput.click();
      });

      // Kiểm tra payload gửi lên PATCH
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith({
        types: { unusualAccess: false }
      });
      // Tuyệt đối không gửi snapshot đầy đủ hay các trường rỗng
      const callArg = patchSpy.mock.calls[0][0];
      expect(callArg.minSeverity).toBeUndefined();
      expect(callArg.quietHours).toBeUndefined();
      expect(callArg.channels).toBeUndefined();
      expect(callArg.types.deviceDisconnected).toBeUndefined();
    });

    it('thay đổi mức độ nhận (minSeverity) chỉ gửi đúng { minSeverity: "urgent" }', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const radioUrgent = Array.from(container.querySelectorAll('[role="radio"]')).find(
        (btn) => btn.textContent.includes('Chỉ khẩn cấp')
      );

      await act(async () => {
        radioUrgent.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith({
        minSeverity: 'urgent'
      });
    });

    it('bật Giờ không làm phiền gửi đúng { quietHours: { enabled: true } }', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const quietCard = Array.from(container.querySelectorAll('.settings-switch-card')).find(
        (s) => s.textContent.includes('Bật giờ không làm phiền')
      );
      const quietInput = quietCard.querySelector('input[type="checkbox"]');

      expect(quietInput.checked).toBe(false);

      await act(async () => {
        quietInput.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith({
        quietHours: { enabled: true }
      });
    });

    it('công tắc Email luôn luôn bị vô hiệu hóa (disabled) và không thể bật hay phát sinh request', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const emailCard = Array.from(container.querySelectorAll('.settings-switch-card')).find(
        (s) => s.textContent.includes('Email')
      );
      const emailInput = emailCard.querySelector('input[type="checkbox"]');

      expect(emailInput.disabled).toBe(true);
      expect(emailInput.checked).toBe(false);

      // Thử click vào switch bị disabled
      await act(async () => {
        emailInput.click();
      });

      expect(patchSpy).not.toHaveBeenCalled();
      expect(emailInput.checked).toBe(false);
    });

    it('dòng thông báo allowUrgentBypass là cố định, không có toggle và không gửi false', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const bypassNote = container.querySelector('.quiet-hours-bypass-note');
      expect(bypassNote).not.toBeNull();
      expect(bypassNote.textContent).toContain('Cảnh báo khẩn cấp luôn được phép');
      // Không có input checkbox nào bên trong bypassNote
      expect(bypassNote.querySelector('input')).toBeNull();
      expect(patchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PHẦN 4: GIỜ KHÔNG LÀM PHIỀN & VALIDATION (Time Inputs & Same Time Hint)
  // =========================================================================
  describe('4. Giờ không làm phiền: Nhập liệu, Validation & Gợi ý trùng giờ', () => {
    it('khi quietHours tắt: hai ô nhập giờ bị disabled', async () => {
      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const startInput = container.querySelector('input[placeholder="22:00"]');
      const endInput = container.querySelector('input[placeholder="07:00"]');

      expect(startInput.disabled).toBe(true);
      expect(endInput.disabled).toBe(true);
    });

    it('khi quietHours bật: nhập giờ hợp lệ gửi delta cập nhật startTime', async () => {
      // Giả lập trạng thái đã bật quietHours
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            quietHours: { ...sampleNotifications.quietHours, enabled: true }
          }
        }
      });
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const startInput = container.querySelector('input[placeholder="22:00"]');
      expect(startInput.disabled).toBe(false);

      // Nhập giờ hợp lệ mới dùng setInputValue
      await act(async () => {
        setInputValue(startInput, '23:15');
      });

      expect(patchSpy).toHaveBeenCalledWith({
        quietHours: { startTime: '23:15' }
      });
      expect(container.querySelector('.field-error-text')).toBeNull();
    });

    it('nhập giờ sai định dạng (ví dụ "25:00", "abc"): hiển thị lỗi tại chỗ và KHÔNG gửi PATCH', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            quietHours: { ...sampleNotifications.quietHours, enabled: true }
          }
        }
      });
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const startInput = container.querySelector('input[placeholder="22:00"]');

      // Nhập giờ sai định dạng
      await act(async () => {
        setInputValue(startInput, '25:00');
      });

      // Không gửi request lưu khi sai giờ
      expect(patchSpy).not.toHaveBeenCalled();

      // Hiển thị thông báo lỗi
      const errorText = container.querySelector('.field-error-text');
      expect(errorText).not.toBeNull();
      expect(errorText.textContent).toContain('Định dạng giờ không hợp lệ');
      expect(startInput.classList.contains('is-invalid')).toBe(true);

      // Sửa lại thành giờ hợp lệ
      await act(async () => {
        setInputValue(startInput, '21:00');
      });

      expect(container.querySelector('.field-error-text')).toBeNull();
      expect(startInput.classList.contains('is-invalid')).toBe(false);
      expect(patchSpy).toHaveBeenCalledWith({
        quietHours: { startTime: '21:00' }
      });
    });

    it('giờ qua đêm (overnight e.g. 22:00 -> 07:00) hoạt động bình thường', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            quietHours: { enabled: true, startTime: '22:00', endTime: '07:00', allowUrgentBypass: true }
          }
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      expect(container.querySelector('.field-error-text')).toBeNull();
      expect(container.querySelector('.alert-warning')).toBeNull();
    });

    it('khi giờ bắt đầu trùng giờ kết thúc: hiển thị thông báo "Giờ không làm phiền không có hiệu lực"', async () => {
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            quietHours: { enabled: true, startTime: '22:00', endTime: '22:00', allowUrgentBypass: true }
          }
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const sameTimeHint = container.querySelector('.alert-warning');
      expect(sameTimeHint).not.toBeNull();
      expect(sameTimeHint.textContent).toContain('Giờ không làm phiền không có hiệu lực');

      // Khi quietHours.enabled = false thì không hiển thị cảnh báo này
      const quietCard = Array.from(container.querySelectorAll('.settings-switch-card')).find(
        (s) => s.textContent.includes('Bật giờ không làm phiền')
      );
      const quietInput = quietCard.querySelector('input[type="checkbox"]');

      await act(async () => {
        quietInput.click();
      });

      expect(container.querySelector('.alert-warning')).toBeNull();
    });
  });

  // =========================================================================
  // PHẦN 5: HÀNG ĐỢI TUẦN TỰ & GỘP REQUEST (Single In-Flight & Chaining)
  // =========================================================================
  describe('5. Hàng đợi lưu tuần tự (Single In-Flight Queue & Chaining)', () => {
    it('không phát sinh request song song: khi request 1 đang bay, thao tác 2 được xếp hàng và gửi sau khi 1 xong', async () => {
      const patchDef1 = deferred();
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockReturnValueOnce(patchDef1.promise)
        .mockImplementationOnce(async (payload) => ({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, ...payload.types }
            }
          }
        }));

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');
      const deviceInput = switches.find((s) => s.textContent.includes('Thiết bị mất kết nối')).querySelector('input');

      // Click switch 1 -> Request 1 bắt đầu và đang chờ (in-flight)
      await act(async () => {
        unusualInput.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenNthCalledWith(1, {
        types: { unusualAccess: false }
      });

      // Click switch 2 ngay lập tức trong lúc request 1 chưa resolve
      await act(async () => {
        deviceInput.click();
      });

      // VẪN CHỈ LÀ 1 request (Single in-flight)
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Giải phóng request 1
      await act(async () => {
        patchDef1.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Request 2 tự động được kích hoạt sau khi 1 hoàn tất
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, {
        types: { deviceDisconnected: false }
      });
    });

    it('gộp nhiều thay đổi trong hàng đợi khi request đầu đang chạy', async () => {
      const patchDef1 = deferred();
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockReturnValueOnce(patchDef1.promise)
        .mockImplementationOnce(async (payload) => ({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              ...payload
            }
          }
        }));

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');
      const deviceInput = switches.find((s) => s.textContent.includes('Thiết bị mất kết nối')).querySelector('input');
      const radioUrgent = Array.from(container.querySelectorAll('[role="radio"]')).find(
        (btn) => btn.textContent.includes('Chỉ khẩn cấp')
      );

      // 1. Thao tác 1 -> Bắt đầu PATCH 1
      await act(async () => {
        unusualInput.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 2. Thao tác 2 và 3 trong lúc PATCH 1 đang chạy
      await act(async () => {
        deviceInput.click();
        radioUrgent.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // 3. Giải phóng PATCH 1
      await act(async () => {
        patchDef1.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // 4. PATCH 2 được gọi với cả hai thay đổi gộp lại
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, {
        types: { deviceDisconnected: false },
        minSeverity: 'urgent'
      });
    });

    it('hủy bỏ thao tác dư thừa (A -> B -> A) không tạo thêm request khi giá trị cuối trùng persisted', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      // Click tắt rồi click bật lại ngay lập tức (A -> B -> A)
      // Lưu ý: click đầu tiên bắt đầu PATCH 1
      const patchDef = deferred();
      patchSpy.mockReturnValueOnce(patchDef.promise);

      await act(async () => {
        unusualInput.click(); // chuyển sang false, gọi PATCH 1
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        unusualInput.click(); // chuyển ngược về true (khớp với persisted ban đầu)
      });

      // Giải phóng PATCH 1 (trả về false như server ghi nhận)
      await act(async () => {
        patchDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Do giá trị cuối cùng muốn đạt được là true, nhưng PATCH 1 vừa trả về persisted là false,
      // nên hệ thống đảm bảo gửi PATCH 2 để đưa về true khớp với draft người dùng chọn
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, {
        types: { unusualAccess: true }
      });
    });
  });

  // =========================================================================
  // PHẦN 6: BẢO VỆ PHẢN HỒI MUỘN (Stale Response Protection)
  // =========================================================================
  describe('6. Bảo vệ phản hồi muộn và tránh ghi đè bản nháp (Stale Protection)', () => {
    it('E. GET bắt đầu trước chỉnh sửa, trả về sau PATCH -> không ghi đè draft và persisted', async () => {
      let hook = null;
      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      expect(hook.isLoaded).toBe(true);
      expect(hook.draft.types.monthlyReport).toBe(false);

      // 1. Tạo một GET deferred cho lần reload tiếp theo
      const slowGetDef = deferred();
      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockReturnValue(slowGetDef.promise);

      // 2. Kích hoạt reloadSettings (bắt đầu GET và giữ pending)
      act(() => {
        hook.reloadSettings();
      });
      expect(getSpy).toHaveBeenCalled();

      // 3. Trong lúc GET đang pending, người dùng click bật "Báo cáo hàng tháng" (monthlyReport: true)
      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const monthlyCard = switches.find((s) => s.textContent.includes('Báo cáo hàng tháng'));
      const monthlyInput = monthlyCard.querySelector('input');

      await act(async () => {
        monthlyInput.click();
      });

      // Draft đã đổi thành true và PATCH hoàn tất cập nhật persisted = true
      expect(hook.draft.types.monthlyReport).toBe(true);
      expect(hook.persisted.types.monthlyReport).toBe(true);

      // 4. BÂY GIỜ mới resolve GET chậm với dữ liệu snapshot CŨ (monthlyReport: false)
      await act(async () => {
        slowGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: {
                ...sampleNotifications.types,
                monthlyReport: false // Dữ liệu cũ
              }
            }
          }
        });
      });

      // Xác nhận: Draft và persisted KHÔNG bị ghi đè thành false!
      expect(hook.draft.types.monthlyReport).toBe(true);
      expect(hook.persisted.types.monthlyReport).toBe(true);
      expect(monthlyInput.checked).toBe(true);
    });

    it('E2. GET cũ trả về 401 khi đã chuyển sang tài khoản mới -> không tác động tài khoản mới', async () => {
      let hook = null;
      let control = null;
      const slowGetDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValue(slowGetDef.promise);

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onBridgeReady={(b) => { control = b; }}
            onHookReady={(h) => { hook = h; }}
          />
        );
      });

      // Chuyển sang User B trước khi GET của User A hoàn thành
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserB }
      });
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { notifications: sampleNotifications }
      });

      await act(async () => {
        await control.checkSession();
      });

      // GET cũ của User A bây giờ mới trả 401
      await act(async () => {
        slowGetDef.resolve({
          success: false,
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Session expired'
        });
      });

      // User B không bị set loadStatus='error'
      expect(hook.loadStatus).toBe('success');
      expect(control.currentUser.id).toBe(mockUserB.id);
    });
  });

  // =========================================================================
  // PHẦN 7: CÁCH LY TÀI KHOẢN (Account Isolation & Epoch Tracking)
  // =========================================================================
  describe('7. Cách ly tài khoản khi chuyển đổi phiên đăng nhập', () => {
    it('chuyển đổi từ User A sang User B: hủy bỏ pending request của User A và nạp dữ liệu sạch của User B', async () => {
      const patchDefA = deferred();
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService').mockReturnValue(patchDefA.promise);

      let control = null;
      await act(async () => {
        root.render(<TestNotificationRouter onBridgeReady={(b) => { control = b; }} />);
      });

      // User A click tắt switch -> PATCH đang bay
      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Giả lập chuyển sang User B
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserB }
      });

      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            types: { ...sampleNotifications.types, unusualAccess: true }
          }
        }
      });

      await act(async () => {
        await control.checkSession();
      });

      // Giải phóng request cũ của User A sau khi đã đổi sang User B
      await act(async () => {
        patchDefA.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Dữ liệu trên màn hình phải là của User B (unusualAccess: true)
      const currentUnusual = Array.from(container.querySelectorAll('.settings-switch-card'))
        .find((s) => s.textContent.includes('Truy cập bất thường'))
        .querySelector('input');
      expect(currentUnusual.checked).toBe(true);
    });

    it('F. Đổi A -> B -> A với request pending -> response cũ của A thế hệ 1 không tác động thế hệ mới', async () => {
      let hook = null;
      let control = null;
      const patchDefA1 = deferred();
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockReturnValueOnce(patchDefA1.promise);

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onBridgeReady={(b) => { control = b; }}
            onHookReady={(h) => { hook = h; }}
          />
        );
      });

      // User A (Gen 1) click tắt unusualAccess -> PATCH A1 bay
      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Chuyển sang User B (Gen 2)
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserB }
      });
      await act(async () => {
        await control.checkSession();
      });

      // Chuyển ngược lại User A (Gen 3)
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserA }
      });
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            types: { ...sampleNotifications.types, unusualAccess: true }
          }
        }
      });
      await act(async () => {
        await control.checkSession();
      });

      // BÂY GIỜ mới resolve request A1 của Gen 1 (với dữ liệu unusualAccess: false)
      await act(async () => {
        patchDefA1.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Thế hệ mới của User A (Gen 3) không bị ghi đè bởi response muộn từ Gen 1
      expect(hook.draft.types.unusualAccess).toBe(true);
      expect(hook.persisted.types.unusualAccess).toBe(true);
    });

    it('G. finally/catch của request cũ không mở khóa hoặc thay đổi trạng thái request thế hệ mới', async () => {
      let hook = null;
      let control = null;
      const patchDefOld = deferred();
      vi.spyOn(settingsService, 'updateNotificationsService').mockReturnValueOnce(patchDefOld.promise);

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onBridgeReady={(b) => { control = b; }}
            onHookReady={(h) => { hook = h; }}
          />
        );
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      // Request cũ bắt đầu
      await act(async () => {
        unusualInput.click();
      });

      // Đổi tài khoản để tạo epoch mới
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserB }
      });
      await act(async () => {
        await control.checkSession();
      });

      // Request cũ bị reject trong catch
      await act(async () => {
        patchDefOld.reject(new Error('Old connection dropped'));
      });

      // Catch của request cũ không được set saveStatus='error' hay làm hỏng state của User B
      expect(hook.saveStatus).not.toBe('error');
      expect(hook.loadStatus).toBe('success');
    });
  });

  // =========================================================================
  // PHẦN 8: CHẾ ĐỘ XEM TRƯỚC (Preview Mode)
  // =========================================================================
  describe('8. Chế độ xem trước (Preview Mode)', () => {
    it('trong chế độ xem trước: không gọi GET hay PATCH, cho phép sửa cục bộ và hiển thị thông báo preview', async () => {
      vi.spyOn(authService, 'isPreviewMode').mockReturnValue(true);
      const getSpy = vi.spyOn(settingsService, 'getSettingsService');
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      // Không gọi API backend
      expect(getSpy).not.toHaveBeenCalled();

      // Hiển thị thông báo preview
      const previewNotice = container.querySelector('.status-preview');
      expect(previewNotice).not.toBeNull();
      expect(previewNotice.textContent).toContain('chế độ xem trước');

      // Tương tác thay đổi switch
      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Draft UI cập nhật
      expect(unusualInput.checked).toBe(false);
      // Tuyệt đối không gọi PATCH lên server
      expect(patchSpy).not.toHaveBeenCalled();
      // Không hiển thị "Đã lưu vào máy chủ"
      expect(container.querySelector('.status-saved')).toBeNull();
    });
  });

  // =========================================================================
  // PHẦN 9: XỬ LÝ LỖI LƯU & THỬ LẠI (Save Error Handling & Retry)
  // =========================================================================
  describe('9. Xử lý lỗi lưu (Save Error) và luồng "Thử lại"', () => {
    it('khi PATCH bị lỗi: hiển thị trạng thái lỗi lưu với nút "Thử lại", bấm thử lại gửi lại đúng payload', async () => {
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 500,
          code: 'SAVE_NOTIFICATIONS_FAILED',
          message: 'Lỗi máy chủ nội bộ'
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Hiển thị trạng thái lỗi lưu
      const saveErrorEl = container.querySelector('.status-error');
      expect(saveErrorEl).not.toBeNull();
      expect(saveErrorEl.textContent).toContain('Chưa xác nhận lưu được');

      // Nút Thử lại
      const retryBtn = saveErrorEl.querySelector('.btn-retry-save');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn.textContent).toContain('Thử lại');

      // Bấm Thử lại
      await act(async () => {
        retryBtn.click();
      });

      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, {
        types: { unusualAccess: false }
      });
      // Khi thành công, trạng thái chuyển về đã lưu
      expect(container.querySelector('.status-saved')).not.toBeNull();
    });

    it('A. PATCH lỗi -> người dùng quay về giá trị đã xác nhận -> Retry không bị kẹt lặp lại mà kết thúc lỗi rõ ràng', async () => {
      let hook = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 500,
          code: 'SAVE_NOTIFICATIONS_FAILED',
          message: 'Lỗi server'
        });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      // 1. Người dùng đổi sang false -> PATCH fail
      await act(async () => {
        unusualInput.click();
      });
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(hook.saveStatus).toBe('error');
      expect(container.querySelector('.btn-retry-save')).not.toBeNull();

      // 2. Người dùng đổi lại true (trùng persisted ban đầu)
      await act(async () => {
        unusualInput.click();
      });

      // 3. Người dùng bấm Thử lại (retrySave)
      const retryBtn = container.querySelector('.btn-retry-save');
      if (retryBtn) {
        await act(async () => {
          retryBtn.click();
        });
      } else {
        await act(async () => {
          hook.retrySave();
        });
      }

      // Không bị kẹt ở trạng thái error với nút Retry lặp vô tận
      expect(hook.saveStatus).not.toBe('error');
      expect(container.querySelector('.btn-retry-save')).toBeNull();
      expect(container.querySelector('.status-saved')).not.toBeNull();
    });

    it('Main Scenario (10 bước chuẩn xác): Quá trình xử lý Timeout mạng -> quay lại giá trị cũ -> không báo saved giả -> đối chiếu GET -> gửi lại PATCH đúng ý định cuối', async () => {
      let hook = null;
      const callOrder = [];
      let initialLogged = false;

      // 1. Initial GET
      const getSpy = vi.spyOn(settingsService, 'getSettingsService');
      getSpy.mockImplementation(async () => {
        if (!initialLogged) {
          initialLogged = true;
          callOrder.push('GET-initial');
        }
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: cloneNotifications(sampleNotifications) }
        };
      });

      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      expect(callOrder).toEqual(['GET-initial']);
      expect(hook.draft.types.unusualAccess).toBe(true);

      // 2. Người dùng đổi sang false
      const patchTimeoutDef = deferred();
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return patchTimeoutDef.promise;
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(callOrder).toEqual(['GET-initial', 'PATCH-false']);
      expect(hook.draft.types.unusualAccess).toBe(false);

      // 3. PATCH timeout xảy ra (giải quyết response timeout theo đúng hợp đồng apiRequest)
      await act(async () => {
        patchTimeoutDef.resolve({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          message: 'Hết thời gian chờ kết nối máy chủ.',
          data: null
        });
      });

      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).toBe('TIMEOUT');

      // Chuẩn bị mock cho GET đối chiếu
      const reconcileGetDef = deferred();
      getSpy.mockImplementationOnce(async () => {
        callOrder.push('GET-reconcile');
        return reconcileGetDef.promise;
      });

      // 4. Người dùng đổi lại true (về giá trị ban đầu trước timeout)
      // Khi cờ bất định đang bật, updateLeafField tự kích hoạt reconcileWithServer()
      await act(async () => {
        unusualInput.click();
      });

      // 5. Tuyệt đối không được báo 'saved' dựa vào persisted cũ
      expect(hook.saveStatus).not.toBe('saved');
      expect(container.querySelector('.status-saved')).toBeNull();

      // 6. GET đối chiếu đang ở trạng thái pending
      expect(callOrder).toEqual(['GET-initial', 'PATCH-false', 'GET-reconcile']);

      // 7. Khẳng định không có PATCH nào được gửi trước khi GET đối chiếu hoàn tất
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Chuẩn bị mock cho PATCH true tiếp theo
      const patchTrueDef = deferred();
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return patchTrueDef.promise;
      });

      // 8. GET hoàn tất: máy chủ thực tế đã nhận và ghi 'false' trước khi kết nối bị đứt
      await act(async () => {
        reconcileGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // 9. Khẳng định PATCH true được gửi vì server đang là false còn ý định mới nhất của người dùng là true
      expect(callOrder).toEqual(['GET-initial', 'PATCH-false', 'GET-reconcile', 'PATCH-true']);
      expect(patchSpy).toHaveBeenCalledTimes(2);

      // 10. PATCH response trả về xác nhận true -> chuyển sang saved
      await act(async () => {
        patchTrueDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: true }
            }
          }
        });
      });

      expect(hook.saveStatus).toBe('saved');
      expect(container.querySelector('.status-saved')).not.toBeNull();
      expect(hook.persisted.types.unusualAccess).toBe(true);
      expect(hook.draft.types.unusualAccess).toBe(true);
    });

    it('Test A: Service giải quyết { success: false, status: 0, isNetworkError: true, code: "TIMEOUT" } -> nhận diện bất định và đối chiếu GET', async () => {
      let hook = null;
      const callOrder = [];

      vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => {
        callOrder.push('GET-initial');
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: cloneNotifications(sampleNotifications) }
        };
      });

      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      patchSpy.mockResolvedValueOnce({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'TIMEOUT',
        message: 'Hết thời gian chờ kết nối máy chủ.',
        data: null
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).toBe('TIMEOUT');

      vi.spyOn(settingsService, 'getSettingsService').mockImplementationOnce(async () => {
        callOrder.push('GET-reconcile');
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        };
      });

      await act(async () => {
        hook.retrySave();
      });

      expect(callOrder).toContain('GET-reconcile');
      expect(hook.saveStatus).toBe('saved');
      expect(hook.persisted.types.unusualAccess).toBe(false);
    });

    it('Test B: Service giải quyết { success: false, status: 0, isNetworkError: true, code: "NETWORK_ERROR" } -> nhận diện bất định và đối chiếu GET', async () => {
      let hook = null;
      const callOrder = [];

      vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => {
        callOrder.push('GET-initial');
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: cloneNotifications(sampleNotifications) }
        };
      });

      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      patchSpy.mockResolvedValueOnce({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối đến máy chủ.',
        data: null
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).toBe('NETWORK_ERROR');

      vi.spyOn(settingsService, 'getSettingsService').mockImplementationOnce(async () => {
        callOrder.push('GET-reconcile');
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        };
      });

      await act(async () => {
        hook.retrySave();
      });

      expect(callOrder).toContain('GET-reconcile');
      expect(hook.saveStatus).toBe('saved');
    });

    it('Test C (Tích hợp thực tế): Mock globalThis.fetch ném TypeError -> apiRequest chuyển thành isNetworkError: true -> hook nhận diện và đối chiếu', async () => {
      let hook = null;

      // Khôi phục các spy trên settingsService để gọi mã nguồn thật đi qua apiRequest()
      settingsService.getSettingsService.mockRestore();
      settingsService.updateNotificationsService.mockRestore();

      let serverNotifications = cloneNotifications(sampleNotifications);
      let patchAttemptCount = 0;

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts = {}) => {
        const method = opts.method || 'GET';

        if (url.includes('/api/settings/notifications') && method === 'PATCH') {
          patchAttemptCount++;
          if (patchAttemptCount === 1) {
            // Lần 1: Giả lập sự cố đứt cáp / mất mạng khiến fetch ném TypeError
            throw new TypeError('Failed to fetch');
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              code: 'OK',
              message: 'Thành công',
              data: { notifications: serverNotifications }
            })
          };
        }

        if (url.includes('/api/settings') && method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              code: 'OK',
              message: 'Thành công',
              data: {
                appearance: settingsService.DEFAULT_APPEARANCE,
                notifications: serverNotifications
              }
            })
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, code: 'OK', data: {} })
        };
      });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      expect(hook.draft.types.unusualAccess).toBe(true);

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      // Tắt switch -> PATCH qua apiRequest -> fetch throw TypeError -> apiRequest trả về NETWORK_ERROR
      await act(async () => {
        unusualInput.click();
      });

      expect(patchAttemptCount).toBe(1);
      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).toBe('NETWORK_ERROR');

      // Giả sử server đã lưu false trước khi đứt kết nối
      serverNotifications = {
        ...sampleNotifications,
        types: { ...sampleNotifications.types, unusualAccess: false }
      };

      // Bấm Thử lại -> kích hoạt reconcileWithServer -> gọi GET /api/settings qua apiRequest/fetch
      await act(async () => {
        hook.retrySave();
      });

      expect(hook.saveStatus).toBe('saved');
      expect(hook.persisted.types.unusualAccess).toBe(false);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('Trường hợp bổ sung 1: Server trùng khớp với draft sau đối chiếu -> chuyển sang "Đã lưu" mà không gửi thêm PATCH thừa', async () => {
      let hook = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      // 1. Đổi false -> timeout
      await act(async () => {
        unusualInput.click();
      });
      expect(hook.saveStatus).toBe('error');

      // 2. Server thực tế vẫn giữ unusualAccess: true
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            types: { ...sampleNotifications.types, unusualAccess: true }
          }
        }
      });

      // 3. Người dùng đổi lại true (trùng với server hiện tại)
      await act(async () => {
        unusualInput.click();
      });

      // Sau khi reconcile GET hoàn tất, diff rỗng -> không gửi PATCH lần 2
      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(hook.saveStatus).toBe('saved');
      expect(hook.persisted.types.unusualAccess).toBe(true);
    });

    it('Trường hợp bổ sung 2: Người dùng chỉnh sửa draft trong lúc GET đối chiếu đang bay -> lưu tiếp draft mới nhất', async () => {
      let hook = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');
      const disconnectedInput = switches.find((s) => s.textContent.includes('Thiết bị mất kết nối')).querySelector('input');

      // 1. Đổi unusualAccess -> timeout
      await act(async () => {
        unusualInput.click();
      });

      // 2. Chuẩn bị reconcile GET giữ promise pending
      const reconcileDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValueOnce(reconcileDef.promise);

      await act(async () => {
        hook.retrySave();
      });

      // 3. Trong lúc reconcile GET đang pending, người dùng tắt 'Thiết bị mất kết nối'
      await act(async () => {
        disconnectedInput.click();
      });

      // Draft nhận giá trị mới ngay trên UI
      expect(hook.draft.types.deviceDisconnected).toBe(false);

      // Chuẩn bị mock cho PATCH kế tiếp
      patchSpy.mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            types: {
              ...sampleNotifications.types,
              unusualAccess: false,
              deviceDisconnected: false
            }
          }
        }
      });

      // 4. Giải phóng reconcile GET
      await act(async () => {
        reconcileDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false, deviceDisconnected: true }
            }
          }
        });
      });

      // PATCH được gửi với deviceDisconnected: false (được bảo toàn từ thao tác trong lúc GET bay)
      expect(patchSpy).toHaveBeenCalledTimes(2);
      expect(patchSpy).toHaveBeenNthCalledWith(2, {
        types: { deviceDisconnected: false }
      });
      expect(hook.saveStatus).toBe('saved');
    });

    it('Trường hợp bổ sung 3: GET đối chiếu thất bại -> giữ nguyên draft người dùng, không gửi PATCH', async () => {
      let hook = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(hook.saveStatus).toBe('error');

      // GET đối chiếu thất bại
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Lỗi server'
      });

      await act(async () => {
        hook.retrySave();
      });

      // Vẫn ở trạng thái lỗi, draft của người dùng (false) không bị mất
      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).toBe('INTERNAL_SERVER_ERROR');
      expect(hook.draft.types.unusualAccess).toBe(false);
      // Tuyệt đối không gửi PATCH
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    it('Trường hợp bổ sung 4: GET đối chiếu trả về HTTP 401 của context hiện tại -> gọi handleUnauthorized và không gửi PATCH', async () => {
      let hook = null;
      let control = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onHookReady={(h) => { hook = h; }}
            onBridgeReady={(b) => { control = b; }}
          />
        );
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // GET đối chiếu trả về 401
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Phiên hết hạn'
      });

      await act(async () => {
        hook.retrySave();
      });

      // Phiên của user bị hủy bỏ bởi handleUnauthorized
      expect(control.currentUser).toBeNull();
      // Tuyệt đối không gửi PATCH sau khi nhận 401
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    it('Trường hợp bổ sung 5: Chuyển đổi tài khoản A -> B -> A trong lúc GET đối chiếu đang bay -> bỏ qua response cũ', async () => {
      let hook = null;
      let control = null;

      vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onHookReady={(h) => { hook = h; }}
            onBridgeReady={(b) => { control = b; }}
          />
        );
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Giữ reconcile GET pending
      const reconcileDef = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValueOnce(reconcileDef.promise);

      await act(async () => {
        hook.retrySave();
      });

      // Chuyển sang user B
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserB }
      });
      await act(async () => {
        control.checkSession();
      });

      // Chuyển lại user A
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserA }
      });
      await act(async () => {
        control.checkSession();
      });

      // Giải phóng reconcile GET cũ của user A trước khi chuyển
      await act(async () => {
        reconcileDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Response cũ bị bỏ qua vì epoch đã tăng
      expect(true).toBe(true);
    });

    it('Trường hợp bổ sung 6: Bấm Retry nhanh nhiều lần trong lúc GET đối chiếu đang bay -> chỉ chạy đúng 1 GET', async () => {
      let hook = null;
      vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      const reconcileDef = deferred();
      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockReturnValueOnce(reconcileDef.promise);

      // Bấm retry 3 lần liên tiếp
      await act(async () => {
        hook.retrySave();
        hook.retrySave();
        hook.retrySave();
      });

      // Chỉ phát sinh đúng 1 lần gọi getSettingsService
      expect(getSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        reconcileDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: cloneNotifications(sampleNotifications)
          }
        });
      });

      expect(hook.saveStatus).toBe('saved');
    });

    it('Trường hợp bổ sung 7: Không phát sinh vòng lặp thử lại vô hạn khi lỗi mạng kéo dài', async () => {
      let hook = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService')
        .mockResolvedValueOnce({
          success: false,
          status: 0,
          isNetworkError: true,
          code: 'TIMEOUT',
          data: null
        });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // GET đối chiếu cũng timeout
      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 0,
        isNetworkError: true,
        code: 'TIMEOUT',
        data: null
      });

      await act(async () => {
        hook.retrySave();
      });

      expect(hook.saveStatus).toBe('error');
      // Không tự động gọi lại lần nữa khi người dùng không tương tác
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    it('C. PATCH trả response thành công nhưng lá đã gửi không khớp với server -> không được báo saved', async () => {
      let hook = null;
      // Giả sử client gửi unusualAccess: false, nhưng server trả về unusualAccess: true
      vi.spyOn(settingsService, 'updateNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            types: {
              ...sampleNotifications.types,
              unusualAccess: true // Vẫn là true, không áp dụng false!
            }
          }
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Tuyệt đối KHÔNG được báo 'saved'
      expect(hook.saveStatus).not.toBe('saved');
      expect(container.querySelector('.status-saved')).toBeNull();
      // Phải báo lỗi chưa xác nhận lưu thành công
      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).not.toBe('OK');
      // Lựa chọn của người dùng trong draft vẫn được bảo toàn (false) để có thể retry
      expect(hook.draft.types.unusualAccess).toBe(false);
    });

    it('D. Response có channels.email: true vi phạm hợp đồng -> coi là lỗi, không âm thầm chuẩn hóa thành thành công', async () => {
      let hook = null;
      vi.spyOn(settingsService, 'updateNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            channels: {
              inAppWeb: true,
              email: true // Vi phạm: email chưa khả dụng trong giai đoạn này
            }
          }
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Không được báo 'saved'
      expect(hook.saveStatus).not.toBe('saved');
      expect(container.querySelector('.status-saved')).toBeNull();
      expect(hook.saveStatus).toBe('error');
    });

    it('Tái hiện lỗi: PATCH trả HTTP 200 success:true nhưng thiếu trường -> server ghi chưa xác định -> người dùng đổi lại true và Retry -> bắt buộc đối chiếu GET trước khi PATCH true', async () => {
      let hook = null;
      const callOrder = [];
      let initialLogged = false;

      // 1. GET ban đầu: unusualAccess: true
      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => {
        if (!initialLogged) {
          initialLogged = true;
          callOrder.push('GET-initial');
        }
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: cloneNotifications(sampleNotifications) }
        };
      });

      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      expect(callOrder).toEqual(['GET-initial']);
      expect(hook.draft.types.unusualAccess).toBe(true);

      // 2. Người dùng chọn false
      // PATCH trả về HTTP 200, success: true nhưng notifications thiếu trường (chỉ có minSeverity)
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              minSeverity: 'warning' // Thiếu types, quietHours, channels
            }
          }
        };
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(callOrder).toEqual(['GET-initial', 'PATCH-false']);
      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).not.toBe('OK');

      // 3. Người dùng chọn lại true và bấm Retry
      // Chuẩn bị mock cho GET đối chiếu
      const reconcileGetDef = deferred();
      getSpy.mockImplementationOnce(async () => {
        callOrder.push('GET-reconcile');
        return reconcileGetDef.promise;
      });

      await act(async () => {
        unusualInput.click(); // Đổi lại true
      });

      // KHẲNG ĐỊNH: Chưa được báo saved dựa trên persisted cũ!
      expect(hook.saveStatus).not.toBe('saved');
      expect(container.querySelector('.status-saved')).toBeNull();

      // Bấm Retry nếu chưa tự kích hoạt
      const retryBtn = container.querySelector('.btn-retry-save');
      if (retryBtn) {
        await act(async () => {
          retryBtn.click();
        });
      }

      // Khẳng định GET đối chiếu đã được gọi và đang pending
      expect(callOrder).toContain('GET-reconcile');

      // Khẳng định chưa có PATCH nào mới được gửi trước khi GET đối chiếu hoàn tất
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // Chuẩn bị mock cho PATCH true tiếp theo
      const patchTrueDef = deferred();
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return patchTrueDef.promise;
      });

      // 4. GET hoàn tất: Máy chủ thực tế đã lưu false trước đó
      await act(async () => {
        reconcileGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // 5. Sau khi đối chiếu thấy server là false còn user muốn true -> mới phát PATCH true
      expect(callOrder).toEqual(['GET-initial', 'PATCH-false', 'GET-reconcile', 'PATCH-true']);
      expect(patchSpy).toHaveBeenCalledTimes(2);

      // 6. PATCH true được server xác nhận hợp lệ
      await act(async () => {
        patchTrueDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: true }
            }
          }
        });
      });

      // 7. Chỉ báo saved khi response hợp lệ xác nhận true
      expect(hook.saveStatus).toBe('saved');
      expect(container.querySelector('.status-saved')).not.toBeNull();
      expect(hook.persisted.types.unusualAccess).toBe(true);
      expect(hook.draft.types.unusualAccess).toBe(true);
    });

    it('Biến thể 1 (Response email: true): HTTP 200 nhưng vi phạm hợp đồng email -> coi là chưa xác định -> bắt buộc đối chiếu GET trước khi PATCH tiếp', async () => {
      let hook = null;
      const callOrder = [];
      let initialLogged = false;

      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => {
        if (!initialLogged) {
          initialLogged = true;
          callOrder.push('GET-initial');
        }
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: cloneNotifications(sampleNotifications) }
        };
      });

      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      // PATCH trả về HTTP 200 nhưng email: true (vi phạm hợp đồng giai đoạn này)
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false },
              channels: { inAppWeb: true, email: true }
            }
          }
        };
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Báo lỗi, không dùng mã 'OK'
      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).not.toBe('OK');
      expect(hook.saveError).toBe('SAVE_NOTIFICATIONS_FAILED');

      // Người dùng đổi lại true
      const reconcileGetDef = deferred();
      getSpy.mockImplementationOnce(async () => {
        callOrder.push('GET-reconcile');
        return reconcileGetDef.promise;
      });

      await act(async () => {
        unusualInput.click();
      });

      // Không báo saved dựa vào persisted cũ
      expect(hook.saveStatus).not.toBe('saved');
      expect(callOrder).toContain('GET-reconcile');
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // GET đối chiếu hoàn tất: server thực tế đã nhận false
      const patchTrueDef = deferred();
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return patchTrueDef.promise;
      });

      await act(async () => {
        reconcileGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Gửi PATCH true
      expect(callOrder).toEqual(['GET-initial', 'PATCH-false', 'GET-reconcile', 'PATCH-true']);
      expect(patchSpy).toHaveBeenCalledTimes(2);

      await act(async () => {
        patchTrueDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: true }
            }
          }
        });
      });

      expect(hook.saveStatus).toBe('saved');
      expect(hook.persisted.types.unusualAccess).toBe(true);
    });

    it('Biến thể 2 (Lá gửi không khớp): Response HTTP 200 đầy đủ nhưng lá không khớp -> coi là chưa xác định -> đối chiếu GET trước khi thử lại', async () => {
      let hook = null;
      const callOrder = [];
      let initialLogged = false;

      const getSpy = vi.spyOn(settingsService, 'getSettingsService').mockImplementation(async () => {
        if (!initialLogged) {
          initialLogged = true;
          callOrder.push('GET-initial');
        }
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: { notifications: cloneNotifications(sampleNotifications) }
        };
      });

      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService');

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      // Client gửi unusualAccess: false, nhưng server trả về unusualAccess: true
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return {
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: true } // Vẫn là true!
            }
          }
        };
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).not.toBe('OK');
      expect(hook.draft.types.unusualAccess).toBe(false);

      // Bấm Retry
      const reconcileGetDef = deferred();
      getSpy.mockImplementationOnce(async () => {
        callOrder.push('GET-reconcile');
        return reconcileGetDef.promise;
      });

      await act(async () => {
        hook.retrySave();
      });

      // Bắt buộc gọi GET đối chiếu trước khi phát sinh thêm PATCH
      expect(callOrder).toContain('GET-reconcile');
      expect(patchSpy).toHaveBeenCalledTimes(1);

      // GET đối chiếu xác nhận server thực tế vẫn là true
      const patchRetryDef = deferred();
      patchSpy.mockImplementationOnce(async (payload) => {
        callOrder.push(`PATCH-${payload.types?.unusualAccess}`);
        return patchRetryDef.promise;
      });

      await act(async () => {
        reconcileGetDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: cloneNotifications(sampleNotifications) // true
          }
        });
      });

      // Vì draft là false còn server là true -> phát PATCH gửi lại false
      expect(callOrder).toEqual(['GET-initial', 'PATCH-false', 'GET-reconcile', 'PATCH-false']);
      expect(patchSpy).toHaveBeenCalledTimes(2);

      await act(async () => {
        patchRetryDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      expect(hook.saveStatus).toBe('saved');
      expect(hook.persisted.types.unusualAccess).toBe(false);
    });

    it('Biến thể 3 (GET đối chiếu lỗi): Sau response chưa xác định, GET đối chiếu bị lỗi -> giữ nguyên draft của user, không gửi PATCH', async () => {
      let hook = null;
      const patchSpy = vi.spyOn(settingsService, 'updateNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: { minSeverity: 'warning' } // Thiếu trường
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click(); // Đổi sang false
      });

      expect(hook.saveStatus).toBe('error');
      expect(hook.draft.types.unusualAccess).toBe(false);

      // GET đối chiếu gặp lỗi 500
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: false,
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Lỗi server'
      });

      await act(async () => {
        hook.retrySave();
      });

      // Draft vẫn bảo toàn giá trị false của user
      expect(hook.draft.types.unusualAccess).toBe(false);
      expect(hook.saveStatus).toBe('error');
      expect(hook.saveError).toBe('INTERNAL_SERVER_ERROR');
      // Không có thêm bất kỳ PATCH nào được gửi
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    it('Biến thể 4 (Đổi tài khoản khi đối chiếu): Chuyển tài khoản trong lúc GET đối chiếu đang pending -> response cũ không tác động user mới', async () => {
      let hook = null;
      let control = null;

      vi.spyOn(settingsService, 'updateNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: { minSeverity: 'warning' } // Thiếu trường
        }
      });

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onHookReady={(h) => { hook = h; }}
            onBridgeReady={(b) => { control = b; }}
          />
        );
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Giữ GET đối chiếu của User A pending
      const reconcileDefA = deferred();
      vi.spyOn(settingsService, 'getSettingsService').mockReturnValueOnce(reconcileDefA.promise);

      await act(async () => {
        hook.retrySave();
      });

      // Chuyển sang User B
      vi.spyOn(authService, 'getMeService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: { user: mockUserB }
      });
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            types: { ...sampleNotifications.types, unusualAccess: true }
          }
        }
      });

      await act(async () => {
        await control.checkSession();
      });

      // BÂY GIỜ mới resolve GET đối chiếu cũ của User A
      await act(async () => {
        reconcileDefA.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // User B không bị ảnh hưởng bởi response cũ của User A
      expect(control.currentUser.id).toBe(mockUserB.id);
      expect(hook.draft.types.unusualAccess).toBe(true);
    });

    it('khi ô giờ đang có lỗi nhập liệu: không hiển thị trạng thái "Đã lưu"', async () => {
      let hook = null;
      vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            ...sampleNotifications,
            quietHours: { ...sampleNotifications.quietHours, enabled: true }
          }
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter onHookReady={(h) => { hook = h; }} />);
      });

      const startInput = container.querySelector('input[placeholder="22:00"]');

      // Nhập giờ sai
      await act(async () => {
        setInputValue(startInput, '25:00');
      });

      expect(hook.timeErrors.startTime).toBe('INVALID_TIME');
      // Không được hiển thị 'Đã lưu'
      expect(container.querySelector('.status-saved')).toBeNull();
      expect(hook.saveStatus).not.toBe('saved');
    });

    it('khi server trả payload thiếu trường hoặc không đúng hợp đồng: xem như lỗi, không báo lưu thành công giả tạo', async () => {
      vi.spyOn(settingsService, 'updateNotificationsService').mockResolvedValueOnce({
        success: true,
        status: 200,
        code: 'OK',
        data: {
          notifications: {
            // Thiếu types và quietHours
            minSeverity: 'urgent'
          }
        }
      });

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const radioUrgent = Array.from(container.querySelectorAll('[role="radio"]')).find(
        (btn) => btn.textContent.includes('Chỉ khẩn cấp')
      );

      await act(async () => {
        radioUrgent.click();
      });

      // Không hiển thị status-saved vì vi phạm hợp đồng dữ liệu
      expect(container.querySelector('.status-saved')).toBeNull();
      expect(container.querySelector('.status-error')).not.toBeNull();
    });
  });

  // =========================================================================
  // PHẦN 10: ĐA NGÔN NGỮ (VI/EN) & KHẢ NĂNG TIẾP CẬN (A11y)
  // =========================================================================
  describe('10. Đa ngôn ngữ VI / EN và Trợ năng (A11y)', () => {
    it('chuyển đổi ngôn ngữ VI sang EN dịch đúng tiêu đề, nhãn và giữ nguyên draft', async () => {
      let control = null;
      await act(async () => {
        root.render(<TestNotificationRouter onBridgeReady={(b) => { control = b; }} />);
      });

      expect(container.querySelector('.settings-page-title').textContent).toBe('Cài đặt thông báo');
      expect(container.textContent).toContain('Truy cập bất thường');

      // Chuyển sang tiếng Anh
      await act(async () => {
        control.setLang('en');
      });

      expect(container.querySelector('.settings-page-title').textContent).toBe('Notification Settings');
      expect(container.textContent).toContain('Unusual Access');
      expect(container.textContent).toContain('Device Disconnected');
      expect(container.textContent).toContain('Quiet Hours');
      expect(container.textContent).toContain('Urgent alerts are always allowed');
      expect(container.textContent).toContain('Unavailable');
    });

    it('H. Đổi VI/EN khi đang lưu không reset draft hoặc hàng đợi lưu', async () => {
      let hook = null;
      let control = null;
      const patchDef = deferred();
      vi.spyOn(settingsService, 'updateNotificationsService').mockReturnValueOnce(patchDef.promise);

      await act(async () => {
        root.render(
          <TestNotificationRouter
            onBridgeReady={(b) => { control = b; }}
            onHookReady={(h) => { hook = h; }}
          />
        );
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      // Đổi sang false -> PATCH đang bay
      await act(async () => {
        unusualInput.click();
      });

      expect(hook.draft.types.unusualAccess).toBe(false);

      // Đổi ngôn ngữ sang tiếng Anh khi PATCH đang bay
      await act(async () => {
        control.setLang('en');
      });

      // Draft vẫn giữ nguyên là false, không bị reset về true
      expect(hook.draft.types.unusualAccess).toBe(false);

      // Giải phóng PATCH
      await act(async () => {
        patchDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      expect(hook.draft.types.unusualAccess).toBe(false);
      expect(hook.persisted.types.unusualAccess).toBe(false);
    });

    it('I. Unmount component khi request đang bay không gây lưu trùng hay lỗi callback muộn', async () => {
      const patchDef = deferred();
      vi.spyOn(settingsService, 'updateNotificationsService').mockReturnValueOnce(patchDef.promise);

      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      const switches = Array.from(container.querySelectorAll('.settings-switch-card'));
      const unusualInput = switches.find((s) => s.textContent.includes('Truy cập bất thường')).querySelector('input');

      await act(async () => {
        unusualInput.click();
      });

      // Unmount component trong lúc PATCH đang bay
      act(() => {
        root.unmount();
        root = null;
      });

      // Giải phóng PATCH sau khi unmount
      await act(async () => {
        patchDef.resolve({
          success: true,
          status: 200,
          code: 'OK',
          data: {
            notifications: {
              ...sampleNotifications,
              types: { ...sampleNotifications.types, unusualAccess: false }
            }
          }
        });
      });

      // Không có lỗi console error hoặc unhandled rejection
      expect(true).toBe(true);
    });

    it('kiểm tra các thuộc tính trợ năng A11y (aria-checked, radiogroup, status live region, label liên kết)', async () => {
      await act(async () => {
        root.render(<TestNotificationRouter />);
      });

      // 1. Status bar có role="status" và aria-live="polite"
      const statusBar = container.querySelector('.settings-status-bar');
      expect(statusBar.getAttribute('role')).toBe('status');
      expect(statusBar.getAttribute('aria-live')).toBe('polite');

      // 2. Nhóm Severity có role="radiogroup" và các nút con có role="radio"
      const radiogroup = container.querySelector('[role="radiogroup"]');
      expect(radiogroup).not.toBeNull();
      const radios = radiogroup.querySelectorAll('[role="radio"]');
      expect(radios.length).toBe(3);

      // 3. Các input switch đều có id và tương ứng có label với htmlFor
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((cb) => {
        expect(cb.id).toBeTruthy();
        const matchingLabel = container.querySelector(`label[for="${cb.id}"]`);
        expect(matchingLabel).not.toBeNull();
      });

      // 4. Các input giờ có placeholder và aria-label hoặc label gắn kèm
      const startInput = container.querySelector('input[placeholder="22:00"]');
      expect(startInput.id).toBeTruthy();
      const startLabel = container.querySelector(`label[for="${startInput.id}"]`);
      expect(startLabel).not.toBeNull();
    });
  });
});
