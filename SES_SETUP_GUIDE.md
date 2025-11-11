# Amazon SES Setup Guide - Quick Start

## ✅ Good News!

Your code **already supports AWS SES**! The email service is configured to use SES by default. You just need to set up SES in AWS and configure permissions.

---

## Step 1: Set Up Amazon SES (5 minutes)

### 1.1 Verify Sender Email

1. Go to AWS SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Make sure you're in **us-east-1** region (same as App Runner)
3. Click **"Verified identities"** in the left sidebar
4. Click **"Create identity"** button
5. Select **"Email address"**
6. Enter your sender email (e.g., `noreply@yourdomain.com`)
7. Click **"Create identity"**
8. **Check your email inbox** for verification email from AWS
9. Click the verification link
10. Status should change to **"Verified"** ✅

### 1.2 Request Production Access (Important!)

By default, SES is in "Sandbox" mode and can only send to verified emails.

**To send to any email address:**

1. In SES Console, click **"Account dashboard"** (left sidebar)
2. Look for **"Sending limits"** section
3. You'll see: **"Your account is in the Amazon SES sandbox"**
4. Click **"Request production access"** button
5. Fill out the form:
   - **Mail Type:** Select **"Transactional"**
   - **Website URL:** `https://forms-bk39jkt10-reel48s-projects.vercel.app` (your frontend URL)
   - **Use case description:**
     ```
     We use Amazon SES to send transactional emails for our Forms application:
     - Password reset emails
     - Form and quote assignment notifications
     - Invoice payment confirmations
     - Admin alerts for form submissions and quote acceptances
     
     This is a business application for managing client forms and quotes.
     ```
   - **Expected volume:** Estimate your monthly emails (e.g., "500-1000 emails per month")
   - **Compliance:** Check the box for CAN-SPAM Act compliance
6. Click **"Submit request"**
7. **Wait for approval** (usually 24-48 hours, sometimes instant)

**While waiting:** You can test by verifying recipient email addresses in SES (they'll receive emails even in sandbox mode).

---

## Step 2: Configure App Runner Permissions (5 minutes)

App Runner needs permission to send emails via SES. We'll use the App Runner service role.

### 2.1 Find Your App Runner Service Role

1. Go to AWS App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click on your service **"forms"**
3. Go to **"Configuration"** tab
4. Scroll down to **"Security"** section
5. Look for **"Service role"** - note the role ARN (e.g., `arn:aws:iam::391313099201:role/AppRunnerServiceRole-...`)

### 2.2 Add SES Permissions to Role

1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click **"Roles"** in the left sidebar
3. Search for your App Runner service role (from step 2.1)
4. Click on the role name
5. Click **"Add permissions"** → **"Attach policies"**
6. Search for **"AmazonSESFullAccess"**
7. Check the box next to it
8. Click **"Add permissions"**

**Alternative (More Secure):** Create a custom policy with only the permissions needed:
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

---

## Step 3: Update App Runner Environment Variables (2 minutes)

### 3.1 Remove SendGrid Configuration

1. Go to App Runner Console: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Click **"Configuration"** tab
3. Scroll to **"Environment variables"**
4. Click **"Edit"**
5. **Remove** `SENDGRID_API_KEY` (if it exists)
6. **Keep** these variables:
   - `FROM_EMAIL` (must match the email you verified in SES)
   - `FROM_NAME`
   - `FRONTEND_URL`

### 3.2 Add/Verify SES Configuration

1. **Add or verify `EMAIL_PROVIDER`:**
   - **Key:** `EMAIL_PROVIDER`
   - **Value:** `ses`
   - (This is actually optional - defaults to `ses` if not set)

2. **Optional - Set AWS Region:**
   - **Key:** `AWS_REGION`
   - **Value:** `us-east-1`
   - (Defaults to us-east-1 if not set)

3. Click **"Save changes"**
4. Wait 2-5 minutes for deployment

---

## Step 4: Test Email Sending (2 minutes)

### 4.1 Check Configuration

```bash
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
```

**Expected response:**
```json
{
  "email_provider": "ses",
  "from_email": "noreply@yourdomain.com",
  "from_name": "Forms App",
  "frontend_url": "https://forms-bk39jkt10-reel48s-projects.vercel.app",
  "email_service_client_initialized": true
}
```

### 4.2 Test Email Sending

**If in Sandbox mode:** Verify your test email first in SES Console, then:

```bash
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-verified-email@example.com"
```

**If production access approved:** Can send to any email:

```bash
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=any-email@example.com"
```

### 4.3 Test Password Reset

1. Go to your frontend
2. Click "Forgot Password"
3. Enter your email
4. Check inbox for password reset email

---

## Step 5: Monitor and Verify

### 5.1 Check App Runner Logs

1. Go to App Runner Console → Your Service → **"Logs"** tab
2. Look for:
   - `SUCCESS: AWS SES initialized`
   - `Attempting to send email to... via AWS SES`
   - `SUCCESS: Email sent to... via AWS SES`

### 5.2 Check SES Sending Statistics

1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Click **"Sending statistics"** (left sidebar)
3. You'll see:
   - Emails sent
   - Bounce rate
   - Complaint rate
   - Delivery rate

### 5.3 Check SES Event Publishing (Optional)

For detailed email tracking:
1. Go to SES Console → **"Configuration sets"**
2. Create a configuration set
3. Set up event publishing to CloudWatch
4. Monitor email events (sent, delivered, bounced, etc.)

---

## Troubleshooting

### Issue: "MessageRejected" Error

**Cause:** Sender email not verified

**Solution:**
1. Go to SES Console → Verified identities
2. Verify the email address matches your `FROM_EMAIL` environment variable
3. Check your email inbox for verification link

### Issue: "AccessDenied" Error

**Cause:** App Runner service role doesn't have SES permissions

**Solution:**
1. Go to IAM Console → Roles
2. Find your App Runner service role
3. Attach `AmazonSESFullAccess` policy (or custom policy with `ses:SendEmail`)

### Issue: "Account is in sandbox" Error

**Cause:** Haven't requested production access yet

**Solution:**
1. Go to SES Console → Account dashboard
2. Click "Request production access"
3. Fill out the form and submit
4. Wait for approval (24-48 hours usually)

### Issue: Can Only Send to Verified Emails

**Cause:** Still in sandbox mode

**Solution:**
- Wait for production access approval
- Or verify recipient emails for testing

### Issue: Emails Not Being Received

**Check:**
1. SES Sending statistics - are emails being sent?
2. Check spam/junk folder
3. Verify sender email reputation
4. Check SES bounce/complaint rates

---

## Cost Comparison

### Your Estimated Usage
- Password resets: ~50/month
- Assignment notifications: ~100/month
- Payment confirmations: ~20/month
- Admin alerts: ~50/month
- **Total: ~220 emails/month**

### Amazon SES Cost
- **Free tier:** 62,000 emails/month (when sending from EC2/App Runner)
- **Your usage:** 220 emails/month = **$0.00** ✅
- **Even at 10,000 emails/month:** $1.00

### SendGrid Cost
- **Lowest plan:** $15/month
- **Your usage:** 220 emails/month = **$15/month**

**Savings: $15/month = $180/year** 🎉

---

## Quick Reference

### Environment Variables Needed
- ✅ `EMAIL_PROVIDER=ses` (optional, defaults to ses)
- ✅ `FROM_EMAIL` = Verified email in SES
- ✅ `FROM_NAME` = Display name
- ✅ `FRONTEND_URL` = Your frontend URL
- ❌ Remove `SENDGRID_API_KEY` (no longer needed)

### AWS Console Links
- **SES Console:** https://console.aws.amazon.com/ses/home?region=us-east-1
- **App Runner:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
- **IAM Console:** https://console.aws.amazon.com/iam/

### Your Service URLs
- **Backend API:** https://uvpc5mx3se.us-east-1.awsapprunner.com
- **Frontend:** https://forms-bk39jkt10-reel48s-projects.vercel.app

---

## Migration Checklist

- [ ] Verify sender email in SES Console
- [ ] Request production access in SES
- [ ] Add SES permissions to App Runner service role
- [ ] Update App Runner environment variables (remove SENDGRID_API_KEY, set EMAIL_PROVIDER=ses)
- [ ] Wait for deployment to complete
- [ ] Test email sending with debug endpoint
- [ ] Test password reset flow
- [ ] Monitor SES sending statistics
- [ ] Verify emails are being delivered
- [ ] Remove SendGrid API key from environment (if still there)

---

## Next Steps After Setup

1. **Monitor SES metrics** for the first week
2. **Set up CloudWatch alarms** for bounce/complaint rates (optional)
3. **Consider domain authentication** for better deliverability (optional)
4. **Set up configuration sets** for detailed tracking (optional)

Once everything is working, you're done! SES will handle all your email needs at a fraction of the cost.

