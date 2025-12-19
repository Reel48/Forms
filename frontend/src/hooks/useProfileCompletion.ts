import { useState, useEffect } from 'react';
import { clientsAPI, ProfileCompletionStatus } from '../api';

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
    } catch (err) {
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

