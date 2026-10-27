import React, { useState } from 'react';
import useEnvironmentSensor from './useEnvironmentSensor.js';
import './EnvironmentSensor.css';

export default function EnvironmentSensorOwnerArea() {
  const { snapshot, live, streamConnected } = useEnvironmentSensor();
  const [mockMode, setMockMode] = useState(false);
  const [mockState, setMockState] = useState({
    gasRaw: 850,
    temperature: 28.5,
    humidity: 62.0,
    alertLevel: 1,
    alertLevelText: 'SAFE',
    buzzerOn: false,
    isWarmingUp: false
  });

  // Sử dụng dữ liệu thật từ backend/ESP32 nếu có, hoặc dùng mockState khi chưa cắm board
  const hasRealData = Boolean(snapshot?.state?.data);
  const isOnline = (live || hasRealData) || mockMode;
  const currentData = hasRealData
    ? snapshot.state.data
    : (mockMode ? mockState : null);

  const alertLevel = currentData ? currentData.alertLevel : 0;
  const isWarmingUp = currentData ? currentData.isWarmingUp : false;

  const getLevelClass = () => {
    if (!isOnline) return 'level-offline';
    if (isWarmingUp) return 'level-warmup';
    if (alertLevel === 3) return 'level-danger';
    if (alertLevel === 2) return 'level-warning';
    return 'level-safe';
  };

  const getLevelTitle = () => {
    if (!isOnline) return 'Thiết bị đang Offline';
    if (isWarmingUp) return 'Đang sấy cảm biến MQ-2 (Warm-up)';
    if (alertLevel === 3) return 'BÁO ĐỘNG ĐỎ: NGUY HIỂM KHÍ GAS!';
    if (alertLevel === 2) return 'CẢNH BÁO: PHÁT HIỆN RÒ RỈ GAS!';
    return 'AN TOÀN: Nồng độ khí gas bình thường';
  };

  const getLevelDesc = () => {
    if (!isOnline) return 'Đang chờ ESP32 kết nối Wi-Fi và truyền dữ liệu MQTT...';
    if (isWarmingUp) return 'Cảm biến đang gia nhiệt ổn định trong 20 giây đầu. Còi buzzer tạm khóa.';
    if (alertLevel === 3) return 'Nồng độ gas vượt ngưỡng 2200 ADC! Còi buzzer báo động liên tục.';
    if (alertLevel === 2) return 'Nồng độ gas vượt ngưỡng 1200 ADC. Còi buzzer phát tín hiệu ngắt quãng.';
    return 'Môi trường nhà bếp thông thoáng, nhiệt độ & độ ẩm trong giới hạn an toàn.';
  };

  const gasPercentage = currentData
    ? Math.min(100, Math.round((currentData.gasRaw / 4095) * 100))
    : 0;

  const getMeterColor = () => {
    if (alertLevel === 3) return '#dc2626';
    if (alertLevel === 2) return '#d97706';
    return '#10b981';
  };

  const events = snapshot?.events || [];

  return (
    <div className="owner-area-container" data-module="environment-sensor" data-owner="quynh">
      <div className="owner-area-header">
        <span className="owner-badge">Khu vực phát triển riêng</span>
        <h3 className="owner-title">Cảm biến môi trường & Cảnh báo Gas Nhà bếp</h3>
        <p className="owner-assignee">Người phụ trách: <strong>Quỳnh</strong></p>
      </div>

      <div className="env-dashboard">
        {/* Banner trạng thái Hero */}
        <div className={`env-hero-banner ${getLevelClass()}`}>
          <div className="env-hero-main">
            <span className="env-hero-icon">
              {!isOnline ? '📡' : isWarmingUp ? '⏳' : alertLevel === 3 ? '🚨' : alertLevel === 2 ? '⚠️' : '🛡️'}
            </span>
            <div>
              <h4 className="env-hero-title">{getLevelTitle()}</h4>
              <p className="env-hero-desc">{getLevelDesc()}</p>
            </div>
          </div>
          <div className="env-connection-tag">
            <span className={`env-dot ${isOnline ? 'online' : 'offline'}`}></span>
            <span>{isOnline ? 'Đang cập nhật trực tiếp' : (streamConnected ? 'Chờ dữ liệu ESP32' : 'Mất kết nối')}</span>
          </div>
        </div>

        {/* Lưới các thẻ thông số cảm biến */}
        <div className="env-grid">
          {/* Card 1: Khí Gas MQ-2 */}
          <div className="env-card">
            <div className="env-card-header">
              <h5 className="env-card-title">Nồng độ Gas / Khói (MQ-2)</h5>
              <span className="env-card-glyph">🔥</span>
            </div>
            <div className={`env-card-value ${alertLevel === 3 ? 'danger' : alertLevel === 2 ? 'warn' : 'safe'}`}>
              {currentData ? currentData.gasRaw : '----'}
              <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6b7280', marginLeft: '4px' }}>ADC</span>
            </div>
            <p className="env-card-sub">
              Trạng thái: <strong>{currentData ? currentData.alertLevelText : 'Không có dữ liệu'}</strong>
            </p>
            <div className="env-meter-container">
              <div className="env-meter-bar">
                <div
                  className="env-meter-fill"
                  style={{ width: `${gasPercentage}%`, backgroundColor: getMeterColor() }}
                ></div>
              </div>
              <div className="env-meter-markers">
                <span>0 (Sạch)</span>
                <span>1200 (Cảnh báo)</span>
                <span>2200 (Nguy hiểm)</span>
              </div>
            </div>
          </div>

          {/* Card 2: Nhiệt độ DHT11 */}
          <div className="env-card">
            <div className="env-card-header">
              <h5 className="env-card-title">Nhiệt độ phòng (DHT11)</h5>
              <span className="env-card-glyph">🌡️</span>
            </div>
            <div className="env-card-value">
              {currentData ? `${currentData.temperature}°C` : '--.-°C'}
            </div>
            <p className="env-card-sub">
              Dải đo: 0°C – 50°C (Sai số ±2°C)
            </p>
          </div>

          {/* Card 3: Độ ẩm DHT11 */}
          <div className="env-card">
            <div className="env-card-header">
              <h5 className="env-card-title">Độ ẩm không khí (DHT11)</h5>
              <span className="env-card-glyph">💧</span>
            </div>
            <div className="env-card-value">
              {currentData ? `${currentData.humidity}%` : '--%'}
            </div>
            <p className="env-card-sub">
              Độ ẩm tương đối %RH
            </p>
          </div>

          {/* Card 4: Còi báo động Buzzer */}
          <div className="env-card">
            <div className="env-card-header">
              <h5 className="env-card-title">Còi báo động (Buzzer)</h5>
              <span className="env-card-glyph">🔊</span>
            </div>
            <div className={`env-card-value ${currentData?.buzzerOn ? 'danger' : 'safe'}`}>
              {currentData ? (currentData.buzzerOn ? 'ĐANG KÊU' : 'YÊN LẶNG') : '----'}
            </div>
            <p className="env-card-sub">
              {currentData?.buzzerOn ? 'Còi đang phát âm cảnh báo' : 'Hệ thống an toàn'}
            </p>
          </div>
        </div>

        {/* 2 Cột: Nhật ký cảnh báo & Thông số kỹ thuật phần cứng */}
        <div className="env-two-column">
          {/* Cột trái: Lịch sử sự kiện cảnh báo */}
          <div className="env-panel">
            <div className="env-panel-header">
              <h5 className="env-panel-title">Lịch sử sự kiện cảnh báo Gas</h5>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{events.length} sự kiện</span>
            </div>
            {events.length > 0 ? (
              <ul className="env-event-list">
                {events.map((evt, idx) => (
                  <li
                    key={idx}
                    className={`env-event-item ${
                      evt.alertLevel === 3 ? 'is-alert' : evt.alertLevel === 2 ? 'is-warn' : ''
                    }`}
                  >
                    <div>
                      <span className="env-event-code">{evt.code}</span>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Gas ADC: {evt.gasRaw} · Mức: {evt.alertLevelText}
                      </div>
                    </div>
                    <span className="env-event-time">
                      {evt.receivedAt ? new Date(evt.receivedAt).toLocaleTimeString('vi-VN') : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="env-empty-events">
                <span>🛡️ Chưa ghi nhận sự cố rò rỉ khí gas nào.</span>
              </div>
            )}
          </div>

          {/* Cột phải: Thông số phần cứng & Công cụ mô phỏng */}
          <div className="env-panel">
            <div className="env-panel-header">
              <h5 className="env-panel-title">Chẩn đoán phần cứng & Công cụ</h5>
            </div>
            <div className="env-hardware-info">
              <div className="env-info-row">
                <span className="env-info-label">Vi điều khiển:</span>
                <span className="env-info-value">ESP32 DevKit V1 (240MHz)</span>
              </div>
              <div className="env-info-row">
                <span className="env-info-label">Chân kết nối:</span>
                <span className="env-info-value">MQ-2 (GPIO35) · DHT11 (GPIO4) · Buzzer (GPIO18)</span>
              </div>
              <div className="env-info-row">
                <span className="env-info-label">Giao thức truyền:</span>
                <span className="env-info-value">Wi-Fi + MQTT + ESP-NOW</span>
              </div>
              <div className="env-info-row">
                <span className="env-info-label">Broker MQTT:</span>
                <span className="env-info-value">
                  {snapshot?.brokerConnected ? 'Đã kết nối (broker.emqx.io)' : 'Đang kết nối...'}
                </span>
              </div>
              <div className="env-info-row">
                <span className="env-info-label">Tín hiệu Wi-Fi:</span>
                <span className="env-info-value">
                  {currentData?.wifiRssi ? `${currentData.wifiRssi} dBm` : '—'}
                </span>
              </div>

              {/* Công cụ giả lập test nhanh nếu chưa cắm board */}
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>
                  Thử nghiệm nhanh giao diện:
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #10b981',
                      background: '#ecfdf5',
                      color: '#065f46',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setMockMode(true);
                      setMockState({
                        gasRaw: 850,
                        temperature: 27.5,
                        humidity: 60.0,
                        alertLevel: 1,
                        alertLevelText: 'SAFE',
                        buzzerOn: false,
                        isWarmingUp: false
                      });
                    }}
                  >
                    Sim: An toàn
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #f59e0b',
                      background: '#fffbeb',
                      color: '#92400e',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setMockMode(true);
                      setMockState({
                        gasRaw: 1650,
                        temperature: 30.2,
                        humidity: 68.0,
                        alertLevel: 2,
                        alertLevelText: 'WARNING',
                        buzzerOn: true,
                        isWarmingUp: false
                      });
                    }}
                  >
                    Sim: Cảnh báo Gas
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #ef4444',
                      background: '#fef2f2',
                      color: '#991b1b',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setMockMode(true);
                      setMockState({
                        gasRaw: 2850,
                        temperature: 34.0,
                        humidity: 75.0,
                        alertLevel: 3,
                        alertLevelText: 'DANGER',
                        buzzerOn: true,
                        isWarmingUp: false
                      });
                    }}
                  >
                    Sim: Báo động Đỏ
                  </button>

                  {mockMode && (
                    <button
                      type="button"
                      style={{
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid #6b7280',
                        background: '#f3f4f6',
                        color: '#374151',
                        cursor: 'pointer'
                      }}
                      onClick={() => setMockMode(false)}
                    >
                      Dùng dữ liệu thật
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
