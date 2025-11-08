# How to Get Google Places API Key

## Step-by-Step Guide

### Step 1: Go to Google Cloud Console

1. **Visit**: https://console.cloud.google.com/
2. **Sign in** with your Google account (or create one if needed)

### Step 2: Create or Select a Project

1. Click the **project dropdown** at the top (next to "Google Cloud")
2. Either:
   - **Select existing project** (if you have one)
   - **Click "New Project"** to create one
     - Project name: `Quote Builder` (or any name)
     - Click "Create"

### Step 3: Enable Places API

1. Go to **APIs & Services** → **Library**
   - Or visit: https://console.cloud.google.com/apis/library
2. **Search for**: "Places API"
3. Click on **"Places API"** (by Google)
4. Click **"Enable"** button
5. Wait for it to enable (usually instant)

### Step 4: Create API Key

1. Go to **APIs & Services** → **Credentials**
   - Or visit: https://console.cloud.google.com/apis/credentials
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"API key"**
4. **Copy the API key** that appears (starts with `AIza...`)
5. Click **"Close"** (don't restrict yet - we'll do that later)

### Step 5: (Optional) Restrict API Key for Production

**For now, you can skip this and do it later for production.**

If you want to restrict it now:

1. Click on your API key in the credentials list
2. Under **"API restrictions"**:
   - Select **"Restrict key"**
   - Check **"Places API"** only
3. Under **"Application restrictions"**:
   - Select **"HTTP referrers (web sites)"**
   - Add your domains:
     - `localhost:*` (for development)
     - `*.vercel.app` (for Vercel previews)
     - `yourdomain.com/*` (for production)
4. Click **"Save"**

### Step 6: Add to Your Project

Once you have the API key, I'll add it to your frontend environment variables.

**Your API key will look like:**
```
AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
```

---

## Important Notes

### Billing
- Google Places API has a **free tier**: $200/month credit
- Autocomplete costs: **$2.83 per 1,000 requests**
- For most small-medium apps, you'll stay within the free tier
- You need to enable billing, but won't be charged until you exceed $200/month

### Enable Billing (Required)
1. Go to **Billing** in Google Cloud Console
2. Link a billing account (credit card required)
3. Don't worry - you get $200 free credit monthly

---

## Once You Have the Key

**Just send me the API key** and I'll:
1. Add it to your frontend environment
2. Complete the full implementation
3. Test everything
4. Deploy it

**Format to send:**
```
VITE_GOOGLE_PLACES_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
```

Or just the key itself:
```
AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
```

---

## Quick Links

- **Google Cloud Console**: https://console.cloud.google.com/
- **APIs Library**: https://console.cloud.google.com/apis/library
- **Credentials**: https://console.cloud.google.com/apis/credentials
- **Places API Docs**: https://developers.google.com/maps/documentation/places/web-service

---

**Once you have the key, let me know and I'll implement everything!** 🚀

