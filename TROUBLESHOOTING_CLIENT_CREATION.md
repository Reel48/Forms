# Troubleshooting Client Creation Issues

## Problem
Test entries from curl work, but submissions from the website don't appear in Supabase.

## Most Likely Cause
The frontend is not configured with the correct `VITE_API_URL` environment variable in Vercel, so it's trying to connect to `http://localhost:8000` instead of your AWS backend.

## Quick Fix Steps

### 1. Check Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `Forms` (or whatever it's named)
3. Go to **Settings** → **Environment Variables**
4. Look for `VITE_API_URL`

**If it's missing or incorrect:**
- Click **Add New**
- Name: `VITE_API_URL`
- Value: `https://uvpc5mx3se.us-east-1.awsapprunner.com`
- **Important:** Select all environments:
  - ✅ Production
  - ✅ Preview  
  - ✅ Development (optional)
- Click **Save**

### 2. Redeploy Frontend

After adding/updating the environment variable:
1. Go to **Deployments** tab
2. Click the **⋯** menu on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger auto-deploy

### 3. Verify the Fix

1. Open your website: `https://forms-ten-self.vercel.app`
2. Open browser DevTools (F12) → **Console** tab
3. Look for these log messages:
   ```
   API URL configured: https://uvpc5mx3se.us-east-1.awsapprunner.com
   VITE_API_URL env var: https://uvpc5mx3se.us-east-1.awsapprunner.com
   ```

**If you see `http://localhost:8000` instead**, the environment variable is not set correctly.

4. Try creating a client
5. Check the Console for:
   ```
   API Request: POST /api/clients to https://uvpc5mx3se.us-east-1.awsapprunner.com
   API Response: 200 /api/clients
   ```

## Debugging Steps

### Check Browser Console

1. Open DevTools (F12)
2. Go to **Console** tab
3. Look for:
   - `API URL configured:` - Shows what URL is being used
   - `API Request:` - Shows each API call being made
   - `API Response:` - Shows successful responses
   - `API Response Error:` - Shows failed requests

### Check Network Tab

1. Open DevTools (F12)
2. Go to **Network** tab
3. Try creating a client
4. Look for a request to `/api/clients`
5. Check:
   - **Request URL:** Should be `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/clients`
   - **Status:** Should be `200` (success) or `4xx/5xx` (error)
   - **Response:** Should show the created client data

### Common Issues

#### Issue: "Network Error" or CORS error
**Solution:** 
- Check that `ALLOWED_ORIGINS` in AWS App Runner includes your Vercel domain
- Current setting should include: `https://*.vercel.app` or your specific domain

#### Issue: Requests going to localhost:8000
**Solution:**
- `VITE_API_URL` is not set in Vercel
- Follow steps 1-2 above

#### Issue: 404 Not Found
**Solution:**
- Check the API URL is correct: `https://uvpc5mx3se.us-east-1.awsapprunner.com`
- Test the backend directly: `curl https://uvpc5mx3se.us-east-1.awsapprunner.com/health`

#### Issue: 500 Internal Server Error
**Solution:**
- Backend is receiving the request but failing
- Check AWS App Runner logs (see below)
- The error details should be in the browser console

## Checking AWS App Runner Logs

If you need to check backend logs:

1. Go to [AWS Console](https://console.aws.amazon.com/apprunner/)
2. Select your service: `forms`
3. Click **Logs** tab
4. Look for:
   - `DEBUG: Client data to insert:` - Shows what data was received
   - `DEBUG: Insert response:` - Shows Supabase response
   - Any error messages

## Testing the Backend Directly

Test if the backend is working:

```bash
curl -X POST https://uvpc5mx3se.us-east-1.awsapprunner.com/api/clients \
  -H "Content-Type: application/json" \
  -H "Origin: https://forms-ten-self.vercel.app" \
  -d '{"name":"Test Client","email":"test@example.com"}'
```

**Expected response:**
```json
{
  "name": "Test Client",
  "email": "test@example.com",
  "id": "...",
  "created_at": "...",
  ...
}
```

If this works but the website doesn't, the issue is with the frontend configuration.

## Still Not Working?

1. **Check browser console** - Look for any error messages
2. **Check network tab** - See what requests are being made
3. **Verify environment variable** - Make sure it's set in Vercel
4. **Redeploy frontend** - After changing environment variables
5. **Clear browser cache** - Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)


