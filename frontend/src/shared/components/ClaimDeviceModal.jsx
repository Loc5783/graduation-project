import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useMyDevices } from '../../context/MyDevicesContext.jsx';
import './ClaimDeviceModal.css';

export default function ClaimDeviceModal({ isOpen, onClose, onSuccess }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const { claimDevice } = useMyDevices();

  const [code, setCode] = useState('');
  const [pairingSecret, setPairingSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const codeInputRef = useRef(null);
  const dialogRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement;
      setCode('');
      setPairingSecret('');
      setErrorMsg(null);
      setSuccessMsg(null);
      // Focus vào ô nhập đầu tiên
      setTimeout(() => codeInputRef.current?.focus(), 50);
    } else if (previouslyFocusedElementRef.current) {
      previouslyFocusedElementRef.current.focus();
    }
  }, [isOpen]);

  // Bắt phím Escape và Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!submitting) onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanSecret = pairingSecret.trim();

    if (!cleanCode || cleanCode.length < 6) {
      setErrorMsg(isEn ? 'Device code must be at least 6 characters.' : 'Mã nhận diện phải có ít nhất 6 ký tự (VD: TRTM01).');
      return;
    }
    if (!cleanSecret || cleanSecret.length < 12) {
      setErrorMsg(isEn ? 'Pairing secret code must be at least 12 characters.' : 'Mã ghép nối bí mật phải có ít nhất 12 ký tự dán trên thiết bị.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await claimDevice({ code: cleanCode, pairingSecret: cleanSecret });
      if (res.success) {
        setSuccessMsg(isEn ? 'Device paired successfully!' : 'Nhận và ghép nối thiết bị thành công!');
        setTimeout(() => {
          onSuccess?.(res.data);
          onClose();
        }, 800);
      } else {
        if (res.code === 'ALREADY_CLAIMED') {
          setErrorMsg(isEn ? 'This device has already been claimed by another account.' : 'Thiết bị này đã có chủ sở hữu khác nhận trước.');
        } else if (res.code === 'CLAIM_FAILED') {
          setErrorMsg(isEn ? 'Invalid Device Code or Secret Pairing Code.' : 'Mã thiết bị hoặc mã ghép nối bí mật không đúng.');
        } else if (res.code === 'TOO_MANY_REQUESTS') {
          setErrorMsg(isEn ? 'Too many attempts. Please try again later.' : 'Bạn đã thử quá số lần cho phép. Vui lòng thử lại sau.');
        } else {
          setErrorMsg(res.message || (isEn ? 'Pairing failed. Please check your codes.' : 'Ghép nối không thành công. Vui lòng kiểm tra lại mã.'));
        }
      }
    } catch {
      setErrorMsg(isEn ? 'Network error during pairing.' : 'Lỗi kết nối khi ghép nối thiết bị.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="claim-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-modal-title"
        className="claim-modal-card"
      >
        <header className="claim-modal-header">
          <h2 id="claim-modal-title">
            {isEn ? 'Add Smart Device' : 'Thêm thiết bị thông minh'}
          </h2>
          <button
            type="button"
            className="claim-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label={isEn ? 'Close dialog' : 'Đóng hộp thoại'}
          >
            ✕
          </button>
        </header>

        <p className="claim-modal-desc">
          {isEn
            ? 'Enter the Device Code (e.g. TRTM01) and the Secret Pairing Code printed on the physical device label to claim ownership.'
            : 'Nhập Mã nhận diện thiết bị (ví dụ TRTM01) và Mã ghép nối bí mật dán trên tem thiết bị để nhận quyền chủ sở hữu.'}
        </p>

        {errorMsg && (
          <div className="claim-modal-alert claim-modal-alert-error" role="alert">
            <span aria-hidden="true">⚠️</span> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="claim-modal-alert claim-modal-alert-success" role="status">
            <span aria-hidden="true">✓</span> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="claim-modal-form">
          <div className="form-group">
            <label htmlFor="device-code-input">
              {isEn ? 'Device Code' : 'Mã nhận diện thiết bị'}
              <span className="required-star">*</span>
            </label>
            <input
              id="device-code-input"
              ref={codeInputRef}
              type="text"
              placeholder={isEn ? 'e.g. TRTM01, KCTM01, OCTM01' : 'VD: TRTM01, KCTM01, OCTM01'}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={submitting}
              autoComplete="off"
              required
            />
            <small className="field-hint">
              {isEn ? 'Public identifier on outer label' : 'Mã công khai trên vỏ thiết bị'}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="pairing-secret-input">
              {isEn ? 'Secret Pairing Code' : 'Mã ghép nối bí mật'}
              <span className="required-star">*</span>
            </label>
            <input
              id="pairing-secret-input"
              type="password"
              placeholder={isEn ? 'Private secret code on label' : 'Mã bí mật in riêng trên tem thiết bị'}
              value={pairingSecret}
              onChange={(e) => setPairingSecret(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              required
            />
            <small className="field-hint">
              {isEn ? 'Confidential salted secret; never shared publicly' : 'Mã bí mật được bảo vệ; không cung cấp cho người khác'}
            </small>
          </div>

          <footer className="claim-modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              {isEn ? 'Cancel' : 'Hủy bỏ'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? (isEn ? 'Pairing…' : 'Đang ghép nối…')
                : (isEn ? 'Pair Device' : 'Nhận thiết bị')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
