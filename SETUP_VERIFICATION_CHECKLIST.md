# Setup Verification Checklist

Use this checklist to verify your complete setup is ready for development.

## ✅ Current Status

### AWS Backend (App Runner)
- **Status:** ✅ RUNNING
- **URL:** `https://uvpc5mx3se.us-east-1.awsapprunner.com`
- **Health Check:** `/health` endpoint available
- **Environment Variables:** ✅ Configured
  - ✅ SUPABASE_URL
  - ✅ SUPABASE_KEY
  - ✅ STRIPE_SECRET_KEY
  - ✅ ALLOWED_ORIGINS

### Supabase Database
- **Status:** ✅ Connected
- **URL:** `https://boisewltuwcjfrdjnfwd.supabase.co`
- **Database:** PostgreSQL
- **Tables:** clients, quotes, line_items

### Vercel Frontend
- **Status:** ⚠️ Needs verification
- **Configuration:** ✅ vercel.json configured
- **Environment Variable:** ⚠️ VITE_API_URL needs to be set

---

## 🔧 Required Setup Steps

### 1. Update Vercel Environment Variable ⚠️ REQUIRED

**Action:** Set `VITE_API_URL` in Vercel to point to your AWS backend.

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add/Update:
   ```
   VITE_API_URL=https://uvpc5mx3se.us-east-1.awsapprunner.com
   ```
5. **Important:** Add this for all environments:
   - ✅ Production
   - ✅ Preview
   - ✅ Development (optional, for local dev)
6. **Redeploy** your frontend after adding the variable

**Verify:**
- After redeploy, your frontend should connect to the AWS backend
- Check browser console for API calls to `uvpc5mx3se.us-east-1.awsapprunner.com`

---

### 2. Update CORS Configuration (If Needed)

**Current Setting:**
```
ALLOWED_ORIGINS=https://*.vercel.app,http://localhost:5173,http://localhost:3000
```

**Action:** After you deploy to Vercel, you may need to add your specific Vercel domain(s) to `ALLOWED_ORIGINS` for better security.

1. Get your Vercel domain(s) after deployment
2. Update AWS App Runner environment variable:
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main.vercel.app,http://localhost:5173
   ```

**Note:** The wildcard `https://*.vercel.app` should work, but specific domains are more secure.

---

### 3. Set Up Stripe Webhooks (Optional but Recommended)

**Status:** ⚠️ Not configured yet

**Why:** Webhooks automatically update payment status when invoices are paid.

**Steps:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Enter endpoint URL:
   ```
   https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook
   ```
4. Select events:
   - ✅ `invoice.paid`
   - ✅ `invoice.payment_failed`
   - ✅ `invoice.finalized`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to AWS App Runner environment variables:
   - Go to AWS App Runner Console
   - Edit service configuration
   - Add: `STRIPE_WEBHOOK_SECRET=whsec_...`
   - Save (service will auto-redeploy)

**See:** `STRIPE_WEBHOOK_SETUP.md` for detailed instructions

---

## ✅ Verification Tests

### Test 1: Backend Health Check
```bash
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/health
```
**Expected:** `{"status":"healthy"}`

### Test 2: Backend API Docs
Open in browser:
```
https://uvpc5mx3se.us-east-1.awsapprunner.com/docs
```
**Expected:** FastAPI Swagger documentation

### Test 3: Frontend Connection
1. Deploy frontend to Vercel with `VITE_API_URL` set
2. Open your Vercel app
3. Open browser DevTools → Network tab
4. Try to load clients or quotes
5. **Expected:** API calls to `uvpc5mx3se.us-east-1.awsapprunner.com`

### Test 4: Database Connection
1. Create a client in the frontend
2. Check Supabase dashboard → Table Editor → `clients`
3. **Expected:** New client appears in database

### Test 5: Stripe Integration (After Webhook Setup)
1. Create a quote
2. Accept the quote
3. Create a Stripe invoice
4. Pay the invoice in Stripe Dashboard
5. **Expected:** Quote payment status updates automatically

---

## 🚀 Ready to Build Checklist

- [ ] **Vercel Environment Variable Set**
  - [ ] `VITE_API_URL` added to Vercel
  - [ ] Frontend redeployed with new variable
  - [ ] Frontend can connect to backend (test in browser)

- [ ] **CORS Configuration** (Optional)
  - [ ] Specific Vercel domains added to `ALLOWED_ORIGINS` (if needed)
  - [ ] No CORS errors in browser console

- [ ] **Stripe Webhooks** (Optional but Recommended)
  - [ ] Webhook endpoint created in Stripe
  - [ ] `STRIPE_WEBHOOK_SECRET` added to AWS App Runner
  - [ ] Webhook tested and working

- [ ] **End-to-End Testing**
  - [ ] Can create clients
  - [ ] Can create quotes
  - [ ] Can generate PDFs
  - [ ] Can create Stripe invoices
  - [ ] Payment status updates (if webhooks configured)

---

## 📋 Quick Reference

### Your Service URLs

**Backend (AWS App Runner):**
```
https://uvpc5mx3se.us-east-1.awsapprunner.com
```

**API Endpoints:**
- Health: `https://uvpc5mx3se.us-east-1.awsapprunner.com/health`
- API Docs: `https://uvpc5mx3se.us-east-1.awsapprunner.com/docs`
- Clients: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/clients`
- Quotes: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/quotes`
- Stripe Webhook: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/stripe/webhook`

**Database (Supabase):**
```
https://boisewltuwcjfrdjnfwd.supabase.co
```

**Frontend (Vercel):**
```
https://your-app.vercel.app (after deployment)
```

### Environment Variables Reference

**Vercel (Frontend):**
- `VITE_API_URL` = `https://uvpc5mx3se.us-east-1.awsapprunner.com`

**AWS App Runner (Backend):**
- `SUPABASE_URL` = `https://boisewltuwcjfrdjnfwd.supabase.co`
- `SUPABASE_KEY` = (configured)
- `STRIPE_SECRET_KEY` = (configured)
- `ALLOWED_ORIGINS` = `https://*.vercel.app,http://localhost:5173,http://localhost:3000`
- `STRIPE_WEBHOOK_SECRET` = (optional, add when setting up webhooks)

---

## 🎯 Next Steps

1. **Immediate (Required):**
   - Set `VITE_API_URL` in Vercel
   - Redeploy frontend
   - Test frontend-backend connection

2. **Soon (Recommended):**
   - Set up Stripe webhooks
   - Add specific Vercel domains to CORS (for better security)

3. **Optional:**
   - Set up custom domain for AWS App Runner
   - Configure CloudWatch alarms for monitoring
   - Set up CI/CD for automatic deployments

---

## 🆘 Troubleshooting

### Frontend can't connect to backend
- ✅ Verify `VITE_API_URL` is set in Vercel
- ✅ Check browser console for CORS errors
- ✅ Verify backend is running: `curl https://uvpc5mx3se.us-east-1.awsapprunner.com/health`
- ✅ Check `ALLOWED_ORIGINS` includes your Vercel domain

### CORS errors
- ✅ Update `ALLOWED_ORIGINS` in AWS App Runner with your specific Vercel domain
- ✅ Ensure no trailing slashes in URLs
- ✅ Check browser console for exact error message

### Database connection issues
- ✅ Verify Supabase credentials in AWS App Runner
- ✅ Check Supabase dashboard for connection status
- ✅ Review AWS CloudWatch logs for database errors

### Stripe issues
- ✅ Verify `STRIPE_SECRET_KEY` is set in AWS App Runner
- ✅ Check you're using the correct Stripe mode (test vs live)
- ✅ Verify webhook secret matches if webhooks are configured

---

## ✅ You're Ready When...

- ✅ Frontend deployed to Vercel with `VITE_API_URL` set
- ✅ Frontend can successfully make API calls to backend
- ✅ Can create/view clients and quotes
- ✅ Database operations work (create, read, update, delete)
- ✅ PDF generation works
- ✅ (Optional) Stripe invoices can be created

Once these are verified, you're ready to start building new features! 🚀



