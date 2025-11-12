# ✅ IAM Setup Complete for AWS SES

## What I've Done

### ✅ Step 1: Added SES Permissions to Access Role
- **Role:** `AppRunnerECRAccessRole`
- **Policy Added:** `AmazonSESFullAccess`
- **Status:** ✅ Complete

### ✅ Step 2: Created Instance Role
- **Role Name:** `AppRunnerInstanceRole-forms`
- **Role ARN:** `arn:aws:iam::391313099201:role/AppRunnerInstanceRole-forms`
- **Policy Attached:** `AmazonSESFullAccess`
- **Status:** ✅ Complete

### ✅ Step 3: Configured App Runner Service
- **Instance Role:** Set to `AppRunnerInstanceRole-forms`
- **Status:** ✅ Service updated and deploying

---

## Current Configuration

### IAM Roles
1. **AppRunnerECRAccessRole** (for App Runner to access ECR)
   - ✅ Has `AmazonSESFullAccess` policy

2. **AppRunnerInstanceRole-forms** (for application code to access AWS services)
   - ✅ Has `AmazonSESFullAccess` policy
   - ✅ Configured as instance role for App Runner service

### Environment Variables (Already Set)
- ✅ `EMAIL_PROVIDER=ses`
- ✅ `FROM_EMAIL=noreply@reel48.com`
- ✅ `FROM_NAME=Forms App`
- ✅ `FRONTEND_URL=https://reel48.app`
- ✅ `AWS_REGION=us-east-1`

### Domain Status
- ✅ `reel48.com` verified in SES
- ⚠️ Account in sandbox mode (can only send to verified emails)

---

## Deployment Status

The App Runner service is currently deploying with:
- ✅ New environment variables
- ✅ Instance role configured with SES permissions

**Status:** `OPERATION_IN_PROGRESS` - Deployment in progress (2-5 minutes)

---

## Next Steps

### 1. Wait for Deployment (2-5 minutes)
Monitor deployment at:
https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms

### 2. Test Configuration
Once deployment completes, test:

```bash
# Check email configuration
curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config
```

**Expected Response:**
```json
{
  "email_provider": "ses",
  "from_email": "noreply@reel48.com",
  "from_name": "Forms App",
  "frontend_url": "https://reel48.app",
  "email_service_client_initialized": true,
  "aws_region": "us-east-1"
}
```

If `email_service_client_initialized` is `true`, you're all set! ✅

### 3. Test Email Sending
```bash
# Test sending an email
curl -X POST "https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/test-email?email=your-email@example.com"
```

**Note:** If in sandbox mode, use a verified email address.

### 4. Request Production Access (Optional)
To send to any email address (not just verified ones):
1. Go to SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Account dashboard → Request production access
3. Fill out the form and submit

---

## Summary

✅ **Environment Variables:** Set and deploying  
✅ **IAM Permissions:** Configured  
✅ **Instance Role:** Created and attached  
✅ **Domain Verification:** `reel48.com` verified  

**Everything is set up!** Once deployment completes, you'll be able to send emails via AWS SES from `noreply@reel48.com`! 🎉

---

## Troubleshooting

### If `email_service_client_initialized` is still `false`:

1. Wait a few more minutes for IAM permissions to propagate
2. Check App Runner logs for any error messages
3. Verify the instance role is correctly configured:
   ```bash
   aws apprunner describe-service \
     --service-arn "arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07" \
     --query 'Service.InstanceConfiguration.InstanceRoleArn'
   ```
   Should return: `arn:aws:iam::391313099201:role/AppRunnerInstanceRole-forms`

### If you get "AccessDenied" errors:

1. Verify the instance role has SES permissions:
   ```bash
   aws iam list-attached-role-policies \
     --role-name AppRunnerInstanceRole-forms
   ```
   Should show `AmazonSESFullAccess`

2. Wait a few minutes for permissions to propagate

---

## Quick Reference

- **Instance Role ARN:** `arn:aws:iam::391313099201:role/AppRunnerInstanceRole-forms`
- **Service ARN:** `arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07`
- **Service URL:** `https://uvpc5mx3se.us-east-1.awsapprunner.com`
- **SES Domain:** `reel48.com` (verified)

