import { useState, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { FaTimes } from 'react-icons/fa';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration || 5000,
    };
    
    setNotifications(prev => [...prev, newNotification]);
    
    const duration = newNotification.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: '400px',
        }}
      >
        {notifications.map(notification => (
          <div
            key={notification.id}
            style={{
              padding: '1rem',
              borderRadius: '0.375rem',
              backgroundColor: 
                notification.type === 'success' ? 'var(--color-success-light)' :
                notification.type === 'error' ? 'var(--color-danger-light)' :
                notification.type === 'warning' ? 'var(--color-warning-light)' :
                'var(--color-primary-light)',
              border: `1px solid ${
                notification.type === 'success' ? 'var(--color-success)' :
                notification.type === 'error' ? 'var(--color-danger)' :
                notification.type === 'warning' ? 'var(--color-warning)' :
                'var(--color-primary)'
              }`,
              color: 
                notification.type === 'success' ? 'var(--color-verdant-pulse)' :
                notification.type === 'error' ? 'var(--color-terra-blush)' :
                notification.type === 'warning' ? 'var(--color-sunlit-saffron)' :
                'var(--color-primary)',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1rem',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                {notification.message}
              </div>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.25rem',
                color: 'inherit',
                opacity: 0.7,
                padding: '0',
                lineHeight: '1',
              }}
            >
              <FaTimes />
            </button>
          </div>
        ))}
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
    </NotificationContext.Provider>
  );
}

