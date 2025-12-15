import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import api from '../api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: 'admin' | 'customer' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ requiresVerification?: boolean } | void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'admin' | 'customer' | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (token?: string) => {
    try {
      // Get user role from backend
      const accessToken = token || session?.access_token;
      if (!accessToken) {
        // No token available, don't try to fetch role
        return;
      }

      // Check if token is expired (basic check - JWT tokens have exp claim)
      try {
        const parts = accessToken.split('.');
        if (parts.length !== 3) {
          console.log('Invalid token format, skipping role fetch');
          setRole(null);
          return;
        }
        
        const payload = JSON.parse(atob(parts[1]));
        const exp = payload.exp;
        if (exp && Date.now() >= exp * 1000) {
          // Token is expired, try to refresh it first
          console.log('Token expired, attempting refresh...');
          try {
            const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !newSession) {
              console.log('Token refresh failed, clearing role');
              setRole(null);
              return;
            }
            // Use the new token
            api.defaults.headers.common['Authorization'] = `Bearer ${newSession.access_token}`;
            // Retry with new token
            const response = await api.get('/api/auth/me', {
              headers: {
                Authorization: `Bearer ${newSession.access_token}`,
              },
            });
            if (response.data && response.data.role) {
              setRole(response.data.role);
            } else {
              setRole('customer');
            }
            return;
          } catch (refreshErr) {
            console.log('Token refresh error:', refreshErr);
            setRole(null);
            return;
          }
        }
      } catch (e) {
        // If we can't parse the token, don't try the request
        console.log('Could not parse token, skipping role fetch:', e);
        setRole(null);
        return;
      }

      // Make sure we're using the token from the parameter
      const response = await api.get('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.data && response.data.role) {
        setRole(response.data.role);
      } else {
        setRole('customer'); // Default role
      }
    } catch (error: any) {
      // Handle 401 errors - token might be expired or invalid
      if (error?.response?.status === 401) {
        // Try to refresh the session
        try {
          const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && newSession) {
            // Retry with new token
            api.defaults.headers.common['Authorization'] = `Bearer ${newSession.access_token}`;
            try {
              const retryResponse = await api.get('/api/auth/me', {
                headers: {
                  Authorization: `Bearer ${newSession.access_token}`,
                },
              });
              if (retryResponse.data && retryResponse.data.role) {
                setRole(retryResponse.data.role);
                return;
              }
            } catch (retryError) {
              console.log('Retry after refresh failed:', retryError);
            }
          }
        } catch (refreshErr) {
          console.log('Session refresh failed:', refreshErr);
        }
        
        // Token is invalid or refresh failed, clear the role
        setRole(null);
        return;
      }
      // Log other errors
      console.error('Error fetching user role:', error);
      // Don't set role to customer on error - leave it as null
      setRole(null);
    }
  };

  const refreshUser = async () => {
    try {
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.log('Session error:', error.message);
        setSession(null);
        setUser(null);
        setRole(null);
        delete api.defaults.headers.common['Authorization'];
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user && currentSession?.access_token) {
        // Check if token is expired before trying to use it
        try {
          const parts = currentSession.access_token.split('.');
          if (parts.length !== 3) {
            console.log('Invalid token format in session');
            setRole(null);
            delete api.defaults.headers.common['Authorization'];
            return;
          }
          
          const payload = JSON.parse(atob(parts[1]));
          const exp = payload.exp;
          if (exp && Date.now() >= exp * 1000) {
            // Token is expired, try to refresh it
            console.log('Session token expired, attempting refresh...');
            try {
              const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError || !newSession) {
                console.log('Token refresh failed');
                setRole(null);
                delete api.defaults.headers.common['Authorization'];
                return;
              }
              // Use the refreshed session
              setSession(newSession);
              setUser(newSession.user);
              api.defaults.headers.common['Authorization'] = `Bearer ${newSession.access_token}`;
              await fetchUserRole(newSession.access_token);
              return;
            } catch (refreshErr) {
              console.log('Token refresh error:', refreshErr);
              setRole(null);
              delete api.defaults.headers.common['Authorization'];
              return;
            }
          }
        } catch (e) {
          // If we can't parse the token, don't try to use it
          console.log('Could not parse session token:', e);
          setRole(null);
          delete api.defaults.headers.common['Authorization'];
          return;
        }

        // Token is valid, update API client and fetch role
        api.defaults.headers.common['Authorization'] = `Bearer ${currentSession.access_token}`;
        // Then fetch role with the token directly
        await fetchUserRole(currentSession.access_token);
      } else {
        setRole(null);
        delete api.defaults.headers.common['Authorization'];
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
      setRole(null);
      delete api.defaults.headers.common['Authorization'];
    }
  };

  useEffect(() => {
    // Get initial session
    refreshUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Only fetch role on specific events (not during recovery/initialization)
      const shouldFetchRole = event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED';

      if (session?.user && session?.access_token && shouldFetchRole) {
        // Check if token is expired before trying to use it
        let tokenValid = true;
        try {
          const parts = session.access_token.split('.');
          if (parts.length !== 3) {
            tokenValid = false;
            console.log('Invalid token format in auth state change');
          } else {
            const payload = JSON.parse(atob(parts[1]));
            const exp = payload.exp;
            if (exp && Date.now() >= exp * 1000) {
              tokenValid = false;
              console.log('Token expired in auth state change, attempting refresh...');
              // Try to refresh the session
              try {
                const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
                if (!refreshError && newSession) {
                  // Use the refreshed session
                  setSession(newSession);
                  setUser(newSession.user);
                  api.defaults.headers.common['Authorization'] = `Bearer ${newSession.access_token}`;
                  await fetchUserRole(newSession.access_token);
                  return;
                }
              } catch (refreshErr) {
                console.log('Token refresh failed in auth state change:', refreshErr);
              }
            }
          }
        } catch (e) {
          tokenValid = false;
          console.log('Could not parse token in auth state change:', e);
        }

        if (tokenValid) {
          // Update API client with token first
          api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
          // Then fetch role with the token directly
          await fetchUserRole(session.access_token);
        } else {
          setRole(null);
          delete api.defaults.headers.common['Authorization'];
        }
      } else {
        // No session or not a role-fetch event
        if (!session || !session.user) {
          setRole(null);
          delete api.defaults.headers.common['Authorization'];
        } else if (session.user && session.access_token && !shouldFetchRole) {
          // We have a session but it's not a role-fetch event (e.g., INITIAL_SESSION)
          // Check if token is valid before setting header
          try {
            const parts = session.access_token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              const exp = payload.exp;
              if (!exp || Date.now() < exp * 1000) {
                // Token is valid, set the auth header
                api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
              }
            }
          } catch (e) {
            // If we can't parse, don't set the header
            console.log('Could not parse token, not setting auth header');
          }
        }
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    // Backend-primary auth: uses backend endpoint so we get rate limiting,
    // account lockout, session tracking, and consistent logging.
    const response = await api.post('/api/auth/login', { email, password });
    const accessToken: string | undefined = response.data?.session?.access_token;
    const refreshToken: string | undefined = response.data?.session?.refresh_token;

    if (!accessToken || !refreshToken) {
      throw new Error('Login failed: missing session tokens');
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      throw sessionError;
    }

    // Ensure local state and role are correct
    await refreshUser();
  };

  const signUp = async (email: string, password: string) => {
    // Backend-primary registration: creates auth user with email_confirm=false,
    // sends verification email, and does NOT create a session until verified.
    const response = await api.post('/api/auth/register', { email, password });
    const requiresVerification = Boolean(response.data?.requires_verification);
    return { requiresVerification };
  };

  const signOut = async () => {
    try {
      // Revoke token server-side (best-effort) before clearing the browser session.
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.access_token) {
          await api.post(
            '/api/auth/logout',
            {},
            { headers: { Authorization: `Bearer ${currentSession.access_token}` } }
          );
        }
      } catch {
        // Ignore logout errors; still clear local session
      }

      const { error } = await supabase.auth.signOut();
      // If error is about missing session, that's okay - we still want to clear local state
      if (error && !error.message?.includes('session missing') && !error.message?.includes('Auth session missing')) {
        throw error;
      }
    } catch (error: any) {
      // If it's a session missing error, we'll continue with clearing local state
      if (error?.message?.includes('session missing') || error?.message?.includes('Auth session missing')) {
        // This is fine - session was already expired/missing
      } else {
        // For other errors, re-throw
        throw error;
      }
    } finally {
      // Always clear local state regardless of signOut result
      setUser(null);
      setSession(null);
      setRole(null);
      delete api.defaults.headers.common['Authorization'];
    }
  };

  const value: AuthContextType = {
    user,
    session,
    role,
    loading,
    signIn,
    signUp,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

