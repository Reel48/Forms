# How to Connect Your Stripe Account - Step by Step Guide

This guide will walk you through connecting your Stripe account to the Quote Builder application.

## Step 1: Get Your Stripe API Keys

1. **Log in to Stripe Dashboard**
   - Go to https://dashboard.stripe.com
   - Sign in to your account (or create one if you don't have it)

2. **Get Your Secret Key**
   - Click on **"Developers"** in the left sidebar
   - Click on **"API keys"**
   - You'll see two keys:
     - **Publishable key** (starts with `pk_test_...` or `pk_live_...`) - Not needed for this integration
     - **Secret key** (starts with `sk_test_...` or `sk_live_...`) - **This is what you need**
   
   **For Testing/Development:**
   - Use the **"Secret key"** under "Test mode" (starts with `sk_test_...`)
   - Click "Reveal test key" if it's hidden
   - Copy this key

   **For Production:**
   - Switch to "Live mode" toggle
   - Use the **"Secret key"** under "Live mode" (starts with `sk_live_...`)
   - Copy this key

## Step 2: Set Up Environment Variables

1. **Navigate to your backend directory**
   ```bash
   cd backend
   ```

2. **Create or edit `.env` file**
   - If you don't have a `.env` file, create one
   - If you already have one, open it for editing

3. **Add your Stripe keys**
   ```env
   # Stripe Configuration
   STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
   ```
   
   **Important:** Replace `YOUR_SECRET_KEY_HERE` with the actual key you copied from Stripe (keep the `sk_test_` prefix)

   **Note:** Leave `STRIPE_WEBHOOK_SECRET` empty for now - we'll get this in Step 4

4. **Save the file**
   - Make sure `.env` is in your `.gitignore` file (never commit secrets!)

## Step 3: Install Dependencies

Make sure the Stripe package is installed:

```bash
cd backend
pip install -r requirements.txt
```

This will install `stripe==7.0.0` along with other dependencies.

## Step 4: Set Up Webhooks (For Payment Status Updates)

Webhooks allow Stripe to notify your app when payments are made. You have two options:

### Option A: Local Development (Using ngrok)

1. **Install ngrok** (if you don't have it)
   - Download from https://ngrok.com/download
   - Or install via Homebrew: `brew install ngrok`

2. **Start your backend server**
   ```bash
   cd backend
   uvicorn main:app --reload
   ```
   Your server should be running on `http://localhost:8000`

3. **Start ngrok in a new terminal**
   ```bash
   ngrok http 8000
   ```
   This will give you a URL like: `https://abc123.ngrok.io`

4. **Set up webhook in Stripe Dashboard**
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click **"Add endpoint"**
   - Enter your endpoint URL: `https://YOUR-NGROK-URL.ngrok.io/api/stripe/webhook`
     (Replace `YOUR-NGROK-URL` with your actual ngrok URL)
   - Click **"Select events"**
   - Select these events:
     - `invoice.paid`
     - `invoice.payment_failed`
     - `invoice.finalized`
   - Click **"Add endpoint"**

5. **Get the webhook signing secret**
   - After creating the endpoint, click on it
   - Find **"Signing secret"** section
   - Click **"Reveal"** and copy the secret (starts with `whsec_...`)
   - Add it to your `.env` file:
     ```env
     STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
     ```

### Option B: Production (Using Your Domain)

1. **Deploy your backend** to a server with a public URL
   - Example: `https://api.yourdomain.com`

2. **Set up webhook in Stripe Dashboard**
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click **"Add endpoint"**
   - Enter your endpoint URL: `https://api.yourdomain.com/api/stripe/webhook`
   - Click **"Select events"**
   - Select these events:
     - `invoice.paid`
     - `invoice.payment_failed`
     - `invoice.finalized`
   - Click **"Add endpoint"**

3. **Get the webhook signing secret**
   - Click on the endpoint you just created
   - Copy the **"Signing secret"** (starts with `whsec_...`)
   - Add it to your production environment variables

## Step 5: Run Database Migration

Before using Stripe features, you need to add the Stripe-related columns to your database:

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to **SQL Editor**

2. **Run the migration**
   - Open the file `database/stripe_migration.sql`
   - Copy its contents
   - Paste into Supabase SQL Editor
   - Click **"Run"**

   Or manually run:
   ```sql
   -- Add Stripe fields to clients table
   ALTER TABLE clients 
   ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

   -- Add Stripe fields to quotes table
   ALTER TABLE quotes 
   ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR(255),
   ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255),
   ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';

   -- Create indexes
   CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer_id ON clients(stripe_customer_id);
   CREATE INDEX IF NOT EXISTS idx_quotes_stripe_invoice_id ON quotes(stripe_invoice_id);
   CREATE INDEX IF NOT EXISTS idx_quotes_payment_status ON quotes(payment_status);
   ```

## Step 6: Test the Connection

1. **Restart your backend server** (to load new environment variables)
   ```bash
   # Stop the server (Ctrl+C) and restart
   uvicorn main:app --reload
   ```

2. **Test customer creation**
   - Create a client in your app with an email address
   - Check Stripe Dashboard → **Customers** → You should see a new customer

3. **Test invoice creation**
   - Create a quote for that client
   - Accept the quote (change status to "accepted")
   - Click "Create Stripe Invoice" on the quote view page
   - Check Stripe Dashboard → **Invoices** → You should see a new invoice

## Troubleshooting

### "STRIPE_SECRET_KEY environment variable is required"
- Make sure your `.env` file is in the `backend` directory
- Check that the key starts with `sk_test_` or `sk_live_`
- Restart your server after adding the key

### "Webhook secret not configured"
- This is okay for testing - webhooks are optional for basic functionality
- You can test invoice creation without webhooks
- Payment status updates won't work without webhooks

### Customer not created in Stripe
- Make sure the client has an email address
- Check backend logs for error messages
- Verify your Stripe secret key is correct

### Invoice creation fails
- Ensure quote is "accepted" status
- Ensure quote has an associated client
- Ensure client has an email address
- Check backend logs for detailed errors

## Quick Reference

**Environment Variables Needed:**
```env
STRIPE_SECRET_KEY=sk_test_...          # Required
STRIPE_WEBHOOK_SECRET=whsec_...        # Optional (needed for payment status updates)
```

**Stripe Dashboard Links:**
- API Keys: https://dashboard.stripe.com/apikeys
- Webhooks: https://dashboard.stripe.com/webhooks
- Customers: https://dashboard.stripe.com/customers
- Invoices: https://dashboard.stripe.com/invoices

## Next Steps

Once connected:
1. Test creating a client → Should create Stripe customer
2. Test accepting a quote → Should allow invoice creation
3. Test creating invoice → Should appear in Stripe
4. Test payment → Should update payment status (if webhooks configured)

You're all set! Your Stripe account is now connected to your Quote Builder application.

