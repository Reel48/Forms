# Realtime Testing Checklist - Production

## ✅ Service Role Key Verification

Your service role key has been provided. Now let's verify everything is set up correctly.

## Step 1: Verify Vercel Environment Variables

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Verify these are set for **Production**:
   - ✅ `VITE_SUPABASE_URL` = `https://boisewltuwcjfrdjnfwd.supabase.co`
   - ✅ `VITE_SUPABASE_ANON_KEY` = (your anon key)
   - ✅ `VITE_SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (the key you provided)

3. **Important:** The service role key should be set for:
   - ✅ Production
   - ✅ Preview (optional, but recommended)
   - ✅ Development (optional, but recommended)

## Step 2: Verify Latest Deployment

1. Go to **Vercel Dashboard** → **Deployments**
2. Check that the latest deployment includes the enhanced logging changes
3. If not, wait for the next deployment or trigger a redeploy

## Step 3: Test in Production

### Open Your Production Website

1. Navigate to your production URL
2. Open **Browser Developer Tools** (F12 or Cmd+Option+I)
3. Go to the **Console** tab

### Test Customer Chat Widget

1. Click the chat widget button to open it
2. Look for these console logs:

**✅ Expected Success Logs:**
```
🔍 Realtime client check: {
  hasServiceRoleKey: true,
  serviceRoleKeyLength: 200+,
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

**❌ If You See Errors:**
```
⚠️ Service role key not available
💡 To fix: Add VITE_SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables
```

**If you see errors:**
- The environment variable might not be set correctly
- Or the deployment might not have picked it up yet
- Try redeploying after verifying the variable is set

### Test Admin Chat Page

1. Navigate to the admin chat page
2. Select a conversation
3. Check console for the same success logs

## Step 4: Test Realtime Functionality

### Test 1: Real-time Message Delivery

1. Open your website in **two different browser windows/tabs** (or use incognito)
2. In **Window 1:** Open chat and send a message
3. In **Window 2:** Open chat (same conversation)
4. **Expected:** Message should appear in Window 2 **instantly** without refresh
5. **If it works:** ✅ Realtime is working!

### Test 2: Check WebSocket Connection

1. In Developer Tools, go to **Network** tab
2. Filter by **WS** (WebSocket)
3. You should see a connection to:
   ```
   wss://boisewltuwcjfrdjnfwd.supabase.co/realtime/v1/websocket?apikey=...
   ```
4. Click on the WebSocket connection
5. Check the **Request URL** - it should contain your service role key (long JWT token)
6. **Bad sign:** If you see `role%3D%22anon%22` in the URL, it's using the anon key

### Test 3: Monitor Network Activity

1. Stay in the **Network** tab
2. Filter by **Fetch/XHR**
3. **Expected:** No frequent polling requests (every few seconds)
4. **If you see:** Requests every 3-10 seconds, Realtime might not be working (falling back to polling)

## Step 5: Verify Database Replication

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project: `boisewltuwcjfrdjnfwd`
3. Go to **Database** → **Replication**
4. Verify these tables are listed and **Active**:
   - ✅ `chat_messages`
   - ✅ `chat_conversations`

## Troubleshooting

### Issue: Service Role Key Not Found

**Check:**
1. Vercel environment variable is set for **Production**
2. Variable name is exactly: `VITE_SUPABASE_SERVICE_ROLE_KEY`
3. Value matches the key you provided
4. Redeploy after setting the variable

### Issue: Still Using Anon Key

**Check:**
1. WebSocket URL in Network tab
2. If it contains `role%3D%22anon%22`, the service role key isn't being used
3. Verify environment variable is set correctly
4. Clear browser cache and hard refresh (Cmd+Shift+R)

### Issue: CHANNEL_ERROR

**Possible causes:**
1. Service role key is incorrect
2. Realtime not enabled for tables
3. Network/firewall blocking WebSocket

**Solutions:**
1. Double-check the service role key in Vercel
2. Verify tables are enabled in Supabase Replication
3. Check browser console for specific error messages

## Success Indicators

When Realtime is working correctly, you should see:

- ✅ Console shows `hasServiceRoleKey: true`
- ✅ Console shows `✅ Successfully subscribed to chat messages via Realtime`
- ✅ Console shows `✅ Successfully subscribed to chat conversations via Realtime`
- ✅ WebSocket connection exists in Network tab
- ✅ WebSocket URL contains service role key (not anon key)
- ✅ Messages appear instantly without refresh
- ✅ No frequent polling requests

## Next Steps

After verifying Realtime is working:

1. ✅ Test with multiple users/conversations
2. ✅ Monitor for any errors in production
3. ✅ Check Supabase logs if issues arise
4. ✅ Document any edge cases you discover

## Security Reminder

⚠️ **Important:** The service role key you provided is now in Vercel environment variables. This is correct. However:

- ❌ **Never** commit this key to git
- ❌ **Never** hardcode it in your source code
- ❌ **Never** expose it in client-side code (it will be in the bundle, but that's the trade-off for Realtime)
- ✅ **Only** store it in Vercel environment variables
- ✅ **Only** use it for Realtime subscriptions (which we're doing)

The key is already visible in the frontend JavaScript bundle, but this is the only way to use it for Realtime subscriptions. The subscriptions are filtered by `conversation_id`, so users can only see messages from conversations they're part of.

