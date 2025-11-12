# AWS SES Setup Checklist for reel48.app

## ✅ Pre-Setup Status

- [x] Domain `reel48.app` verified in AWS SES
- [x] Domain ARN: `arn:aws:ses:us-east-1:391313099201:identity/reel48.app`
- [x] Region: `us-east-1`
- [x] Code already supports AWS SES (defaults to SES)

---

## Step 1: IAM Permissions (5 minutes)

- [ ] **Find App Runner Service Role**
  - Go to: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
  - Configuration tab → Security section → Note the Service role ARN

- [ ] **Add SES Permissions**
  - Go to: https://console.aws.amazon.com/iam/
  - Roles → Find your App Runner service role
  - Add permissions → Attach policies → `AmazonSESFullAccess`
  - OR create custom inline policy (see SES_DOMAIN_SETUP_REEL48.md)

---

## Step 2: Environment Variables (3 minutes)

- [ ] **Go to App Runner Environment Variables**
  - https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
  - Configuration tab → Environment variables → Edit

- [ ] **Add/Update These Variables:**

  - [ ] `EMAIL_PROVIDER` = `ses`
  - [ ] `FROM_EMAIL` = `noreply@reel48.app` (or your preferred email on reel48.app)
  - [ ] `FROM_NAME` = `Forms App` (or your preferred name)
  - [ ] `FRONTEND_URL` = `https://forms-bk39jkt10-reel48s-projects.vercel.app` (or your frontend URL)
  - [ ] `AWS_REGION` = `us-east-1` (verify it's set)

- [ ] **Remove (if present):**
  - [ ] `SENDGRID_API_KEY` (not needed for SES)

- [ ] **Save changes and wait for deployment** (2-5 minutes)

---

## Step 3: Verify Configuration (2 minutes)

- [ ] **Test Email Configuration**
  ```bash
  curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
  ```
  - Should show: `"email_provider": "ses"` and `"email_service_client_initialized": true`

- [ ] **Test Email Sending**
  ```bash
  curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
  ```
  - **Note:** If in sandbox mode, use a verified email address

- [ ] **Check App Runner Logs**
  - Look for: `SUCCESS: AWS SES initialized`

---

## Step 4: Production Access (If Needed)

- [ ] **Check if in Sandbox Mode**
  - Go to: https://console.aws.amazon.com/ses/home?region=us-east-1
  - Account dashboard → Check "Sending limits"
  - If shows "sandbox", request production access

- [ ] **Request Production Access** (if needed)
  - Click "Request production access"
  - Fill form with use case description
  - Submit and wait for approval (usually 24 hours, sometimes instant)

---

## Step 5: Verify Domain in SES

- [ ] **Check Domain Status**
  - Go to: https://console.aws.amazon.com/ses/home?region=us-east-1
  - Verified identities → `reel48.app` should show "Verified" ✅
  - Verify DKIM records are configured

---

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| AccessDenied error | Add SES permissions to App Runner service role (Step 1) |
| MessageRejected error | Verify FROM_EMAIL uses @reel48.app domain |
| Can only send to verified emails | Request production access (Step 4) |
| Email service not initialized | Check EMAIL_PROVIDER=ses and AWS_REGION=us-east-1 |

---

## Quick Links

- **SES Console:** https://console.aws.amazon.com/ses/home?region=us-east-1
- **App Runner Console:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
- **IAM Console:** https://console.aws.amazon.com/iam/
- **Full Setup Guide:** See `SES_DOMAIN_SETUP_REEL48.md`

---

## Expected Environment Variables

```bash
EMAIL_PROVIDER=ses
FROM_EMAIL=noreply@reel48.app
FROM_NAME=Forms App
FRONTEND_URL=https://forms-bk39jkt10-reel48s-projects.vercel.app
AWS_REGION=us-east-1
```

---

## Cost

- **Free Tier:** 3,000 emails/month = FREE ✅
- **After Free Tier:** $0.10 per 1,000 emails

---

## ✅ Completion

Once all steps are complete:
- ✅ Emails will be sent via AWS SES
- ✅ Using your verified domain `reel48.app`
- ✅ No SendGrid API key needed
- ✅ Cost-effective email sending

