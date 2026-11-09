import { useState, useEffect, useRef, useCallback } from 'react';
import Paho from 'paho-mqtt';

/**
 * Custom Hook: Quản lý kết nối MQTT hai chiều thời gian thực giữa Web và ESP32
 * Broker: broker.emqx.io (WSS 8084 /mqtt)
 * Người phụ trách: Nhật Anh (nhatanh)
 *
 * Tính năng tối ưu logic:
 * - Đóng gói logic mức kích phần cứng (Active-LOW: ESP32 "OFF" = LED sáng, "ON" = LED tắt).
 * - Cooldown Lock 1.2s: Chống giật ngược trạng thái do các gói tin cũ bị trễ nhịp.
 * - Khả năng phản hồi tức thời 0ms delay (Optimistic UI).
 */
export function useSmartPlugMQTT() {
  const [isMqttConnected, setIsMqttConnected] = useState(false);
  const [isDeviceOnline, setIsDeviceOnline] = useState(false);
  const [relayState, setRelayState] = useState(null); // true: Đèn sáng, false: Đèn tắt
  const [fanState, setFanState] = useState(false); // true: Quạt đang quay, false: Quạt tắt
  const [isRoomDark, setIsRoomDark] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [deviceIp, setDeviceIp] = useState('');
  const [lastSeen, setLastSeen] = useState(null);

  const clientRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastUserCommandTimeRef = useRef(0); // Khóa chống giật lùi (Cooldown Lock)
  const lastFanCommandTimeRef = useRef(0); // Khóa chống giật lùi cho Quạt

  const brokerHost = 'broker.emqx.io';
  const brokerPort = 8084;
  const brokerPath = '/mqtt';
  const topicCmd = 'shp/device-smart-plug-01/command';
  const topicStatus = 'shp/device-smart-plug-01/status';
  const topicTelemetry = 'shp/device-smart-plug-01/telemetry';

  useEffect(() => {
    isMountedRef.current = true;

    // Trong môi trường test Vitest/JSDOM không có WebSocket thực thụ
    if (typeof window === 'undefined' || !window.WebSocket) {
      return;
    }

    const clientId = 'web_sp_' + Math.random().toString(16).substring(2, 10);
    const client = new Paho.Client(brokerHost, brokerPort, brokerPath, clientId);
    clientRef.current = client;

    client.onConnectionLost = (responseObject) => {
      if (!isMountedRef.current) return;
      setIsMqttConnected(false);
      if (responseObject.errorCode !== 0) {
        console.warn('[MQTT] Mất kết nối:', responseObject.errorMessage);
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connectClient, 4000);
      }
    };

    client.onMessageArrived = (message) => {
      if (!isMountedRef.current) return;
      try {
        const payloadStr = message.payloadString;
        const topic = message.destinationName;
        const data = JSON.parse(payloadStr);

        setLastSeen(new Date());
        setIsDeviceOnline(true);

        // Bỏ qua trạng thái rơ-le trong 1.2s sau khi người dùng vừa bấm nút để chống giật ngược
        const isCooldownActive = Date.now() - lastUserCommandTimeRef.current < 1200;
        const isFanCooldownActive = Date.now() - lastFanCommandTimeRef.current < 1200;

        if (topic === topicStatus) {
          if (!isCooldownActive) {
            const rawRelay = data.relay || data.relayState;
            if (typeof rawRelay === 'string') {
              setRelayState(rawRelay.toUpperCase() === 'ON');
            }
          }
          if (!isFanCooldownActive) {
            const rawFan = data.fan || data.fanState;
            if (typeof rawFan === 'string') {
              setFanState(rawFan.toUpperCase() === 'ON');
            }
          }
          if (typeof data.auto === 'boolean') {
            setIsAutoMode(data.auto);
          }
          if (data.ip) {
            setDeviceIp(data.ip);
          }
        } else if (topic === topicTelemetry) {
          if (!isCooldownActive) {
            const rawRelay = data.relay || data.relayState;
            if (typeof rawRelay === 'string') {
              setRelayState(rawRelay.toUpperCase() === 'ON');
            }
          }
          if (!isFanCooldownActive) {
            const rawFan = data.fan || data.fanState;
            if (typeof rawFan === 'string') {
              setFanState(rawFan.toUpperCase() === 'ON');
            }
          }
          if (typeof data.is_dark === 'boolean') {
            setIsRoomDark(data.is_dark);
          }
          if (typeof data.auto_mode === 'boolean') {
            setIsAutoMode(data.auto_mode);
          }
        }
      } catch (err) {
        console.debug('[MQTT] Không thể parse JSON bản tin:', err);
      }
    };

    function connectClient() {
      if (!isMountedRef.current || !clientRef.current) return;
      try {
        clientRef.current.connect({
          useSSL: true,
          timeout: 5,
          keepAliveInterval: 30,
          cleanSession: true,
          onSuccess: () => {
            if (!isMountedRef.current) return;
            setIsMqttConnected(true);
            try {
              clientRef.current.subscribe(topicStatus, { qos: 0 });
              clientRef.current.subscribe(topicTelemetry, { qos: 0 });
              console.log('[MQTT] Đã kết nối thành công tới broker.emqx.io');
            } catch (subErr) {
              console.error('[MQTT] Lỗi subscribe:', subErr);
            }
          },
          onFailure: (err) => {
            if (!isMountedRef.current) return;
            setIsMqttConnected(false);
            console.warn('[MQTT] Kết nối thất bại:', err?.errorMessage || err);
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(connectClient, 5000);
          }
        });
      } catch (e) {
        console.warn('[MQTT] Lỗi khởi tạo kết nối:', e);
      }
    }

    connectClient();

    return () => {
      isMountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      if (clientRef.current) {
        try {
          if (clientRef.current.isConnected()) {
            clientRef.current.disconnect();
          }
        } catch {
          // Bỏ qua lỗi ngắt kết nối
        }
      }
    };
  }, [topicStatus, topicTelemetry]);

  // Gửi lệnh đóng/ngắt rơ-le (Bật/tắt bóng LED)
  const publishRelayCommand = useCallback((turnOn) => {
    // Đặt mốc thời gian khóa chống giật lùi trạng thái
    lastUserCommandTimeRef.current = Date.now();
    setRelayState(turnOn);

    if (!clientRef.current || !clientRef.current.isConnected()) {
      return false;
    }
    try {
      const payload = JSON.stringify({ relay: turnOn ? 'ON' : 'OFF' });
      const message = new Paho.Message(payload);
      message.destinationName = topicCmd;
      message.qos = 0;
      clientRef.current.send(message);
      return true;
    } catch (err) {
      console.error('[MQTT] Lỗi gửi lệnh rơ-le:', err);
      return false;
    }
  }, [topicCmd]);

  // Gửi lệnh đóng/ngắt Rơ-le 2 (Bật/tắt Quạt làm mát 5V)
  const publishFanCommand = useCallback((turnOn) => {
    lastFanCommandTimeRef.current = Date.now();
    setFanState(turnOn);

    if (!clientRef.current || !clientRef.current.isConnected()) {
      return false;
    }
    try {
      const payload = JSON.stringify({ fan: turnOn ? 'ON' : 'OFF' });
      const message = new Paho.Message(payload);
      message.destinationName = topicCmd;
      message.qos = 0;
      clientRef.current.send(message);
      return true;
    } catch (err) {
      console.error('[MQTT] Lỗi gửi lệnh quạt:', err);
      return false;
    }
  }, [topicCmd]);

  // Gửi lệnh bật/tắt chế độ tự động
  const publishAutoCommand = useCallback((enableAuto) => {
    setIsAutoMode(Boolean(enableAuto));
    if (!clientRef.current || !clientRef.current.isConnected()) {
      return false;
    }
    try {
      const payload = JSON.stringify({ auto: Boolean(enableAuto) });
      const message = new Paho.Message(payload);
      message.destinationName = topicCmd;
      message.qos = 0;
      clientRef.current.send(message);
      return true;
    } catch (err) {
      console.error('[MQTT] Lỗi gửi lệnh tự động:', err);
      return false;
    }
  }, [topicCmd]);

  return {
    isMqttConnected,
    isDeviceOnline,
    relayState,
    fanState,
    isRoomDark,
    isAutoMode,
    deviceIp,
    lastSeen,
    publishRelayCommand,
    publishFanCommand,
    publishAutoCommand
  };
}
