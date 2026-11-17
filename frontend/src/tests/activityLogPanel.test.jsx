import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../context/LanguageContext.jsx';
import ActivityLogPanel from '../shared/components/ActivityLogPanel.jsx';
import * as accountService from '../services/accountService.js';
import * as deviceService from '../services/myDeviceService.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Nhật ký hoạt động', () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('tài khoản chỉ tải nhật ký khi người dùng mở', async () => {
    const spy = vi.spyOn(accountService, 'getAccountActivityService').mockResolvedValue({ success: true,
      data: { items: [{ id: '1', action: 'LOGIN_SUCCESS', createdAt: '2026-11-16T00:00:00.000Z' }] } });
    await act(async () => root.render(<LanguageProvider><ActivityLogPanel /></LanguageProvider>));
    expect(spy).not.toHaveBeenCalled();
    await act(async () => container.querySelector('button').click());
    expect(spy).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Đăng nhập thành công');
  });

  it('trang Nhật ký tải ngay lịch sử tài khoản khi mở từ menu', async () => {
    const spy = vi.spyOn(accountService, 'getAccountActivityService').mockResolvedValue({ success: true,
      data: { items: [{ id: '3', action: 'REGISTER', createdAt: '2026-11-16T00:00:00.000Z' }] } });
    await act(async () => root.render(<LanguageProvider><ActivityLogPanel autoLoad /></LanguageProvider>));
    expect(spy).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Đăng ký tài khoản');
  });

  it('chủ thiết bị thấy người được chia sẻ truy cập và có thể làm mới', async () => {
    const spy = vi.spyOn(deviceService, 'getDeviceActivity').mockResolvedValue({ success: true,
      data: { items: [{ id: '2', action: 'SHARED_DEVICE_VIEW', actor: { name: 'Người xem', email: 'viewer@example.com' },
        createdAt: '2026-11-16T00:00:00.000Z' }] } });
    await act(async () => root.render(<LanguageProvider><ActivityLogPanel deviceId="smart-bin" /></LanguageProvider>));
    await act(async () => container.querySelector('button').click());
    expect(spy).toHaveBeenCalledWith('smart-bin');
    expect(container.textContent).toContain('Người được chia sẻ đã mở thiết bị');
    expect(container.textContent).toContain('Người xem');
    await act(async () => container.querySelector('button').click());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
