# AWS SES Setup for reel48.app Domain

## ✅ Domain Verification Status

Your domain `reel48.app` is already verified in AWS SES!
- **Domain ARN:** `arn:aws:ses:us-east-1:391313099201:identity/reel48.app`
- **Region:** `us-east-1`
- **Status:** Verified ✅

Since your domain is verified, you can send emails from **any email address** on `reel48.app` (e.g., `noreply@reel48.app`, `support@reel48.app`, etc.)

---

## Step 1: Configure IAM Permissions (5 minutes)

App Runner needs permission to send emails via SES.

### 1.1 Find Your App Runner Service Role

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click on your service **"forms"**
3. Go to **"Configuration"** tab
4. Scroll down to **"Security"** section
5. Look for **"Service role"** - note the role ARN
   - Example: `arn:aws:iam::391313099201:role/AppRunnerServiceRole-...`

### 1.2 Add SES Permissions to Role

1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click **"Roles"** in the left sidebar
3. Search for your App Runner service role (from step 1.1)
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

## Step 2: Update App Runner Environment Variables (3 minutes)

### 2.1 Access Environment Variables

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click **"Configuration"** tab
3. Scroll to **"Environment variables"** section
4. Click **"Edit"**

### 2.2 Add/Update Required Variables

Add or update these environment variables:

#### Required Variables:

- **`EMAIL_PROVIDER`** = `ses`
  - This tells the app to use AWS SES (it defaults to SES, but explicit is better)

- **`FROM_EMAIL`** = `noreply@reel48.app` (or any email on your domain)
  - Since your domain is verified, you can use any email address on `reel48.app`
  - Common options: `noreply@reel48.app`, `support@reel48.app`, `info@reel48.app`
  - **Important:** Use an email address that makes sense for your application

- **`FROM_NAME`** = `Forms App` (or your preferred name)
  - This is the display name shown in email clients
  - Example: `Forms App`, `Reel48`, `Your Company Name`

- **`FRONTEND_URL`** = Your frontend URL
  - Example: `https://forms-bk39jkt10-reel48s-projects.vercel.app`
  - Or your custom domain if you have one

- **`AWS_REGION`** = `us-east-1`
  - Should already be set, but verify it matches your SES region

#### Remove (if present):

- **`SENDGRID_API_KEY`** - Not needed for AWS SES

### 2.3 Save Changes

1. Review all your environment variables
2. Click **"Save changes"** at the bottom
3. Confirm the update
4. Wait for deployment (2-5 minutes)
   - Monitor progress in the **"Activity"** tab

---

## Step 3: Verify SES Configuration (2 minutes)

Once deployment is complete, test the configuration:

### 3.1 Check Email Configuration

```bash
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
```

**Expected Response:**
```json
{
  "email_provider": "ses",
  "from_email": "noreply@reel48.app",
  "from_name": "Forms App",
  "frontend_url": "https://forms-bk39jkt10-reel48s-projects.vercel.app",
  "email_service_client_initialized": true,
  "aws_region": "us-east-1"
}
```

### 3.2 Test Email Sending

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

### 3.3 Check App Runner Logs

1. Go to App Runner Console → **"Logs"** tab
2. Look for:
   - `SUCCESS: AWS SES initialized. Quota: X emails/day`
   - `Attempting to send email to...`
   - `SUCCESS: Email sent to...`

---

## Step 4: Request Production Access (If Needed)

If your account is in **sandbox mode**, you can only send to verified email addresses. To send to any email:

1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Click **"Account dashboard"** in left sidebar
3. Look for **"Sending limits"** section
4. If you see **"Account is in the Amazon SES sandbox"**, click **"Request production access"**
5. Fill out the form:
   - **Mail Type:** Transactional
   - **Website URL:** Your website URL
   - **Use case description:** "Sending password reset emails, form assignment notifications, and invoice payment confirmations to customers for our Forms application"
   - **Compliance:** Check the boxes
6. Submit the request
7. Usually approved within 24 hours (often faster)

**While waiting:** You can test by verifying recipient email addresses in SES (they'll receive emails even in sandbox mode).

---

## Step 5: Verify Domain Status in SES

Double-check your domain verification:

1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Click **"Verified identities"** in left sidebar
3. You should see `reel48.app` with status **"Verified"** ✅
4. Click on it to see details:
   - **DKIM:** Should show 3 CNAME records (for email authentication)
   - **SPF:** Should be configured
   - **Verification status:** Verified

---

## Troubleshooting

### Issue: "AccessDenied" Error

**Cause:** App Runner service role doesn't have SES permissions

**Solution:**
1. Go to IAM Console → Roles
2. Find your App Runner service role
3. Verify it has `AmazonSESFullAccess` or the custom SES policy attached
4. If not, follow Step 1 above

### Issue: "MessageRejected" Error

**Cause:** Sender email not verified or domain not properly configured

**Solution:**
1. Verify `FROM_EMAIL` uses your verified domain (`@reel48.app`)
2. Check SES Console → Verified identities → `reel48.app` is verified
3. Ensure DKIM records are properly configured in your DNS

### Issue: Can Only Send to Verified Emails

**Cause:** Account is in sandbox mode

**Solution:**
1. Request production access (Step 4 above)
2. Or verify recipient email addresses in SES for testing

### Issue: Emails Going to Spam

**Solution:**
1. Verify DKIM records are properly configured in DNS
2. Ensure SPF records are set up
3. Request production access
4. Warm up your sending reputation gradually (start with low volume)

### Issue: Email Service Not Initialized

**Check:**
1. Verify `EMAIL_PROVIDER=ses` is set
2. Check App Runner logs for error messages
3. Verify `AWS_REGION=us-east-1` matches your SES region
4. Ensure boto3 is installed (should be in requirements.txt)

---

## Quick Reference

### Your Configuration:
- **Domain:** `reel48.app` ✅ Verified
- **Region:** `us-east-1`
- **Service:** `forms`
- **Service ARN:** `arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07`

### Required Environment Variables:
- `EMAIL_PROVIDER=ses`
- `FROM_EMAIL=noreply@reel48.app` (or any email on reel48.app)
- `FROM_NAME=Forms App`
- `FRONTEND_URL=https://forms-bk39jkt10-reel48s-projects.vercel.app` (or your frontend URL)
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

## Next Steps

1. ✅ Complete Step 1: Add IAM permissions
2. ✅ Complete Step 2: Update environment variables
3. ✅ Complete Step 3: Test email sending
4. ⏳ (If needed) Complete Step 4: Request production access
5. 🎉 Start sending emails!

Once configured, your application will automatically use AWS SES for all email sending (password resets, form assignments, invoice notifications, etc.).



