# AWS CLI Credentials Setup Guide

## Current Status

Your AWS CLI is configured with:
- **Profile:** `Whoosh` (from AWS_PROFILE environment variable)
- **Region:** `us-east-1` ✅
- **Credentials:** Present but **INVALID** ❌
- **Expected Account ID:** `391313099201`

## Step-by-Step Fix

### Option 1: Update Existing Profile (Recommended)

1. **Check your current profile:**
   ```bash
   aws configure list
   ```

2. **Update the "Whoosh" profile:**
   ```bash
   aws configure --profile Whoosh
   ```
   
   You'll be prompted for:
   - **AWS Access Key ID:** [Enter your access key]
   - **AWS Secret Access Key:** [Enter your secret key]
   - **Default region:** `us-east-1` (already set)
   - **Default output format:** `json` (recommended)

3. **Verify it works:**
   ```bash
   aws sts get-caller-identity --profile Whoosh
   ```
   
   Should show:
   ```json
   {
       "UserId": "...",
       "Account": "391313099201",
       "Arn": "..."
   }
   ```

### Option 2: Use Default Profile

If you want to use the default profile instead:

1. **Configure default profile:**
   ```bash
   aws configure
   ```
   (Same prompts as above, but saves to default profile)

2. **Unset the profile environment variable:**
   ```bash
   unset AWS_PROFILE
   unset AWS_DEFAULT_PROFILE
   ```

3. **Verify:**
   ```bash
   aws sts get-caller-identity
   ```

### Option 3: Set Environment Variables (Temporary)

For a quick test without changing files:

```bash
export AWS_ACCESS_KEY_ID="your-access-key-here"
export AWS_SECRET_ACCESS_KEY="your-secret-key-here"
export AWS_DEFAULT_REGION="us-east-1"
unset AWS_PROFILE
unset AWS_DEFAULT_PROFILE

# Verify
aws sts get-caller-identity
```

### Option 4: Create New Profile for This Project

1. **Create a new profile:**
   ```bash
   aws configure --profile forms-deployment
   ```

2. **Use it:**
   ```bash
   export AWS_PROFILE=forms-deployment
   ```

3. **Verify:**
   ```bash
   aws sts get-caller-identity
   ```

## Getting Your AWS Credentials

If you don't have your AWS credentials:

1. **Go to AWS Console:** https://console.aws.amazon.com/
2. **Click your username** (top right)
3. **Go to "Security credentials"**
4. **Under "Access keys"** → Click "Create access key"
5. **Choose use case:** "Command Line Interface (CLI)"
6. **Download or copy** the Access Key ID and Secret Access Key

⚠️ **Important:** Save the secret key immediately - you can't view it again!

## Verify Account ID

After configuring, verify you're using the correct account:

```bash
aws sts get-caller-identity --query Account --output text
```

Should return: `391313099201`

If it returns a different account ID, you're using the wrong credentials!

## Quick Test Commands

Once configured, test with:

```bash
# Check identity
aws sts get-caller-identity

# List App Runner services
aws apprunner list-services --region us-east-1

# Check your service
aws apprunner describe-service \
    --service-arn "arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07" \
    --region us-east-1 \
    --query 'Service.Status' \
    --output text
```

## Troubleshooting

### "InvalidClientTokenId" Error
- Credentials are wrong or expired
- Solution: Get new credentials from AWS Console

### "Access Denied" Error
- Credentials are valid but don't have permissions
- Solution: Check IAM permissions for App Runner access

### Wrong Account ID
- Using credentials for different AWS account
- Solution: Use credentials for account `391313099201`

## After Fixing Credentials

Once credentials are working, I can:
1. Check deployment status
2. Review CloudWatch logs
3. Identify the rollback cause
4. Trigger a new deployment

Just let me know when credentials are configured and I'll run the diagnostic script!

