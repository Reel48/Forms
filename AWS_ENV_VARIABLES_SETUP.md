# AWS App Runner Environment Variables Setup Guide

This guide will walk you through setting up the email environment variables in AWS App Runner.

## Your Service Information

Based on your configuration:
- **Service Name:** `forms`
- **Service ARN:** `arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07`
- **Region:** `us-east-1`
- **Direct Console Link:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms

---

## Step 1: Get Your SendGrid API Key

### 1.1 Sign Up/Login to SendGrid
1. Go to https://sendgrid.com
2. Sign up for a free account (100 emails/day free tier) or log in if you already have one
3. Verify your email address if required

### 1.2 Create an API Key
1. Once logged in, go to **Settings** → **API Keys** 
   - Direct link: https://app.sendgrid.com/settings/api_keys
2. Click **"Create API Key"** button (top right, blue button)
3. Give it a name: `Forms App Production` (or any name you prefer)
4. Select permissions:
   - **Option 1 (Recommended for testing):** Select **"Full Access"** 
   - **Option 2 (More secure):** Select **"Restricted Access"** → Then check only **"Mail Send"** permissions
5. Click **"Create & View"**
6. **⚠️ CRITICAL:** Copy the API key immediately! 
   - It starts with `SG.` and is about 69 characters long
   - Example: `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **You won't be able to see it again** after you close this window!
   - Save it somewhere safe (password manager, secure note, etc.)

### 1.3 Verify Sender Email (Required!)

You must verify a sender email before you can send emails. Choose one:

**Option A: Single Sender Verification (Easier, for testing)**
1. Go to **Settings** → **Sender Authentication**
   - Direct link: https://app.sendgrid.com/settings/sender_auth
2. Click **"Verify a Single Sender"**
3. Fill in the form:
   - **From Email:** Enter an email you control (e.g., `noreply@yourdomain.com` or use a Gmail address for testing)
   - **From Name:** `Forms App` (or your company name)
   - Fill in the rest of the required fields
4. Click **"Create"**
5. **Check your email inbox** for a verification email from SendGrid
6. Click the verification link in the email
7. **Save this email address** - you'll use it as your `FROM_EMAIL`

**Option B: Domain Authentication (Better for production)**
1. Go to **Settings** → **Sender Authentication**
2. Click **"Authenticate Your Domain"**
3. Follow the DNS setup instructions
4. This allows you to send from any email on your domain
5. More professional and better deliverability

---

## Step 2: Access AWS App Runner Console

### Method 1: Direct Link (Easiest)
Click this link to go directly to your service:
**https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms**

### Method 2: Manual Navigation
1. Go to AWS Console: https://console.aws.amazon.com/
2. Make sure you're in the **us-east-1** region (check top right corner)
3. In the search bar at the top, type **"App Runner"** and click on it
4. You should see your service named **"forms"** in the list
5. Click on **"forms"** to open it

---

## Step 3: Edit Environment Variables

### 3.1 Open Configuration Tab
1. In your App Runner service page, you'll see several tabs at the top:
   - Overview
   - **Configuration** ← Click this one!
   - Activity
   - Logs
   - Metrics
2. Click on the **"Configuration"** tab

### 3.2 Find Environment Variables Section
1. Scroll down through the configuration page
2. You'll see sections like:
   - Service settings
   - Source and deployment
   - Networking
   - **Environment variables** ← This is what we need!
3. In the **"Environment variables"** section, you'll see:
   - A list of existing variables (if any)
   - An **"Edit"** button (usually on the right side)

### 3.3 Click Edit
1. Click the **"Edit"** button in the Environment variables section
2. You'll see a form/modal with your existing environment variables

### 3.4 Add New Environment Variables

Click **"Add environment variable"** (or the **+** button) for each of these:

#### Variable 1: SENDGRID_API_KEY
- **Key:** `SENDGRID_API_KEY`
- **Value:** Paste the API key you copied from SendGrid (starts with `SG.`)
- Click **"Add"** or the checkmark

#### Variable 2: FROM_EMAIL
- **Key:** `FROM_EMAIL`
- **Value:** The email address you verified in SendGrid
  - Example: `noreply@yourdomain.com` or `your-email@gmail.com` (if you verified a Gmail)
- **⚠️ Important:** Must match exactly the email you verified in SendGrid!
- Click **"Add"** or the checkmark

#### Variable 3: FROM_NAME
- **Key:** `FROM_NAME`
- **Value:** `Forms App` (or whatever display name you want for emails)
- Click **"Add"** or the checkmark

#### Variable 4: FRONTEND_URL
- **Key:** `FRONTEND_URL`
- **Value:** Your frontend URL
  - Based on your setup, this should be: `https://forms-bk39jkt10-reel48s-projects.vercel.app`
  - Or if you have a custom domain: `https://yourdomain.com`
- Click **"Add"** or the checkmark

### 3.5 Review and Save
1. You should now see all 4 new environment variables in the list:
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL`
   - `FROM_NAME`
   - `FRONTEND_URL`
2. Scroll down to the bottom of the form/modal
3. Click **"Save changes"** or **"Update"** button
4. AWS will show a confirmation dialog
5. Click **"Confirm"** or **"Update"** to proceed

### 3.6 Wait for Deployment
- App Runner will automatically redeploy with the new environment variables
- This usually takes **2-5 minutes**
- You can monitor progress:
  1. Click on the **"Activity"** tab
  2. You'll see a new deployment in progress
  3. Wait until status shows **"Active"** or **"Running"**
  4. The service will be briefly unavailable during deployment (usually < 1 minute)

---

## Step 4: Verify Configuration

### 4.1 Check Email Configuration (Debug Endpoint)

Once deployment is complete (status shows "Active"), test the configuration:

```bash
# Your API URL
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
```

**Expected Response:**
```json
{
  "sendgrid_configured": true,
  "sendgrid_key_length": 69,
  "sendgrid_key_preview": "SG.xxxxx...xxxx",
  "from_email": "noreply@yourdomain.com",
  "from_name": "Forms App",
  "frontend_url": "https://forms-bk39jkt10-reel48s-projects.vercel.app",
  "email_service_client_initialized": true,
  "environment_variables": {
    "SENDGRID_API_KEY": "SET",
    "FROM_EMAIL": "noreply@yourdomain.com",
    "FROM_NAME": "Forms App",
    "FRONTEND_URL": "https://forms-bk39jkt10-reel48s-projects.vercel.app"
  }
}
```

**If you see `"sendgrid_configured": false`:**
- The `SENDGRID_API_KEY` environment variable is not set correctly
- Go back to Step 3 and verify the key was added

### 4.2 Test Email Sending

Send a test email to yourself:

```bash
# Replace with your actual email
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

**Check your email inbox** - you should receive a password reset email with a test token.

### 4.3 Check App Runner Logs

1. Go back to AWS App Runner Console
2. Click on the **"Logs"** tab
3. Look for log entries that show:
   - `SUCCESS: Email service initialized with SendGrid`
   - `Attempting to send email to...`
   - `SUCCESS: Email sent to...`

**If you see errors:**
- Look for messages like `ERROR: SendGrid returned status...`
- Check the error message for details
- Common issues:
  - Sender email not verified
  - Invalid API key
  - API key doesn't have Mail Send permissions

### 4.4 Test Password Reset Flow

1. Go to your frontend: https://forms-bk39jkt10-reel48s-projects.vercel.app
2. Click "Sign In"
3. Click "Forgot your password?"
4. Enter your email address
5. Click "Send Reset Link"
6. **Check your email inbox** (and spam folder)
7. You should receive an email with a reset link

---

## Step 5: Check SendGrid Activity Feed

To see if emails are actually being sent:

1. Go to SendGrid Dashboard: https://app.sendgrid.com/activity
2. You'll see a list of all email activity
3. Look for:
   - **Delivered** ✅ - Email was sent successfully
   - **Bounced** ❌ - Email address is invalid
   - **Blocked** ⚠️ - Email was blocked (spam filter, etc.)
   - **Dropped** ⚠️ - Email was dropped (invalid sender, etc.)

**If emails show as "Delivered" but you're not receiving them:**
- Check your spam/junk folder
- Check email filters
- Try a different email address
- Set up Domain Authentication for better deliverability

---

## Troubleshooting

### Issue: Can't Find Environment Variables Section
- Make sure you're in the **"Configuration"** tab (not Overview or Activity)
- Scroll down - the Environment variables section is usually near the bottom
- If you still can't find it, try refreshing the page

### Issue: "Edit" Button is Grayed Out or Missing
- Make sure the service is in "Running" state (not deploying)
- Wait for any current deployment to finish
- Try refreshing the page

### Issue: Changes Not Saving
- Make sure you clicked "Save changes" at the bottom
- Check that you confirmed the update dialog
- Look at the Activity tab to see if a deployment started

### Issue: SendGrid API Key Not Working
- Verify you copied the entire key (should be ~69 characters, starts with `SG.`)
- Check that the key has "Mail Send" permissions in SendGrid
- Verify the key is still active in SendGrid dashboard
- Try creating a new API key if the old one isn't working

### Issue: FROM_EMAIL Not Verified Error
- Go to SendGrid → Settings → Sender Authentication
- Make sure the email in `FROM_EMAIL` matches a verified sender
- Check your email inbox for the verification link
- Re-verify if needed

### Issue: Emails Still Not Sending After Setup
1. **Check the debug endpoint:**
   ```bash
   curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
   ```
   - Verify `sendgrid_configured: true`
   - Verify `email_service_client_initialized: true`

2. **Check App Runner logs:**
   - Look for error messages
   - Check for "ERROR:" or "WARNING:" messages

3. **Check SendGrid Activity Feed:**
   - See if emails are being attempted
   - Check for error messages

4. **Verify all 4 environment variables are set:**
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL`
   - `FROM_NAME`
   - `FRONTEND_URL`

---

## Quick Reference Checklist

### Environment Variables to Add:
- [ ] `SENDGRID_API_KEY` = `SG.xxxxxxxx...` (from SendGrid API Keys page)
- [ ] `FROM_EMAIL` = Verified email address (from SendGrid Sender Authentication)
- [ ] `FROM_NAME` = `Forms App` (or your preferred name)
- [ ] `FRONTEND_URL` = `https://forms-bk39jkt10-reel48s-projects.vercel.app` (or your Vercel URL)

### Your Service URLs:
- **Backend API:** https://uvpc5mx3se.us-east-1.awsapprunner.com
- **Frontend:** https://forms-bk39jkt10-reel48s-projects.vercel.app
- **AWS Console:** https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms

### SendGrid Links:
- **API Keys:** https://app.sendgrid.com/settings/api_keys
- **Sender Authentication:** https://app.sendgrid.com/settings/sender_auth
- **Activity Feed:** https://app.sendgrid.com/activity

---

## Security Notes

- ✅ **Never commit API keys to git** - they're only in environment variables
- ✅ **Rotate API keys** if they're accidentally exposed
- ✅ **Use restricted access** API keys in production when possible
- ✅ **Domain authentication** is more secure than single sender verification
- ✅ **Monitor SendGrid Activity Feed** regularly for suspicious activity

---

## Need More Help?

If you're still having issues:

1. **Check the debug endpoint** to see current configuration
2. **Check App Runner logs** for detailed error messages
3. **Check SendGrid Activity Feed** to see if emails are being attempted
4. **Verify all environment variables** are set correctly in AWS Console

The logs will show exactly what's happening when you try to send emails!
