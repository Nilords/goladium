import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext(null);

// Auth type tracking - distinguishes between JWT (email/pass) and cookie (Google OAuth)
const AUTH_TYPE_KEY = 'goladium_auth_type';
const AUTH_TYPE_JWT = 'jwt';
const AUTH_TYPE_GOOGLE = 'google';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('goladium_token'));
  
  // Flag to prevent checkAuth from overwriting state set by handleGoogleCallback
  const authInProgress = useRef(false);

  useEffect(() => {
    // Skip checkAuth if we're on the OAuth callback route
    // The callback component will handle authentication
    if (window.location.pathname === '/auth/callback') {
      setLoading(false);
      return;
    }
    
    checkAuth();
  }, []);

  const checkAuth = async () => {
    // Don't run if auth is being handled elsewhere (e.g., Google callback)
    if (authInProgress.current) {
      return;
    }
    
    try {
      const storedToken = localStorage.getItem('goladium_token');
      const authType = localStorage.getItem(AUTH_TYPE_KEY);
      
      // Case 1: JWT token exists - validate it
      if (storedToken) {
        const response = await fetch(`/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${storedToken}` }
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setToken(storedToken);
        } else {
          clearAuthState();
        }
        setLoading(false);
        return;
      }
      
      // Case 2: Google OAuth session - check for cached user data first
      if (authType === AUTH_TYPE_GOOGLE) {
        // Check if we have cached user data from recent Google auth
        const cachedUser = sessionStorage.getItem('goladium_user');
        if (cachedUser) {
          try {
            const userData = JSON.parse(cachedUser);
            setUser(userData);
            setLoading(false);
            return;
          } catch (e) {
            sessionStorage.removeItem('goladium_user');
          }
        }
        
        // Try to validate session with backend
        const response = await fetch(`/api/auth/me`, {
          credentials: 'include'
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          // Cache user data for subsequent loads
          sessionStorage.setItem('goladium_user', JSON.stringify(userData));
        } else {
          clearAuthState();
        }
        setLoading(false);
        return;
      }
      
      // Case 3: No auth - not logged in
      setLoading(false);
    } catch (error) {
      console.error('Auth check failed:', error);
      clearAuthState();
      setLoading(false);
    }
  };
  
  const clearAuthState = () => {
    localStorage.removeItem('goladium_token');
    localStorage.removeItem(AUTH_TYPE_KEY);
    sessionStorage.removeItem('goladium_user');
    setToken(null);
    setUser(null);
  };

  const login = async (username, password, turnstileToken) => {

    // Clear any stale cached data from previous sessions
    sessionStorage.removeItem('goladium_user');
    
    const response = await fetch(`/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password,
        username,
        turnstile_token: turnstileToken
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'Login failed');
    }

    localStorage.setItem('goladium_token', data.access_token);
    localStorage.setItem(AUTH_TYPE_KEY, AUTH_TYPE_JWT);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

    const register = async (username, password, turnstileToken) => {
    // Clear any stale cached data from previous sessions
    sessionStorage.removeItem('goladium_user');
    
    const response = await fetch(`/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        turnstile_token: turnstileToken
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'Registration failed');
    }

    localStorage.setItem('goladium_token', data.access_token);
    localStorage.setItem(AUTH_TYPE_KEY, AUTH_TYPE_JWT);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/auth/callback';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleGoogleCallback = async (sessionId) => {
    authInProgress.current = true;
    
    try {
      const response = await fetch(`/api/auth/session`, {
        method: 'GET',
        headers: { 'X-Session-ID': sessionId },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Google authentication failed: ${response.status}`);
      }

      const userData = await response.json();
      
      localStorage.setItem(AUTH_TYPE_KEY, AUTH_TYPE_GOOGLE);
      sessionStorage.setItem('goladium_user', JSON.stringify(userData));
      
      setUser(userData);
      setLoading(false);
      
      return userData;
    } catch (error) {
      throw error;
    } finally {
      authInProgress.current = false;
    }
  };

  const logout = async () => {
    try {
      await fetch(`/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuthState();
    }
  };

  const updateUserBalance = (newBalance) => {
    if (user) {
      const updatedUser = { ...user, balance: newBalance };
      setUser(updatedUser);
      // Update cached user data too
      const authType = localStorage.getItem(AUTH_TYPE_KEY);
      if (authType === AUTH_TYPE_GOOGLE) {
        sessionStorage.setItem('goladium_user', JSON.stringify(updatedUser));
      }
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`/api/auth/me`, {
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const updateUser = (updatedData) => {
    setUser(prev => ({ ...prev, ...updatedData }));
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    loginWithGoogle,
    handleGoogleCallback,
    logout,
    updateUserBalance,
    updateUser,
    refreshUser,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
