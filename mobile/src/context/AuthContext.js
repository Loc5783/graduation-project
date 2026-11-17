import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMeApi, loginApi, registerApi, logoutApi, verifyEmailApi, resendVerificationApi, cancelRegistrationApi } from '../api/authApi';
import { setOnUnauthorized } from '../api/client';
import { getServerUrl, setServerUrl, getUserInfo, DEFAULT_SERVER_URL } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);

  // Tải cấu hình và phiên ban đầu
  useEffect(() => {
    async function init() {
      try {
        const url = await getServerUrl();
        setServerUrlState(url);

        const cachedUser = await getUserInfo();
        if (cachedUser) {
          setCurrentUser(cachedUser);
        }

        // Kiểm tra lại với máy chủ
        const res = await getMeApi();
        if (res.success && res.data?.user) {
          setCurrentUser(res.data.user);
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra phiên:', err);
      } finally {
        setIsLoading(false);
      }
    }

    setOnUnauthorized(() => {
      setCurrentUser(null);
    });

    init();
  }, []);

  const login = useCallback(async (credentials) => {
    setIsLoading(true);
    try {
      const res = await loginApi(credentials);
      if (res.success && res.data?.user) {
        setCurrentUser(res.data.user);
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data) => {
    setIsLoading(true);
    try {
      return await registerApi(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const updateServerUrl = useCallback(async (newUrl) => {
    const saved = await setServerUrl(newUrl);
    if (saved) {
      setServerUrlState(saved);
    }
    return saved;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser),
        isLoading,
        serverUrl,
        updateServerUrl,
        login,
        register,
        verifyEmail: verifyEmailApi,
        resendVerification: resendVerificationApi,
        cancelRegistration: cancelRegistrationApi,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
