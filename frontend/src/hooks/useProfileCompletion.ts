import { useState, useEffect } from 'react';
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

export function useProfileCompletion(): UseProfileCompletionReturn {
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [profileCompletedAt, setProfileCompletedAt] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const fetchCompletionStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await clientsAPI.getProfileCompletionStatus();
      const status: ProfileCompletionStatus = response.data;
      
      setIsComplete(status.is_complete);
      setMissingFields(status.missing_fields || []);
      setProfileCompletedAt(status.profile_completed_at || null);
    } catch (err: any) {
      // Handle 401 errors gracefully - might be token refresh issue
      if (err?.response?.status === 401) {
        console.warn('Profile completion check returned 401 - token may need refresh');
        // Try to refresh and retry once
        try {
          const { supabase } = await import('../lib/supabase');
          const { data: { session } } = await supabase.auth.refreshSession();
          if (session?.access_token) {
            // Retry with refreshed token
            const retryResponse = await clientsAPI.getProfileCompletionStatus();
            const status: ProfileCompletionStatus = retryResponse.data;
            setIsComplete(status.is_complete);
            setMissingFields(status.missing_fields || []);
            setProfileCompletedAt(status.profile_completed_at || null);
            setError(null);
            return;
          }
        } catch (refreshErr) {
          console.error('Failed to refresh session for profile completion check:', refreshErr);
        }
      }
      
      const error = err instanceof Error ? err : new Error('Failed to check profile completion');
      setError(error);
      // Default to incomplete on error to be safe
      setIsComplete(false);
      setMissingFields([]);
      setProfileCompletedAt(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompletionStatus();
  }, []);

  return {
    isComplete,
    isLoading,
    missingFields,
    profileCompletedAt,
    error,
    refetch: fetchCompletionStatus,
  };
}

