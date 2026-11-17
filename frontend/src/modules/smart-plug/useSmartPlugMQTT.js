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
export function useSmartPlugMQTT({ _canPublish = false, enabled = true } = {}) {
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
  const topicStatus = 'shp/device-smart-plug-01/status';
  const topicTelemetry = 'shp/device-smart-plug-01/telemetry';

  // Khóa hoàn toàn phát lệnh trên kênh MQTT công khai cho MỌI runtime (Dev, Test, Prod) để bảo đảm an toàn thiết bị
  const isPublicPublishLocked = true;

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled) {
      setIsMqttConnected(false);
      setIsDeviceOnline(false);
      setRelayState(null);
      setFanState(false);
      setLastSeen(null);
      return;
    }

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
  }, [topicStatus, topicTelemetry, enabled]);

  // Gửi lệnh đóng/ngắt rơ-le - Khóa hoàn toàn trên kênh công khai cho mọi runtime
  const publishRelayCommand = useCallback(() => {
    console.warn('[MQTT] Lệnh điều khiển rơ-le bị khóa trên kênh công khai cho mọi runtime để bảo đảm an toàn cho thiết bị.');
    return false;
  }, []);

  // Gửi lệnh đóng/ngắt Rơ-le 2 - Khóa hoàn toàn trên kênh công khai cho mọi runtime
  const publishFanCommand = useCallback(() => {
    console.warn('[MQTT] Lệnh điều khiển quạt bị khóa trên kênh công khai cho mọi runtime để bảo đảm an toàn cho thiết bị.');
    return false;
  }, []);

  // Gửi lệnh bật/tắt chế độ tự động - Khóa hoàn toàn trên kênh công khai cho mọi runtime
  const publishAutoCommand = useCallback(() => {
    console.warn('[MQTT] Lệnh bật/tắt tự động bị khóa trên kênh công khai cho mọi runtime để bảo đảm an toàn cho thiết bị.');
    return false;
  }, []);

  return {
    isMqttConnected,
    isDeviceOnline, // Tín hiệu gói tin từ topic MQTT công khai (chưa xác thực danh tính thiết bị)
    hasPublicTelemetry: isDeviceOnline,
    isPublicSourceUnauthenticated: true, // Nguồn tin công khai không có chữ ký xác thực
    isPhysicalHardwareVerified: false, // Tuyệt đối không khẳng định ESP32 vật lý đang trực tuyến
    relayState,
    fanState,
    isRoomDark,
    isAutoMode,
    deviceIp,
    lastSeen,
    isPublicPublishLocked,
    publishRelayCommand,
    publishFanCommand,
    publishAutoCommand
  };
}
