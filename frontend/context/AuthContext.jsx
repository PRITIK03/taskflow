'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, attempt to refresh the session
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const response = await apiFetch('/api/auth/refresh', { method: 'POST' });
        
        if (response.ok) {
          const data = await response.json();
          setAccessToken(data.accessToken);
          
          // Fetch user data
          const meResponse = await apiFetch('/api/auth/me', {}, data.accessToken);
          if (meResponse.ok) {
            const userData = await meResponse.json();
            setUser(userData);
          }
        }
      } catch (error) {
        // Silent fail - no valid session is normal for first visit
        console.log('No existing session');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Login failed');
    }

    const data = await response.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  };

  const signup = async (name, email, password) => {
    const response = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Signup failed');
    }

    const data = await response.json();
    
    // Auto-login after signup
    return login(email, password);
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAccessToken(null);
    setUser(null);
  };

  /**
   * Authenticated fetch with automatic token refresh on 401.
   * Attaches the current access token and retries once with a new token if unauthorized.
   */
  const authedFetch = useCallback(
    async (path, options = {}) => {
      // First attempt with current token
      let response = await apiFetch(path, options, accessToken);

      // If 401, attempt refresh and retry once
      if (response.status === 401) {
        try {
          const refreshResponse = await apiFetch('/api/auth/refresh', { method: 'POST' });
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            setAccessToken(refreshData.accessToken);
            
            // Retry the original request with new token
            response = await apiFetch(path, options, refreshData.accessToken);
          } else {
            // Refresh failed, clear auth state
            setAccessToken(null);
            setUser(null);
          }
        } catch (error) {
          // Refresh failed, clear auth state
          setAccessToken(null);
          setUser(null);
        }
      }

      return response;
    },
    [accessToken]
  );

  const value = {
    accessToken,
    user,
    isLoading,
    login,
    signup,
    logout,
    authedFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
