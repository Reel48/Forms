# AWS SES Setup for reel48.com Domain

## ✅ Domain Configuration

**Email Domain:** `reel48.com` (for sending emails)  
**Website Domain:** `reel48.app` (your website)  
**Status:** ✅ This is a valid and common setup!

**Why this works:**
- AWS SES only cares that the **email domain** (`reel48.com`) is verified
- Your website domain (`reel48.app`) doesn't need to match
- This is actually a common pattern - many companies use different domains for email vs website

---

## Step 1: Verify Domain in SES

**Please provide your SES ARN for `reel48.com`** so I can verify the setup.

Expected format: `arn:aws:ses:us-east-1:391313099201:identity/reel48.com`

**To check domain status:**
1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Click "Verified identities" → Find `reel48.com`
3. Verify status is **"Verified"** ✅
4. Check that DKIM records are configured (3 CNAME records)

---

## Step 2: Configure IAM Permissions (5 minutes)

App Runner needs permission to send emails via SES.

### 2.1 Find Your App Runner Service Role

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click on your service **"forms"**
3. Go to **"Configuration"** tab
4. Scroll down to **"Security"** section
5. Look for **"Service role"** - note the role ARN

### 2.2 Add SES Permissions to Role

1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click **"Roles"** in the left sidebar
3. Search for your App Runner service role (from step 2.1)
4. Click on the role name
5. Click **"Add permissions"** → **"Attach policies"**
6. Search for **"AmazonSESFullAccess"**
7. Check the box next to it
8. Click **"Add permissions"**

**Alternative (More Secure):** Create a custom inline policy:
1. Click **"Add permissions"** → **"Create inline policy"**
2. Click **"JSON"** tab
3. Paste this:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail",
                "ses:GetSendQuota",
                "ses:GetSendStatistics"
            ],
            "Resource": "*"
        }
    ]
}
```
4. Click **"Next"**
5. Name it: `SESSendEmailPolicy`
6. Click **"Create policy"**

---

## Step 3: Update App Runner Environment Variables (3 minutes)

### 3.1 Access Environment Variables

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click **"Configuration"** tab
3. Scroll to **"Environment variables"** section
4. Click **"Edit"**

### 3.2 Add/Update Required Variables

Add or update these environment variables:

#### Required Variables:

- **`EMAIL_PROVIDER`** = `ses`
  - This tells the app to use AWS SES

- **`FROM_EMAIL`** = `noreply@reel48.com` (or any email on reel48.com)
  - **Important:** Must use `@reel48.com` domain (your verified email domain)
  - Common options: `noreply@reel48.com`, `support@reel48.com`, `info@reel48.com`
  - **Do NOT use** `@reel48.app` - that domain is not verified for email

- **`FROM_NAME`** = `Forms App` (or your preferred name)
  - This is the display name shown in email clients

- **`FRONTEND_URL`** = Your frontend URL
  - This can be `https://reel48.app` (your website domain) - that's fine!
  - Or: `https://forms-bk39jkt10-reel48s-projects.vercel.app`

- **`AWS_REGION`** = `us-east-1`
  - Should already be set, but verify it matches your SES region

#### Remove (if present):

- **`SENDGRID_API_KEY`** - Not needed for AWS SES

### 3.3 Save Changes

1. Review all your environment variables
2. Click **"Save changes"** at the bottom
3. Confirm the update
4. Wait for deployment (2-5 minutes)
   - Monitor progress in the **"Activity"** tab

---

## Step 4: Verify Configuration (2 minutes)

Once deployment is complete, test the configuration:

### 4.1 Check Email Configuration

```bash
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
```

**Expected Response:**
```json
{
  "email_provider": "ses",
  "from_email": "noreply@reel48.com",
  "from_name": "Forms App",
  "frontend_url": "https://reel48.app",
  "email_service_client_initialized": true,
  "aws_region": "us-east-1"
}
```

### 4.2 Test Email Sending

**Important:** If your SES account is still in sandbox mode, you can only send to verified email addresses. If you have production access, you can send to any email.

```bash
# Replace with a verified email (if in sandbox) or any email (if production)
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
```

**Expected Response:**
```json
{
  "email_sent": true,
  "message": "Test email sent",
  "recipient": "your-email@example.com"
}
```

### 4.3 Check App Runner Logs

1. Go to App Runner Console → **"Logs"** tab
2. Look for:
   - `SUCCESS: AWS SES initialized. Quota: X emails/day`
   - `Attempting to send email to...`
   - `SUCCESS: Email sent to...`

---

## Step 5: Request Production Access (If Needed)

If your account is in **sandbox mode**, you can only send to verified email addresses. To send to any email:

1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Click **"Account dashboard"** in left sidebar
3. Look for **"Sending limits"** section
4. If you see **"Account is in the Amazon SES sandbox"**, click **"Request production access"**
5. Fill out the form:
   - **Mail Type:** Transactional
   - **Website URL:** `https://reel48.app` (your website domain - that's fine!)
   - **Use case description:** "Sending password reset emails, form assignment notifications, and invoice payment confirmations to customers for our Forms application"
   - **Compliance:** Check the boxes
6. Submit the request
7. Usually approved within 24 hours (often faster)

**While waiting:** You can test by verifying recipient email addresses in SES (they'll receive emails even in sandbox mode).

---

## Important Notes

### Domain Separation
- ✅ **Email domain (`reel48.com`):** Must be verified in SES
- ✅ **Website domain (`reel48.app`):** Can be different - no problem!
- ✅ **FROM_EMAIL:** Must use `@reel48.com` (your verified email domain)
- ✅ **FRONTEND_URL:** Can be `https://reel48.app` (your website domain)

### DNS Records
Make sure DNS records for `reel48.com` are configured:
- **SPF record:** Should be set up for email authentication
- **DKIM records:** 3 CNAME records should be added (SES will provide these)
- **DMARC (optional):** Recommended for better deliverability

---

## Troubleshooting

### Issue: "MessageRejected" Error

**Cause:** Sender email not verified or domain not properly configured

**Solution:**
1. Verify `FROM_EMAIL` uses `@reel48.com` (not `@reel48.app`)
2. Check SES Console → Verified identities → `reel48.com` is verified
3. Ensure DKIM records are properly configured in DNS for `reel48.com`

### Issue: "AccessDenied" Error

**Cause:** App Runner service role doesn't have SES permissions

**Solution:**
1. Go to IAM Console → Roles
2. Find your App Runner service role
3. Verify it has `AmazonSESFullAccess` or the custom SES policy attached
4. If not, follow Step 2 above

### Issue: Can Only Send to Verified Emails

**Cause:** Account is in sandbox mode

**Solution:**
1. Request production access (Step 5 above)
2. Or verify recipient email addresses in SES for testing

---

## Quick Reference

### Your Configuration:
- **Email Domain:** `reel48.com` ✅ (for sending emails)
- **Website Domain:** `reel48.app` ✅ (your website - can be different!)
- **Region:** `us-east-1`
- **Service:** `forms`
- **Service ARN:** `arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07`

### Required Environment Variables:
- `EMAIL_PROVIDER=ses`
- `FROM_EMAIL=noreply@reel48.com` (must use @reel48.com)
- `FROM_NAME=Forms App`
- `FRONTEND_URL=https://reel48.app` (can use your website domain)
- `AWS_REGION=us-east-1`

### Console Links:
- **SES Console:** https://console.aws.amazon.com/ses/home?region=us-east-1
- **App Runner Console:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
- **IAM Console:** https://console.aws.amazon.com/iam/

### Test Endpoints:
- **Email Config:** `curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config`
- **Test Email:** `curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"`

---

## Cost Estimate

**Free Tier:**
- 3,000 emails/month = **FREE** ✅

**After Free Tier:**
- 10,000 emails/month = **$0.70/month**
- 50,000 emails/month = **$4.70/month**
- 100,000 emails/month = **$9.70/month**

Much cheaper than SendGrid's $15/month minimum!

---

## Summary

✅ **You can absolutely use `reel48.com` for email even though your website is `reel48.app`!**

**Key points:**
- Email domain (`reel48.com`) must be verified in SES
- `FROM_EMAIL` must use `@reel48.com`
- Website domain (`reel48.app`) can be different - no problem!
- DNS records (SPF, DKIM) must be configured for `reel48.com`

Once configured, your application will automatically use AWS SES for all email sending! 🎉

