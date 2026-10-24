import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSmartDoorLock, { STALE_AFTER_MS } from './useSmartDoorLock.js';
import SmartDoorLockOwnerArea from './OwnerArea.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  static instances = [];
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = new Map();
    this.close = vi.fn();
    FakeEventSource.instances.push(this);
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  emit(name, snapshot) {
    this.listeners.get(name)?.({ data: JSON.stringify(snapshot) });
  }
}

function fixture(overrides = {}) {
  return {
    deviceId: 'smart-door-lock', brokerConnected: true, availability: 'online', fresh: true,
    receivedAt: new Date().toISOString(),
    state: {
      schemaVersion: 1, deviceId: 'smart-door-lock', kind: 'state', bootId: 'aabbccdd', sequence: 1, uptimeMs: 2000,
      data: {
        doorOpen: false, doorRaw: 1, boltCommand: 'locked', boltCommandCompleted: true,
        boltFeedbackAvailable: false, servoPwmReady: true, servoPulseUs: 1600,
        insidePressed: false, cdsRaw: 1, vibration: { installed: true, raw: 0, active: false, triggerCount: 3 },
        forcedOpen: false, heldOpen: false, pinConfigured: true, pinLockout: false,
        failedPinAttempts: 0, rfidDetected: true, rfidCards: 2,
        fingerprintOnline: true, fingerprintBusy: false, fingerprintCount: 4,
        firmware: 'smartdoor-test'
      }
    },
    events: [], ...overrides
  };
}

const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => ({ success: status === 200, data }) });

describe('Smart Door Lock authenticated live readings', () => {
  let container;
  let root;
  let current;
  function Probe() {
    current = useSmartDoorLock();
    return null;
  }
  const render = async (element = <Probe />) => {
    await act(async () => { root.render(element); });
  };
  const emit = async (name, snapshot, source = FakeEventSource.instances.at(-1)) => {
    await act(async () => { source.emit(name, snapshot); });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T06:00:00Z'));
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(fixture())));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches with session cookies but waits for a fresh live stream before showing readings', async () => {
    await render();
    expect(fetch).toHaveBeenCalledWith('/api/smart-door-lock/state', expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
    const stream = FakeEventSource.instances[0];
    expect(stream.url).toBe('/api/smart-door-lock/events');
    expect(stream.options).toEqual({ withCredentials: true });
    expect(current.snapshot.state.data.doorOpen).toBe(false);
    expect(current.live).toBe(false);
    await emit('open');
    expect(current.live).toBe(false);
    await emit('state', fixture());
    expect(current.live).toBe(true);
  });

  it('does not treat a retained state or an offline broker as live', async () => {
    await render();
    await emit('open');
    await emit('state', fixture({ fresh: false }));
    expect(current.live).toBe(false);
    await emit('state', fixture({ brokerConnected: false }));
    expect(current.live).toBe(false);
    await emit('state', fixture({ availability: 'offline' }));
    expect(current.live).toBe(false);
  });

  it('expires silent data even when the browser has not detected a broken stream', async () => {
    await render();
    await emit('open');
    await emit('state', fixture());
    expect(current.live).toBe(true);
    act(() => vi.advanceTimersByTime(STALE_AFTER_MS + 500));
    expect(current.live).toBe(false);
  });

  it('hides readings immediately on disconnect and waits for a new state after reconnecting', async () => {
    await render();
    await emit('open');
    await emit('state', fixture());
    await emit('error');
    expect(current.live).toBe(false);
    await emit('open');
    expect(current.live).toBe(false);
    await emit('state', fixture());
    expect(current.live).toBe(true);
  });

  it('does not let a slower initial fetch overwrite a streaming update', async () => {
    let resolveInitial;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }));
    await render();
    await emit('open');
    const newer = fixture();
    newer.state.sequence = 12;
    newer.state.data.doorOpen = true;
    await emit('state', newer);
    await act(async () => { resolveInitial(response(fixture())); });
    expect(current.snapshot.state.sequence).toBe(12);
    expect(current.snapshot.state.data.doorOpen).toBe(true);
  });

  it('clears data and closes the stream when the session is rejected', async () => {
    fetch.mockResolvedValueOnce(response(null, 401));
    await render(<SmartDoorLockOwnerArea />);
    expect(container.textContent).toContain('Đăng nhập để xem dữ liệu thiết bị.');
    expect(container.querySelector('[data-live="true"]')).toBeNull();
    expect(FakeEventSource.instances[0].close).toHaveBeenCalled();
    await emit('open');
    await emit('state', fixture());
    expect(container.textContent).toContain('Đăng nhập để xem dữ liệu thiết bị.');
    expect(container.textContent).not.toContain('Cửa đang đóng');
  });

  it('rechecks authentication on a streaming error without bypassing a 403', async () => {
    fetch.mockResolvedValueOnce(response(fixture())).mockResolvedValueOnce(response(null, 403));
    await render();
    await emit('open');
    await emit('state', fixture());
    await emit('error');
    expect(current.error).toBe('forbidden');
    expect(current.snapshot).toBeNull();
    expect(FakeEventSource.instances[0].close).toHaveBeenCalled();
  });

  it('immediately clears readings when the server expires the streaming session', async () => {
    await render();
    await emit('open');
    await emit('state', fixture());
    expect(current.live).toBe(true);
    await emit('session-expired');
    expect(current.live).toBe(false);
    expect(current.snapshot).toBeNull();
    expect(current.error).toBe('unauthorized');
    expect(FakeEventSource.instances[0].close).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(1);
    await emit('state', fixture());
    expect(current.snapshot).toBeNull();
  });

  it('cleans up streams, requests and watchdogs during StrictMode remounts', async () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    await render(<StrictMode><Probe /></StrictMode>);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].close).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    act(() => root.unmount());
    expect(FakeEventSource.instances[1].close).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });

  it('shows all actual sensors without disclosing credentials or claiming physical bolt confirmation', async () => {
    await render(<SmartDoorLockOwnerArea />);
    await emit('open');
    const state = fixture({ events: [{ bootId: 'aabbccdd', sequence: 2, uptimeMs: 3000, code: 'ACCESS_RFID', receivedAt: new Date().toISOString(), data: { uid: 'SECRET-CARD', pin: 'SECRET-PIN' } }] });
    state.state.data.vibration.active = null;
    await emit('state', state);
    expect(container.querySelectorAll('.sdl-sensor')).toHaveLength(6);
    expect(container.textContent).toContain('Cửa đang đóng');
    expect(container.textContent).toContain('Lệnh khóa');
    expect(container.textContent).toContain('chưa có cảm biến xác nhận chốt khóa thực tế');
    expect(container.textContent).toContain('Chưa hiệu chuẩn · LOW · 0');
    expect(container.textContent).toContain('Tín hiệu CDS chưa hiệu chuẩn');
    expect(container.textContent).toContain('Thẻ đã đăng ký: 2');
    expect(container.textContent).toContain('Vân tay đã cấp quyền: 4');
    expect(container.textContent).toContain('Mở cửa bằng thẻ');
    expect(container.textContent).not.toContain('SECRET');
    await emit('error');
    expect(container.textContent).not.toContain('Cửa đang đóng');
    expect(container.textContent).not.toContain('Thẻ đã đăng ký: 2');
    expect(container.textContent).toContain('Mở cửa bằng thẻ');
    expect(container.textContent).toContain('Lần nhận cuối');
  });
});
