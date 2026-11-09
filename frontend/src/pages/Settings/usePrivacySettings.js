import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { isPreviewMode } from '../../services/authService.js';
import {
  getSettingsService,
  updatePrivacyService,
  DEFAULT_PRIVACY
} from '../../services/settingsService.js';

export const VALID_RETENTION_DAYS = Object.freeze([7, 30, 90]);

/**
 * Kiểm tra tính hợp lệ của hợp đồng dữ liệu privacy từ backend
 */
export function isValidPrivacyContract(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return (
    typeof data.retentionDays === 'number' &&
    Number.isInteger(data.retentionDays) &&
    VALID_RETENTION_DAYS.includes(data.retentionDays)
  );
}

/**
 * Hook quản lý trạng thái và tự lưu Cài đặt Quyền riêng tư (Privacy Settings).
 *
 * Đặc điểm an toàn:
 * 1. Khóa chung đồng bộ cho cả PATCH và GET đối soát (`activeOpRef`).
 * 2. Khi đối soát GET đang chạy, không khởi chạy PATCH song song; ghi nhận draft mới nhất.
 * 3. Sau GET đối soát thành công, so sánh server với draft MỚI NHẤT, không dùng giá trị cũ chụp trước await.
 * 4. Nếu đối soát GET thất bại (lỗi mạng, 5xx, sai hợp đồng, 401), DỪNG LẠI, không tự động gửi PATCH tiếp.
 * 5. Khi PATCH gặp lỗi chưa xác định, không tự gửi pendingValue tiếp theo; yêu cầu đối soát có kiểm soát.
 * 6. Chuyển tài khoản: reset toàn bộ saveStatus, saveError, draft, persisted, và khóa thao tác khi đang tải.
 * 7. Response của request cũ không bao giờ ghi state hay mở khóa request của tài khoản mới.
 */
export function usePrivacySettings() {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const currentUserId = currentUser?.id;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const isPreview = isPreviewMode();

  // State hiển thị
  const [retentionDays, setRetentionDays] = useState(DEFAULT_PRIVACY.retentionDays);
  const [persistedDays, setPersistedDays] = useState(DEFAULT_PRIVACY.retentionDays);
  const [loadStatus, setLoadStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);

  // Refs quản lý bất đồng bộ và khóa chung
  const generationRef = useRef(0);
  const isMountedRef = useRef(true);
  const activeOpRef = useRef(null); // 'patch' | 'reconcile' | null (Khóa chung đồng bộ)
  const inFlightValueRef = useRef(null);
  const inFlightReqSeqRef = useRef(0);
  const patchSeqRef = useRef(0);
  const fetchSeqRef = useRef(0);
  const pendingValueRef = useRef(null); // Giá trị mới nhất user chọn khi có request đang bay
  const hasUncertainServerStateRef = useRef(false);
  const draftValueRef = useRef(DEFAULT_PRIVACY.retentionDays);
  draftValueRef.current = retentionDays;

  // Thực thi lệnh PATCH
  const executePatch = useCallback(async (targetValue) => {
    if (!VALID_RETENTION_DAYS.includes(targetValue)) return;
    if (activeOpRef.current !== null) return; // Bảo vệ khóa chung

    activeOpRef.current = 'patch';
    inFlightValueRef.current = targetValue;
    const mySeq = ++patchSeqRef.current;
    inFlightReqSeqRef.current = mySeq;
    const reqGen = generationRef.current;
    const reqUserId = currentUserIdRef.current;

    setSaveStatus('saving');
    setSaveError(null);

    try {
      const res = await updatePrivacyService({ retentionDays: targetValue });

      // Guard 1: Đã unmount hoặc đổi tài khoản
      if (!isMountedRef.current || generationRef.current !== reqGen || currentUserIdRef.current !== reqUserId) {
        return;
      }

      // Guard 2: Request cũ hơn một PATCH mới hơn đã phát hành
      if (mySeq < patchSeqRef.current) {
        return;
      }

      // Giải phóng khóa thao tác
      activeOpRef.current = null;
      inFlightValueRef.current = null;

      // Guard 3: Xử lý 401 Unauthorized
      if (res.status === 401) {
        setSaveStatus('error');
        setSaveError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      // Guard 4: Lỗi mạng hoặc kết quả không chắc chắn
      const isUncertain = Boolean(
        res.isNetworkError ||
        res.status === 0 ||
        res.status >= 500 ||
        res.code === 'TIMEOUT' ||
        res.code === 'NETWORK_ERROR' ||
        res.code === 'INVALID_RESPONSE'
      );

      if (!res.success || isUncertain) {
        hasUncertainServerStateRef.current = isUncertain;
        setSaveStatus('error');
        setSaveError(res);
        // QUAN TRỌNG: Khi PATCH có kết quả chưa xác định, KHÔNG tự gửi pendingValue tiếp theo.
        // Dừng lại và yêu cầu đối soát theo luồng có kiểm soát.
        return;
      }

      // Guard 5: Kiểm tra hợp đồng response
      const isContractValid = isValidPrivacyContract(res.data?.privacy);
      if (!isContractValid || res.data.privacy.retentionDays !== targetValue) {
        hasUncertainServerStateRef.current = true;
        setSaveStatus('error');
        setSaveError({
          code: 'INVALID_RESPONSE',
          message: 'Phản hồi từ máy chủ không hợp lệ.'
        });
        return;
      }

      // Xác nhận thành công từ server
      hasUncertainServerStateRef.current = false;
      const confirmedDays = res.data.privacy.retentionDays;
      setPersistedDays(confirmedDays);

      // Kiểm tra xem trong lúc request chạy user có đổi sang draft khác không
      const latestDraft = draftValueRef.current;
      if (pendingValueRef.current !== null && pendingValueRef.current !== confirmedDays) {
        const nextVal = pendingValueRef.current;
        pendingValueRef.current = null;
        executePatch(nextVal);
      } else if (latestDraft !== confirmedDays) {
        pendingValueRef.current = null;
        executePatch(latestDraft);
      } else {
        pendingValueRef.current = null;
        setSaveStatus('saved');
      }
    } catch (err) {
      if (!isMountedRef.current || generationRef.current !== reqGen || currentUserIdRef.current !== reqUserId) {
        return;
      }
      activeOpRef.current = null;
      inFlightValueRef.current = null;
      hasUncertainServerStateRef.current = true;
      setSaveStatus('error');
      setSaveError(err);
    }
  }, [handleUnauthorized]);

  // Đối soát cấu hình hiện tại từ máy chủ trước khi tiếp tục
  const reconcileAndProceed = useCallback(async () => {
    if (activeOpRef.current !== null) return;

    activeOpRef.current = 'reconcile';
    setSaveStatus('saving');
    setSaveError(null);

    const reqGen = generationRef.current;
    const reqUserId = currentUserIdRef.current;

    let getRes;
    try {
      getRes = await getSettingsService();
    } catch (err) {
      getRes = {
        isNetworkError: true,
        status: 0,
        code: 'NETWORK_ERROR',
        message: err.message
      };
    }

    // Guard 1: Đã unmount hoặc đổi tài khoản
    if (!isMountedRef.current || generationRef.current !== reqGen || currentUserIdRef.current !== reqUserId) {
      return;
    }

    // Giải phóng khóa reconcile
    activeOpRef.current = null;

    // Guard 2: Xử lý 401 Unauthorized
    if (getRes.status === 401) {
      setSaveStatus('error');
      setSaveError('UNAUTHORIZED');
      if (typeof handleUnauthorized === 'function') {
        handleUnauthorized(reqUserId);
      }
      return; // DỪNG LẠI, KHÔNG GỬI PATCH TIẾP!
    }

    // Guard 3: GET đối soát gặp lỗi mạng, 5xx hoặc không thành công
    const isGetUncertain = Boolean(
      getRes.isNetworkError ||
      getRes.status === 0 ||
      getRes.status >= 500 ||
      getRes.code === 'TIMEOUT' ||
      getRes.code === 'NETWORK_ERROR'
    );

    if (!getRes.success || isGetUncertain) {
      hasUncertainServerStateRef.current = true;
      setSaveStatus('error');
      setSaveError(getRes);
      return; // DỪNG LẠI, KHÔNG BỎ QUA LỖI ĐỂ GỬI PATCH!
    }

    // Guard 4: Kiểm tra hợp đồng response GET
    if (!isValidPrivacyContract(getRes.data?.privacy)) {
      hasUncertainServerStateRef.current = true;
      setSaveStatus('error');
      setSaveError({
        code: 'INVALID_RESPONSE',
        message: 'Dữ liệu cài đặt quyền riêng tư không hợp lệ.'
      });
      return; // DỪNG LẠI, KHÔNG GỬI PATCH!
    }

    // GET đối soát THÀNH CÔNG:
    // So sánh serverDays với draft MỚI NHẤT (draftValueRef.current)
    const serverDays = getRes.data.privacy.retentionDays;
    setPersistedDays(serverDays);

    const latestDraft = draftValueRef.current;
    if (serverDays === latestDraft && (pendingValueRef.current === null || pendingValueRef.current === latestDraft)) {
      // Khớp hoàn toàn với draft mới nhất của người dùng
      hasUncertainServerStateRef.current = false;
      pendingValueRef.current = null;
      setSaveStatus('saved');
      setSaveError(null);
      return;
    }

    // Khác draft mới nhất: xóa trạng thái không chắc chắn và gửi đúng 1 PATCH cho draft mới nhất
    hasUncertainServerStateRef.current = false;
    pendingValueRef.current = null;
    executePatch(latestDraft);
  }, [handleUnauthorized, executePatch]);

  // Hàm thay đổi giá trị retentionDays (từ UI)
  const changeRetentionDays = useCallback((newValue) => {
    if (!VALID_RETENTION_DAYS.includes(newValue)) return;

    if (isPreview) {
      setRetentionDays(newValue);
      draftValueRef.current = newValue;
      setSaveStatus('idle');
      return;
    }

    // Trong lúc tài khoản mới đang tải hoặc tải lỗi, không cho lưu giá trị chưa được nạp xác nhận
    if (loadStatus !== 'success') {
      return;
    }

    // Cập nhật draft ngay lập tức cho UI phản hồi tức thì
    setRetentionDays(newValue);
    draftValueRef.current = newValue;

    // Nếu đang có thao tác đang chạy (PATCH hoặc GET đối soát): ghi nhận draft mới nhất và chờ
    if (activeOpRef.current !== null) {
      pendingValueRef.current = newValue;
      return;
    }

    // Nếu trạng thái máy chủ chưa xác định (sau PATCH lỗi mạng/timeout):
    // Đối soát trước khi lưu draft mới nhất; KHÔNG gửi PATCH trực tiếp!
    if (hasUncertainServerStateRef.current) {
      pendingValueRef.current = newValue;
      reconcileAndProceed();
      return;
    }

    // Nếu không có thao tác nào đang chạy và giá trị đã khớp server và không lỗi
    if (saveStatus === 'saved' && persistedDays === newValue) {
      pendingValueRef.current = null;
      return;
    }

    // Không có thao tác nào đang chạy và trạng thái máy chủ xác định -> thực thi ngay
    pendingValueRef.current = null;
    executePatch(newValue);
  }, [isPreview, loadStatus, saveStatus, persistedDays, reconcileAndProceed, executePatch]);

  // Thử lại khi lưu thất bại
  const retrySave = useCallback(async () => {
    if (saveStatus !== 'error') return;
    // Khóa chung: nếu đang có thao tác đang chạy (PATCH hoặc reconcile), không chạy song song (chống double click)
    if (activeOpRef.current !== null) return;

    // Nếu trạng thái máy chủ chưa xác định (lỗi mạng/timeout trước đó), đối soát GET trước
    if (hasUncertainServerStateRef.current) {
      reconcileAndProceed();
      return;
    }

    // Nếu không ở trạng thái chưa xác định: gửi PATCH cho draft mới nhất
    const currentDraft = draftValueRef.current;
    executePatch(currentDraft);
  }, [saveStatus, reconcileAndProceed, executePatch]);

  // Nạp cấu hình từ máy chủ (GET /api/settings)
  const reloadSettings = useCallback(async () => {
    if (isPreview) {
      setRetentionDays(DEFAULT_PRIVACY.retentionDays);
      setPersistedDays(DEFAULT_PRIVACY.retentionDays);
      setLoadStatus('success');
      return;
    }

    if (!currentUserIdRef.current) {
      setLoadStatus('idle');
      return;
    }

    const myFetchSeq = ++fetchSeqRef.current;
    const reqGen = generationRef.current;
    const reqUserId = currentUserIdRef.current;

    setLoadStatus('loading');
    setLoadError(null);

    try {
      const res = await getSettingsService();

      if (!isMountedRef.current || generationRef.current !== reqGen || currentUserIdRef.current !== reqUserId) {
        return;
      }

      if (myFetchSeq < fetchSeqRef.current) {
        return;
      }

      if (res.status === 401) {
        setLoadStatus('error');
        setLoadError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      if (!res.success) {
        setLoadStatus('error');
        setLoadError(res);
        return;
      }

      if (isValidPrivacyContract(res.data?.privacy)) {
        const serverDays = res.data.privacy.retentionDays;
        setRetentionDays(serverDays);
        draftValueRef.current = serverDays;
        setPersistedDays(serverDays);
        setLoadStatus('success');
      } else {
        setLoadStatus('error');
        setLoadError({
          code: 'INVALID_RESPONSE',
          message: 'Dữ liệu cài đặt quyền riêng tư không hợp lệ.'
        });
      }
    } catch (err) {
      if (!isMountedRef.current || generationRef.current !== reqGen || currentUserIdRef.current !== reqUserId) {
        return;
      }
      setLoadStatus('error');
      setLoadError(err);
    }
  }, [isPreview, handleUnauthorized]);

  // Khởi tạo nạp cài đặt và xử lý chuyển tài khoản
  useEffect(() => {
    isMountedRef.current = true;
    generationRef.current += 1;
    activeOpRef.current = null;
    inFlightValueRef.current = null;
    pendingValueRef.current = null;
    hasUncertainServerStateRef.current = false;

    // Reset toàn bộ trạng thái lưu và nạp khi đổi tài khoản
    setSaveStatus('idle');
    setSaveError(null);
    setLoadStatus('loading');
    setLoadError(null);
    setRetentionDays(DEFAULT_PRIVACY.retentionDays);
    setPersistedDays(DEFAULT_PRIVACY.retentionDays);
    draftValueRef.current = DEFAULT_PRIVACY.retentionDays;

    reloadSettings();

    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
      activeOpRef.current = null;
      inFlightValueRef.current = null;
      pendingValueRef.current = null;
    };
  }, [currentUserId, reloadSettings]);

  return {
    retentionDays,
    persistedDays,
    loadStatus,
    loadError,
    saveStatus,
    saveError,
    isPreview,
    changeRetentionDays,
    retrySave,
    reloadSettings
  };
}
