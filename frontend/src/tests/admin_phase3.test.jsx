import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider } from '../context/SettingsContext.jsx';
import * as adminService from '../services/adminService.js';
import * as authService from '../services/authService.js';
import AdminSettings from '../pages/Settings/AdminSettings.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Phần 3: Quản trị hệ thống (AdminSettings) - Phân quyền, Trạng thái & Nhật ký', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  const renderComponent = async (userRole = 'admin', username = 'admin') => {
    window.sessionStorage.setItem(
      'shp_auth_session',
      JSON.stringify({
        id: 'usr-1',
        username,
        name: username === 'admin' ? 'Quản trị viên' : 'Thành viên Test',
        role: userRole,
        owned: userRole === 'member' ? ['smart-plug'] : []
      })
    );
    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);

    // Mock API services
    vi.spyOn(adminService, 'getAdminUsersService').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'user-admin',
          name: 'Quản trị viên',
          email: 'admin@smarthome.local',
          role: 'admin',
          owned: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'user-quynh',
          name: 'Đỗ Thúy Quỳnh',
          email: 'quynh@smarthome.local',
          role: 'member',
          owned: ['environment-sensor'],
          createdAt: new Date().toISOString()
        },
        {
          id: 'user-guest',
          name: 'Khách',
          email: 'guest@smarthome.local',
          role: 'viewer',
          owned: [],
          createdAt: new Date().toISOString()
        }
      ]
    });

    vi.spyOn(adminService, 'getAdminSystemStatusService').mockResolvedValue({
      success: true,
      data: {
        server: {
          uptimeSeconds: 3600,
          nodeVersion: 'v20.0.0',
          platform: 'win32',
          memoryMb: 85,
          heapUsedMb: 42,
          port: 5000
        },
        database: {
          connected: true,
          name: 'smart_home_privacy',
          userCount: 6,
          sessionCount: 2,
          logCount: 15,
          notificationCount: 4
        },
        mqtt: {
          url: 'mqtt://broker.emqx.io:1883',
          connected: true,
          protocol: 'TCP / WebSocket'
        },
        devices: {
          total: 5,
          onlineCount: 5,
          list: [
            {
              id: 'environment-sensor',
              name: 'Cảm biến môi trường & Gas',
              owner: 'Quỳnh',
              online: true,
              status: 'Hoạt động tốt',
              lastSeen: new Date().toISOString()
            },
            {
              id: 'smart-door-lock',
              name: 'Khóa cửa thông minh',
              owner: 'Thành',
              online: true,
              status: 'Khóa an toàn (Pin 92%)',
              lastSeen: new Date().toISOString()
            },
            {
              id: 'smart-speaker',
              name: 'Loa thông minh',
              owner: 'Lộc',
              online: true,
              status: 'Sẵn sàng',
              lastSeen: new Date().toISOString()
            },
            {
              id: 'window-sensor',
              name: 'Cảm biến cửa sổ',
              owner: 'Minh',
              online: true,
              status: 'Cửa đang đóng',
              lastSeen: new Date().toISOString()
            },
            {
              id: 'smart-plug',
              name: 'Ổ cắm thông minh',
              owner: 'Nhật Anh',
              online: true,
              status: 'Bật (45W)',
              lastSeen: new Date().toISOString()
            }
          ]
        },
        checkedAt: new Date().toISOString()
      }
    });

    vi.spyOn(adminService, 'getAdminAuditLogsService').mockResolvedValue({
      success: true,
      data: {
        logs: [
          {
            id: 'log-1',
            action: 'LOGIN_SUCCESS',
            category: 'auth',
            severity: 'info',
            actor: 'admin',
            target: 'Dashboard',
            details: 'Đăng nhập thành công từ Chrome 127.0.0.1',
            ip: '127.0.0.1',
            createdAt: new Date().toISOString()
          },
          {
            id: 'log-2',
            action: 'DEVICE_ALERT',
            category: 'device',
            severity: 'warning',
            actor: 'environment-sensor',
            target: 'Nhà bếp',
            details: 'Gas MQ-2 vượt ngưỡng 1205 ADC',
            ip: '172.21.203.9',
            createdAt: new Date().toISOString()
          }
        ],
        pagination: { total: 2, page: 1, limit: 20, totalPages: 1 }
      }
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings/admin']}>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <DeviceProvider>
                <SettingsProvider>
                  <Routes>
                    <Route path="/settings/admin" element={<AdminSettings />} />
                  </Routes>
                </SettingsProvider>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });
  };

  it('1. Chặn người dùng không phải Admin (Viewer / Member) và hiển thị màn hình 403 Forbidden', async () => {
    await renderComponent('viewer', 'guest');

    expect(container.querySelector('.admin-forbidden-card')).not.toBeNull();
    expect(container.textContent).toContain('Không có quyền truy cập khu vực quản trị.');
    // Không hiển thị 3 tab admin
    expect(container.querySelector('.admin-tabs')).toBeNull();
  });

  it('2. Cho phép Admin truy cập và hiển thị đầy đủ 3 Tab điều hướng', async () => {
    await renderComponent('admin', 'admin');

    expect(container.querySelector('.admin-forbidden-card')).toBeNull();
    const tabsContainer = container.querySelector('.admin-tabs');
    expect(tabsContainer).not.toBeNull();

    expect(container.textContent).toContain('Người dùng & Phân quyền');
    expect(container.textContent).toContain('Trạng thái hệ thống');
    expect(container.textContent).toContain('Nhật ký & Kiểm toán');
  });

  it('3. Tab 1: Render danh sách người dùng, vai trò và thiết bị phụ trách', async () => {
    await renderComponent('admin', 'admin');

    expect(container.textContent).toContain('Quản trị viên');
    expect(container.textContent).toContain('Đỗ Thúy Quỳnh');
    expect(container.textContent).toContain('Khách');
    expect(container.textContent).toContain('admin@smarthome.local');
    expect(container.textContent).toContain('quynh@smarthome.local');

    // Nút Thêm người dùng
    const addUserBtn = container.querySelector('.admin-add-btn');
    expect(addUserBtn).not.toBeNull();
  });

  it('4. Tab 1: Mở modal Thêm người dùng mới và kiểm tra các trường nhập liệu', async () => {
    await renderComponent('admin', 'admin');

    const addUserBtn = container.querySelector('.admin-add-btn');
    await act(async () => {
      addUserBtn.click();
    });

    expect(container.querySelector('.admin-modal-backdrop')).not.toBeNull();
    expect(container.textContent).toContain('Tạo tài khoản người dùng mới');

    // Đóng modal
    const cancelBtn = container.querySelector('.modal-close-btn');
    await act(async () => {
      cancelBtn.click();
    });

    expect(container.querySelector('.admin-modal-backdrop')).toBeNull();
  });

  it('5. Tab 2: Chuyển sang tab Trạng thái hệ thống và hiển thị các số đo server, db, broker và 5 thiết bị', async () => {
    await renderComponent('admin', 'admin');

    // Bấm tab Trạng thái hệ thống
    const tabButtons = container.querySelectorAll('.admin-tab-btn');
    await act(async () => {
      tabButtons[1].click();
    });

    expect(container.textContent).toContain('Máy chủ Backend');
    expect(container.textContent).toContain('Cơ sở dữ liệu MongoDB');
    expect(container.textContent).toContain('MQTT Broker');
    expect(container.textContent).toContain('smart_home_privacy');
    expect(container.textContent).toContain('broker.emqx.io:1883');

    // Kiểm tra danh sách 5 thiết bị
    expect(container.textContent).toContain('Cảm biến môi trường');
    expect(container.textContent).toContain('Khóa cửa thông minh');
    expect(container.textContent).toContain('Loa thông minh');
    expect(container.textContent).toContain('Cảm biến cửa sổ');
    expect(container.textContent).toContain('Ổ cắm thông minh');
  });

  it('6. Tab 3: Chuyển sang tab Nhật ký & Kiểm toán, hiển thị bảng nhật ký và kích hoạt xuất CSV', async () => {
    await renderComponent('admin', 'admin');

    // Bấm tab Nhật ký & Kiểm toán
    const tabButtons = container.querySelectorAll('.admin-tab-btn');
    await act(async () => {
      tabButtons[2].click();
    });

    expect(container.textContent).toContain('LOGIN_SUCCESS');
    expect(container.textContent).toContain('DEVICE_ALERT');
    expect(container.textContent).toContain('Đăng nhập thành công từ Chrome 127.0.0.1');

    // Nút Xuất file CSV
    const exportCsvBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Xuất nhật ký CSV')
    );
    expect(exportCsvBtn).toBeDefined();

    const exportSpy = vi.spyOn(adminService, 'exportAuditLogsCSV').mockImplementation(() => true);
    await act(async () => {
      exportCsvBtn.click();
    });

    expect(exportSpy).toHaveBeenCalled();
  });
});
