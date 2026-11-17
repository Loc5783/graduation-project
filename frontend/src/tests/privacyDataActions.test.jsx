import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PrivacyDataActions from '../pages/Settings/PrivacyDataActions.jsx';
import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { NotificationContext } from '../context/NotificationContext.jsx';
import * as privacyDataService from '../services/privacyDataService.js';
import * as authService from '../services/authService.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('PrivacyDataActions Unit Tests - Safe state handling & 401 verification', () => {
  let container = null;
  let root = null;
  const mockHandleUnauthorized = vi.fn();
  const mockRefreshNotifications = vi.fn();

  const mockUser = {
    id: 'user_privacy_1',
    name: 'Privacy User',
    email: 'privacy@example.com',
    role: 'owner'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockHandleUnauthorized.mockClear();
    mockRefreshNotifications.mockClear();
    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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

  function renderComponent(kind) {
    return act(async () => {
      root.render(
        <LanguageProvider>
          <AuthContext.Provider value={{ currentUser: mockUser, handleUnauthorized: mockHandleUnauthorized }}>
            <NotificationContext.Provider value={{ refresh: mockRefreshNotifications }}>
              <PrivacyDataActions kind={kind} />
            </NotificationContext.Provider>
          </AuthContext.Provider>
        </LanguageProvider>
      );
    });
  }

  it('1. remove() không kẹt busy khi deleteOwnNotifications bị reject, nút xóa mở lại được', async () => {
    const deleteSpy = vi.spyOn(privacyDataService, 'deleteOwnNotifications').mockRejectedValue(new Error('Network Crash'));

    await renderComponent('delete');

    // Click nút "Xóa thông báo" ban đầu để mở confirm
    const initBtn = container.querySelector('button.btn-outline');
    expect(initBtn).not.toBeNull();
    expect(initBtn.textContent).toContain('Xóa thông báo');

    await act(async () => {
      initBtn.click();
    });

    // Màn hình confirm hiển thị
    const confirmDeleteBtn = container.querySelector('button.btn-danger');
    expect(confirmDeleteBtn).not.toBeNull();

    // Click xác nhận xóa
    await act(async () => {
      confirmDeleteBtn.click();
    });

    expect(deleteSpy).toHaveBeenCalledTimes(1);

    // Kiểm tra thông báo lỗi hiển thị
    expect(container.textContent).toContain('Thao tác thất bại. Vui lòng thử lại.');

    // Nút không bị kẹt busy = true, người dùng có thể click lại và hộp thoại xác nhận vẫn được giữ nguyên
    expect(confirmDeleteBtn.disabled).toBe(false);
    expect(container.querySelector('button.btn-danger')).not.toBeNull();
    expect(container.textContent).toContain('Bạn chắc chắn muốn xóa toàn bộ thông báo của mình?');
  });

  it('1b. remove() khi API trả về lỗi 500: giữ nguyên giao diện xác nhận để người dùng thử lại', async () => {
    const deleteSpy = vi.spyOn(privacyDataService, 'deleteOwnNotifications')
      .mockResolvedValueOnce({
        success: false,
        status: 500,
        message: 'Database error'
      })
      .mockResolvedValueOnce({
        success: true,
        data: { deletedCount: 3 }
      });

    await renderComponent('delete');

    const initBtn = container.querySelector('button.btn-outline');
    await act(async () => {
      initBtn.click();
    });

    const confirmDeleteBtn = container.querySelector('button.btn-danger');

    // Lần 1: Bấm xóa nhưng API trả về 500
    await act(async () => {
      confirmDeleteBtn.click();
    });

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Thao tác thất bại. Vui lòng thử lại.');
    // Chưa đóng confirm, người dùng có đường thử lại
    expect(container.querySelector('button.btn-danger')).not.toBeNull();

    // Lần 2: Người dùng bấm thử lại và thành công
    await act(async () => {
      confirmDeleteBtn.click();
    });

    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(mockRefreshNotifications).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Đã xóa lịch sử thông báo.');
    // Thành công thì mới đóng confirm
    expect(container.querySelector('button.btn-danger')).toBeNull();
  });

  it('2. remove() gọi handleUnauthorized khi nhận mã lỗi 401 đúng user', async () => {
    vi.spyOn(privacyDataService, 'deleteOwnNotifications').mockResolvedValue({
      success: false,
      status: 401,
      message: 'Unauthorized'
    });

    await renderComponent('delete');

    const initBtn = container.querySelector('button.btn-outline');
    await act(async () => {
      initBtn.click();
    });

    const confirmDeleteBtn = container.querySelector('button.btn-danger');
    await act(async () => {
      confirmDeleteBtn.click();
    });

    expect(mockHandleUnauthorized).toHaveBeenCalledWith('user_privacy_1');
    expect(container.textContent).toContain('Thao tác thất bại. Vui lòng thử lại.');
  });

  it('3. remove() thành công: hiển thị thông báo đã xóa và gọi refreshNotifications', async () => {
    vi.spyOn(privacyDataService, 'deleteOwnNotifications').mockResolvedValue({
      success: true,
      data: { deletedCount: 5 }
    });

    await renderComponent('delete');

    const initBtn = container.querySelector('button.btn-outline');
    await act(async () => {
      initBtn.click();
    });

    const confirmDeleteBtn = container.querySelector('button.btn-danger');
    await act(async () => {
      confirmDeleteBtn.click();
    });

    expect(mockRefreshNotifications).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Đã xóa lịch sử thông báo.');
  });

  it('4. csv() khi nhận 401 gọi handleUnauthorized và giải phóng busy', async () => {
    vi.spyOn(privacyDataService, 'downloadPrivacyCsv').mockResolvedValue({
      success: false,
      status: 401
    });

    await renderComponent('export');

    const csvBtn = container.querySelector('button.btn-primary');
    expect(csvBtn.textContent).toContain('Tải CSV');

    await act(async () => {
      csvBtn.click();
    });

    expect(mockHandleUnauthorized).toHaveBeenCalledWith('user_privacy_1');
    expect(csvBtn.disabled).toBe(false);
  });
});
