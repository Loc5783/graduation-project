import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { LiveDeviceProvider } from '../context/LiveDeviceContext.jsx';
import LiveDevicePanel from '../shared/components/LiveDevicePanel.jsx';

const auth = vi.hoisted(() => ({ currentUser: { id: 'A' }, handleUnauthorized: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuthContext: () => auth }));
vi.mock('../services/authService.js', () => ({ apiRequest: vi.fn(), isPreviewMode: () => false }));
import { apiRequest } from '../services/authService.js';

describe('Real telemetry presentation and lifecycle', () => {
  let host, root;
  beforeEach(() => {
    vi.useFakeTimers(); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    auth.currentUser = { id: 'A' }; auth.handleUnauthorized.mockClear(); apiRequest.mockReset();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
  const render = () => root.render(<LiveDeviceProvider><LiveDevicePanel deviceId="environment-sensor" /></LiveDeviceProvider>);
  const response = value => ({ success: true, data: { devices: [{ id: 'environment-sensor', brokerConnected: true,
    fresh: true, ageSeconds: 1, data: { temperature: value, gasRaw: 326 } }] } });
  it('shows actual readings and marks them stale when refresh fails', async () => {
    apiRequest.mockResolvedValueOnce(response(28.9)).mockResolvedValue({ success: false, status: 503 });
    await act(async () => render());
    expect(host.textContent).toContain('28.9'); expect(host.querySelector('.is-live')).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(host.querySelector('.is-live')).toBeNull(); expect(host.textContent).toContain('28.9');
  });
  it('does not poll before login', async () => {
    auth.currentUser = null; await act(async () => render());
    expect(apiRequest).not.toHaveBeenCalled(); expect(host.querySelector('.is-live')).toBeNull();
  });
  it('ignores old-account responses, including late 401', async () => {
    let resolveA;
    apiRequest.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; })).mockResolvedValue(response(24));
    await act(async () => render());
    auth.currentUser = { id: 'B' }; await act(async () => render());
    await act(async () => resolveA({ success: false, status: 401 }));
    expect(auth.handleUnauthorized).not.toHaveBeenCalled(); expect(host.textContent).toContain('24');
  });
  it('ages telemetry even while the next HTTP request is pending', async () => {
    apiRequest.mockResolvedValueOnce(response(28)).mockImplementation(() => new Promise(() => {}));
    await act(async () => render());
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(host.querySelector('.is-live')).toBeNull();
  });
});
