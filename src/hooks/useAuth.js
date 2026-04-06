import { useCallback, useEffect, useState } from 'react';

const NO_REFRESH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

async function rawRequest(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

async function request(path, options = {}) {
  const { res, payload } = await rawRequest(path, options);

  if (
    res.status === 401
    && !NO_REFRESH_PATHS.has(path)
    && options.retryOnAuthFailure !== false
  ) {
    const refresh = await rawRequest('/api/auth/refresh', { method: 'POST' });
    if (refresh.res.ok) {
      return request(path, { ...options, retryOnAuthFailure: false });
    }
  }

  if (!res.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrateUser = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await request('/api/auth/me', { method: 'GET' });
      setUser(payload.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  const register = useCallback(async ({ name, email, password }) => {
    const payload = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (payload.user) {
      setUser(payload.user);
    }
    return payload;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const payload = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(payload.user || null);
    return payload.user;
  }, []);

  const logout = useCallback(async () => {
    await request('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const requestEmailVerification = useCallback(async ({ email }) => {
    return request('/api/auth/request-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const verifyEmail = useCallback(async ({ email, token }) => {
    return request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, token }),
    });
  }, []);

  const requestPasswordReset = useCallback(async ({ email }) => {
    return request('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const resetPassword = useCallback(async ({ email, token, newPassword }) => {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, token, newPassword }),
    });
  }, []);

  return {
    user,
    loading,
    register,
    login,
    logout,
    requestEmailVerification,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    hydrateUser,
  };
}