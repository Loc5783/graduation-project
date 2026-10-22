import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import {
  createPrng,
  isNightTime,
  isExternalExportOrShare,
  evaluateAnomaly,
  calculateShareScore,
  generateLogs,
  enrichLogsWithPreferences,
  getActiveAlerts
} from '../shared/mockData.js';
import {
  ROLES,
  DEMO_ACCOUNTS,
  canEditDevice,
  canExportReport
} from '../shared/roles.js';
import { deviceConfigs, deviceConfigMap } from '../modules/configs.js';
import {
  DeviceProvider,
  DeviceContext,
  useDeviceContext,
  sanitizePreferences,
  buildDefaultPreferences,
  readInitialDevicePreferences,
  STORAGE_KEY_DEVICE_PREFERENCES
} from '../context/DeviceContext.jsx';
import {
  AuthProvider,
  useAuthContext,
  AuthContext,
  calculatePasswordStrength,
  restoreAuthSession,
  normalizeAuthSession,
  clearAllAuthStorages,
  safeGetItem,
  getStorage,
  STORAGE_KEY_AUTH
} from '../context/AuthContext.jsx';
import Layout from '../shared/components/Layout.jsx';

// Thiết lập môi trường act của React 18
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Lưu trữ descriptor gốc của window.localStorage và window.sessionStorage
const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(window, 'localStorage');
const originalSessionStorageDesc = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

function restoreStorageDescriptors() {
  if (originalLocalStorageDesc) {
    Object.defineProperty(window, 'localStorage', originalLocalStorageDesc);
  }
  if (originalSessionStorageDesc) {
    Object.defineProperty(window, 'sessionStorage', originalSessionStorageDesc);
  }
}

function mockLocalStorageThrowsSecurityError() {
  Object.defineProperty(window, 'localStorage', {
    get() {
      throw new DOMException('Access is denied', 'SecurityError');
    },
    configurable: true
  });
}

function mockSessionStorageThrowsSecurityError() {
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      throw new DOMException('Access is denied', 'SecurityError');
    },
    configurable: true
  });
}

describe('Giai đoạn 1: Kiểm thử nền tảng, module, dữ liệu seed, RBAC và Storage', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    restoreStorageDescriptors();
    vi.restoreAllMocks();
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
    } catch {
      // Bỏ qua nếu môi trường test không có storage
    }
  });

  describe('1. Cấu hình 5 thiết bị và người phụ trách', () => {
    it('Đảm bảo đủ 5 thiết bị với đúng 5 ID và người phụ trách theo yêu cầu', () => {
      const expectedDevices = [
        { id: 'smart-door-lock', owner: 'Thành' },
        { id: 'smart-speaker', owner: 'Lộc' },
        { id: 'window-sensor', owner: 'Minh' },
        { id: 'smart-plug', owner: 'Nhật Anh' },
        { id: 'environment-sensor', owner: 'Quỳnh' }
      ];

      expect(deviceConfigs).toHaveLength(5);
      expectedDevices.forEach(expected => {
        const config = deviceConfigMap[expected.id];
        expect(config).toBeDefined();
        expect(config.owner).toBe(expected.owner);
        expect(config.mqtt).toBeDefined();
        expect(config.mqtt.command).toBe(`home/${expected.id}/command`);
        expect(config.mqtt.status).toBe(`home/${expected.id}/status`);
        expect(config.mqtt.telemetry).toBe(`home/${expected.id}/telemetry`);
      });
    });

    it('smart-door-lock có authentication_events thay cho pin_fingerprint_meta', () => {
      const lockConfig = deviceConfigMap['smart-door-lock'];
      const pinMeta = lockConfig.dataTypes.find(dt => dt.key === 'pin_fingerprint_meta');
      const authEvents = lockConfig.dataTypes.find(dt => dt.key === 'authentication_events');

      expect(pinMeta).toBeUndefined();
      expect(authEvents).toBeDefined();
      expect(authEvents.label).toBe('Nhật ký xác thực mở khóa');
      expect(authEvents.sensitivity).toBe('high');
    });

    it('smart-plug phân biệt rõ công suất tức thời (W) và điện năng tích lũy (kWh)', () => {
      const plugConfig = deviceConfigMap['smart-plug'];
      const watt = plugConfig.dataTypes.find(dt => dt.key === 'instant_power_watt');
      const kwh = plugConfig.dataTypes.find(dt => dt.key === 'energy_consumption_kwh');

      expect(watt).toBeDefined();
      expect(watt.label).toContain('(W)');
      expect(kwh).toBeDefined();
      expect(kwh.label).toContain('(kWh)');
    });

    it('window-sensor không khẳng định giao thức Zigbee', () => {
      const windowConfig = deviceConfigMap['window-sensor'];
      const str = JSON.stringify(windowConfig).toLowerCase();
      expect(str).not.toContain('zigbee');
    });
  });

  describe('2. Tính tất định của Mock Data (Seed)', () => {
    it('Cùng cấu hình đầu vào luôn sinh ra cùng một mảng logs giống hệt nhau', () => {
      const lockConfig = deviceConfigMap['smart-door-lock'];
      const run1 = generateLogs(lockConfig, 40);
      const run2 = generateLogs(lockConfig, 40);

      expect(run1).toEqual(run2);
      expect(run1).toHaveLength(40);
    });

    it('createPrng hoạt động tất định theo chuỗi seed', () => {
      const prngA1 = createPrng('test-seed-123');
      const prngA2 = createPrng('test-seed-123');
      const prngB = createPrng('another-seed');

      const valuesA1 = [prngA1(), prngA1(), prngA1()];
      const valuesA2 = [prngA2(), prngA2(), prngA2()];
      const valuesB = [prngB(), prngB(), prngB()];

      expect(valuesA1).toEqual(valuesA2);
      expect(valuesA1).not.toEqual(valuesB);
    });
  });

  describe('3. Quy tắc giờ đêm và phát hiện bất thường', () => {
    it('Kiểm tra riêng biệt biên 04:59 (đêm) và 05:00 (ngày, không phải đêm)', () => {
      expect(isNightTime(0, 0)).toBe(true);
      expect(isNightTime(1, 30)).toBe(true);
      expect(isNightTime(4, 59)).toBe(true); // Biên đêm
      expect(isNightTime(5, 0)).toBe(false);  // Biên ngày: 05:00 KHÔNG thuộc giờ đêm
      expect(isNightTime(12, 0)).toBe(false);
      expect(isNightTime(23, 59)).toBe(false);
    });

    it('Mỗi thiết bị có chính xác 4/40 log trong khoảng 00:00 - trước 05:00 (10%)', () => {
      for (const config of deviceConfigs) {
        const logs = generateLogs(config, 40);
        expect(logs).toHaveLength(40);

        const nightLogs = logs.filter(log => isNightTime(log.hour, log.minute));
        expect(nightLogs).toHaveLength(4);

        // Kiểm tra log index 3 là biên 04:59 và log index 4 là biên 05:00
        expect(logs[3].hour).toBe(4);
        expect(logs[3].minute).toBe(59);
        expect(logs[3].anomalous).toBe(true);

        expect(logs[4].hour).toBe(5);
        expect(logs[4].minute).toBe(0);
        // Log index 4 là internal + read lúc 05:00 -> không bất thường
        expect(logs[4].anomalous).toBe(false);
      }
    });

    it('Hành vi trích xuất/chia sẻ của bên thứ ba (external export/share) được đánh dấu bất thường', () => {
      expect(isExternalExportOrShare(true, 'export')).toBe(true);
      expect(isExternalExportOrShare(true, 'share')).toBe(true);
      expect(isExternalExportOrShare(true, 'read')).toBe(false);
      expect(isExternalExportOrShare(false, 'export')).toBe(false);
      expect(isExternalExportOrShare(false, 'share')).toBe(false);
    });

    it('Lý do bất thường hỗ trợ cả đơn lẻ và kết hợp cả 2 lý do', () => {
      // Chỉ đêm
      const nightOnly = evaluateAnomaly(2, 0, false, 'read');
      expect(nightOnly.anomalous).toBe(true);
      expect(nightOnly.reason).toContain('khung giờ đêm');
      expect(nightOnly.reason).not.toContain('Bên ngoài trích xuất');

      // Chỉ external export ban ngày
      const exportOnly = evaluateAnomaly(14, 0, true, 'export');
      expect(exportOnly.anomalous).toBe(true);
      expect(exportOnly.reason).toContain('Bên ngoài trích xuất hoặc chia sẻ');
      expect(exportOnly.reason).not.toContain('khung giờ đêm');

      // Cả hai
      const both = evaluateAnomaly(3, 0, true, 'share');
      expect(both.anomalous).toBe(true);
      expect(both.reason).toContain('khung giờ đêm');
      expect(both.reason).toContain('Bên ngoài trích xuất hoặc chia sẻ');

      // Bình thường
      const normal = evaluateAnomaly(10, 0, true, 'read');
      expect(normal.anomalous).toBe(false);
      expect(normal.reason).toBe('');
    });
  });

  describe('4. Tính điểm chia sẻ dữ liệu (Share Score)', () => {
    it('Cấu hình rỗng trả về 0 điểm (không lỗi chia cho 0)', () => {
      expect(calculateShareScore([])).toBe(0);
      expect(calculateShareScore(null)).toBe(0);
    });

    it('Bật tất cả loại dữ liệu trả về 100 điểm', () => {
      const lockConfig = deviceConfigMap['smart-door-lock'];
      const allEnabled = {};
      lockConfig.dataTypes.forEach(dt => { allEnabled[dt.key] = true; });

      expect(calculateShareScore(lockConfig.dataTypes, allEnabled)).toBe(100);
    });

    it('Tắt tất cả loại dữ liệu trả về 0 điểm', () => {
      const lockConfig = deviceConfigMap['smart-door-lock'];
      const allDisabled = {};
      lockConfig.dataTypes.forEach(dt => { allDisabled[dt.key] = false; });

      expect(calculateShareScore(lockConfig.dataTypes, allDisabled)).toBe(0);
    });

    it('Tính đúng trọng số: high=3, medium=2, low=1', () => {
      const mockDataTypes = [
        { key: 'd1', sensitivity: 'high' },   // w = 3
        { key: 'd2', sensitivity: 'medium' }, // w = 2
        { key: 'd3', sensitivity: 'low' }     // w = 1
      ];
      // Tổng trọng số = 3 + 2 + 1 = 6

      // Chỉ bật high (3) -> round(100 * 3 / 6) = 50
      expect(calculateShareScore(mockDataTypes, { d1: true, d2: false, d3: false })).toBe(50);

      // Bật high (3) + medium (2) -> round(100 * 5 / 6) = 83
      expect(calculateShareScore(mockDataTypes, { d1: true, d2: true, d3: false })).toBe(83);

      // Chỉ bật low (1) -> round(100 * 1 / 6) = 17
      expect(calculateShareScore(mockDataTypes, { d1: false, d2: false, d3: true })).toBe(17);
    });
  });

  describe('5. Sửa test chuyển trạng thái log (Không dùng if, fixture chắc chắn)', () => {
    it('Chứng minh bật => allowed và có cảnh báo; tắt => blocked và không có cảnh báo; log gốc không đổi', () => {
      const lockConfig = deviceConfigMap['smart-door-lock'];
      const baseLogs = generateLogs(lockConfig, 40);

      // Bản sao sâu để kiểm chứng tính bất biến của dữ liệu gốc
      const originalCopy = JSON.parse(JSON.stringify(baseLogs));

      // Fixture chắc chắn: unlock_history là dataTypes[0] nên log đầu tiên (i = 0)
      // diễn ra lúc 01:15:12 (khung giờ đêm => anomalous: true)
      const targetLog = baseLogs.find(l => l.dataKey === 'unlock_history' && l.anomalous);

      // Assert log tồn tại (không dùng if!)
      expect(targetLog).toBeDefined();
      expect(targetLog.dataKey).toBe('unlock_history');
      expect(targetLog.anomalous).toBe(true);

      // 1. Khi bật unlock_history:
      const prefsOn = { unlock_history: true };
      const enrichedOn = enrichLogsWithPreferences(baseLogs, prefsOn);
      const alertsOn = getActiveAlerts(enrichedOn);

      const targetLogOn = enrichedOn.find(l => l.id === targetLog.id);
      expect(targetLogOn).toBeDefined();
      expect(targetLogOn.status).toBe('allowed');
      expect(alertsOn.map(a => a.id)).toContain(targetLog.id);

      // 2. Khi tắt unlock_history:
      const prefsOff = { unlock_history: false };
      const enrichedOff = enrichLogsWithPreferences(baseLogs, prefsOff);
      const alertsOff = getActiveAlerts(enrichedOff);

      const targetLogOff = enrichedOff.find(l => l.id === targetLog.id);
      expect(targetLogOff).toBeDefined();
      expect(targetLogOff.status).toBe('blocked');
      expect(alertsOff.map(a => a.id)).not.toContain(targetLog.id);

      // 3. Chứng minh log gốc KHÔNG hề bị sửa đổi
      expect(baseLogs).toEqual(originalCopy);
    });

    it('Tắt toàn bộ loại dữ liệu => không còn cảnh báo hoạt động nào', () => {
      for (const config of deviceConfigs) {
        const baseLogs = generateLogs(config, 40);
        const allOffPrefs = {};
        for (const dt of config.dataTypes) {
          allOffPrefs[dt.key] = false;
        }

        const enriched = enrichLogsWithPreferences(baseLogs, allOffPrefs);
        const alerts = getActiveAlerts(enriched);

        // Tất cả log anomalous đều bị chuyển thành 'blocked' => alerts rỗng
        expect(alerts).toHaveLength(0);
      }
    });
  });

  describe('6. Phân quyền RBAC (roles.js)', () => {
    it('Admin có toàn quyền chỉnh sửa mọi thiết bị và xuất báo cáo', () => {
      const admin = DEMO_ACCOUNTS.find(a => a.username === 'admin');
      for (const config of deviceConfigs) {
        expect(canEditDevice(admin, config.id)).toBe(true);
      }
      expect(canExportReport(admin)).toBe(true);
    });

    it('Member chỉ sửa đúng thiết bị mình sở hữu, không thể sửa thiết bị khác', () => {
      const thanh = DEMO_ACCOUNTS.find(a => a.username === 'thanh');
      expect(canEditDevice(thanh, 'smart-door-lock')).toBe(true);
      expect(canEditDevice(thanh, 'smart-speaker')).toBe(false);
      expect(canEditDevice(thanh, 'window-sensor')).toBe(false);
      expect(canEditDevice(thanh, 'smart-plug')).toBe(false);
      expect(canEditDevice(thanh, 'environment-sensor')).toBe(false);
      expect(canExportReport(thanh)).toBe(true);

      const loc = DEMO_ACCOUNTS.find(a => a.username === 'loc');
      expect(canEditDevice(loc, 'smart-speaker')).toBe(true);
      expect(canEditDevice(loc, 'smart-door-lock')).toBe(false);

      const minh = DEMO_ACCOUNTS.find(a => a.username === 'minh');
      expect(canEditDevice(minh, 'window-sensor')).toBe(true);
      expect(canEditDevice(minh, 'smart-door-lock')).toBe(false);

      const nhatanh = DEMO_ACCOUNTS.find(a => a.username === 'nhatanh');
      expect(canEditDevice(nhatanh, 'smart-plug')).toBe(true);
      expect(canEditDevice(nhatanh, 'smart-door-lock')).toBe(false);

      const quynh = DEMO_ACCOUNTS.find(a => a.username === 'quynh');
      expect(canEditDevice(quynh, 'environment-sensor')).toBe(true);
      expect(canEditDevice(quynh, 'smart-door-lock')).toBe(false);
    });

    it('Viewer (guest hoặc tài khoản mới) không được chỉnh sửa thiết bị và không được xuất báo cáo', () => {
      const guest = DEMO_ACCOUNTS.find(a => a.username === 'guest');
      for (const config of deviceConfigs) {
        expect(canEditDevice(guest, config.id)).toBe(false);
      }
      expect(canExportReport(guest)).toBe(false);

      const newViewer = { username: 'testuser', role: ROLES.VIEWER, owned: [] };
      for (const config of deviceConfigs) {
        expect(canEditDevice(newViewer, config.id)).toBe(false);
      }
      expect(canExportReport(newViewer)).toBe(false);
    });
  });

  describe('7. Chuẩn hóa phiên và chống leo thang đặc quyền trong AuthContext', () => {
    it('Guest có role admin trong storage không trở thành admin (chuẩn hóa về viewer)', () => {
      const maliciousSession = {
        username: 'guest',
        role: 'admin',
        owned: ['smart-door-lock', 'smart-speaker']
      };

      const normalized = normalizeAuthSession(maliciousSession);
      expect(normalized).not.toBeNull();
      expect(normalized.username).toBe('guest');
      expect(normalized.role).toBe(ROLES.VIEWER);
      expect(normalized.owned).toEqual([]);
    });

    it('Member có owned bị sửa được chuẩn hóa về đúng thiết bị sở hữu', () => {
      const hackedThanh = {
        username: 'thanh',
        role: 'admin',
        owned: ['smart-speaker', 'window-sensor', 'smart-plug']
      };

      const normalized = normalizeAuthSession(hackedThanh);
      expect(normalized).not.toBeNull();
      expect(normalized.username).toBe('thanh');
      expect(normalized.role).toBe(ROLES.MEMBER);
      expect(normalized.owned).toEqual(['smart-door-lock']);
    });

    it('Session sai role, sai kiểu dữ liệu, tài khoản không hợp lệ bị loại bỏ', () => {
      expect(normalizeAuthSession(null)).toBeNull();
      expect(normalizeAuthSession(undefined)).toBeNull();
      expect(normalizeAuthSession('some-string')).toBeNull();
      expect(normalizeAuthSession([1, 2, 3])).toBeNull();
      expect(normalizeAuthSession({})).toBeNull();
      expect(normalizeAuthSession({ username: 12345 })).toBeNull();
      expect(normalizeAuthSession({ username: '   ' })).toBeNull();
      expect(normalizeAuthSession({ username: 'hacker', role: 'admin' })).toBeNull();

      window.localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify({ username: 'invalid_user', role: 'admin' }));
      const restored = restoreAuthSession();
      expect(restored).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    });

    it('Tài khoản đăng ký khôi phục vẫn là viewer và owned rỗng', () => {
      const registeredUser = {
        username: 'newuser@domain.com',
        name: 'Người Dùng Thử Nghiệm',
        role: 'admin',
        owned: ['smart-door-lock'],
        isDemoRegistered: true
      };

      const normalized = normalizeAuthSession(registeredUser);
      expect(normalized).not.toBeNull();
      expect(normalized.username).toBe('newuser@domain.com');
      expect(normalized.name).toBe('Người Dùng Thử Nghiệm');
      expect(normalized.role).toBe(ROLES.VIEWER);
      expect(normalized.owned).toEqual([]);
      expect(normalized.isDemoRegistered).toBe(true);
    });

    it('Đổi tài khoản / logout không để phiên cũ xuất hiện lại', () => {
      window.localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify({ username: 'thanh' }));
      expect(restoreAuthSession()?.username).toBe('thanh');

      clearAllAuthStorages();
      expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
      expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
      expect(restoreAuthSession()).toBeNull();
    });
  });

  describe('8. Kiểm thử cấp Provider/Hook: Bảo vệ getter window.localStorage/sessionStorage ném SecurityError', () => {
    it('Getter window.localStorage ném SecurityError, sessionStorage vẫn hoạt động bình thường', () => {
      // Thiết lập sessionStorage có phiên của 'loc'
      window.sessionStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify({ username: 'loc' }));

      // Giả lập window.localStorage getter ném SecurityError
      mockLocalStorageThrowsSecurityError();

      // Kiểm tra hàm getStorage('local') bắt lỗi an toàn và trả về null
      expect(getStorage('local')).toBeNull();
      expect(safeGetItem('local', STORAGE_KEY_AUTH)).toBeNull();

      // restoreAuthSession không bị crash và tiếp tục đọc thành công từ sessionStorage
      const session = restoreAuthSession();
      expect(session).not.toBeNull();
      expect(session.username).toBe('loc');
      expect(session.role).toBe(ROLES.MEMBER);
      expect(session.owned).toEqual(['smart-speaker']);

      // clearAllAuthStorages không bị crash và xóa thành công sessionStorage
      const clearResult = clearAllAuthStorages();
      expect(clearResult.localRemoved).toBe(false);
      expect(clearResult.sessionRemoved).toBe(true);

      // Khôi phục localStorage để kiểm tra sessionStorage đã bị xóa
      restoreStorageDescriptors();
      expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    });

    it('Getter window.sessionStorage ném SecurityError, localStorage vẫn hoạt động bình thường', () => {
      // Lưu phiên vào localStorage
      window.localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify({ username: 'thanh' }));

      // Giả lập window.sessionStorage getter ném SecurityError
      mockSessionStorageThrowsSecurityError();

      expect(getStorage('session')).toBeNull();
      expect(safeGetItem('session', STORAGE_KEY_AUTH)).toBeNull();

      // restoreAuthSession vẫn đọc được từ localStorage
      const session = restoreAuthSession();
      expect(session).not.toBeNull();
      expect(session.username).toBe('thanh');
      expect(session.role).toBe(ROLES.MEMBER);

      // clearAllAuthStorages xóa thành công localStorage
      const clearResult = clearAllAuthStorages();
      expect(clearResult.localRemoved).toBe(true);
      expect(clearResult.sessionRemoved).toBe(false);

      restoreStorageDescriptors();
      expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    });

    it('AuthProvider: Login, Register, Logout không crash khi localStorage ném SecurityError và ghi nhận giới hạn trung thực', async () => {
      mockLocalStorageThrowsSecurityError();

      let authState = null;
      function TestAuthConsumer() {
        const auth = useAuthContext();
        authState = auth;
        return <div data-testid="auth-state">{auth.currentUser?.username || 'none'}</div>;
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={true}>
            <TestAuthConsumer />
          </AuthProvider>
        );
      });

      // 1. Login khi localStorage bị chặn
      await act(async () => {
        await authState.login({ username: 'admin', password: '123', remember: true });
      });

      expect(authState.currentUser).not.toBeNull();
      expect(authState.currentUser.username).toBe('admin');
      expect(authState.isStorageAvailable).toBe(false);
      expect(authState.storageNotice).toContain('quyền truy cập bị chặn');

      // 2. Logout khi localStorage bị chặn -> báo trung thực không thể xóa bền vững
      await act(async () => {
        authState.logout();
      });

      expect(authState.currentUser).toBeNull();
      expect(authState.storageNotice).toContain('không thể xóa dữ liệu trên localStorage do quyền truy cập bị chặn');

      // 3. Register khi localStorage bị chặn
      await act(async () => {
        await authState.register({
          fullName: 'Khách Test',
          email: 'test@example.com',
          password: 'password123',
          confirmPassword: 'password123',
          agreed: true
        });
      });

      expect(authState.currentUser).not.toBeNull();
      expect(authState.currentUser.username).toBe('test@example.com');
      expect(authState.currentUser.role).toBe(ROLES.VIEWER);
    });

    it('AuthProvider.logout (Tổ hợp 1: cả hai kho thành công) -> storageNotice rỗng, phiên kết thúc', async () => {
      let authState = null;
      function TestAuthConsumer() {
        authState = useAuthContext();
        return <div>{authState.currentUser?.username || 'none'}</div>;
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={true}>
            <TestAuthConsumer />
          </AuthProvider>
        );
      });

      await act(async () => {
        await authState.login({ username: 'admin', password: '123' });
      });
      expect(authState.currentUser?.username).toBe('admin');

      await act(async () => {
        authState.logout();
      });

      expect(authState.currentUser).toBeNull();
      expect(authState.storageNotice).toBe('');
    });

    it('AuthProvider.logout (Tổ hợp 2: chỉ localStorage lỗi) -> thông báo lỗi đúng kho localStorage', async () => {
      mockLocalStorageThrowsSecurityError();

      let authState = null;
      function TestAuthConsumer() {
        authState = useAuthContext();
        return <div>{authState.currentUser?.username || 'none'}</div>;
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={true}>
            <TestAuthConsumer />
          </AuthProvider>
        );
      });

      await act(async () => {
        await authState.login({ username: 'thanh', password: '123', remember: false });
      });

      await act(async () => {
        authState.logout();
      });

      expect(authState.currentUser).toBeNull();
      expect(authState.storageNotice).toBe('Đã kết thúc phiên, nhưng không thể xóa dữ liệu trên localStorage do quyền truy cập bị chặn.');
    });

    it('AuthProvider.logout (Tổ hợp 3: chỉ sessionStorage lỗi) -> thông báo lỗi đúng kho sessionStorage', async () => {
      mockSessionStorageThrowsSecurityError();

      let authState = null;
      function TestAuthConsumer() {
        authState = useAuthContext();
        return <div>{authState.currentUser?.username || 'none'}</div>;
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={true}>
            <TestAuthConsumer />
          </AuthProvider>
        );
      });

      await act(async () => {
        await authState.login({ username: 'minh', password: '123', remember: true });
      });

      await act(async () => {
        authState.logout();
      });

      expect(authState.currentUser).toBeNull();
      expect(authState.storageNotice).toBe('Đã kết thúc phiên, nhưng không thể xóa dữ liệu trên sessionStorage do quyền truy cập bị chặn.');
    });

    it('AuthProvider.logout (Tổ hợp 4: cả hai kho đều lỗi) -> thông báo trình duyệt từ chối cả 2 kho, không tuyên bố xóa bền vững', async () => {
      mockLocalStorageThrowsSecurityError();
      mockSessionStorageThrowsSecurityError();

      let authState = null;
      function TestAuthConsumer() {
        authState = useAuthContext();
        return <div>{authState.currentUser?.username || 'none'}</div>;
      }

      await act(async () => {
        root.render(
          <AuthProvider enableDemoAuth={true}>
            <TestAuthConsumer />
          </AuthProvider>
        );
      });

      await act(async () => {
        await authState.login({ username: 'guest', password: '123' });
      });

      await act(async () => {
        authState.logout();
      });

      expect(authState.currentUser).toBeNull();
      expect(authState.storageNotice).toBe('Trình duyệt từ chối quyền truy cập bộ nhớ lưu trữ; không thể bảo đảm đã xóa phiên bền vững trên thiết bị.');
    });
  });

  describe('9. Kiểm thử cấp Provider/Hook: DeviceProvider xử lý JSON hỏng và lỗi ghi storage', () => {
    it('DeviceProvider gặp JSON hỏng: preferences về mặc định và storageNotice thông báo chính xác', async () => {
      // Đặt dữ liệu JSON hỏng vào localStorage
      window.localStorage.setItem(STORAGE_KEY_DEVICE_PREFERENCES, '{broken');

      // 1. Kiểm tra hàm đọc thuần (pure read)
      const initial = readInitialDevicePreferences();
      expect(initial.preferences).toEqual(buildDefaultPreferences());
      expect(initial.isStorageAvailable).toBe(true);
      expect(initial.storageNotice).toBe('Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.');

      // 2. Mount DeviceProvider thật trong DOM
      let capturedDevice = null;
      function TestDeviceConsumer() {
        const deviceData = useDeviceContext();
        capturedDevice = deviceData;
        return (
          <div>
            <div data-testid="notice">{deviceData.storageNotice}</div>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <DeviceProvider>
            <TestDeviceConsumer />
          </DeviceProvider>
        );
      });

      // Kiểm tra state bên trong Provider
      expect(capturedDevice).not.toBeNull();
      expect(capturedDevice.preferences).toEqual(buildDefaultPreferences());
      expect(capturedDevice.storageNotice).toBe('Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.');

      // Kiểm tra văn bản render trong DOM
      expect(container.querySelector('[data-testid="notice"]').textContent).toBe(
        'Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.'
      );
    });

    it('DeviceProvider bọc trong React.StrictMode: JSON hỏng được khôi phục, storageNotice tồn tại sau mount và đổi lựa chọn tiếp theo được lưu đúng', async () => {
      // Đặt dữ liệu JSON hỏng vào localStorage
      window.localStorage.setItem(STORAGE_KEY_DEVICE_PREFERENCES, '{broken');

      let capturedDevice = null;
      function TestDeviceConsumer() {
        const deviceData = useDeviceContext();
        capturedDevice = deviceData;
        return (
          <div>
            <div data-testid="strict-notice">{deviceData.storageNotice}</div>
          </div>
        );
      }

      // Mount bên trong React.StrictMode
      await act(async () => {
        root.render(
          <StrictMode>
            <DeviceProvider>
              <TestDeviceConsumer />
            </DeviceProvider>
          </StrictMode>
        );
      });

      // 1. Sau khi hoàn tất mount trong StrictMode: preferences về mặc định và storageNotice vẫn nguyên vẹn
      expect(capturedDevice).not.toBeNull();
      expect(capturedDevice.preferences).toEqual(buildDefaultPreferences());
      expect(capturedDevice.storageNotice).toBe('Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.');
      expect(container.querySelector('[data-testid="strict-notice"]').textContent).toBe(
        'Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.'
      );

      // 2. Khi người dùng thực sự thay đổi lựa chọn tiếp theo:
      await act(async () => {
        capturedDevice.setDataTypeEnabled('smart-door-lock', 'unlock_history', false);
      });

      // State trong context cập nhật thành false và thông báo cũ được xóa
      expect(capturedDevice.preferences['smart-door-lock']['unlock_history']).toBe(false);
      expect(capturedDevice.storageNotice).toBe('');
      expect(container.querySelector('[data-testid="strict-notice"]').textContent).toBe('');

      // Dữ liệu được ghi đúng vào localStorage
      const storedAfter = JSON.parse(window.localStorage.getItem(STORAGE_KEY_DEVICE_PREFERENCES));
      expect(storedAfter['smart-door-lock']['unlock_history']).toBe(false);
    });

    it('DeviceProvider gặp storage không ghi được: vẫn thay đổi được preferences trong bộ nhớ và báo không lưu được', async () => {
      // Khởi tạo bình thường với defaults
      let capturedDevice = null;
      function TestDeviceConsumer() {
        const deviceData = useDeviceContext();
        capturedDevice = deviceData;
        return (
          <div>
            <div data-testid="notice">{deviceData.storageNotice}</div>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <DeviceProvider>
            <TestDeviceConsumer />
          </DeviceProvider>
        );
      });

      expect(capturedDevice.preferences['smart-door-lock']['unlock_history']).toBe(true);

      // Giả lập Storage.prototype.setItem ném lỗi QuotaExceededError khi cập nhật
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      // Thực hiện đổi công tắc
      await act(async () => {
        capturedDevice.setDataTypeEnabled('smart-door-lock', 'unlock_history', false);
      });

      // Khẳng định: Trong bộ nhớ RAM vẫn cập nhật thành công thành false!
      expect(capturedDevice.preferences['smart-door-lock']['unlock_history']).toBe(false);
      // Khẳng định: Provider phát hiện lỗi ghi và báo cho người dùng
      expect(capturedDevice.isStorageAvailable).toBe(false);
      expect(capturedDevice.storageNotice).toContain('Bộ nhớ trình duyệt không khả dụng');
    });

    it('DeviceContext: sanitizePreferences xử lý JSON hỏng, mảng rác hoặc key lạ', () => {
      const defaults = buildDefaultPreferences();
      expect(sanitizePreferences(null)).toEqual(defaults);
      expect(sanitizePreferences('invalid-string')).toEqual(defaults);
      expect(sanitizePreferences([1, 2, 3])).toEqual(defaults);

      const corruptedInput = {
        'unknown-device': { some_key: true },
        'smart-door-lock': {
          unlock_history: false,
          hacker_injected_key: true
        }
      };

      const sanitized = sanitizePreferences(corruptedInput);
      expect(sanitized['unknown-device']).toBeUndefined();
      expect(sanitized['smart-door-lock'].unlock_history).toBe(false);
      expect(sanitized['smart-door-lock'].hacker_injected_key).toBeUndefined();
      expect(sanitized['smart-door-lock'].authentication_events).toBe(true);
    });

    it('Thông báo lỗi lưu phiên AuthContext và DeviceContext được render trên giao diện chung (Layout)', async () => {
      const mockAuthValue = {
        currentUser: { username: 'admin', name: 'Quản trị viên', role: ROLES.ADMIN, owned: [] },
        storageNotice: 'Phiên làm việc chỉ lưu tạm trong bộ nhớ do storage bị chặn.'
      };
      const mockDeviceValue = {
        preferences: {},
        storageNotice: 'Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.'
      };

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/overview']}>
            <AuthContext.Provider value={mockAuthValue}>
              <DeviceContext.Provider value={mockDeviceValue}>
                <Layout />
              </DeviceContext.Provider>
            </AuthContext.Provider>
          </MemoryRouter>
        );
      });

      // Kiểm tra sự xuất hiện của thông báo phiên làm việc trên giao diện chung
      const authNoticeElement = container.querySelector('.auth-storage-notice');
      expect(authNoticeElement).not.toBeNull();
      expect(authNoticeElement.textContent).toContain('Phiên làm việc chỉ lưu tạm trong bộ nhớ do storage bị chặn.');

      // Kiểm tra sự xuất hiện của thông báo bộ nhớ cấu hình trên giao diện chung
      const deviceNoticeElement = container.querySelector('.device-storage-notice');
      expect(deviceNoticeElement).not.toBeNull();
      expect(deviceNoticeElement.textContent).toContain('Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.');
    });
  });

  describe('10. Quy tắc đăng ký demo và đo độ mạnh mật khẩu', () => {
    it('calculatePasswordStrength tính đúng 4 mức', () => {
      expect(calculatePasswordStrength('')).toBe(0);
      expect(calculatePasswordStrength('12345')).toBe(1); // Dưới 8 ký tự
      expect(calculatePasswordStrength('abcdefgh')).toBe(1); // 8 ký tự nhưng chỉ 1 loại
      expect(calculatePasswordStrength('Abcdefgh')).toBe(2); // 8 ký tự, 2 loại (hoa, thường)
      expect(calculatePasswordStrength('Abc1234567')).toBe(3); // 10 ký tự, 3 loại
      expect(calculatePasswordStrength('Abc@12345678')).toBe(4); // 12 ký tự, 4 loại
    });
  });
});
