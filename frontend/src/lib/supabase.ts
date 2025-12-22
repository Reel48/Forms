import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Aggressively clean the anon key - remove all whitespace, newlines, and control characters
// This handles cases where env vars have trailing newlines or other whitespace
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseAnonKey = rawAnonKey.replace(/[\s\n\r\t]/g, '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Validate the anon key format (should be a JWT)
if (!supabaseAnonKey.includes('.')) {
  console.error('⚠️ WARNING: VITE_SUPABASE_ANON_KEY does not appear to be a valid JWT token. Please check your Vercel environment variables.');
}

// Main client with anon key (for authenticated operations)
// This client automatically includes the user's access token in Realtime subscriptions
// when a session is available, ensuring RLS policies are properly enforced.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

