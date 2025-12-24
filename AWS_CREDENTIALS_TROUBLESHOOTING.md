# AWS Credentials Troubleshooting

## Current Status

✅ Credentials file updated with new keys:
- Access Key: `AKIAXXXXXXXXXXXXXXXXX` (ends in ZG3N)
- Secret Key: `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (ends in RXON)

❌ Still getting "InvalidClientTokenId" error

## Possible Issues

### 1. Credentials Not Activated Yet
New AWS credentials sometimes take a few minutes to become active. Wait 2-3 minutes and try again.

### 2. Wrong AWS Account
Verify the credentials are for account `391313099201`. Check in AWS Console:
- Go to IAM → Users → Your user → Security credentials
- Verify the access key matches

### 3. Credentials Revoked/Deleted
If the credentials were created but then deleted/revoked, they won't work. Create new ones.

### 4. Root Account vs IAM User
If these are root account credentials, ensure:
- MFA is not required for programmatic access
- Root account access is enabled

## Next Steps

### Option 1: Wait and Retry
```bash
# Wait 2-3 minutes, then:
aws sts get-caller-identity
```

### Option 2: Verify in AWS Console
1. Go to: https://console.aws.amazon.com/iam/home#/users
2. Find the user/root account
3. Check "Security credentials" tab
4. Verify the access key ID matches: `AKIAXXXXXXXXXXXXXXXXX`
5. If it doesn't match, the credentials might be for a different user

### Option 3: Create New Credentials
1. Go to AWS Console → IAM → Users
2. Select your user (or root account)
3. Security credentials → Create access key
4. Download the CSV file
5. Update credentials:
   ```bash
   aws configure
   ```

### Option 4: Manual File Edit
Edit the credentials file directly:
```bash
nano ~/.aws/credentials
```

Make sure the `[default]` section looks like:
```
[default]
aws_access_key_id = AKIAXXXXXXXXXXXXXXXXX
aws_secret_access_key = XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Save and test:
```bash
aws sts get-caller-identity
```

## Test Command

Once credentials work, test with:
```bash
# 1. Verify identity
aws sts get-caller-identity

# 2. Should return:
# {
#     "UserId": "...",
#     "Account": "391313099201",
#     "Arn": "..."
# }

# 3. Then test App Runner
aws apprunner list-services --region us-east-1
```

## Alternative: Use AWS Console

If CLI continues to have issues, you can check deployment status in AWS Console:
1. Go to: https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms
2. Check service status
3. View operations tab for failed deployments
4. Check CloudWatch logs

Let me know when credentials are working and I can help diagnose the deployment issue!

