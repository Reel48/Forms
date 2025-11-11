# Email Debugging Guide

## Issue: Password Reset Emails Not Being Sent

If you're getting a success message but not receiving emails, here's how to debug:

## Step 1: Check Email Configuration

Use the debug endpoint to check if SendGrid is configured:

```bash
# Check email configuration
curl http://localhost:8000/api/debug/email-config

# Or in production
curl https://your-api-url.com/api/debug/email-config
```

This will show:
- Whether SENDGRID_API_KEY is set
- FROM_EMAIL, FROM_NAME, FRONTEND_URL values
- Whether the email service client is initialized

## Step 2: Test Email Sending

Send a test email:

```bash
# Send test email
curl -X POST http://localhost:8000/api/debug/test-email?email=your-email@example.com
```

## Step 3: Check Backend Logs

When you request a password reset, check the backend logs for:

1. **Email Service Initialization:**
   - Look for "Initializing EmailService..."
   - Check if SENDGRID_API_KEY is SET or NOT SET
   - Verify FROM_EMAIL, FROM_NAME, FRONTEND_URL values

2. **Email Sending Attempts:**
   - Look for "Attempting to send email to..."
   - Check for "SUCCESS: Email sent to..." or "ERROR: ..." messages
   - Look for SendGrid error responses

## Common Issues

### Issue 1: SENDGRID_API_KEY Not Set

**Symptoms:**
- Debug endpoint shows `sendgrid_configured: false`
- Logs show "SENDGRID_API_KEY not found in environment variables"

**Solution:**
1. Get your SendGrid API key from https://app.sendgrid.com/settings/api_keys
2. Add it to your environment variables:
   - **Local:** Add to `.env` file: `SENDGRID_API_KEY=SG.xxx`
   - **AWS App Runner:** Add in AWS Console → Environment variables

### Issue 2: FROM_EMAIL Not Verified

**Symptoms:**
- Email service is initialized
- SendGrid returns 403 or 400 error
- Error mentions "sender verification" or "unverified sender"

**Solution:**
1. Go to SendGrid Dashboard → Settings → Sender Authentication
2. Verify your sender email address (Single Sender Verification)
3. Or set up Domain Authentication for better deliverability
4. Make sure `FROM_EMAIL` environment variable matches verified sender

### Issue 3: Email Going to Spam

**Symptoms:**
- Emails are being sent (status 200/201/202)
- But you're not receiving them

**Solution:**
1. Check spam/junk folder
2. Set up Domain Authentication in SendGrid (better deliverability)
3. Check SendGrid Activity Feed to see email status
4. Verify sender reputation in SendGrid dashboard

### Issue 4: Wrong FRONTEND_URL

**Symptoms:**
- Emails are sent but links don't work
- Reset links point to wrong domain

**Solution:**
1. Check `FRONTEND_URL` environment variable
2. Make sure it matches your actual frontend URL
3. For production: `https://your-app.vercel.app`
4. For local dev: `http://localhost:5173`

## Step 4: Check SendGrid Dashboard

1. Go to https://app.sendgrid.com/activity
2. Look for recent email activity
3. Check for:
   - **Delivered:** Email was sent successfully
   - **Bounced:** Email address is invalid
   - **Blocked:** Email was blocked (spam, etc.)
   - **Dropped:** Email was dropped (invalid sender, etc.)

## Step 5: Verify Environment Variables in AWS

If deployed to AWS App Runner:

1. Go to AWS Console → App Runner → Your Service
2. Click on "Configuration" tab
3. Check "Environment variables" section
4. Verify these are set:
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL`
   - `FROM_NAME`
   - `FRONTEND_URL`

## Testing Locally

To test email sending locally:

1. Create `.env` file in `backend/` directory:
   ```
   SENDGRID_API_KEY=SG.your_api_key_here
   FROM_EMAIL=noreply@yourdomain.com
   FROM_NAME=Forms App
   FRONTEND_URL=http://localhost:5173
   ```

2. Start backend:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

3. Check logs when requesting password reset - you should see:
   - "SUCCESS: Email service initialized with SendGrid"
   - "Attempting to send email to..."
   - "SUCCESS: Email sent to..."

## Next Steps

1. **Check the debug endpoint** to see current configuration
2. **Check backend logs** when requesting password reset
3. **Verify SendGrid API key** is set in environment variables
4. **Check SendGrid Activity Feed** to see if emails are being sent
5. **Verify sender email** is authenticated in SendGrid

If emails still aren't working after checking all of the above, the logs will show the specific error from SendGrid.

