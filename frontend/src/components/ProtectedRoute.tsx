import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useProfileCompletion } from '../hooks/useProfileCompletion';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  skipProfileCheck?: boolean; // Allow certain routes to skip profile completion check
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAdmin = false,
  skipProfileCheck = false
}) => {
  const { user, role, loading: authLoading } = useAuth();
  const location = useLocation();
  const { isComplete, isLoading: profileLoading, error: profileError } = useProfileCompletion();

  // Don't check profile completion for onboarding and profile pages
  const isOnboardingRoute = location.pathname === '/onboarding' || location.pathname === '/profile';
  const shouldCheckProfile = !skipProfileCheck && !isOnboardingRoute;

  if (authLoading || (shouldCheckProfile && profileLoading)) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // Check profile completion for authenticated users (except on onboarding/profile pages)
  // If there's a profile error, allow access to prevent blocking users due to transient errors
  // Only redirect to onboarding if profile is explicitly incomplete AND there's no error
  if (shouldCheckProfile && !isComplete && !profileError && !profileLoading) {
    return <Navigate to="/onboarding" replace />;
  }

  // If there's an error but user is authenticated, let them through
  // This prevents blocking users due to API errors while still enforcing completion when possible
  return <>{children}</>;
};

