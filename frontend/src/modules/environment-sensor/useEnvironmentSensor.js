import { useEffect, useState, useRef, useCallback } from 'react';
import Paho from 'paho-mqtt';

export const STALE_AFTER_MS = 7000;
const API = '/api/environment-sensor';

function isSnapshot(value) {
  return (
    value?.deviceId === 'environment-sensor' &&
    typeof value.brokerConnected === 'boolean' &&
    ['online', 'offline', 'unknown'].includes(value.availability) &&
    typeof value.fresh === 'boolean' &&
    Array.isArray(value.events)
  );
}

export default function useEnvironmentSensor() {
  const [record, setRecord] = useState(null);
  const recordRef = useRef(null);
  recordRef.current = record;
  const [streamConnected, setStreamConnected] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now);

  const clientRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const eventsRef = useRef([]);

  // Hàm cập nhật snapshot an toàn
  const accept = useCallback((snapshot, fromStream) => {
    if (!snapshot || !isSnapshot(snapshot)) return false;
    setRecord({ snapshot, arrivedAt: Date.now(), fromStream });
    setNow(Date.now());
    setError(null);
    return true;
  }, []);

  // 1. KẾT NỐI TRỰC TIẾP MQTT WEBSOCKET TỚI broker.emqx.io (WSS 8084)
  // Đảm bảo dữ liệu từ ESP32 hiển thị tức thì trên Web mà không phụ thuộc backend
  useEffect(() => {
    let isMounted = true;

    if (typeof window === 'undefined' || !window.WebSocket) {
      return;
    }

    const brokerHost = 'broker.emqx.io';
    const brokerPort = 8084;
    const brokerPath = '/mqtt';
    const clientId = 'web_env_' + Math.random().toString(16).substring(2, 10);

    const client = new Paho.Client(brokerHost, brokerPort, brokerPath, clientId);
    clientRef.current = client;

    client.onConnectionLost = (responseObject) => {
      if (!isMounted) return;
      if (responseObject.errorCode !== 0) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connectMqtt, 4000);
      }
    };

    client.onMessageArrived = (message) => {
      if (!isMounted) return;
      const topic = message.destinationName;
      try {
        const payloadStr = message.payloadString;
        const parsed = JSON.parse(payloadStr);

        if (topic === 'home/environment-sensor/telemetry') {
          if (parsed && parsed.kind === 'state' && parsed.data) {
            const snap = {
              deviceId: 'environment-sensor',
              brokerConnected: true,
              availability: 'online',
              fresh: true,
              receivedAt: new Date().toISOString(),
              state: parsed,
              events: eventsRef.current
            };
            accept(snap, true);
          }
        } else if (topic === 'home/environment-sensor/status') {
          if (parsed && parsed.online) {
            setRecord((prev) => {
              if (!prev || !prev.snapshot) {
                return {
                  snapshot: {
                    deviceId: 'environment-sensor',
                    brokerConnected: true,
                    availability: 'online',
                    fresh: true,
                    receivedAt: new Date().toISOString(),
                    state: null,
                    events: eventsRef.current
                  },
                  arrivedAt: Date.now(),
                  fromStream: true
                };
              }
              return {
                ...prev,
                snapshot: {
                  ...prev.snapshot,
                  brokerConnected: true,
                  availability: 'online',
                  fresh: true
                }
              };
            });
          }
        } else if (topic === 'home/environment-sensor/alert') {
          const alertItem = {
            code: parsed.code || 'GAS_LEAK_ALERT',
            alertLevel: typeof parsed.alertLevel === 'number' ? parsed.alertLevel : 2,
            alertLevelText: parsed.alertLevelText || 'WARNING',
            gasRaw: parsed.gasRaw || 0,
            receivedAt: new Date().toISOString()
          };
          eventsRef.current = [alertItem, ...eventsRef.current].slice(0, 30);
          setRecord((prev) => {
            if (!prev || !prev.snapshot) return prev;
            return {
              ...prev,
              snapshot: {
                ...prev.snapshot,
                events: eventsRef.current
              }
            };
          });
        }
      } catch (err) {
        // bỏ qua lỗi parse json
      }
    };

    function connectMqtt() {
      if (!isMounted || !clientRef.current) return;
      try {
        clientRef.current.connect({
          useSSL: true,
          timeout: 5,
          keepAliveInterval: 30,
          cleanSession: true,
          onSuccess: () => {
            if (!isMounted) return;
            try {
              clientRef.current.subscribe('home/environment-sensor/status', { qos: 0 });
              clientRef.current.subscribe('home/environment-sensor/telemetry', { qos: 0 });
              clientRef.current.subscribe('home/environment-sensor/alert', { qos: 0 });
              console.log('[MQTT Environment] Đã kết nối broker.emqx.io WSS:8084');
            } catch (subErr) {
              console.warn('[MQTT Environment] Lỗi subscribe:', subErr);
            }
          },
          onFailure: () => {
            if (!isMounted) return;
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(connectMqtt, 5000);
          }
        });
      } catch (e) {
        console.warn('[MQTT Environment] Lỗi khởi tạo connect:', e);
      }
    }

    connectMqtt();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimerRef.current);
      if (clientRef.current) {
        try {
          if (clientRef.current.isConnected()) {
            clientRef.current.disconnect();
          }
        } catch {}
      }
    };
  }, [accept]);

  // 2. KẾT NỐI BACKEND (API & SSE) ĐỂ ĐỒNG BỘ NẾU BACKEND ĐANG CHẠY
  useEffect(() => {
    let active = true;
    let source;
    let checking = false;
    let denied = false;
    const controller = new AbortController();

    const rejectSession = (reason) => {
      if (!active) return;
      denied = true;
      controller.abort();
      if (!recordRef.current) {
        setError(reason);
      }
      setStreamConnected(false);
      source?.close();
    };

    const fetchState = async () => {
      if (checking || !active || denied) return;
      checking = true;
      const requestController = new AbortController();
      const timeout = setTimeout(() => requestController.abort(), 8000);
      const abortRequest = () => {
        clearTimeout(timeout);
        requestController.abort();
      };
      controller.signal.addEventListener('abort', abortRequest, { once: true });

      try {
        const response = await fetch(`${API}/state`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: requestController.signal
        });
        if (!active) return;
        if (response.status === 401 || response.status === 403) {
          rejectSession(response.status === 401 ? 'unauthorized' : 'forbidden');
          return;
        }
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        if (active && !denied && body?.data) {
          accept(body.data, false);
        }
      } catch {
        if (active && !controller.signal.aborted && !recordRef.current) {
          setError('unavailable');
        }
      } finally {
        checking = false;
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abortRequest);
      }
    };

    void fetchState();

    if (typeof EventSource === 'function') {
      try {
        source = new EventSource(`${API}/events`, { withCredentials: true });
        source.addEventListener('open', () => {
          if (active && !denied) setStreamConnected(true);
        });
        source.addEventListener('state', (event) => {
          if (!active || denied) return;
          try {
            const snapshot = JSON.parse(event.data);
            accept(snapshot, true);
          } catch {
            if (!recordRef.current) setError('invalid');
          }
        });
        source.addEventListener('error', () => {
          if (!active || denied) return;
          setStreamConnected(false);
          setRecord((previous) => (previous ? { ...previous, fromStream: false } : previous));
          void fetchState();
        });
        source.addEventListener('session-expired', () => rejectSession('unauthorized'));
      } catch {
        if (!recordRef.current) setError('unavailable');
      }
    } else {
      if (!recordRef.current) setError('unsupported');
    }

    const pollInterval = setInterval(() => {
      void fetchState();
    }, 5000);

    const watchdog = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      controller.abort();
      source?.close();
      clearInterval(pollInterval);
      clearInterval(watchdog);
    };
  }, [accept]);

  const publishCommand = useCallback((command) => {
    if (clientRef.current && clientRef.current.isConnected()) {
      try {
        const payloadStr = typeof command === 'string' ? command : JSON.stringify(command);
        const msg = new Paho.Message(payloadStr);
        msg.destinationName = 'home/environment-sensor/command';
        msg.qos = 0;
        clientRef.current.send(msg);
        return true;
      } catch (err) {
        console.warn('[MQTT Environment] Lỗi gửi lệnh:', err);
      }
    }
    return false;
  }, []);

  const snapshot = record?.snapshot ?? null;
  const live = Boolean(
    !error &&
      snapshot?.fresh &&
      snapshot?.brokerConnected &&
      snapshot?.availability === 'online' &&
      snapshot?.state?.kind === 'state' &&
      snapshot?.state?.data &&
      now - record.arrivedAt <= STALE_AFTER_MS
  );

  return { snapshot, live, streamConnected, error, publishCommand };
}
