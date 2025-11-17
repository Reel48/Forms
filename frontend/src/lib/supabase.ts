import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Main client with anon key (for authenticated operations)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Service role client for Realtime (bypasses RLS - use with caution!)
// WARNING: This bypasses Row Level Security. Only use for Realtime subscriptions where
// authentication via access token is not working properly.

// Singleton instance to avoid creating multiple clients
let realtimeClientInstance: SupabaseClient | null = null;

export const getRealtimeClient = (): SupabaseClient => {
  // Check if service role key is available
  const hasServiceRoleKey = !!supabaseServiceRoleKey;
  
  console.log('🔍 Realtime client check:', {
    hasServiceRoleKey,
    serviceRoleKeyLength: supabaseServiceRoleKey?.length || 0,
    usingServiceRole: hasServiceRoleKey,
    environment: import.meta.env.MODE,
  });

  if (hasServiceRoleKey) {
    if (!realtimeClientInstance) {
      console.warn('⚠️ Using service role key for Realtime - RLS is bypassed!');
      realtimeClientInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'realtime-service-role', // Use separate storage key to avoid conflicts
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      console.log('✅ Realtime client created with service role key (auth disabled, isolated storage)');
    } else {
      console.log('♻️ Reusing existing Realtime client instance');
    }
    return realtimeClientInstance;
  }
  
  // Fallback to regular client if service role key not available
  console.warn('⚠️ Service role key not available, using anon key for Realtime (may fail with RLS)');
  console.warn('💡 To fix: Add VITE_SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables');
  return supabase;
};

