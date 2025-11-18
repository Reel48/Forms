# Quick Start: Using reel48.com for Email

## ✅ Great News!

**Your domain `reel48.com` is verified in AWS SES!** ✅

You can absolutely use `reel48.com` for sending emails even though your website is `reel48.app`. This is a common and perfectly valid setup!

---

## What You Need to Know

### Domain Setup
- ✅ **Email Domain:** `reel48.com` (verified in SES) - Use this for `FROM_EMAIL`
- ✅ **Website Domain:** `reel48.app` (your website) - Can be different, no problem!
- ✅ **Status:** `reel48.com` is verified and ready to use

### Important Rules
1. **`FROM_EMAIL` must use `@reel48.com`** (your verified email domain)
   - ✅ Good: `noreply@reel48.com`
   - ❌ Bad: `noreply@reel48.app` (not verified for email)

2. **`FRONTEND_URL` can use `reel48.app`** (your website domain)
   - ✅ Good: `https://reel48.app`
   - This is fine - it's just for links in emails

---

## Quick Setup (3 Steps)

### Step 1: Add Environment Variables (5 min)

**Option A: Use the script** (easiest)
```bash
cd backend
./setup-ses-env-vars.sh
```
When prompted, use:
- `FROM_EMAIL`: `noreply@reel48.com` (or your preferred email on reel48.com)
- `FRONTEND_URL`: `https://reel48.app` (your website)

**Option B: Manual via AWS Console**
1. Go to: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Configuration → Environment variables → Edit
3. Add:
   ```
   EMAIL_PROVIDER=ses
   FROM_EMAIL=noreply@reel48.com
   FROM_NAME=Forms App
   FRONTEND_URL=https://reel48.app
   AWS_REGION=us-east-1
   ```
4. Save and wait for deployment

### Step 2: Add IAM Permissions (5 min)

1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Roles → Find your App Runner service role
3. Add permissions → Attach policies → `AmazonSESFullAccess`
4. Save

### Step 3: Test (2 min)

```bash
# Check configuration
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config

# Test sending (use a verified email if in sandbox mode)
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
```

---

## Environment Variables Summary

```bash
EMAIL_PROVIDER=ses
FROM_EMAIL=noreply@reel48.com        # ← Must use @reel48.com
FROM_NAME=Forms App
FRONTEND_URL=https://reel48.app     # ← Can use reel48.app (your website)
AWS_REGION=us-east-1
```

---

## Why This Works

- **AWS SES** only cares that the **email domain** (`reel48.com`) is verified
- Your **website domain** (`reel48.app`) doesn't need to match
- This is actually a common pattern:
  - Many companies use `.com` for email (more professional)
  - And `.app` or other TLDs for websites
  - Example: Email from `noreply@company.com`, website at `company.app`

---

## Next Steps

1. ✅ Add environment variables (Step 1)
2. ✅ Add IAM permissions (Step 2)
3. ✅ Test email sending (Step 3)

Once complete, you'll be sending emails from `noreply@reel48.com`! 🎉

---

## Full Documentation

- **Complete Setup Guide:** `SES_DOMAIN_SETUP_REEL48_COM.md`
- **Status Check:** Run `./backend/check-ses-setup.sh`


