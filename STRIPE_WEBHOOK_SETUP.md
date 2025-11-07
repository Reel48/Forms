# Stripe Webhook Setup Guide

This guide will walk you through setting up Stripe webhooks for your Quote Builder application.

## Prerequisites

1. ✅ Enhanced webhook handler implemented
2. ✅ Database migration for webhook events table
3. ✅ Stripe account with API keys configured

## Step 1: Run Database Migration

Before setting up webhooks, run the migration to create the webhook events table:

1. Open your **Supabase Dashboard**
2. Go to **SQL Editor**
3. Open the file `database/webhook_events_migration.sql`
4. Copy and paste the SQL into the editor
5. Click **Run**

This creates the `webhook_events` table for storing webhook events and enabling idempotency.

## Step 2: Get Your Webhook Endpoint URL

You need a publicly accessible URL for your webhook endpoint. Choose one:

### Option A: Production (Recommended)

If your backend is deployed:
- **Webhook URL**: `https://your-backend-domain.com/api/stripe/webhook`
- Example: `https://api.yourdomain.com/api/stripe/webhook`

### Option B: Local Development (Using ngrok)

For local testing:

1. **Install ngrok** (if not already installed):
   ```bash
   # macOS
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Start your backend server**:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```
   Your server should be running on `http://localhost:8000`

3. **Start ngrok in a new terminal**:
   ```bash
   ngrok http 8000
   ```

4. **Copy the HTTPS URL** ngrok provides:
   - Example: `https://abc123.ngrok.io`
   - **Webhook URL**: `https://abc123.ngrok.io/api/stripe/webhook`

   ⚠️ **Note**: ngrok URLs change each time you restart ngrok (unless you have a paid account with a fixed domain)

## Step 3: Configure Webhook in Stripe Dashboard

1. **Log in to Stripe Dashboard**
   - Go to https://dashboard.stripe.com
   - Make sure you're in the correct mode (Test or Live)

2. **Navigate to Webhooks**
   - Click **"Developers"** in the left sidebar
   - Click **"Webhooks"**

3. **Add Webhook Endpoint**
   - Click **"Add endpoint"** button
   - Enter your **Endpoint URL**:
     - Production: `https://your-backend-domain.com/api/stripe/webhook`
     - Local (ngrok): `https://your-ngrok-url.ngrok.io/api/stripe/webhook`

4. **Select Events to Listen For**
   Click **"Select events"** and choose these invoice events:
   
   **Required Events:**
   - ✅ `invoice.paid`
   - ✅ `invoice.payment_failed`
   - ✅ `invoice.finalized`
   
   **Recommended Events:**
   - ✅ `invoice.updated`
   - ✅ `invoice.voided`
   - ✅ `invoice.marked_uncollectible`
   - ✅ `invoice.sent`
   - ✅ `invoice.payment_action_required`
   
   **Optional Events:**
   - `invoice.upcoming` (mainly for subscriptions)

5. **Save the Endpoint**
   - Click **"Add endpoint"**

## Step 4: Get Webhook Signing Secret

After creating the endpoint:

1. **Click on the endpoint** you just created
2. Find the **"Signing secret"** section
3. Click **"Reveal"** or **"Click to reveal"**
4. **Copy the secret** (starts with `whsec_...`)

## Step 5: Add Webhook Secret to Environment Variables

1. **Open your `.env` file** in the `backend` directory:
   ```bash
   cd backend
   nano .env  # or use your preferred editor
   ```

2. **Add the webhook secret**:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
   ```

3. **Save the file**

4. **Restart your backend server** to load the new environment variable:
   ```bash
   # Stop the server (Ctrl+C) and restart
   uvicorn main:app --reload
   ```

## Step 6: Test the Webhook

### Test Using Stripe Dashboard

1. Go to **Stripe Dashboard** → **Webhooks**
2. Click on your webhook endpoint
3. Click **"Send test webhook"**
4. Select an event type (e.g., `invoice.paid`)
5. Click **"Send test webhook"**

### Verify It's Working

1. **Check your backend logs** - you should see:
   ```
   INFO: Received webhook event: invoice.paid (ID: evt_...)
   INFO: Successfully processed webhook event invoice.paid
   ```

2. **Check the webhook events table**:
   - Query: `SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;`
   - Or use the API endpoint: `GET /api/stripe/webhook-events`

3. **Check your quote** - if you have a test quote with an invoice:
   - The payment status should update automatically

## Step 7: Monitor Webhook Events

### Using the API

**Get recent webhook events:**
```bash
GET /api/stripe/webhook-events?limit=50
```

**Filter by event type:**
```bash
GET /api/stripe/webhook-events?event_type=invoice.paid
```

**Filter by status:**
```bash
GET /api/stripe/webhook-events?status=completed
```

**Get specific event:**
```bash
GET /api/stripe/webhook-events/{stripe_event_id}
```

### Using Stripe Dashboard

1. Go to **Webhooks** → Your endpoint
2. View **"Recent events"** tab
3. See delivery status, response codes, and retry attempts

## Troubleshooting

### Webhook Not Receiving Events

1. **Check endpoint URL is correct**
   - Must be HTTPS (not HTTP)
   - Must include `/api/stripe/webhook` path
   - No trailing slash

2. **Verify webhook secret is set**
   ```bash
   # Check .env file
   cat backend/.env | grep STRIPE_WEBHOOK_SECRET
   ```

3. **Check server is running and accessible**
   - Test: `curl https://your-endpoint-url/api/stripe/webhook`
   - Should return 400 (expected - no signature provided)

4. **Check Stripe Dashboard**
   - Go to Webhooks → Your endpoint → Recent events
   - Look for failed deliveries
   - Check error messages

### Webhook Returns 400 "Invalid signature"

1. **Verify webhook secret matches**
   - Check Stripe Dashboard → Webhooks → Your endpoint → Signing secret
   - Compare with your `.env` file

2. **Check if using correct Stripe mode**
   - Test mode webhook secret only works with test mode
   - Live mode webhook secret only works with live mode

3. **Restart server after changing .env**
   - Environment variables are loaded at startup

### Events Not Updating Quotes

1. **Check if quote has invoice ID**
   - Quote must have `stripe_invoice_id` set
   - Webhook matches invoice ID to quote

2. **Check webhook event logs**
   ```bash
   GET /api/stripe/webhook-events
   ```
   - Look for events with `processing_status: "failed"`
   - Check `error_message` field

3. **Check backend logs**
   - Look for error messages
   - Check if invoice ID matches quote

### Webhook Events Not Stored

1. **Verify database migration ran**
   - Check if `webhook_events` table exists
   - Run migration if needed

2. **Check database connection**
   - Verify Supabase credentials in `.env`
   - Test connection: `python -c "from database import supabase; print('Connected')"`

## Webhook Event Flow

```
1. Stripe sends webhook → Your endpoint
2. Verify signature → Validate request
3. Check idempotency → Skip if already processed
4. Store event → Save to webhook_events table
5. Process event → Update quote status
6. Update event status → Mark as completed
7. Return 200 → Acknowledge to Stripe
```

## Security Best Practices

1. ✅ **Always use HTTPS** - Never use HTTP for webhooks
2. ✅ **Verify signatures** - Always validate webhook signatures
3. ✅ **Store events** - Keep audit trail of all webhook events
4. ✅ **Idempotency** - Prevent duplicate processing
5. ✅ **Logging** - Log all webhook events for debugging
6. ✅ **Error handling** - Return appropriate status codes

## Next Steps

Once webhooks are set up:

1. **Test with real invoices** - Create a test quote, accept it, create invoice
2. **Monitor webhook events** - Use the API endpoints to view events
3. **Set up alerts** - Monitor for failed webhook deliveries
4. **Review logs** - Check webhook processing regularly

## Support

If you encounter issues:

1. Check backend logs for error messages
2. Review webhook events in database: `SELECT * FROM webhook_events ORDER BY created_at DESC;`
3. Check Stripe Dashboard → Webhooks → Recent events
4. Verify all environment variables are set correctly

Your webhook system is now production-ready with:
- ✅ Comprehensive event handling
- ✅ Idempotency protection
- ✅ Full audit trail
- ✅ Structured logging
- ✅ Error handling
