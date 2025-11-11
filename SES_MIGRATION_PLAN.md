# Amazon SES Migration Plan

## Overview

Migrating from SendGrid to Amazon SES (Simple Email Service) for email capabilities. SES is cost-effective and integrates well with our existing AWS infrastructure.

## Why Amazon SES?

### Cost Comparison
- **SendGrid:** $15/month (lowest paid plan)
- **Amazon SES:** 
  - **Free tier:** 62,000 emails/month free (if sending from EC2/App Runner)
  - **After free tier:** $0.10 per 1,000 emails
  - **Example:** 10,000 emails/month = $1.00 (vs $15 on SendGrid)

### Benefits
- ✅ Already using AWS (no new account needed)
- ✅ Very cost-effective (often free for low volumes)
- ✅ High deliverability
- ✅ Integrates with existing AWS infrastructure
- ✅ No monthly minimums
- ✅ Pay only for what you use

### Considerations
- ⚠️ Requires sender email/domain verification (similar to SendGrid)
- ⚠️ Starts in "Sandbox" mode (can only send to verified emails)
- ⚠️ Need to request production access to send to any email

---

## Migration Steps

### Phase 1: Set Up Amazon SES

#### Step 1.1: Access SES Console
1. Go to AWS Console: https://console.aws.amazon.com/
2. Make sure you're in **us-east-1** region (same as App Runner)
3. Search for "SES" or "Simple Email Service"
4. Or go directly to: https://console.aws.amazon.com/ses/home?region=us-east-1

#### Step 1.2: Verify Sender Email
1. In SES Console, go to **"Verified identities"** (left sidebar)
2. Click **"Create identity"**
3. Select **"Email address"**
4. Enter your sender email (e.g., `noreply@yourdomain.com`)
5. Click **"Create identity"**
6. **Check your email inbox** for verification email
7. Click the verification link
8. Status should change to "Verified"

#### Step 1.3: Request Production Access (Important!)
By default, SES is in "Sandbox" mode and can only send to verified emails.

**To send to any email address:**
1. In SES Console, go to **"Account dashboard"** (left sidebar)
2. Look for **"Sending limits"** section
3. Click **"Request production access"**
4. Fill out the form:
   - **Mail Type:** Transactional
   - **Website URL:** Your frontend URL
   - **Use case description:** 
     ```
     We use SES to send password reset emails, form/quote assignment notifications, 
     and invoice payment confirmations to our customers. This is a transactional 
     email service for our Forms application.
     ```
   - **Expected volume:** Estimate your monthly email volume
   - **Compliance:** Check boxes for CAN-SPAM compliance
5. Click **"Submit request"**
6. **Wait for approval** (usually 24-48 hours, sometimes instant)

**Note:** While waiting for approval, you can test by verifying recipient emails too.

#### Step 1.4: Create IAM User for SES Access
1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click **"Users"** → **"Create user"**
3. User name: `ses-email-sender` (or similar)
4. Select **"Attach policies directly"**
5. Search for and select: **"AmazonSESFullAccess"** (or create custom policy with just `ses:SendEmail`, `ses:SendRawEmail`)
6. Click **"Next"** → **"Create user"**
7. Click on the new user
8. Go to **"Security credentials"** tab
9. Click **"Create access key"**
10. Select **"Application running outside AWS"** (since App Runner needs it)
11. Click **"Next"** → **"Create access key"**
12. **⚠️ IMPORTANT:** Copy both:
    - **Access Key ID** (starts with `AKIA...`)
    - **Secret Access Key** (you won't see it again!)
13. Save these securely

**Alternative:** Use the App Runner service role if it has SES permissions (simpler, but less secure)

---

### Phase 2: Configure Code to Use SES

**✅ Good News:** The code already supports AWS SES! No code changes needed.

#### Step 2.1: Verify Dependencies
- `boto3` is already in `requirements.txt` ✅
- Email service already has SES implementation ✅

#### Step 2.2: Update Environment Variables
In App Runner, you need to:
1. **Set `EMAIL_PROVIDER`** to `ses` (or leave unset - defaults to `ses`)
2. **Remove `SENDGRID_API_KEY`** (no longer needed)
3. **Keep existing variables:**
   - `FROM_EMAIL` (must be verified in SES)
   - `FROM_NAME`
   - `FRONTEND_URL`
4. **Set AWS Region** (optional, defaults to us-east-1):
   - `AWS_REGION=us-east-1`

#### Step 2.3: Configure IAM Permissions
App Runner needs permission to send emails via SES. Two options:

**Option A: Use App Runner Service Role (Recommended)**
1. Go to IAM Console → Roles
2. Find your App Runner service role (usually named like `AppRunnerServiceRole-...`)
3. Attach policy: `AmazonSESFullAccess` (or create custom policy with just `ses:SendEmail`)
4. No need for access keys - uses role automatically

**Option B: Use Access Keys (If role doesn't work)**
1. Create IAM user with SES permissions
2. Create access keys
3. Add to App Runner environment variables:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

---

### Phase 3: Deploy and Test

#### Step 3.1: Update Environment Variables in App Runner
1. Go to App Runner Console
2. Edit environment variables
3. Remove `SENDGRID_API_KEY`
4. Add AWS credentials (or configure IAM role)

#### Step 3.2: Deploy Updated Code
- Build and push new Docker image
- App Runner will auto-deploy

#### Step 3.3: Test Email Sending
- Use debug endpoint to test
- Send test emails
- Verify delivery

---

## Implementation Details

### Code Changes Required

1. **Update `backend/email_service.py`:**
   - Replace SendGrid client with boto3 SES client
   - Update `_send_email()` method
   - Keep all email template methods the same

2. **Update `backend/requirements.txt`:**
   - Remove `sendgrid==6.11.0`
   - Ensure `boto3` is included (usually already installed)

3. **Update environment variables:**
   - Remove: `SENDGRID_API_KEY`
   - Add: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - Keep: `FROM_EMAIL`, `FROM_NAME`, `FRONTEND_URL`

4. **Update documentation:**
   - Update setup guides
   - Update environment variable guides

---

## Cost Estimate

### Current Usage Estimate
Assuming:
- 50 password resets/month
- 100 form/quote assignments/month
- 20 invoice payments/month
- **Total: ~170 emails/month**

### SES Cost
- **Free tier:** 62,000 emails/month (if sending from EC2/App Runner)
- **Your usage:** 170 emails/month = **$0.00** (completely free!)
- **Even at 10,000 emails/month:** $1.00

### SendGrid Cost
- **Lowest plan:** $15/month
- **Your usage:** 170 emails/month = **$15/month**

**Savings: $15/month = $180/year**

---

## Timeline

1. **Day 1:** Set up SES, verify sender email, request production access
2. **Day 1-2:** Wait for production access approval
3. **Day 2:** Update code to use SES
4. **Day 2:** Deploy and test
5. **Day 3:** Monitor and verify everything works
6. **Day 3:** Remove SendGrid configuration

**Total time: 2-3 days** (mostly waiting for SES approval)

---

## Rollback Plan

If something goes wrong:
1. Keep SendGrid API key in environment variables (just don't use it)
2. Can quickly switch back by changing one environment variable
3. Or keep both services and use feature flag

---

## Next Steps

1. Review this plan
2. Set up SES account and verify sender
3. Request production access
4. I'll update the code to use SES
5. Deploy and test
6. Remove SendGrid once confirmed working

