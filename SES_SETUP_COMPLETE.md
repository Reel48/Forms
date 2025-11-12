# ✅ AWS SES Setup Complete - reel48.com

## What I've Done

### ✅ Step 1: Environment Variables - COMPLETE

I've automatically added all required environment variables to your App Runner service:

- ✅ `EMAIL_PROVIDER=ses`
- ✅ `FROM_EMAIL=noreply@reel48.com`
- ✅ `FROM_NAME=Forms App`
- ✅ `FRONTEND_URL=https://reel48.app`
- ✅ `AWS_REGION=us-east-1`

**Status:** Environment variables are being deployed now (2-5 minutes)

---

## What You Need to Do

### ⚠️ Step 2: Add IAM Permissions (5 minutes) - REQUIRED

App Runner needs permission to send emails via SES. Since no explicit service role was found, you need to either:

**Option A: Configure a Service Role (Recommended)**

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click on your service **"forms"**
3. Go to **"Configuration"** tab
4. Scroll to **"Security"** section
5. If there's a **"Service role"** field:
   - Note the role ARN
   - Go to IAM Console: https://console.aws.amazon.com/iam/
   - Find that role and add `AmazonSESFullAccess` policy

**Option B: Check Default Execution Role**

App Runner might be using a default execution role. Check:

1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Look for roles that might be used by App Runner
3. Common names: `AppRunnerECRAccessRole`, `AWSServiceRoleForAppRunner`, or roles with "AppRunner" in the name
4. Add `AmazonSESFullAccess` policy to the appropriate role

**Option C: Create a Custom Service Role**

If no role exists, you may need to create one:

1. Go to IAM Console → Roles → Create role
2. Select "AWS service" → "App Runner"
3. Attach `AmazonSESFullAccess` policy
4. Create the role
5. Go back to App Runner → Configuration → Security → Set the service role

---

## Verify Setup (After Deployment)

Once the App Runner deployment completes (2-5 minutes), test the configuration:

```bash
# Check email configuration
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

If `email_service_client_initialized` is `false`, it means IAM permissions are missing.

---

## Test Email Sending

Once IAM permissions are added and deployment is complete:

```bash
# Test sending an email
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
```

**Note:** If your account is in sandbox mode, you can only send to verified email addresses. To send to any email, request production access in SES Console.

---

## Current Configuration Summary

### Environment Variables (✅ Set)
```
EMAIL_PROVIDER=ses
FROM_EMAIL=noreply@reel48.com
FROM_NAME=Forms App
FRONTEND_URL=https://reel48.app
AWS_REGION=us-east-1
```

### Domain Status
- ✅ `reel48.com` is verified in SES
- ✅ ARN: `arn:aws:ses:us-east-1:391313099201:identity/reel48.com`
- ⚠️ Account is in sandbox mode (200 emails/day, can only send to verified emails)

### IAM Permissions
- ⚠️ **Action Required:** Add SES permissions to App Runner service/execution role

---

## Quick Links

- **App Runner Console:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
- **SES Console:** https://console.aws.amazon.com/ses/home?region=us-east-1
- **IAM Console:** https://console.aws.amazon.com/iam/

---

## Next Steps

1. ✅ **Environment variables** - DONE (deploying now)
2. ⏳ **Add IAM permissions** - YOU NEED TO DO THIS (5 minutes)
3. ⏳ **Wait for deployment** - 2-5 minutes
4. ⏳ **Test configuration** - After deployment completes
5. ⏳ **Request production access** (optional) - To send to any email

---

## Troubleshooting

### If `email_service_client_initialized` is `false`:

This means IAM permissions are missing. You need to:
1. Find the App Runner execution role
2. Add `AmazonSESFullAccess` policy
3. Wait a few minutes for permissions to propagate
4. Test again

### If you get "AccessDenied" errors:

Same as above - IAM permissions are missing or not propagated yet.

### If emails are rejected:

1. Check that `FROM_EMAIL` uses `@reel48.com` (not `@reel48.app`)
2. Verify `reel48.com` is verified in SES Console
3. Check DNS records (SPF, DKIM) are configured for `reel48.com`

---

## Summary

✅ **Environment variables are set and deploying!**

⚠️ **You still need to add IAM permissions** (5 minutes)

Once IAM permissions are added, you'll be ready to send emails! 🎉

