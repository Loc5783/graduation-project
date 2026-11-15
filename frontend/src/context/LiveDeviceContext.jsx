import { createContext, useContext, useEffect, useState } from 'react';
import { useAuthContext } from './AuthContext.jsx';
import { apiRequest, isPreviewMode } from '../services/authService.js';

const EMPTY = { devices: [], loading: false, error: false, receivedAt: null };
const LiveDeviceContext = createContext(EMPTY);
export const useLiveDevices = () => useContext(LiveDeviceContext);

export function LiveDeviceProvider({ children }) {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const userId = currentUser?.id;
  const [snapshot, setSnapshot] = useState({ ...EMPTY, userId: null });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!userId || isPreviewMode()) return;
    let active = true;
    let timer;
    const controller = new AbortController();
    setSnapshot({ ...EMPTY, userId, loading: true });
    const poll = async () => {
      try {
        const res = await apiRequest('/api/live-devices', { signal: controller.signal });
        if (!active) return;
        if (res.status === 401) { handleUnauthorized(userId); return; }
        const devices = res.data?.devices;
        if (!res.success || !Array.isArray(devices) || !devices.every(d => d && typeof d.id === 'string' &&
          typeof d.fresh === 'boolean' && typeof d.brokerConnected === 'boolean' &&
          (d.ageSeconds === null || (typeof d.ageSeconds === 'number' && Number.isFinite(d.ageSeconds) && d.ageSeconds >= 0)) &&
          (d.data === null || (typeof d.data === 'object' && !Array.isArray(d.data))))) {
          setSnapshot(prev => ({ ...prev, loading: false, error: true }));
        } else {
          setSnapshot({ userId, devices, receivedAt: Date.now(), loading: false, error: false });
        }
      } catch {
        if (active) setSnapshot(prev => ({ ...prev, loading: false, error: true }));
      }
      if (active) timer = setTimeout(poll, 3000);
    };
    void poll();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; controller.abort(); clearTimeout(timer); clearInterval(clock); };
  }, [userId, handleUnauthorized]);
  const current = snapshot.userId === userId && userId && !isPreviewMode() ? snapshot : EMPTY;
  const elapsed = current.receivedAt ? Math.max(0, (now - current.receivedAt) / 1000) : 0;
  const devices = current.devices.map(d => ({ ...d,
    brokerConnected: !current.error && elapsed < 15 && d.brokerConnected,
    ageSeconds: d.ageSeconds === null ? null : d.ageSeconds + elapsed,
    fresh: !current.error && d.fresh && d.ageSeconds !== null && d.ageSeconds + elapsed < 15
  }));
  return <LiveDeviceContext.Provider value={{ ...current, devices }}>{children}</LiveDeviceContext.Provider>;
}
