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
  signUp: (email: string, password: string) => Promise<void>;
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
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const exp = payload.exp;
        if (exp && Date.now() >= exp * 1000) {
          // Token is expired, don't try to fetch role
          console.log('Token expired, skipping role fetch');
          return;
        }
      } catch (e) {
        // If we can't parse the token, still try the request
      }

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
      // Only log non-401 errors (401 is expected when token is invalid/expired)
      if (error?.response?.status !== 401) {
        console.error('Error fetching user role:', error);
      }
      // Don't set role to customer on 401 - let the user stay logged out
      if (error?.response?.status === 401) {
        // Token is invalid, clear the role but don't set to customer
        setRole(null);
      } else {
        setRole('customer'); // Default to customer on other errors
      }
    }
  };

  const refreshUser = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        // Update API client with token first
        api.defaults.headers.common['Authorization'] = `Bearer ${currentSession.access_token}`;
        // Then fetch role with the token directly
        await fetchUserRole(currentSession.access_token);
      } else {
        setRole(null);
        delete api.defaults.headers.common['Authorization'];
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
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

      if (session?.user && session?.access_token) {
        // Update API client with token first
        api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
        // Only fetch role if we have a valid session (not during token refresh)
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // Then fetch role with the token directly
          await fetchUserRole(session.access_token);
        }
      } else {
        setRole(null);
        delete api.defaults.headers.common['Authorization'];
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      // Update API client with token first
      api.defaults.headers.common['Authorization'] = `Bearer ${data.session.access_token}`;
      // Then fetch role with the token directly
      await fetchUserRole(data.session.access_token);
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      // Update API client with token first
      api.defaults.headers.common['Authorization'] = `Bearer ${data.session.access_token}`;
      // Then fetch role with the token directly
      await fetchUserRole(data.session.access_token);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setUser(null);
    setSession(null);
    setRole(null);
    delete api.defaults.headers.common['Authorization'];
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

