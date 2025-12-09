# GitHub Secrets Quick Setup

## ⚠️ Required Secrets

Your GitHub Actions workflow needs these secrets to deploy to AWS. Add them now:

## Step 1: Go to GitHub Secrets

1. **Navigate to**: https://github.com/Reel48/Forms/settings/secrets/actions
2. Click **"New repository secret"** for each secret below

## Step 2: Add These Secrets

### Secret 1: `AWS_ACCESS_KEY_ID`
- **Name**: `AWS_ACCESS_KEY_ID` (exact, case-sensitive)
- **Value**: Your AWS Access Key ID (starts with `AKIA...`)
- **Where to find**: Check your `~/.aws/credentials` file or AWS Console → IAM → Users → Security credentials

### Secret 2: `AWS_SECRET_ACCESS_KEY`
- **Name**: `AWS_SECRET_ACCESS_KEY` (exact, case-sensitive)
- **Value**: Your AWS Secret Access Key
- **Where to find**: Check your `~/.aws/credentials` file (you'll need to create a new one if you don't have it saved)

### Secret 3: `AWS_APP_RUNNER_SERVICE_ARN` (Optional but Recommended)
- **Name**: `AWS_APP_RUNNER_SERVICE_ARN`
- **Value**: `arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07`
- **Purpose**: Enables automatic App Runner deployment after image push

## Step 3: Verify Secrets Are Added

After adding all secrets, you should see:
- ✅ `AWS_ACCESS_KEY_ID`
- ✅ `AWS_SECRET_ACCESS_KEY`
- ✅ `AWS_APP_RUNNER_SERVICE_ARN` (optional)

## Step 4: Test the Workflow

1. Go to: https://github.com/Reel48/Forms/actions
2. Find the failed workflow run
3. Click **"Re-run jobs"** → **"Re-run failed jobs"**
4. Or make a small change to trigger a new run

## ⚠️ Important Notes

### Current Setup
- You're using **root account credentials** (not recommended for production)
- For better security, create an IAM user with limited permissions (see below)

### Security Recommendation

**Create a dedicated IAM user for GitHub Actions:**

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Create a new user: `github-actions-deploy`
3. Attach these policies:
   - `AmazonEC2ContainerRegistryFullAccess`
   - `AppRunnerFullAccess`
4. Create access keys for this user
5. Use those keys in GitHub Secrets instead

This limits access if credentials are ever compromised.

## Troubleshooting

### Error: "Credentials could not be loaded"
- ✅ Check secret names are **exact** (case-sensitive)
- ✅ Verify no extra spaces when copying
- ✅ Make sure both secrets are added

### Error: "Access Denied"
- ✅ Verify the credentials have ECR and App Runner permissions
- ✅ Check the account ID matches `391313099201`

### Test Credentials Locally
```bash
# Verify your credentials work
aws sts get-caller-identity

# Should show: Account: 391313099201
```

## Quick Links

- **GitHub Secrets**: https://github.com/Reel48/Forms/settings/secrets/actions
- **AWS IAM Console**: https://console.aws.amazon.com/iam/
- **Workflow Actions**: https://github.com/Reel48/Forms/actions

