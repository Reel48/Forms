# Realtime Verification Guide - Production

## How to Verify Realtime is Working

After deploying to production with the service role key set, follow these steps to verify Realtime is working correctly.

### Step 1: Open Browser Console

1. Go to your production website
2. Open Developer Tools (F12 or Cmd+Option+I)
3. Go to the **Console** tab
4. Clear the console (optional, for cleaner output)

### Step 2: Open Chat Widget/Page

1. **For Customer:** Open the chat widget (click the chat button)
2. **For Admin:** Navigate to the chat page

### Step 3: Check Console Logs

You should see these logs in order:

#### ✅ Success Indicators:

```
🔍 Realtime client check: {
  hasServiceRoleKey: true,
  serviceRoleKeyLength: 200+ (or similar),
  usingServiceRole: true,
  environment: "production"
}
⚠️ Using service role key for Realtime - RLS is bypassed!
✅ Realtime client created with service role key
📨 Messages subscription status: SUBSCRIBED
✅ Successfully subscribed to chat messages via Realtime
💬 Conversations subscription status: SUBSCRIBED
✅ Successfully subscribed to chat conversations via Realtime
```

#### ❌ Failure Indicators:

If you see any of these, Realtime is NOT working:

```
⚠️ Service role key not available, using anon key for Realtime (may fail with RLS)
💡 To fix: Add VITE_SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables
```

OR

```
❌ Error subscribing to chat messages: CHANNEL_ERROR
💡 Check: Is VITE_SUPABASE_SERVICE_ROLE_KEY set in Vercel?
```

### Step 4: Test Realtime Functionality

#### Test 1: Send a Message
1. Send a message from one browser/tab
2. **Expected:** Message should appear instantly in another browser/tab (no page refresh needed)
3. **If it works:** Realtime is working! ✅
4. **If it doesn't:** Check console for errors

#### Test 2: Check WebSocket Connection
1. In browser console, look for WebSocket connections
2. Go to **Network** tab → Filter by **WS** (WebSocket)
3. You should see a connection to: `wss://boisewltuwcjfrdjnfwd.supabase.co/realtime/v1/websocket`
4. **Check the URL parameters:**
   - ✅ **Good:** Should contain the service role key (long JWT token)
   - ❌ **Bad:** Contains `role%3D%22anon%22` (anon key)

#### Test 3: Monitor Network Activity
1. Open **Network** tab in DevTools
2. Filter by **Fetch/XHR**
3. **Expected:** No frequent polling requests (every few seconds)
4. **If you see:** Requests every 3-10 seconds, Realtime might not be working (falling back to polling)

### Step 5: Verify in Supabase Dashboard

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Database** → **Replication**
4. Verify that `chat_messages` and `chat_conversations` are listed
5. They should show as **Active** for Realtime

## Troubleshooting

### Issue: Service Role Key Not Found

**Symptoms:**
```
hasServiceRoleKey: false
⚠️ Service role key not available
```

**Solution:**
1. Go to Vercel → Settings → Environment Variables
2. Verify `VITE_SUPABASE_SERVICE_ROLE_KEY` is set for **Production**
3. If missing, add it from Supabase Dashboard → Settings → API → service_role key
4. Redeploy

### Issue: CHANNEL_ERROR

**Symptoms:**
```
❌ Error subscribing to chat messages: CHANNEL_ERROR
```

**Possible Causes:**
1. Service role key is incorrect
2. Realtime not enabled for tables
3. Network/firewall blocking WebSocket

**Solution:**
1. Verify service role key is correct in Vercel
2. Check Supabase Dashboard → Database → Replication
3. Ensure `chat_messages` and `chat_conversations` are enabled
4. Check browser console for WebSocket connection errors

### Issue: TIMED_OUT

**Symptoms:**
```
⏱️ Realtime subscription timed out
```

**Solution:**
- This is usually temporary
- Check network connection
- Refresh the page
- If persistent, check Supabase status page

### Issue: Still Using Polling

**Symptoms:**
- See API requests every few seconds in Network tab
- Messages don't appear instantly

**Solution:**
1. Check console for subscription errors
2. Verify service role key is set
3. Check WebSocket connection in Network tab
4. Ensure subscriptions show `SUBSCRIBED` status

## Expected Behavior

### When Realtime is Working:
- ✅ Messages appear instantly (no refresh needed)
- ✅ No frequent polling requests
- ✅ Console shows `SUBSCRIBED` status
- ✅ WebSocket connection is active
- ✅ Unread counts update in real-time

### When Realtime is NOT Working (Fallback):
- ⚠️ Messages only appear after polling interval (10-30 seconds)
- ⚠️ Frequent API requests in Network tab
- ⚠️ Console shows errors or `CHANNEL_ERROR`
- ⚠️ WebSocket connection fails or uses anon key

## Quick Verification Checklist

- [ ] Console shows `hasServiceRoleKey: true`
- [ ] Console shows `✅ Successfully subscribed to chat messages via Realtime`
- [ ] Console shows `✅ Successfully subscribed to chat conversations via Realtime`
- [ ] WebSocket connection exists in Network tab
- [ ] WebSocket URL contains service role key (not anon key)
- [ ] Messages appear instantly without refresh
- [ ] No frequent polling requests (only occasional backup polling)

## Need Help?

If Realtime is still not working after following this guide:

1. **Check Vercel Environment Variables:**
   - `VITE_SUPABASE_URL` ✅
   - `VITE_SUPABASE_ANON_KEY` ✅ (Production)
   - `VITE_SUPABASE_SERVICE_ROLE_KEY` ✅ (All environments)

2. **Check Supabase Dashboard:**
   - Database → Replication → Tables enabled for Realtime

3. **Check Browser Console:**
   - Look for any error messages
   - Check WebSocket connection status

4. **Redeploy:**
   - After changing environment variables, always redeploy

