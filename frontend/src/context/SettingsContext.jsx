import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from './AuthContext.jsx';
import { useLanguage } from './LanguageContext.jsx';
import {
  getSettingsService,
  updateAppearanceService,
  DEFAULT_APPEARANCE
} from '../services/settingsService.js';
import { isPreviewMode } from '../services/authService.js';

export const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const currentUserId = currentUser?.id;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const { setLang, registerLanguageChangeListener } = useLanguage();
  const isPreview = isPreviewMode();

  // 1. Phân tách rõ ràng các tầng trạng thái
  const [persistedSettings, setPersistedSettings] = useState({ ...DEFAULT_APPEARANCE });
  const [currentSettings, setCurrentSettings] = useState({ ...DEFAULT_APPEARANCE });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadStatus, setLoadStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // 2. Refs quản lý hàng đợi, tracking tuần tự và chống stale response
  const generationRef = useRef(0);
  const mutationSeqRef = useRef(0);
  const fetchSeqRef = useRef(0);
  const lastAppliedFetchSeqRef = useRef(0);
  const patchSeqRef = useRef(0);
  const inFlightPatchSeqRef = useRef(0);
  const pendingChangesRef = useRef({});
  const inFlightRef = useRef(null);
  const isSavingRef = useRef(false);
  const persistedSettingsRef = useRef({ ...DEFAULT_APPEARANCE });
  const saveStatusRef = useRef('idle');
  saveStatusRef.current = saveStatus;

  // 3. Khởi tạo và nạp dữ liệu từ máy chủ (GET /api/settings)
  const fetchSettings = useCallback(async (isSilent = false) => {
    if (!currentUserId || isPreview) {
      setIsLoading(false);
      return;
    }

    const currentGen = generationRef.current;
    const reqUserId = currentUserId;
    const myFetchSeq = ++fetchSeqRef.current;
    const myMutationSeq = mutationSeqRef.current;

    if (!isSilent) {
      setIsLoading(true);
      setLoadStatus('loading');
      setLoadError(null);
    }

    try {
      const res = await getSettingsService();

      // Guard 1: Đổi phiên / tài khoản trong lúc chờ response
      if (generationRef.current !== currentGen || currentUserIdRef.current !== reqUserId) {
        return;
      }

      // Guard 2: Xử lý 401 Unauthorized
      if (res.status === 401) {
        pendingChangesRef.current = {};
        inFlightRef.current = null;
        isSavingRef.current = false;
        setIsSaving(false);
        setLoadStatus('error');
        setLoadError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      // Guard 3: Hai GET về sai thứ tự -> bỏ qua GET cũ hơn
      if (myFetchSeq < lastAppliedFetchSeqRef.current) {
        return;
      }

      // Guard 4: Đã có chỉnh sửa hoặc PATCH hoàn thành sau khi GET này bắt đầu -> GET snapshot đã lỗi thời
      if (mutationSeqRef.current > myMutationSeq) {
        return;
      }

      // Guard 5: Đang có PATCH bay hoặc có thay đổi chưa lưu trong queue
      if (isSavingRef.current || Object.keys(pendingChangesRef.current).length > 0) {
        return;
      }

      if (res.success && res.data?.appearance) {
        const serverAppearance = res.data.appearance;
        lastAppliedFetchSeqRef.current = myFetchSeq;
        persistedSettingsRef.current = serverAppearance;
        setPersistedSettings(serverAppearance);
        setCurrentSettings(serverAppearance);
        setIsLoaded(true);
        setLoadStatus('success');
        setLoadError(null);

        // Hydrate ngôn ngữ giao diện (không kích hoạt PATCH ngược lại)
        if (serverAppearance.language) {
          setLang(serverAppearance.language, { isHydration: true });
        }
      } else {
        if (!isSilent) {
          setLoadStatus('error');
          setLoadError(res.code || 'LOAD_SETTINGS_FAILED');
        }
      }
    } catch {
      if (generationRef.current !== currentGen || currentUserIdRef.current !== reqUserId) return;
      if (!isSilent) {
        setLoadStatus('error');
        setLoadError('NETWORK_ERROR');
      }
    } finally {
      if (generationRef.current === currentGen && currentUserIdRef.current === reqUserId && !isSilent) {
        setIsLoading(false);
      }
    }
  }, [currentUserId, isPreview, setLang, handleUnauthorized]);

  // 4. Theo dõi phiên người dùng: Chuyển tài khoản / Đăng xuất
  useEffect(() => {
    generationRef.current += 1;
    mutationSeqRef.current = 0;
    fetchSeqRef.current = 0;
    lastAppliedFetchSeqRef.current = 0;
    patchSeqRef.current = 0;
    inFlightPatchSeqRef.current = 0;
    inFlightRef.current = null;
    pendingChangesRef.current = {};
    isSavingRef.current = false;
    setIsSaving(false);
    setSaveError(null);
    setLoadError(null);
    setValidationErrors({});

    if (currentUserId && !isPreview) {
      setIsLoaded(false);
      setLoadStatus('loading');
      fetchSettings(false);
    } else {
      persistedSettingsRef.current = { ...DEFAULT_APPEARANCE };
      setPersistedSettings({ ...DEFAULT_APPEARANCE });
      setCurrentSettings({ ...DEFAULT_APPEARANCE });
      setIsLoaded(true);
      setLoadStatus('idle');
      setSaveStatus('idle');
      setIsLoading(false);
    }
  }, [currentUserId, isPreview, fetchSettings]);

  // 5. Kiểm tra điều kiện cần đưa vào hàng đợi lưu backend
  const shouldEnqueueChange = useCallback((field, newValue) => {
    const persistedVal = persistedSettingsRef.current[field];
    const inFlightVal = inFlightRef.current ? inFlightRef.current[field] : undefined;
    const pendingVal = pendingChangesRef.current[field];

    // 1. Đang có PATCH bay cho trường này và giá trị đang bay khác newValue:
    // Bắt buộc enqueue newValue để sau khi PATCH kia xong, PATCH này gửi giá trị cuối cùng.
    if (inFlightVal !== undefined && inFlightVal !== newValue) {
      return true;
    }

    // 2. Không có in-flight (hoặc in-flight trùng newValue), kiểm tra so với persisted:
    if (newValue !== persistedVal) {
      return true;
    }

    // 3. Nếu newValue === persistedVal:
    // Nếu trước đó có pending draft khác chưa bay, xóa bỏ draft thừa vì server đã có newValue
    if (pendingVal !== undefined && pendingVal !== newValue) {
      delete pendingChangesRef.current[field];
    }

    return false;
  }, []);

  // 6. Hàm thực thi hàng đợi lưu tuần tự (Single In-Flight & Chaining)
  const processQueue = useCallback(async () => {
    if (isSavingRef.current) return;
    if (Object.keys(pendingChangesRef.current).length === 0) {
      setSaveStatus('saved');
      return;
    }

    const currentGen = generationRef.current;
    const reqUserId = currentUserIdRef.current;
    const myPatchSeq = ++patchSeqRef.current;
    inFlightPatchSeqRef.current = myPatchSeq;

    // Rút trích các trường cần gửi đợt này
    const toSend = { ...pendingChangesRef.current };
    pendingChangesRef.current = {};
    inFlightRef.current = toSend;

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveStatus('saving');
    setSaveError(null);
    setValidationErrors({});

    try {
      const res = await updateAppearanceService(toSend);

      // Nếu tài khoản hoặc generation đã đổi hoặc request này không còn là request đang bay sở hữu generation:
      // TUYỆT ĐỐI KHÔNG CHẠM VÀO BẤT KỲ STATE HOẶC REF NÀO CỦA GENERATION MỚI!
      if (
        generationRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId ||
        inFlightPatchSeqRef.current !== myPatchSeq
      ) {
        return;
      }

      // Xử lý 401 Unauthorized khi PATCH
      if (res.status === 401) {
        inFlightRef.current = null;
        inFlightPatchSeqRef.current = 0;
        pendingChangesRef.current = {};
        isSavingRef.current = false;
        setIsSaving(false);
        setSaveStatus('error');
        setSaveError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      if (res.success && res.data?.appearance) {
        // Tăng mutation sequence để đánh dấu server đã cập nhật
        mutationSeqRef.current++;
        inFlightRef.current = null;
        inFlightPatchSeqRef.current = 0;

        // Cập nhật cấu hình đã xác nhận trên server
        persistedSettingsRef.current = res.data.appearance;
        setPersistedSettings(res.data.appearance);

        // Nếu trong lúc gửi đã có thêm thay đổi mới tích lũy trong pendingChanges
        if (Object.keys(pendingChangesRef.current).length > 0) {
          isSavingRef.current = false;
          setIsSaving(false);
          processQueue();
        } else {
          isSavingRef.current = false;
          setIsSaving(false);
          setSaveStatus('saved');
        }
      } else {
        // Lỗi lưu: gom toSend trở lại vào pendingChanges để người dùng có thể thử lại
        inFlightRef.current = null;
        inFlightPatchSeqRef.current = 0;
        isSavingRef.current = false;
        setIsSaving(false);
        setSaveStatus('error');
        pendingChangesRef.current = { ...toSend, ...pendingChangesRef.current };
        setSaveError(res.code || 'SAVE_ERROR');
        if (res.errors) {
          setValidationErrors(res.errors);
        }
      }
    } catch {
      if (
        generationRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId ||
        inFlightPatchSeqRef.current !== myPatchSeq
      ) {
        return;
      }
      inFlightRef.current = null;
      inFlightPatchSeqRef.current = 0;
      isSavingRef.current = false;
      setIsSaving(false);
      setSaveStatus('error');
      pendingChangesRef.current = { ...toSend, ...pendingChangesRef.current };
      setSaveError('NETWORK_ERROR');
    }
  }, [handleUnauthorized]);

  // 7. Cập nhật một trường giao diện từ UI (Optimistic & Enqueue)
  const updateAppearanceField = useCallback((field, value) => {
    // 1. Kiểm tra xem có cần đưa vào hàng đợi lưu backend hay không
    const needsEnqueue = shouldEnqueueChange(field, value);

    // 2. Cập nhật lạc quan lên UI ngay tức thì
    setCurrentSettings((prev) => ({
      ...prev,
      [field]: value
    }));

    // 3. Nếu đổi ngôn ngữ, đồng bộ ngay với LanguageContext
    if (field === 'language') {
      setLang(value, { fromSettings: true, isHydration: false });
    }

    // 4. Nếu đang ở chế độ xem trước hoặc chưa đăng nhập: không gửi PATCH
    if (!currentUserId || isPreview) {
      return;
    }

    // 5. Nếu giá trị không đổi và không có in-flight/pending: không gọi PATCH
    if (!needsEnqueue) {
      return;
    }

    // Đánh dấu có mutation mới của người dùng
    mutationSeqRef.current++;

    // 6. Đưa trường thay đổi vào hàng đợi chờ lưu
    pendingChangesRef.current[field] = value;

    // 7. Kích hoạt xử lý hàng đợi nếu không có request nào đang bay
    if (!isSavingRef.current) {
      processQueue();
    }
  }, [currentUserId, isPreview, setLang, shouldEnqueueChange, processQueue]);

  // 8. Đồng bộ nút bấm chuyển đổi ngôn ngữ ở Header với SettingsProvider
  useEffect(() => {
    if (currentUserId && !isPreview && typeof registerLanguageChangeListener === 'function') {
      return registerLanguageChangeListener((newLang) => {
        updateAppearanceField('language', newLang);
      });
    }
  }, [currentUserId, isPreview, registerLanguageChangeListener, updateAppearanceField]);

  // 9. Tự động đối soát dữ liệu khi người dùng chuyển lại tab (Focus Re-sync)
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (
        !isSavingRef.current &&
        Object.keys(pendingChangesRef.current).length === 0 &&
        saveStatusRef.current !== 'error' &&
        currentUserId &&
        !isPreview
      ) {
        fetchSettings(true); // Tải lại ở chế độ im lặng
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleFocusOrVisible();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUserId, isPreview, fetchSettings]);

  // 10. Áp dụng hiệu ứng giao diện lên DOM (Theme, Font Size, Contrast, Motion)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const docEl = document.documentElement;

    // A. Theme: dark | light | system
    const themeVal = currentSettings.theme || 'dark';
    let cleanupSystemListener = null;

    if (themeVal === 'system') {
      const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      const applySystemTheme = (matches) => {
        docEl.setAttribute('data-theme', matches ? 'dark' : 'light');
      };

      if (mql) {
        applySystemTheme(mql.matches);
        const listener = (e) => applySystemTheme(e.matches);
        if (mql.addEventListener) {
          mql.addEventListener('change', listener);
          cleanupSystemListener = () => mql.removeEventListener('change', listener);
        } else if (mql.addListener) {
          mql.addListener(listener);
          cleanupSystemListener = () => mql.removeListener(listener);
        }
      } else {
        docEl.setAttribute('data-theme', 'dark');
      }
    } else {
      docEl.setAttribute('data-theme', themeVal);
    }

    // B. Cỡ chữ: small | medium | large
    docEl.setAttribute('data-font-size', currentSettings.fontSize || 'medium');

    // C. Độ tương phản cao
    if (currentSettings.highContrast) {
      docEl.setAttribute('data-high-contrast', 'true');
    } else {
      docEl.removeAttribute('data-high-contrast');
    }

    // D. Giảm chuyển động
    if (currentSettings.reducedMotion) {
      docEl.setAttribute('data-reduced-motion', 'true');
    } else {
      docEl.removeAttribute('data-reduced-motion');
    }

    return () => {
      if (cleanupSystemListener) {
        cleanupSystemListener();
      }
    };
  }, [
    currentSettings.theme,
    currentSettings.fontSize,
    currentSettings.highContrast,
    currentSettings.reducedMotion
  ]);

  // 11. Thử lại thao tác lưu khi gặp sự cố
  const retrySave = useCallback(() => {
    if (!isSavingRef.current && Object.keys(pendingChangesRef.current).length > 0) {
      processQueue();
    }
  }, [processQueue]);

  const value = {
    currentSettings,
    persistedSettings,
    isSaving,
    isLoading,
    isLoaded,
    loadStatus,
    loadError,
    saveStatus,
    saveError,
    validationErrors,
    isPreview,
    updateAppearanceField,
    retrySave,
    reloadSettings: () => fetchSettings(false)
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    return {
      currentSettings: { ...DEFAULT_APPEARANCE },
      persistedSettings: { ...DEFAULT_APPEARANCE },
      isSaving: false,
      isLoading: false,
      isLoaded: false,
      loadStatus: 'idle',
      loadError: null,
      saveStatus: 'idle',
      saveError: null,
      validationErrors: {},
      isPreview: false,
      updateAppearanceField: () => {},
      retrySave: () => {},
      reloadSettings: () => {}
    };
  }
  return context;
}
