# Supabase Realtime WebSocket Authentication Issue - Root Cause Analysis

## The Problem

Supabase Realtime subscriptions were failing with `CHANNEL_ERROR` and `TIMED_OUT` errors. The WebSocket connection was being established, but authentication was failing, causing RLS policies to block the subscriptions.

## Root Cause

### How Supabase Realtime Authentication Works

1. **WebSocket Connection**: Supabase Realtime uses WebSocket connections, which **cannot include HTTP headers** like `Authorization: Bearer <token>`

2. **Two-Stage Authentication**:
   - **Stage 1**: WebSocket connection is established using the **anon key** in the URL query parameter
     ```
     wss://project.supabase.co/realtime/v1/websocket?apikey=<anon-key>
     ```
   - **Stage 2**: After connection, the Supabase client should automatically send the user's **access token** via the WebSocket protocol (not headers)

3. **The Issue**: The Supabase JS client should automatically include the access token from the current session when subscribing to Realtime channels, but this wasn't happening in our case.

### Why It Failed

1. **Session Timing**: The session might not have been fully established on the Supabase client when the Realtime subscription was attempted
2. **Client Configuration**: The Supabase client might need explicit configuration to pass the access token for Realtime
3. **RLS Policies**: Without the access token, `auth.uid()` returns `NULL` in RLS policies, causing all subscriptions to be blocked

## Evidence

- WebSocket URL showed only the anon key: `wss://...?apikey=<anon-key>`
- No access token was being passed for authentication
- RLS policies blocked subscriptions because `auth.uid()` was `NULL`
- Error: `CHANNEL_ERROR` and `TIMED_OUT`

## The Solution (Current Implementation)

We've temporarily disabled Realtime and reverted to **efficient polling every 3 seconds**. This provides:
- ✅ Reliable message delivery
- ✅ No WebSocket connection errors
- ✅ Works with RLS policies (uses REST API with proper auth headers)
- ⚠️ Slight delay (up to 3 seconds) compared to instant Realtime updates

## How to Fix Realtime (Future Implementation)

### Option 1: Ensure Session is Set Before Subscribing

The Supabase client should automatically use the session's access token, but we need to ensure:

1. **Wait for session to be available**:
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   if (!session) {
     // Wait or retry
     return;
   }
   ```

2. **Set session explicitly** (if needed):
   ```typescript
   await supabase.auth.setSession({
     access_token: session.access_token,
     refresh_token: session.refresh_token,
   });
   ```

3. **Then subscribe**:
   ```typescript
   const channel = supabase
     .channel('chat_messages')
     .on('postgres_changes', { ... })
     .subscribe();
   ```

### Option 2: Use Realtime with Custom JWT (Advanced)

If the automatic session handling doesn't work, you can pass the JWT explicitly:

1. **Include JWT in channel config** (if supported by client version)
2. **Or use Realtime REST API** instead of WebSocket for authenticated subscriptions

### Option 3: Check Supabase Client Version

The issue might be related to the Supabase JS client version (`@supabase/supabase-js@^2.80.0`). Consider:
- Updating to the latest version
- Checking release notes for Realtime authentication fixes
- Reporting the issue to Supabase if it's a bug

## Why Polling Works

Polling uses the REST API with proper `Authorization: Bearer <token>` headers:
- ✅ Headers are supported in HTTP requests
- ✅ Access token is automatically included by axios interceptors
- ✅ RLS policies work correctly with `auth.uid()`
- ✅ No WebSocket connection issues

## Recommendations

1. **Short-term**: Continue using polling (every 3 seconds) - it's reliable and works well
2. **Long-term**: Investigate Supabase client updates or alternative Realtime authentication methods
3. **Monitor**: Watch for Supabase client updates that might fix Realtime authentication

## References

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [WebSocket Authentication Limitations](https://supabase.com/docs/guides/functions/websockets)
- [Supabase JS Client GitHub](https://github.com/supabase/supabase-js)

