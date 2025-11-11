# AWS SES Setup Guide (Recommended)

AWS SES is the **best choice** for your setup because:
- ✅ You're already on AWS (App Runner)
- ✅ **FREE:** 3,000 emails/month when using AWS services
- ✅ **Very cheap:** $0.10 per 1,000 emails after free tier
- ✅ No separate account needed
- ✅ High deliverability

## Step 1: Verify Your Sender Email

### 1.1 Go to AWS SES Console
1. Go to AWS Console: https://console.aws.amazon.com/
2. Make sure you're in **us-east-1** region (top right)
3. Search for **"SES"** or **"Simple Email Service"**
4. Or go directly to: https://console.aws.amazon.com/ses/home?region=us-east-1

### 1.2 Verify Email Address
1. In the left sidebar, click **"Verified identities"**
2. Click **"Create identity"** button
3. Select **"Email address"**
4. Enter your email address (e.g., `noreply@yourdomain.com`)
5. Click **"Create identity"**
6. **Check your email inbox** for a verification email from AWS
7. Click the verification link in the email
8. Status should change to **"Verified"**

**Note:** In sandbox mode (default), you can only send to verified email addresses. You'll need to request production access to send to any email.

## Step 2: Request Production Access (Required)

AWS SES starts in "sandbox mode" which only allows sending to verified emails. To send to any email address:

1. In SES Console, click **"Account dashboard"** in left sidebar
2. Look for **"Sending limits"** section
3. You'll see **"Account is in the Amazon SES sandbox"**
4. Click **"Request production access"** button
5. Fill out the form:
   - **Mail Type:** Transactional
   - **Website URL:** Your website URL
   - **Use case description:** "Sending password reset emails, form assignment notifications, and invoice payment confirmations to customers"
   - **Compliance:** Check the boxes
6. Submit the request
7. Usually approved within 24 hours (often faster)

**Alternative:** If you need to test immediately, you can verify test email addresses in the sandbox.

## Step 3: Configure IAM Permissions for App Runner

App Runner needs permission to send emails via SES.

### 3.1 Find Your App Runner Service Role
1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click on your service **"forms"**
3. Go to **"Configuration"** tab
4. Look for **"Service role ARN"** or **"Instance role"**
5. Copy the role ARN (looks like: `arn:aws:iam::391313099201:role/service-role/apprunner-forms-role`)

### 3.2 Add SES Permission to Role
1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click **"Roles"** in left sidebar
3. Search for your App Runner service role (from step 3.1)
4. Click on the role name
5. Click **"Add permissions"** → **"Attach policies"**
6. Search for **"AmazonSESFullAccess"** or **"AmazonSESSendingAccess"**
7. Check the box next to it
8. Click **"Add permissions"**

**Or create a custom policy (more secure):**
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
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```
4. Click **"Next"**
5. Name it: `SESSendEmailPolicy`
6. Click **"Create policy"**

## Step 4: Set Environment Variables in App Runner

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click **"Configuration"** tab
3. Scroll to **"Environment variables"**
4. Click **"Edit"**
5. Add/Update these variables:

### Required Variables:
- **`EMAIL_PROVIDER`** = `ses` (this tells the app to use AWS SES)
- **`FROM_EMAIL`** = Your verified email address (from Step 1.2)
- **`FROM_NAME`** = `Forms App` (or your preferred name)
- **`FRONTEND_URL`** = `https://forms-bk39jkt10-reel48s-projects.vercel.app`
- **`AWS_REGION`** = `us-east-1` (should already be set)

### Remove (if present):
- **`SENDGRID_API_KEY`** - Not needed for AWS SES

6. Click **"Save changes"**
7. Wait for deployment (2-5 minutes)

## Step 5: Test Email Sending

Once deployment is complete:

```bash
# Check email configuration
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config

# Test sending an email
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-verified-email@example.com"
```

**Note:** In sandbox mode, you can only send to verified email addresses. After production access is approved, you can send to any email.

## Step 6: Verify Domain (Optional but Recommended)

For better deliverability and to send from any email on your domain:

1. In SES Console → **"Verified identities"**
2. Click **"Create identity"**
3. Select **"Domain"**
4. Enter your domain (e.g., `yourdomain.com`)
5. Click **"Create identity"**
6. AWS will provide DNS records to add:
   - CNAME records for DKIM
   - TXT record for verification
7. Add these records to your domain's DNS
8. Wait for verification (usually a few minutes)
9. Once verified, you can send from any email on that domain

## Troubleshooting

### Issue: "MessageRejected" Error
- **Cause:** Sender email not verified
- **Solution:** Verify the email in SES Console → Verified identities

### Issue: "AccessDenied" Error
- **Cause:** App Runner service role doesn't have SES permissions
- **Solution:** Add SES permissions to the IAM role (Step 3)

### Issue: Can Only Send to Verified Emails
- **Cause:** Account is in sandbox mode
- **Solution:** Request production access (Step 2)

### Issue: Emails Going to Spam
- **Solution:** 
  - Verify your domain (Step 6)
  - Set up SPF and DKIM records
  - Request production access
  - Warm up your sending reputation gradually

## Cost Estimate

**Free Tier:**
- 3,000 emails/month = **FREE** ✅

**After Free Tier:**
- 10,000 emails/month = **$0.70/month**
- 50,000 emails/month = **$4.70/month**
- 100,000 emails/month = **$9.70/month**

Much cheaper than SendGrid's $15/month minimum!

## Quick Reference

**AWS SES Console:** https://console.aws.amazon.com/ses/home?region=us-east-1
**App Runner Console:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
**IAM Console:** https://console.aws.amazon.com/iam/

**Environment Variables Needed:**
- `EMAIL_PROVIDER=ses`
- `FROM_EMAIL=your-verified-email@example.com`
- `FROM_NAME=Forms App`
- `FRONTEND_URL=https://forms-bk39jkt10-reel48s-projects.vercel.app`
- `AWS_REGION=us-east-1`

