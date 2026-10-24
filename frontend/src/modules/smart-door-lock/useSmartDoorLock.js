import { useEffect, useState } from 'react';

export const STALE_AFTER_MS = 7000;
const API = '/api/smart-door-lock';

function isSnapshot(value) {
  return value?.deviceId === 'smart-door-lock'
    && typeof value.brokerConnected === 'boolean'
    && ['online', 'offline', 'unknown'].includes(value.availability)
    && typeof value.fresh === 'boolean'
    && Array.isArray(value.events);
}

/** Cookie-authenticated, read-only stream. No MQTT credentials enter the browser. */
export default function useSmartDoorLock() {
  const [record, setRecord] = useState(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    let source;
    let streamRevision = 0;
    let checking = false;
    let denied = false;
    const controller = new AbortController();

    const rejectSession = (reason) => {
      if (!active) return;
      denied = true;
      controller.abort();
      setError(reason);
      setStreamConnected(false);
      setRecord(null);
      source?.close();
    };

    const accept = (snapshot, fromStream) => {
      if (!active || denied || !isSnapshot(snapshot)) return false;
      setRecord({ snapshot, arrivedAt: Date.now(), fromStream });
      setNow(Date.now());
      setError(null);
      return true;
    };

    const fetchState = async () => {
      if (checking || !active || denied) return;
      checking = true;
      const revision = streamRevision;
      const requestController = new AbortController();
      const timeout = setTimeout(() => requestController.abort(), 10000);
      const abortRequest = () => { clearTimeout(timeout); requestController.abort(); };
      controller.signal.addEventListener('abort', abortRequest, { once: true });
      try {
        const response = await fetch(`${API}/state`, {
          method: 'GET', credentials: 'include', cache: 'no-store',
          headers: { Accept: 'application/json' }, signal: requestController.signal
        });
        if (!active) return;
        if (response.status === 401 || response.status === 403) {
          rejectSession(response.status === 401 ? 'unauthorized' : 'forbidden');
          return;
        }
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        // An initial request must never overwrite a newer streaming update.
        if (active && revision === streamRevision && streamRevision === 0) {
          if (!accept(body?.data, false)) setError('invalid');
        }
      } catch {
        if (active && !controller.signal.aborted && streamRevision === 0) setError('unavailable');
      } finally {
        checking = false;
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abortRequest);
      }
    };

    void fetchState();
    if (typeof EventSource === 'function') {
      source = new EventSource(`${API}/events`, { withCredentials: true });
      source.addEventListener('open', () => {
        if (active && !denied) setStreamConnected(true);
      });
      source.addEventListener('state', (event) => {
        if (!active || denied) return;
        try {
          const snapshot = JSON.parse(event.data);
          if (accept(snapshot, true)) streamRevision += 1;
          else setError('invalid');
        } catch {
          setError('invalid');
        }
      });
      source.addEventListener('error', () => {
        if (!active || denied) return;
        setStreamConnected(false);
        setRecord((previous) => previous ? { ...previous, fromStream: false } : previous);
        // EventSource hides HTTP status; check the authenticated endpoint again.
        void fetchState();
      });
      source.addEventListener('session-expired', () => rejectSession('unauthorized'));
    } else {
      setError('unsupported');
    }

    const watchdog = setInterval(() => setNow(Date.now()), 500);
    return () => {
      active = false;
      controller.abort();
      source?.close();
      clearInterval(watchdog);
    };
  }, []);

  const snapshot = record?.snapshot ?? null;
  const live = Boolean(streamConnected && record?.fromStream && !error
    && snapshot?.fresh && snapshot?.brokerConnected && snapshot?.availability === 'online'
    && snapshot?.state?.kind === 'state' && snapshot?.state?.data
    && now - record.arrivedAt <= STALE_AFTER_MS);

  return { snapshot, live, streamConnected, error };
}
