# Quick Migration to Amazon SES

## ✅ Great News!

Your code **already supports AWS SES** and defaults to it! No code changes needed. You just need to configure SES in AWS.

---

## 3 Simple Steps to Switch to SES

### Step 1: Set Up SES (5 minutes)

1. **Verify Sender Email:**
   - Go to: https://console.aws.amazon.com/ses/home?region=us-east-1
   - Click "Verified identities" → "Create identity"
   - Select "Email address"
   - Enter your sender email (e.g., `noreply@yourdomain.com`)
   - Check email and click verification link

2. **Request Production Access:**
   - In SES Console → "Account dashboard"
   - Click "Request production access"
   - Fill form (select "Transactional", describe your use case)
   - Submit and wait for approval (24-48 hours, sometimes instant)

### Step 2: Add SES Permissions (2 minutes)

1. **Find App Runner Service Role:**
   - Go to App Runner Console → Your Service → Configuration
   - Note the service role ARN

2. **Add SES Permission:**
   - Go to IAM Console → Roles
   - Find your App Runner service role
   - Click "Add permissions" → "Attach policies"
   - Search and select: **"AmazonSESFullAccess"**
   - Click "Add permissions"

### Step 3: Update Environment Variables (2 minutes)

1. **Go to App Runner Console:**
   - https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
   - Configuration tab → Environment variables → Edit

2. **Update Variables:**
   - ✅ **Keep:** `FROM_EMAIL` (must match verified email in SES)
   - ✅ **Keep:** `FROM_NAME`
   - ✅ **Keep:** `FRONTEND_URL`
   - ❌ **Remove:** `SENDGRID_API_KEY` (no longer needed)
   - ✅ **Add (optional):** `EMAIL_PROVIDER=ses` (defaults to ses if not set)

3. **Save and wait for deployment** (2-5 minutes)

---

## Test It

```bash
# Check configuration
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config

# Should show:
# "email_provider": "ses"
# "email_service_client_initialized": true

# Test sending email
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
```

---

## Cost Savings

- **SendGrid:** $15/month
- **Amazon SES:** $0/month (free tier: 62,000 emails/month)
- **Your estimated usage:** ~220 emails/month = **FREE** ✅

**Savings: $180/year** 🎉

---

## Full Guides

- **Quick Setup:** See `SES_SETUP_GUIDE.md` for detailed step-by-step instructions
- **Migration Plan:** See `SES_MIGRATION_PLAN.md` for comprehensive migration details

---

## That's It!

Once you complete these 3 steps, your emails will be sent via Amazon SES instead of SendGrid, and you'll save $15/month!

