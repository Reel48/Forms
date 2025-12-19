import { useState, useEffect, useRef } from 'react';
import { clientsAPI } from '../api';
import type { ProfileCompletionStatus } from '../api';

interface UseProfileCompletionReturn {
  isComplete: boolean;
  isLoading: boolean;
  missingFields: string[];
  profileCompletedAt: string | null;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Session-level cache to prevent repeated API calls
let cachedStatus: {
  isComplete: boolean;
  missingFields: string[];
  profileCompletedAt: string | null;
  timestamp: number;
  error: boolean;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useProfileCompletion(): UseProfileCompletionReturn {
  const [isComplete, setIsComplete] = useState(cachedStatus?.isComplete ?? false);
  const [isLoading, setIsLoading] = useState(!cachedStatus);
  const [missingFields, setMissingFields] = useState<string[]>(cachedStatus?.missingFields ?? []);
  const [profileCompletedAt, setProfileCompletedAt] = useState<string | null>(cachedStatus?.profileCompletedAt ?? null);
  const [error, setError] = useState<Error | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchCompletionStatus = async (force = false) => {
    // Use cached result if available and not expired
    if (!force && cachedStatus && (Date.now() - cachedStatus.timestamp) < CACHE_DURATION) {
      setIsComplete(cachedStatus.isComplete);
      setMissingFields(cachedStatus.missingFields);
      setProfileCompletedAt(cachedStatus.profileCompletedAt);
      setIsLoading(false);
      setError(cachedStatus.error ? new Error('Previous check failed') : null);
      return;
    }

    // If we've already failed with 401 and have a cached "complete" status, don't retry
    if (cachedStatus?.error && !force) {
      setIsComplete(cachedStatus.isComplete);
      setMissingFields(cachedStatus.missingFields);
      setProfileCompletedAt(cachedStatus.profileCompletedAt);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await clientsAPI.getProfileCompletionStatus();
      const status: ProfileCompletionStatus = response.data;
      
      // Cache successful result
      cachedStatus = {
        isComplete: status.is_complete,
        missingFields: status.missing_fields || [],
        profileCompletedAt: status.profile_completed_at || null,
        timestamp: Date.now(),
        error: false
      };
      
      setIsComplete(status.is_complete);
      setMissingFields(status.missing_fields || []);
      setProfileCompletedAt(status.profile_completed_at || null);
    } catch (err: any) {
      // Handle 401 errors gracefully - might be token refresh issue
      if (err?.response?.status === 401) {
        // Only log once to avoid console spam
        if (!cachedStatus?.error) {
          console.warn('Profile completion check returned 401 - assuming profile is complete to avoid blocking');
        }
        
        // Try to refresh and retry once (only if we haven't tried before)
        if (!cachedStatus?.error) {
          try {
            const { supabase } = await import('../lib/supabase');
            const { data: { session } } = await supabase.auth.refreshSession();
            if (session?.access_token) {
              // Retry with refreshed token
              const retryResponse = await clientsAPI.getProfileCompletionStatus();
              const status: ProfileCompletionStatus = retryResponse.data;
              
              // Cache successful retry
              cachedStatus = {
                isComplete: status.is_complete,
                missingFields: status.missing_fields || [],
                profileCompletedAt: status.profile_completed_at || null,
                timestamp: Date.now(),
                error: false
              };
              
              setIsComplete(status.is_complete);
              setMissingFields(status.missing_fields || []);
              setProfileCompletedAt(status.profile_completed_at || null);
              setError(null);
              return;
            }
          } catch (refreshErr) {
            // Refresh failed, continue to fallback
          }
        }
        
        // If refresh failed or already tried, use fallback or cache "complete" status
        // This prevents repeated API calls on every route change
        try {
          const profileResponse = await clientsAPI.getMyProfile();
          const profile = profileResponse.data;
          // If profile_completed_at exists, assume profile is complete
          if (profile.profile_completed_at) {
            cachedStatus = {
              isComplete: true,
              missingFields: [],
              profileCompletedAt: profile.profile_completed_at,
              timestamp: Date.now(),
              error: false
            };
            setIsComplete(true);
            setMissingFields([]);
            setProfileCompletedAt(profile.profile_completed_at);
            setError(null);
            return;
          }
          // If no profile_completed_at, check if all required fields are present
          const hasRequiredFields = profile.name && profile.email && profile.company && 
                                   profile.phone && profile.address_line1 && profile.address_city && 
                                   profile.address_state && profile.address_postal_code;
          if (hasRequiredFields) {
            // Profile has all fields, assume complete even if timestamp missing
            cachedStatus = {
              isComplete: true,
              missingFields: [],
              profileCompletedAt: null,
              timestamp: Date.now(),
              error: false
            };
            setIsComplete(true);
            setMissingFields([]);
            setProfileCompletedAt(null);
            setError(null);
            return;
          }
        } catch (profileErr) {
          // Fallback also failed, cache "complete" status to avoid blocking
        }
        
        // Cache "complete" status to prevent repeated 401 errors
        // This allows users to continue using the app even if the endpoint has auth issues
        cachedStatus = {
          isComplete: true,
          missingFields: [],
          profileCompletedAt: null,
          timestamp: Date.now(),
          error: true
        };
        
        setIsComplete(true);
        setMissingFields([]);
        setProfileCompletedAt(null);
        setError(null);
        return;
      }
      
      // For other errors, cache "complete" status to avoid blocking
      cachedStatus = {
        isComplete: true,
        missingFields: [],
        profileCompletedAt: null,
        timestamp: Date.now(),
        error: true
      };
      
      setError(err instanceof Error ? err : new Error('Failed to check profile completion'));
      setIsComplete(true);
      setMissingFields([]);
      setProfileCompletedAt(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch once per component mount, use cache for subsequent renders
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchCompletionStatus();
    } else if (cachedStatus) {
      // Use cached value if component remounts
      setIsComplete(cachedStatus.isComplete);
      setMissingFields(cachedStatus.missingFields);
      setProfileCompletedAt(cachedStatus.profileCompletedAt);
      setIsLoading(false);
    }
  }, []);

  return {
    isComplete,
    isLoading,
    missingFields,
    profileCompletedAt,
    error,
    refetch: () => fetchCompletionStatus(true), // Force refetch when explicitly called
  };
}

// Export function to clear cache (useful after profile updates)
export function clearProfileCompletionCache() {
  cachedStatus = null;
}

