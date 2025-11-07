# Stripe Webhook Setup Guide

## Do You Need Webhooks?

**YES** - Webhooks are **highly recommended** for automatic payment status updates.

### What Webhooks Do:
- ✅ Automatically update quote payment status when invoices are paid
- ✅ Update payment status when payments fail
- ✅ Keep your database in sync with Stripe payment events

### Without Webhooks:
- ⚠️ You can still create invoices manually
- ⚠️ Payment status won't update automatically
- ⚠️ You'll need to manually check Stripe and update quotes

## Webhook Setup Steps

### Step 1: Deploy Your Backend First

Webhooks need a publicly accessible URL. Your backend must be deployed to AWS App Runner first.

**Your webhook endpoint will be:**
```
https://your-app-runner-url.awsapprunner.com/api/stripe/webhook
```

### Step 2: Set Up Webhook in Stripe Dashboard

1. **Go to Stripe Dashboard**
   - Visit https://dashboard.stripe.com
   - Make sure you're in the correct mode (Test or Live)

2. **Navigate to Webhooks**
   - Click **"Developers"** in the left sidebar
   - Click **"Webhooks"**

3. **Add Endpoint**
   - Click **"Add endpoint"**
   - Enter your endpoint URL:
     ```
     https://your-app-runner-url.awsapprunner.com/api/stripe/webhook
     ```
     ⚠️ Replace `your-app-runner-url.awsapprunner.com` with your actual AWS App Runner URL

4. **Select Events**
   Click **"Select events"** and choose:
   - ✅ `invoice.paid` - When an invoice is paid
   - ✅ `invoice.payment_failed` - When payment fails
   - ✅ `invoice.finalized` - When invoice is finalized

5. **Create Endpoint**
   - Click **"Add endpoint"**

### Step 3: Get Webhook Signing Secret

1. **After creating the endpoint**, click on it in the webhooks list
2. Find the **"Signing secret"** section
3. Click **"Reveal"** or **"Click to reveal"**
4. Copy the secret (starts with `whsec_...`)

### Step 4: Add Webhook Secret to Environment Variables

#### For Local Development (.env file):
```env
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
```

#### For AWS App Runner Deployment:
1. Go to AWS App Runner Console → Your Service → Configuration → Edit
2. Under Runtime environment variables, add:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
   ```
3. Replace `YOUR_SECRET_HERE` with the actual secret from Step 3
4. Save and the service will automatically redeploy

### Step 5: Test the Webhook

1. **Create a test invoice** in your app
2. **Pay the invoice** in Stripe Dashboard (or use test card)
3. **Check your database** - the quote's `payment_status` should automatically update to `"paid"`

## Webhook Events Handled

Your webhook endpoint handles these events:

| Event | What It Does |
|-------|-------------|
| `invoice.paid` | Updates quote `payment_status` to `"paid"` |
| `invoice.payment_failed` | Updates quote `payment_status` to `"failed"` |
| `invoice.finalized` | Updates quote `payment_status` to `"unpaid"` |

## Troubleshooting

### "Webhook secret not configured"
- ✅ Add `STRIPE_WEBHOOK_SECRET` to your environment variables
- ✅ Restart your backend server after adding it
- ✅ For AWS App Runner: Service will auto-redeploy after adding the variable

### Webhook Not Receiving Events
- ✅ Verify your webhook URL is correct and accessible
- ✅ Check that your backend is deployed and running
- ✅ Verify events are selected in Stripe Dashboard
- ✅ Check AWS CloudWatch logs for webhook requests

### Payment Status Not Updating
- ✅ Verify webhook secret matches Stripe Dashboard
- ✅ Check backend logs for webhook processing errors
- ✅ Ensure quote has `stripe_invoice_id` set
- ✅ Test webhook manually in Stripe Dashboard → Webhooks → Send test webhook

### Testing Locally (Before Deployment)

If you want to test webhooks locally before deploying:

1. **Use ngrok** to expose your local server:
   ```bash
   ngrok http 8000
   ```

2. **Use the ngrok URL** in Stripe webhook endpoint:
   ```
   https://abc123.ngrok.io/api/stripe/webhook
   ```

3. **Note**: ngrok URLs change each time you restart, so you'll need to update the webhook URL in Stripe

## Security Notes

- ✅ Webhook signatures are verified automatically (already implemented)
- ✅ Never expose your webhook secret in frontend code
- ✅ Always use HTTPS in production
- ✅ The webhook endpoint validates Stripe signatures to prevent spoofing

## Quick Checklist

- [ ] Backend deployed to AWS App Runner
- [ ] Webhook endpoint created in Stripe Dashboard
- [ ] Events selected: `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`
- [ ] Webhook signing secret copied
- [ ] `STRIPE_WEBHOOK_SECRET` added to AWS App Runner environment variables
- [ ] Backend redeployed (to load new env var)
- [ ] Test webhook sent from Stripe Dashboard
- [ ] Payment status updates verified

## Current Status

Your webhook endpoint is implemented at:
```
POST /api/stripe/webhook
```

The endpoint:
- ✅ Verifies webhook signatures
- ✅ Handles payment events
- ✅ Updates database automatically
- ⚠️ Requires `STRIPE_WEBHOOK_SECRET` to be set

**Next Step**: Set up the webhook in Stripe Dashboard and add the secret to your environment variables!

