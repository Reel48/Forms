# AWS SES Setup - What's Left to Do

## 📊 Current Status

I've checked your entire AWS SES setup. Here's what I found:

### ✅ What's Already Working
- App Runner service is running
- No SendGrid API key (good, using SES)
- Email configuration endpoint is accessible
- Code already supports AWS SES (defaults to SES)

### ❌ What Needs to Be Fixed (3 Critical Issues)

---

## 🚨 Issue #1: Missing Environment Variables (CRITICAL)

**Problem:** Required email configuration variables are not set in App Runner.

**Missing:**
- `EMAIL_PROVIDER` (should be `ses`)
- `FROM_EMAIL` (should be `noreply@reel48.app` or any email on your domain)
- `FROM_NAME` (should be `Forms App`)
- `FRONTEND_URL` (should be your Vercel URL)

**Current Defaults (from code):**
- `FROM_EMAIL`: `noreply@formsapp.com` ❌ (not on your verified domain!)
- `FRONTEND_URL`: `http://localhost:5173` ❌ (wrong for production!)

**Fix This:**
1. **Option A: Use the automated script** (easiest)
   ```bash
   cd backend
   ./setup-ses-env-vars.sh
   ```
   This will prompt you for values and update App Runner automatically.

2. **Option B: Manual setup via AWS Console**
   - Go to: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
   - Configuration tab → Environment variables → Edit
   - Add these variables:
     ```
     EMAIL_PROVIDER=ses
     FROM_EMAIL=noreply@reel48.app
     FROM_NAME=Forms App
     FRONTEND_URL=https://forms-bk39jkt10-reel48s-projects.vercel.app
     AWS_REGION=us-east-1
     ```
   - Save and wait for deployment (2-5 minutes)

**Time:** 5 minutes

---

## 🚨 Issue #2: IAM Permissions Missing (CRITICAL)

**Problem:** App Runner service role doesn't have permission to send emails via SES.

**Fix This:**
1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Configuration tab → Security section → Find the "Service role" ARN
3. Copy the role name (the part after the last `/`)
4. Go to IAM Console: https://console.aws.amazon.com/iam/
5. Click "Roles" → Search for your App Runner service role
6. Click on the role name
7. Click "Add permissions" → "Attach policies"
8. Search for `AmazonSESFullAccess`
9. Check the box and click "Add permissions"

**Time:** 5 minutes

---

## ⚠️ Issue #3: SES Domain Verification Status

**Problem:** Domain `reel48.app` shows as **PENDING** verification in SES.

**Note:** You mentioned the ARN exists (`arn:aws:ses:us-east-1:391313099201:identity/reel48.app`), so the identity is created, but verification may still be in progress.

**Check This:**
1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Click "Verified identities" → Find `reel48.app`
3. Check the status:
   - If **VERIFIED** ✅: You're good to go!
   - If **PENDING** ⏳: 
     - Check that DNS records are properly configured
     - Verify all DKIM CNAME records are added to your DNS
     - Wait for DNS propagation (can take up to 48 hours)
   - If **FAILED** ❌: You may need to re-verify

**Time:** 10-30 minutes (mostly waiting for DNS)

---

## 📋 Complete Action Checklist

### Step 1: Add Environment Variables (5 min) ⚠️ CRITICAL
- [ ] Run `./backend/setup-ses-env-vars.sh` OR manually add via AWS Console
- [ ] Set `EMAIL_PROVIDER=ses`
- [ ] Set `FROM_EMAIL=noreply@reel48.app` (or your preferred email on reel48.app)
- [ ] Set `FROM_NAME=Forms App`
- [ ] Set `FRONTEND_URL` to your Vercel URL
- [ ] Set `AWS_REGION=us-east-1`
- [ ] Wait for deployment to complete (2-5 minutes)

### Step 2: Add IAM Permissions (5 min) ⚠️ CRITICAL
- [ ] Find App Runner service role in IAM Console
- [ ] Attach `AmazonSESFullAccess` policy
- [ ] Wait a few minutes for permissions to propagate

### Step 3: Verify Domain Status (10-30 min)
- [ ] Check SES Console → Verified identities → `reel48.app`
- [ ] Ensure status is **VERIFIED**
- [ ] If PENDING, check DNS records and wait

### Step 4: Test Configuration (2 min)
- [ ] Run: `curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config`
- [ ] Should show: `"email_provider": "ses"` and `"email_service_client_initialized": true`
- [ ] Test sending: `curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"`

### Step 5: Request Production Access (Optional)
- [ ] Go to SES Console → Account dashboard
- [ ] Request production access
- [ ] Fill out the form
- [ ] Wait for approval (usually 24 hours)

---

## 🎯 Quick Start (Fastest Path)

1. **Add environment variables:**
   ```bash
   cd backend
   ./setup-ses-env-vars.sh
   ```

2. **Add IAM permissions:**
   - IAM Console → Roles → Find App Runner role → Add `AmazonSESFullAccess`

3. **Verify domain in SES Console:**
   - Check that `reel48.app` is verified

4. **Test:**
   ```bash
   ./backend/check-ses-setup.sh
   ```

---

## 📊 After Fixing Issues

Once you complete Steps 1-3, you should be able to send emails! 

**Test it:**
```bash
# Check configuration
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config

# Test sending (use a verified email if in sandbox mode)
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
```

**Expected Response:**
```json
{
  "email_provider": "ses",
  "from_email": "noreply@reel48.app",
  "email_service_client_initialized": true,
  ...
}
```

---

## 📚 Documentation Files Created

1. **`SES_SETUP_STATUS.md`** - Detailed status report
2. **`SES_DOMAIN_SETUP_REEL48.md`** - Complete setup guide
3. **`SES_SETUP_CHECKLIST.md`** - Quick checklist
4. **`backend/check-ses-setup.sh`** - Script to check current status
5. **`backend/setup-ses-env-vars.sh`** - Script to add environment variables

---

## ⏱️ Estimated Time to Complete

- **Environment Variables:** 5 minutes
- **IAM Permissions:** 5 minutes
- **Domain Verification Check:** 10-30 minutes (mostly waiting)
- **Testing:** 2 minutes

**Total:** ~20-45 minutes (mostly waiting for deployments and DNS)

---

## 🆘 Need Help?

If you run into issues:
1. Run `./backend/check-ses-setup.sh` to see current status
2. Check `SES_SETUP_STATUS.md` for detailed troubleshooting
3. Review `SES_DOMAIN_SETUP_REEL48.md` for step-by-step instructions

---

## ✅ Summary

**To start sending emails, you need to:**

1. ✅ Add environment variables (5 min) - **MOST CRITICAL**
2. ✅ Add IAM permissions (5 min) - **REQUIRED**
3. ✅ Verify domain is verified in SES (check status)
4. ⏳ Request production access (optional, for sending to any email)

Once Steps 1-3 are complete, you'll be ready to send emails! 🎉



