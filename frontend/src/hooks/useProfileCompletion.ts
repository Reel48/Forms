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
            // Update API token - the api instance is already imported via clientsAPI
            // The token will be picked up by the axios interceptor on the next request
            // Just retry the request
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
        
        // If refresh failed, try to check profile directly via getMyProfile
        // This is a fallback to avoid blocking users unnecessarily
        try {
          const profileResponse = await clientsAPI.getMyProfile();
          const profile = profileResponse.data;
          // If profile_completed_at exists, assume profile is complete
          if (profile.profile_completed_at) {
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
            setIsComplete(true);
            setMissingFields([]);
            setProfileCompletedAt(null);
            setError(null);
            return;
          }
        } catch (profileErr) {
          console.error('Failed to fetch profile as fallback:', profileErr);
        }
      }
      
      const error = err instanceof Error ? err : new Error('Failed to check profile completion');
      setError(error);
      // On error, default to complete to avoid blocking users
      // This is safer than blocking access due to a transient error
      setIsComplete(true);
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

