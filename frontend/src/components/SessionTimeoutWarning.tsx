import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Session Timeout Warning Component
 * Shows a warning when the session is about to expire
 * Prompts user to refresh their session
 */
export const SessionTimeoutWarning: React.FC = () => {
  const { session, refreshUser } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    if (!session?.expires_at) return;

    const checkSessionExpiry = () => {
      const expiresAt = (session.expires_at ?? 0) * 1000; // Convert to milliseconds
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (timeUntilExpiry > 0 && timeUntilExpiry <= fiveMinutes) {
        setShowWarning(true);
        setTimeRemaining(Math.floor(timeUntilExpiry / 1000)); // Convert to seconds
      } else {
        setShowWarning(false);
      }
    };

    // Check immediately
    checkSessionExpiry();

    // Check every 10 seconds
    const interval = setInterval(checkSessionExpiry, 10000);

    // Update countdown every second when warning is shown
    const countdownInterval = setInterval(() => {
      if (showWarning && session?.expires_at) {
        const expiresAt = session.expires_at * 1000;
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
        setTimeRemaining(remaining);
        
        if (remaining === 0) {
          setShowWarning(false);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdownInterval);
    };
  }, [session, showWarning]);

  const handleRefresh = async () => {
    try {
      await refreshUser();
      setShowWarning(false);
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!showWarning) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      zIndex: 10000,
      maxWidth: '400px',
      animation: 'slideIn 0.3s ease-out'
    }}>
      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#856404' }}>Session Expiring Soon</strong>
      </div>
      <div style={{ marginBottom: '12px', color: '#856404', fontSize: '14px' }}>
        Your session will expire in {formatTime(timeRemaining)}. Click "Refresh Session" to stay logged in.
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleRefresh}
          style={{
            backgroundColor: '#ffc107',
            color: '#000',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          Refresh Session
        </button>
        <button
          onClick={() => setShowWarning(false)}
          style={{
            backgroundColor: 'transparent',
            color: '#856404',
            border: '1px solid #856404',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Dismiss
        </button>
      </div>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

