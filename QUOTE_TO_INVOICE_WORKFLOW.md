# Complete Workflow: Quote → Stripe Invoice → Payment

## 📋 Step-by-Step Process

### Step 1: Create a Quote on Your Website

1. **Go to your website**
2. **Create a Client** (if you don't have one)
   - Click "Clients" → "Add Client"
   - Enter client information
   - **Important**: Include an **email address** (required for Stripe customer creation)
   - Save the client

3. **Create a Quote**
   - Click "Quotes" → "Create Quote"
   - Select the client you just created
   - Add line items (description, quantity, price)
   - Set tax rate if needed
   - Add notes/terms if desired
   - Click "Create Quote"

**Result**: Quote is created with status "draft"

---

### Step 2: Send/Accept the Quote

**Option A: Accept the Quote Yourself (Internal Workflow)**
1. View the quote you created
2. Click **"Accept Quote"** button
3. Quote status changes to "accepted"

**Option B: Send Quote to Client (External Workflow)**
1. View the quote
2. Change status to "sent" (via Edit or status dropdown)
3. Send the quote PDF to your client
4. Client reviews and accepts
5. You change status to "accepted" when they agree

**Result**: Quote status is now "accepted"

---

### Step 3: Create Stripe Invoice from Quote

1. **On the Quote View Page**
   - You should see a green box: "Create Invoice"
   - It says: "This quote has been accepted. Create a Stripe invoice to collect payment."

2. **Click "Create Stripe Invoice" Button**
   - The system will:
     - Create a Stripe customer (if not already created)
     - Create invoice items for each line item
     - Create the Stripe invoice
     - Link the invoice to your quote
     - Finalize the invoice

3. **Wait for Processing**
   - Button shows "Creating Invoice..." while processing
   - Usually takes 1-2 seconds

**Result**: 
- Stripe invoice is created
- Quote now has `stripe_invoice_id` set
- You see "Invoice Created" section with "View Invoice" button

---

### Step 4: Send Invoice to Client

**Option A: Use Stripe's Hosted Invoice Page (Recommended)**

1. **Click "View Invoice" Button**
   - Opens Stripe's hosted invoice page in a new tab
   - This is the invoice your client will see

2. **Copy the Invoice URL**
   - The URL looks like: `https://invoice.stripe.com/i/acct_.../...`
   - Copy this URL

3. **Send to Client**
   - Email the invoice URL to your client
   - Or include it in your communication
   - Client clicks link → sees invoice → can pay immediately

**Option B: Send Invoice via Stripe Dashboard**

1. Go to Stripe Dashboard → Invoices
2. Find your invoice
3. Click "Send invoice" button
4. Stripe emails the invoice directly to the client

**Result**: Client receives invoice and can pay

---

### Step 5: Client Pays the Invoice

**What the Client Sees:**
1. Client clicks invoice link
2. Sees Stripe's hosted invoice page with:
   - Invoice details
   - Line items
   - Total amount
   - "Pay" button

3. **Client Clicks "Pay"**
   - Enters payment information
   - Completes payment
   - Receives confirmation

**What Happens Automatically:**
1. **Stripe sends webhook** to your endpoint
2. **Your webhook handler processes the event:**
   - Receives `invoice.paid` event
   - Finds the quote by `stripe_invoice_id`
   - Updates quote `payment_status` to "paid"
   - Stores webhook event in database

3. **Your Website Updates:**
   - Quote view page auto-refreshes (every 10 seconds)
   - Payment status badge changes to "paid" (green)
   - Shows "✅ Payment received! This invoice has been paid." message
   - Or click "Refresh Status" for instant update

**Result**: Payment complete, quote status updated automatically

---

## 🎯 Complete Example Walkthrough

### Scenario: You want to invoice a client for $1,000

1. **Create Client**
   ```
   Name: John Doe
   Email: john@example.com
   Company: Acme Corp
   ```

2. **Create Quote**
   ```
   Title: Website Development
   Client: John Doe
   Line Items:
     - Website Design: $500
     - Development: $400
     - Hosting Setup: $100
   Total: $1,000
   Status: draft
   ```

3. **Accept Quote**
   - Click "Accept Quote"
   - Status: accepted

4. **Create Invoice**
   - Click "Create Stripe Invoice"
   - System creates:
     - Stripe customer: John Doe (john@example.com)
     - Stripe invoice with 3 line items
     - Total: $1,000
   - You see "Invoice Created" section

5. **Send Invoice**
   - Click "View Invoice" → Copy URL
   - Email to john@example.com: "Here's your invoice: [URL]"

6. **Client Pays**
   - John clicks link
   - Enters credit card: 4242 4242 4242 4242
   - Clicks "Pay"
   - Payment processed

7. **Automatic Update**
   - Webhook fires: `invoice.paid`
   - Your system updates quote
   - Quote view shows: "✅ Payment received!"
   - Payment status: **paid** (green badge)

---

## 🔄 The Webhook Flow (Automatic)

```
Client Pays Invoice
    ↓
Stripe Processes Payment
    ↓
Stripe Sends Webhook → Your Endpoint
    ↓
Your Webhook Handler:
  - Verifies signature
  - Checks idempotency (prevents duplicates)
  - Stores event in database
  - Finds quote by invoice_id
  - Updates payment_status to "paid"
  - Returns 200 to Stripe
    ↓
Your Website:
  - Auto-refreshes quote view (every 10 seconds)
  - Shows updated payment status
  - Displays success message
```

---

## 📍 Where to Find Everything

### On Your Website

**Quote List Page:**
- See all quotes
- Status badges show current state
- Payment status visible

**Quote View Page:**
- Full quote details
- "Accept Quote" button (if sent/viewed)
- "Create Stripe Invoice" button (if accepted)
- "View Invoice" link (if invoice created)
- Payment status badge
- Auto-refresh every 10 seconds

### In Stripe Dashboard

**Customers:**
- https://dashboard.stripe.com/customers
- See all clients (automatically created)

**Invoices:**
- https://dashboard.stripe.com/invoices
- See all invoices created from quotes
- View payment status
- Send invoices manually

**Webhooks:**
- https://dashboard.stripe.com/webhooks
- See webhook delivery status
- View recent events
- Test webhooks

---

## ⚡ Quick Reference

### Creating an Invoice

1. Quote must be **"accepted"** status
2. Quote must have a **client** (with email)
3. Click **"Create Stripe Invoice"** button
4. Wait 1-2 seconds
5. Click **"View Invoice"** to get the link

### Sending to Client

**Easiest Method:**
- Click "View Invoice" → Copy URL → Email to client

**Via Stripe:**
- Stripe Dashboard → Invoices → Find invoice → "Send invoice"

### Payment Status Updates

- **Automatic**: Page refreshes every 10 seconds
- **Manual**: Click "Refresh Status" button
- **Check**: Look for payment status badge

---

## 🎬 Visual Flow

```
[Your Website]
    ↓ Create Quote
[Quote: draft]
    ↓ Accept Quote
[Quote: accepted]
    ↓ Create Stripe Invoice
[Stripe Invoice Created]
    ↓ Send Invoice Link
[Client Receives Invoice]
    ↓ Client Pays
[Stripe Processes Payment]
    ↓ Webhook Fires
[Your System Updates]
    ↓ Auto-Refresh
[Quote: paid ✅]
```

---

## 💡 Pro Tips

1. **Always include client email** - Required for Stripe customer creation
2. **Accept quote before creating invoice** - Required step
3. **Use "View Invoice" link** - Easiest way to send to clients
4. **Check payment status badge** - Shows current state
5. **Webhook is automatic** - No manual steps needed after payment
6. **Auto-refresh works** - Just wait 10 seconds for updates

---

## 🐛 Troubleshooting

**"Create Stripe Invoice" button not showing?**
- Quote must be "accepted" status
- Quote must have a client
- Client should have an email

**Invoice created but no link?**
- Click "Refresh Status" button
- Or wait 10 seconds for auto-refresh

**Payment status not updating?**
- Check webhook events: `GET /api/stripe/webhook-events`
- Verify webhook is receiving events in Stripe Dashboard
- Click "Refresh Status" button manually

**Client can't pay?**
- Check invoice link is correct
- Verify invoice is finalized in Stripe
- Check Stripe Dashboard for invoice status

---

That's the complete workflow! Your quotes become Stripe invoices that clients can pay, and everything updates automatically via webhooks. 🚀

