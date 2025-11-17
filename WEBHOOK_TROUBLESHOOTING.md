# Stripe Webhook Troubleshooting Guide

## Current Status

✅ **Webhook Endpoint**: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook`
✅ **Webhook Secret**: Configured in AWS App Runner
✅ **Endpoint Accessible**: Verified (returns proper error for invalid signature)
✅ **Handler Code**: Working (events are being received and processed)

## Issue: Webhook Not Receiving `invoice.paid` Event

The webhook endpoint is working, but Stripe is not sending the `invoice.paid` event for invoice `in_1SUbDeIsDvXaK28Un951QUtP`.

## Steps to Fix

### Step 1: Verify Webhook Configuration in Stripe Dashboard

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/webhooks
2. **Find your webhook endpoint** (should be: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook`)
3. **Click on the webhook endpoint** to view details

### Step 2: Check Webhook Events Configuration

In the webhook endpoint details, verify:
- ✅ **Endpoint URL** is correct: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook`
- ✅ **Events to send** includes `invoice.paid`
- ✅ **Status** is "Enabled" (not disabled)

**Required Events:**
- `invoice.paid` ✅ (MUST be enabled)
- `invoice.payment_failed`
- `invoice.finalized`
- `invoice.updated`

### Step 3: Check Webhook Delivery Logs

1. In the webhook endpoint page, scroll to **"Recent events"** or **"Logs"**
2. Look for the invoice payment event (`in_1SUbDeIsDvXaK28Un951QUtP`)
3. Check the status:
   - **200** = Success (webhook was delivered)
   - **400/500** = Error (webhook failed)
   - **No entry** = Stripe didn't send the webhook

### Step 4: Check Webhook Secret

1. In the webhook endpoint page, find **"Signing secret"**
2. Click **"Reveal"** to see the secret
3. Verify it matches: `whsec_yVf2oLmfiqzR4f5Mg9M6Vk18Gq5kFJim`
4. If it's different, update AWS App Runner environment variable

### Step 5: Test the Webhook Manually

1. In Stripe Dashboard → Webhooks → Your endpoint
2. Click **"Send test webhook"**
3. Select event type: **`invoice.paid`**
4. Click **"Send test webhook"**
5. Check if it appears in your database:
   ```sql
   SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 5;
   ```

### Step 6: Re-send Failed Webhooks (If Any)

If you see failed webhook deliveries in Stripe:

1. In the webhook endpoint page, find the failed event
2. Click on the event
3. Click **"Send again"** or **"Retry"**
4. Check if it's received and processed

### Step 7: Verify Invoice Payment in Stripe

1. Go to Stripe Dashboard → **Invoices**
2. Find invoice `in_1SUbDeIsDvXaK28Un951QUtP`
3. Verify:
   - Status is **"Paid"**
   - Payment date is recorded
   - Webhook was sent (check the invoice details page)

## Common Issues

### Issue 1: Webhook Not Configured
**Symptom**: No webhook endpoint in Stripe Dashboard
**Fix**: Create a new webhook endpoint with the correct URL

### Issue 2: Wrong Events Selected
**Symptom**: Webhook exists but `invoice.paid` is not selected
**Fix**: Edit webhook → Select events → Enable `invoice.paid`

### Issue 3: Webhook Secret Mismatch
**Symptom**: Webhook deliveries show 400 errors
**Fix**: Update `STRIPE_WEBHOOK_SECRET` in AWS App Runner to match Stripe

### Issue 4: Webhook Endpoint Down
**Symptom**: Webhook deliveries show 500/timeout errors
**Fix**: Check AWS App Runner service status and logs

### Issue 5: Invoice Paid Before Webhook Configured
**Symptom**: Invoice is paid but no webhook event exists
**Fix**: Manually trigger webhook from Stripe or use sync endpoint

## Next Steps

1. **Check Stripe Dashboard** for webhook configuration
2. **Verify events are enabled** for `invoice.paid`
3. **Check delivery logs** for the specific invoice
4. **Test webhook** manually from Stripe Dashboard
5. **Check backend logs** in AWS App Runner for webhook processing

## Monitoring

After fixing, monitor webhook events:
```sql
-- Check recent webhook events
SELECT stripe_event_id, event_type, invoice_id, processing_status, created_at 
FROM webhook_events 
ORDER BY created_at DESC 
LIMIT 10;
```

## Contact

If webhook still doesn't work after these steps:
1. Check AWS App Runner logs for webhook processing errors
2. Verify Stripe webhook endpoint is accessible from internet
3. Check if webhook secret is correctly set in AWS App Runner

