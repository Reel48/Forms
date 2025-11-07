# Webhook Testing & Verification Guide

## ✅ Deployment Status

Your Stripe webhook is now fully deployed and ready to test!

### Configuration Verified

- ✅ **Webhook Endpoint**: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook`
- ✅ **Webhook Secret**: Configured in AWS App Runner (redeploying)
- ✅ **Database**: All migrations applied
- ✅ **Code**: Enhanced webhook handler deployed
- ✅ **Frontend**: Payment status display ready

## 🧪 Testing Checklist

### Step 1: Verify Webhook Endpoint is Accessible

The endpoint should return a 400 error (expected - no signature):
```bash
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook
# Expected: 400 Bad Request (invalid payload/signature)
```

✅ **Status**: Endpoint is accessible (tested)

### Step 2: Test from Stripe Dashboard

1. **Go to Stripe Dashboard**
   - Navigate to: https://dashboard.stripe.com/webhooks
   - Find your endpoint: `we_1SQwK4IsDvXaK28Unio8fRjl`

2. **Send Test Webhook**
   - Click on your webhook endpoint
   - Click **"Send test webhook"** button
   - Select event: `invoice.paid`
   - Click **"Send test webhook"**

3. **Verify Success**
   - Check "Recent events" tab
   - Should show **200** response code
   - Response time should be < 1 second

### Step 3: Test with Real Quote Flow

1. **Create a Test Quote**
   - Go to your site
   - Create a new client (with email)
   - Create a new quote for that client
   - Add some line items

2. **Accept the Quote**
   - View the quote
   - Click **"Accept Quote"** button
   - Quote status should change to "accepted"

3. **Create Stripe Invoice**
   - Click **"Create Stripe Invoice"** button
   - Invoice should be created
   - You should see "Invoice Created" section
   - Click **"View Invoice"** to see Stripe invoice

4. **Test Payment (Use Test Card)**
   - In Stripe Dashboard, go to the invoice
   - Use test card: `4242 4242 4242 4242`
   - Complete payment
   - **Webhook should fire automatically**

5. **Verify Payment Status Updated**
   - Go back to your quote view
   - Payment status should show **"paid"** badge
   - Should see "✅ Payment received!" message
   - Status updates automatically (refreshes every 10 seconds)

### Step 4: Verify Webhook Events in Database

Query webhook events:
```sql
SELECT 
  stripe_event_id,
  event_type,
  processing_status,
  quote_id,
  invoice_id,
  created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;
```

Or use the API:
```bash
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook-events
```

## 🔍 What to Check on Your Site

### Quote View Page

1. **Payment Status Badge**
   - Should show payment status (unpaid, paid, failed, etc.)
   - Badge color changes based on status

2. **Invoice Section**
   - When invoice is created, shows "Invoice Created" box
   - "View Invoice" button links to Stripe
   - "Refresh Status" button to manually update

3. **Auto-Refresh**
   - Page automatically refreshes quote data every 10 seconds
   - Payment status updates automatically when webhook fires

### Quote List Page

- Payment status is visible in quote details
- Status badges show current state

## 🐛 Troubleshooting

### Webhook Not Receiving Events

1. **Check AWS App Runner**
   - Verify `STRIPE_WEBHOOK_SECRET` is set
   - Check service is running (not in error state)
   - Verify latest deployment completed

2. **Check Stripe Dashboard**
   - Webhooks → Your endpoint → Recent events
   - Look for failed deliveries
   - Check error messages

3. **Check Endpoint**
   ```bash
   # Should return 400 (expected)
   curl -X POST https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook
   ```

### Payment Status Not Updating

1. **Check Webhook Events**
   ```bash
   GET /api/stripe/webhook-events
   ```
   - Look for events with `processing_status: "completed"`
   - Check if quote_id matches your quote

2. **Check Quote Has Invoice ID**
   - Quote must have `stripe_invoice_id` set
   - Webhook matches invoice ID to quote

3. **Manual Refresh**
   - Click "Refresh Status" button
   - Or refresh the page

### Frontend Not Showing Updates

1. **Check Browser Console**
   - Look for API errors
   - Check network requests

2. **Verify API Response**
   - Quote should include `payment_status` field
   - Check API response in browser DevTools

3. **Auto-Refresh**
   - Page refreshes every 10 seconds
   - Wait for auto-refresh or click "Refresh Status"

## 📊 Monitoring

### View Webhook Events

**Via API:**
```bash
# All events
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook-events

# By type
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook-events?event_type=invoice.paid

# Failed events
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook-events?status=failed
```

**Via Database:**
```sql
SELECT * FROM webhook_events 
WHERE processing_status = 'failed'
ORDER BY created_at DESC;
```

### View in Stripe Dashboard

- Go to Webhooks → Your endpoint
- View "Recent events" tab
- See delivery status, response codes, retry attempts

## ✅ Success Indicators

You'll know everything is working when:

1. ✅ Test webhook from Stripe returns 200
2. ✅ Webhook events appear in database
3. ✅ Payment status updates automatically on quote view
4. ✅ Payment status badge shows correct state
5. ✅ "Payment received!" message appears when paid
6. ✅ Invoice link works and shows paid status

## 🎯 Quick Test Flow

1. Create quote → Accept → Create invoice
2. Pay invoice in Stripe (test card: 4242 4242 4242 4242)
3. Watch quote view page - payment status should update within 10 seconds
4. Check webhook events API - should see `invoice.paid` event

---

**Your webhook is ready!** Start testing with the steps above. 🚀

