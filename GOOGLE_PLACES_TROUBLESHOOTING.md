# Google Places API Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: "Google Places API key not configured"

**Symptoms:**
- Red error message saying "Google Places API key not configured"
- Autocomplete input doesn't appear

**Solution:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add/Check: `VITE_GOOGLE_PLACES_API_KEY` with your API key value
3. Make sure it's set for **Production**, **Preview**, and **Development** environments
4. Redeploy your application

**Verify:**
- Check browser console - should see: "Google Places API key found: AIzaSyB0q..."
- If you see "Google Places API key not found", the environment variable isn't set correctly

---

### Issue 2: "Error loading Google Maps" with error message

**Symptoms:**
- Red error message with specific error
- Console shows Google Maps load error

**Common Causes:**

#### A. Invalid API Key
- **Check:** Go to Google Cloud Console → APIs & Services → Credentials
- **Verify:** Your API key is correct and active
- **Fix:** Regenerate API key if needed

#### B. Places API Not Enabled
- **Check:** Go to Google Cloud Console → APIs & Services → Library
- **Search:** "Places API"
- **Verify:** Status shows "Enabled"
- **Fix:** Click "Enable" if not enabled

#### C. API Key Restrictions Blocking Domain
- **Check:** Go to Google Cloud Console → APIs & Services → Credentials → Your API Key
- **Look at:** "Application restrictions"
- **Problem:** If set to "HTTP referrers", your Vercel domain might not be in the list
- **Fix:** Add your domains:
  - `localhost:*` (for development)
  - `*.vercel.app` (for all Vercel previews)
  - `yourdomain.com/*` (for production)
  - Or temporarily set to "None" for testing

#### D. Billing Not Enabled
- **Check:** Go to Google Cloud Console → Billing
- **Problem:** Google Places API requires billing to be enabled (even with free tier)
- **Fix:** Enable billing and link a payment method
- **Note:** You get $200/month free credit, so you likely won't be charged

---

### Issue 3: Autocomplete appears but doesn't work

**Symptoms:**
- Input field appears
- Can type but no suggestions show
- No errors in console

**Possible Causes:**

#### A. API Key Restrictions Too Strict
- **Check:** API key restrictions in Google Cloud Console
- **Fix:** Make sure "Places API" is allowed in "API restrictions"
- **Fix:** Make sure your domain is in "Application restrictions"

#### B. Quota Exceeded
- **Check:** Google Cloud Console → APIs & Services → Dashboard
- **Look for:** Places API quota/usage
- **Note:** Free tier is $200/month (~70,000 autocomplete requests)

#### C. Network/CORS Issues
- **Check:** Browser console for CORS errors
- **Check:** Network tab for failed requests to `maps.googleapis.com`
- **Fix:** Usually indicates API key restriction issue

---

## Debugging Steps

### Step 1: Check Environment Variable
1. Open browser console (F12)
2. Look for: "Google Places API key found: AIzaSyB0q..."
3. If not found, check Vercel environment variables

### Step 2: Check Script Loading
1. Open browser console
2. Look for: "Google Maps script loaded successfully"
3. If error, check the error message for details

### Step 3: Check Autocomplete Initialization
1. Open browser console
2. Toggle to "structured address" mode
3. Look for: "Autocomplete loaded successfully"
4. If not, check for errors above

### Step 4: Test API Key Directly
1. Open browser console
2. Run: `console.log(import.meta.env.VITE_GOOGLE_PLACES_API_KEY)`
3. Should show your API key (first 10 chars)
4. If `undefined`, environment variable isn't set

### Step 5: Check Google Cloud Console
1. Go to: https://console.cloud.google.com/
2. Check:
   - ✅ Places API is enabled
   - ✅ API key exists and is active
   - ✅ Billing is enabled
   - ✅ API restrictions allow "Places API"
   - ✅ Application restrictions allow your domain (or set to "None" for testing)

---

## Quick Fix Checklist

- [ ] API key is set in Vercel environment variables
- [ ] Environment variable is named exactly: `VITE_GOOGLE_PLACES_API_KEY`
- [ ] Environment variable is set for all environments (Production, Preview, Development)
- [ ] Application has been redeployed after setting environment variable
- [ ] Places API is enabled in Google Cloud Console
- [ ] Billing is enabled in Google Cloud Console
- [ ] API key restrictions allow your domain (or set to "None" for testing)
- [ ] API restrictions include "Places API"

---

## Your Current API Key

Your API key starts with: `AIzaSyB0qfuCxtqO2-NqrLeR8mkbbpc4i0_v1jI`

**Verify it's set in Vercel:**
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Look for: `VITE_GOOGLE_PLACES_API_KEY`
5. Value should be: `AIzaSyB0qfuCxtqO2-NqrLeR8mkbbpc4i0_v1jI`

