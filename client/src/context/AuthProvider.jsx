/**
 * AuthProvider.jsx
 *
 * Authentication context provider managing user state, token persistence,
 * login, registration, and logout workflows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { authService } from '../services/authService';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('crop_health_token'));
  const [loading, setLoading] = useState(true);

  // Initialize and hydrate user profile from token on mount
  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      const storedToken = localStorage.getItem('crop_health_token');
      if (storedToken) {
        try {
          const res = await authService.getMe();
          if (isMounted) {
            if (res.success && res.data?.user) {
              setUser(res.data.user);
              setToken(storedToken);
            } else {
              setUser(null);
              setToken(null);
              localStorage.removeItem('crop_health_token');
            }
          }
        } catch {
          if (isMounted) {
            setUser(null);
            setToken(null);
            localStorage.removeItem('crop_health_token');
          }
        }
      } else if (isMounted) {
        setUser(null);
        setToken(null);
      }

      if (isMounted) {
        setLoading(false);
      }
    }

    hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    if (res.success && res.data?.token) {
      localStorage.setItem('crop_health_token', res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
    }
    return res;
  }, []);

  const register = useCallback(async (userData) => {
    return await authService.register(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('crop_health_token');
      setToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authService.getMe();
      if (res.success && res.data?.user) {
        setUser(res.data.user);
      }
    } catch {
      // Handle silently
    }
  }, []);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
