# Typeform Webhook Setup Guide for AWS App Runner

This guide walks you through setting up the Typeform webhook to automatically mark forms as completed when customers submit them.

## Prerequisites

- ✅ Backend deployed on AWS App Runner
- ✅ Typeform account with the Custom Hat Design Form (or other Typeform forms)
- ✅ Access to AWS Console and Typeform Dashboard

---

## Step 1: Find Your AWS App Runner Service URL

### Option A: AWS Console (Recommended)

1. **Go to AWS App Runner Console:**
   - Navigate to: [https://console.aws.amazon.com/apprunner/](https://console.aws.amazon.com/apprunner/)
   - Select your region (e.g., `us-east-1`)

2. **Find Your Service:**
   - Click on your service name (e.g., "forms")
   - The service URL is displayed at the top of the service details page
   - Format: `https://<service-id>.<region>.awsapprunner.com`
   - Example: `https://uvpc5mx3se.us-east-1.awsapprunner.com`

### Option B: AWS CLI

If you have AWS CLI configured:

```bash
# Replace with your actual service ARN
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07" \
  --region us-east-1 \
  --query 'Service.ServiceUrl' \
  --output text
```

This will output your service URL.

### Option C: Check Existing Documentation

Check your project's deployment documentation:
- Look for files like `AWS_DEPLOYMENT_STATUS.md` or `SETUP_VERIFICATION_CHECKLIST.md`
- These often contain the service URL

---

## Step 2: Construct the Webhook URL

Your complete webhook URL will be:

```
https://<your-service-id>.<region>.awsapprunner.com/api/webhooks/typeform
```

**Example:**
```
https://uvpc5mx3se.us-east-1.awsapprunner.com/api/webhooks/typeform
```

**Important Notes:**
- ✅ Use `https://` (not `http://`)
- ✅ Include the full path: `/api/webhooks/typeform`
- ✅ No trailing slash
- ✅ Case-sensitive

---

## Step 3: Configure Webhook in Typeform

### 3.1 Access Typeform Dashboard

1. Go to [https://admin.typeform.com](https://admin.typeform.com)
2. Log in to your Typeform account
3. Navigate to your workspace

### 3.2 Select Your Form

1. Find and click on the **Custom Hat Design Form** (or the Typeform form you want to configure)
2. Click on the form to open it

### 3.3 Access Webhook Settings

1. In the form editor, click on the **Connect** tab (left sidebar)
2. Scroll down to find **Webhooks** section
3. Click **+ Add webhook** or **Manage webhooks**

### 3.4 Create New Webhook

1. **Webhook URL:**
   - Paste your complete webhook URL:
     ```
     https://<your-service-id>.<region>.awsapprunner.com/api/webhooks/typeform
     ```
   - Example: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/webhooks/typeform`

2. **Event:**
   - Select: **Form response submitted** (or `form_response`)
   - This triggers when a customer completes the form

3. **Secret (Optional but Recommended):**
   - Typeform can provide a webhook secret for signature verification
   - Copy this secret if provided (we'll add signature verification later if needed)
   - For now, you can leave this empty

4. **Status:**
   - Make sure the webhook is **Enabled** (toggle should be ON)

5. **Click "Save" or "Add webhook"**

### 3.5 Verify Webhook Configuration

After saving, you should see:
- ✅ Webhook URL listed
- ✅ Status: **Active** or **Enabled**
- ✅ Event: **Form response submitted**

---

## Step 4: Test the Webhook

### 4.1 Test Submission

1. **Submit a Test Form:**
   - Open your Typeform form in a new tab
   - Fill it out with test data
   - Submit the form

2. **Check Typeform Webhook Logs:**
   - Go back to Typeform Dashboard → Your Form → Connect → Webhooks
   - Click on your webhook to view details
   - Check the **Activity** or **Logs** tab
   - You should see:
     - ✅ Status: **Success** (200 OK)
     - ✅ Recent delivery attempts

### 4.2 Check AWS App Runner Logs

1. **Access CloudWatch Logs:**
   - Go to [AWS CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
   - Navigate to **Log groups**
   - Find: `/aws/apprunner/<your-service-name>/<service-id>/application`

2. **View Recent Logs:**
   - Look for log entries containing:
     - `"Received Typeform webhook"`
     - `"Matched Typeform form"`
     - `"Created completion record"`
   - Example log entry:
     ```
     INFO: Received Typeform webhook: event_type=form_response, form_id=abc123
     INFO: Matched Typeform form abc123 to internal form xyz789 (Custom Hat Design Form)
     INFO: Created completion record submission_123 for form xyz789, folder folder_456
     ```

### 4.3 Verify Form Completion in Your App

1. **Check Folder View:**
   - Log in to your application
   - Navigate to the folder where the form is assigned
   - The form should now show as **Completed** ✅
   - The progress bar should update accordingly

2. **Check Database (Optional):**
   - In Supabase Dashboard → Table Editor → `form_submissions`
   - Look for a new record with:
     - `form_id`: Your form's ID
     - `folder_id`: The folder ID
     - `status`: `completed`
     - `review_status`: `completed:typeform_webhook`

---

## Step 5: Troubleshooting

### Issue: Webhook Returns 404 Not Found

**Symptoms:**
- Typeform shows webhook delivery failed
- Status code: 404

**Solutions:**
1. **Verify URL:**
   - Double-check the webhook URL is correct
   - Ensure it includes `/api/webhooks/typeform`
   - No typos in the service ID

2. **Check App Runner Service:**
   - Verify your App Runner service is running
   - Test the health endpoint: `https://<your-service-id>.<region>.awsapprunner.com/health`
   - Should return: `{"status": "ok"}`

3. **Check Router Registration:**
   - Verify the webhook router is registered in `backend/main.py`
   - Should have: `app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])`

### Issue: Webhook Returns 500 Internal Server Error

**Symptoms:**
- Typeform shows webhook delivery failed
- Status code: 500

**Solutions:**
1. **Check CloudWatch Logs:**
   - Look for error messages in App Runner logs
   - Common errors:
     - Database connection issues
     - Missing environment variables
     - Form not found in database

2. **Verify Form Configuration:**
   - Ensure the Typeform form is imported into your database
   - Check that `is_typeform_form = true` and `typeform_form_id` is set
   - Query: `SELECT id, name, typeform_form_id FROM forms WHERE is_typeform_form = true`

3. **Check Database Permissions:**
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is set in App Runner
   - The webhook uses service role to bypass RLS

### Issue: Form Not Marked as Complete

**Symptoms:**
- Webhook returns 200 OK
- But form doesn't show as completed in folder

**Solutions:**
1. **Check Folder Matching:**
   - The webhook tries to match folders using:
     1. `folder_id` from hidden fields (if provided)
     2. Submitter email → client → folders
     3. All folders where form is assigned (last resort)
   - Check CloudWatch logs to see which strategy was used

2. **Verify Form Assignment:**
   - Ensure the form is assigned to the folder
   - Check `form_folder_assignments` table:
     ```sql
     SELECT * FROM form_folder_assignments 
     WHERE form_id = '<your-form-id>' AND folder_id = '<your-folder-id>';
     ```

3. **Check Hidden Fields:**
   - If using `folder_id` in hidden fields, verify it's being passed
   - In Typeform form settings, ensure hidden fields include:
     - `folder_id`: The folder UUID
     - `submitter_email`: Customer email (optional but helpful)

### Issue: Multiple Completion Records Created

**Symptoms:**
- Duplicate completion records in database
- Form marked complete multiple times

**Solutions:**
1. **Idempotency Check:**
   - The webhook should prevent duplicates
   - If duplicates occur, check:
     - Are multiple webhooks configured?
     - Is the form being submitted multiple times?
   - The idempotency check uses: `form_id + folder_id + submitter_email`

2. **Disable Duplicate Webhooks:**
   - In Typeform, ensure only one webhook is configured
   - Remove any duplicate webhook entries

---

## Step 6: Advanced Configuration

### 6.1 Add Hidden Fields to Typeform Form

To improve folder matching, add hidden fields to your Typeform form:

1. **In Typeform Form Editor:**
   - Add a **Hidden field** component
   - Field name: `folder_id`
   - Value: Use Typeform's variable syntax or logic to pass the folder ID

2. **Recommended Hidden Fields:**
   - `folder_id`: The folder UUID (most important)
   - `submitter_email`: Customer email (helpful for matching)
   - `user_id`: User ID (optional, if available)

### 6.2 Webhook Signature Verification (Future Enhancement)

For additional security, you can verify Typeform webhook signatures:

1. **Get Webhook Secret:**
   - In Typeform webhook settings, copy the webhook secret

2. **Add to App Runner:**
   - Environment variable: `TYPEFORM_WEBHOOK_SECRET`
   - Value: Your webhook secret from Typeform

3. **Update Code:**
   - The webhook endpoint already accepts `typeform-signature` header
   - Add signature verification logic if needed

---

## Step 7: Monitoring and Maintenance

### 7.1 Monitor Webhook Health

**Typeform Dashboard:**
- Check webhook delivery status regularly
- Review failed deliveries
- Check response times

**AWS CloudWatch:**
- Set up log-based metrics for webhook events
- Create alarms for webhook failures
- Monitor error rates

### 7.2 Regular Checks

- ✅ Verify webhook is still active in Typeform
- ✅ Check App Runner service is running
- ✅ Review CloudWatch logs for errors
- ✅ Test form submission periodically
- ✅ Verify completion records are created correctly

---

## Quick Reference

### Webhook URL Format
```
https://<service-id>.<region>.awsapprunner.com/api/webhooks/typeform
```

### Example URLs
- Production: `https://uvpc5mx3se.us-east-1.awsapprunner.com/api/webhooks/typeform`
- Custom Domain: `https://api.yourdomain.com/api/webhooks/typeform` (if configured)

### Typeform Webhook Event
- **Event Type:** `form_response` (Form response submitted)
- **Trigger:** When a customer completes and submits the form

### Expected Response
```json
{
  "status": "success",
  "form_id": "uuid-here",
  "form_name": "Custom Hat Design Form",
  "folders_processed": 1,
  "successful": 1,
  "results": [
    {
      "folder_id": "uuid-here",
      "success": true,
      "submission_id": "uuid-here",
      "already_completed": false
    }
  ]
}
```

---

## Support

If you encounter issues:

1. **Check CloudWatch Logs:**
   - Most errors are logged with full details
   - Look for `ERROR` level logs

2. **Test Webhook Manually:**
   ```bash
   curl -X POST https://<your-service-id>.<region>.awsapprunner.com/api/webhooks/typeform \
     -H "Content-Type: application/json" \
     -d '{
       "event_type": "form_response",
       "form_response": {
         "form_id": "test-form-id",
         "hidden": {
           "folder_id": "test-folder-id"
         }
       }
     }'
   ```

3. **Verify Backend Health:**
   ```bash
   curl https://<your-service-id>.<region>.awsapprunner.com/health
   ```

---

## Summary Checklist

- [ ] Found AWS App Runner service URL
- [ ] Constructed complete webhook URL: `https://<service-id>.<region>.awsapprunner.com/api/webhooks/typeform`
- [ ] Created webhook in Typeform Dashboard
- [ ] Configured event: **Form response submitted**
- [ ] Enabled webhook
- [ ] Tested with a form submission
- [ ] Verified webhook delivery in Typeform logs
- [ ] Checked CloudWatch logs for processing
- [ ] Confirmed form marked as complete in folder view
- [ ] Set up monitoring/alerts (optional)

---

**You're all set!** The webhook will now automatically mark forms as completed whenever customers submit them through Typeform.

