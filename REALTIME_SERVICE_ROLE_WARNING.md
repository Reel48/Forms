# ⚠️ SECURITY WARNING: Service Role Key Usage for Realtime

## Important Security Notice

**The service role key is now being used for Realtime subscriptions on the frontend.** This is a **significant security risk** and should be addressed as soon as possible.

## What This Means

1. **RLS Bypassed**: The service role key bypasses all Row Level Security (RLS) policies
2. **Full Database Access**: Anyone with access to the frontend code can see the service role key
3. **No User-Level Restrictions**: Realtime subscriptions can access all data, not just what the user should see

## Current Implementation

- The service role key is used **only for Realtime subscriptions** (WebSocket connections)
- REST API calls still use the anon key with proper authentication
- The service role key is read from `VITE_SUPABASE_SERVICE_ROLE_KEY` environment variable

## Security Risks

1. **Exposed in Frontend Code**: The service role key will be visible in the browser's JavaScript bundle
2. **No RLS Protection**: Realtime subscriptions bypass RLS, potentially exposing data users shouldn't see
3. **Potential Data Leakage**: If not properly filtered, users might see messages from other conversations

## Required Environment Variable

Add to your Vercel environment variables:
```
VITE_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

**⚠️ WARNING**: This key will be exposed in the frontend bundle. Anyone can view it in the browser's developer tools.

## Recommended Next Steps

1. **Immediate**: Add client-side filtering to ensure users only see their own conversations/messages
2. **Short-term**: Investigate why Supabase Realtime isn't working with access tokens
3. **Long-term**: Implement a backend WebSocket proxy that uses the service role key server-side

## Current Mitigations

- Realtime subscriptions are filtered by `conversation_id` in the channel filter
- The frontend still validates user permissions before displaying data
- REST API calls (for sending messages, etc.) still use proper authentication

## How to Get Service Role Key

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the "service_role" key (NOT the anon key)
4. Add it to your Vercel environment variables as `VITE_SUPABASE_SERVICE_ROLE_KEY`

## Alternative Solutions (Future)

1. **Backend WebSocket Proxy**: Create a backend endpoint that proxies Realtime events
2. **Fix Access Token Issue**: Resolve why Supabase client isn't passing access tokens for Realtime
3. **Use Polling**: Continue using polling instead of Realtime (more secure, slight delay)

