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
export const getRealtimeClient = (): SupabaseClient => {
  if (supabaseServiceRoleKey) {
    console.warn('Using service role key for Realtime - RLS is bypassed!');
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  // Fallback to regular client if service role key not available
  return supabase;
};

