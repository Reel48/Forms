# Stripe Integration Setup Guide

This guide will help you set up Stripe integration for the Quote Builder application.

## Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Access to your Stripe Dashboard

## Setup Steps

### 1. Install Dependencies

The Stripe Python package has been added to `requirements.txt`. Install it:

```bash
cd backend
pip install -r requirements.txt
```

### 2. Database Migration

Run the Stripe migration SQL to add the necessary fields:

```sql
-- Run this in your Supabase SQL Editor
-- File: database/stripe_migration.sql
```

Or manually run:
- Add `stripe_customer_id` to `clients` table
- Add `stripe_invoice_id`, `stripe_payment_intent_id`, and `payment_status` to `quotes` table

### 3. Configure Environment Variables

Add the following to your `.env` file in the backend directory:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key (use test key for development)
STRIPE_WEBHOOK_SECRET=whsec_...  # Your Stripe webhook signing secret (see step 4)
```

**Important:** 
- Use `sk_test_...` keys for development/testing
- Use `sk_live_...` keys for production
- Never commit these keys to version control

### 4. Set Up Stripe Webhooks

1. Go to your Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Set the endpoint URL to: `https://your-domain.com/api/stripe/webhook`
   - For local development, use a tool like ngrok: `ngrok http 8000`
   - Then use: `https://your-ngrok-url.ngrok.io/api/stripe/webhook`
4. Select these events to listen for:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.finalized`
5. Copy the "Signing secret" and add it to your `.env` as `STRIPE_WEBHOOK_SECRET`

### 5. Test the Integration

1. Create a client with an email address
2. Create a quote for that client
3. Accept the quote (change status to "accepted")
4. Click "Create Stripe Invoice" on the quote view page
5. The invoice will be created in Stripe and you'll get a link to view it

## How It Works

### Workflow

1. **Client Creation**: When a client is created/updated with an email, a Stripe customer is automatically created
2. **Quote Acceptance**: When a quote is accepted, you can create a Stripe invoice
3. **Invoice Creation**: The invoice is created with all line items from the quote
4. **Payment Tracking**: Webhooks update the quote's payment status automatically

### Key Features

- **Automatic Customer Sync**: Clients are synced with Stripe customers
- **Invoice Generation**: Accepted quotes can be converted to Stripe invoices
- **Payment Tracking**: Payment status is automatically updated via webhooks
- **Hosted Invoices**: Stripe provides hosted invoice pages for customers

## API Endpoints

### Stripe Endpoints

- `POST /api/stripe/quotes/{quote_id}/create-invoice` - Create a Stripe invoice from an accepted quote
- `GET /api/stripe/invoices/{invoice_id}` - Get invoice details
- `POST /api/stripe/webhook` - Webhook endpoint for Stripe events

### Quote Endpoints

- `PUT /api/quotes/{quote_id}/accept` - Accept a quote

## Frontend Features

The QuoteView page now includes:

- **Accept Quote** button (for sent/viewed quotes)
- **Create Stripe Invoice** button (for accepted quotes)
- **View Invoice** link (when invoice is created)
- **Payment Status** badge

## Troubleshooting

### Invoice Creation Fails

- Ensure the quote has an associated client
- Ensure the client has an email address
- Check that `STRIPE_SECRET_KEY` is set correctly
- Check backend logs for detailed error messages

### Webhooks Not Working

- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Check that the webhook endpoint URL is accessible
- Verify the webhook events are selected in Stripe Dashboard
- Check backend logs for webhook processing errors

### Customer Not Created

- Ensure the client has an email address
- Check Stripe API key permissions
- Review backend logs for Stripe API errors

## Security Notes

- Never expose your Stripe secret keys in the frontend
- Always use HTTPS in production
- Validate webhook signatures (already implemented)
- Use environment variables for all sensitive data

## Next Steps

Consider adding:

- Email notifications when invoices are created
- Automatic invoice sending via Stripe
- Payment method collection
- Refund handling
- Subscription support for recurring quotes

