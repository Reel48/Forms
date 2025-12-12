# GitHub AWS Credentials Setup Guide

This guide will help you configure AWS credentials in GitHub Secrets so your GitHub Actions workflow can deploy to AWS.

## Required GitHub Secrets

Your workflow needs these secrets:
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_APP_RUNNER_SERVICE_ARN` (optional) - Your App Runner service ARN for auto-deployment

## Step 1: Create AWS IAM User and Credentials

### Option A: Create a New IAM User (Recommended for CI/CD)

1. **Go to AWS Console**
   - Navigate to [AWS IAM Console](https://console.aws.amazon.com/iam/)
   - Sign in to your AWS account

2. **Create a New User**
   - Click "Users" in the left sidebar
   - Click "Create user"
   - Enter a username (e.g., `github-actions-deploy`)
   - Click "Next"

3. **Set Permissions**
   - Select "Attach policies directly"
   - You have two options:
   
   **Option 1: Use AWS Managed Policies (Easier)**
   - Search for and attach these policies:
     - `AmazonEC2ContainerRegistryFullAccess` (for ECR push/pull)
     - `AppRunnerFullAccess` (for App Runner deployments)
   
   **Option 2: Create Custom Policy (More Secure)**
   - Click "Create policy"
   - Switch to JSON tab
   - Paste this policy (replace `YOUR_ACCOUNT_ID` and `YOUR_REGION`):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ecr:GetAuthorizationToken",
           "ecr:BatchCheckLayerAvailability",
           "ecr:GetDownloadUrlForLayer",
           "ecr:BatchGetImage",
           "ecr:PutImage",
           "ecr:InitiateLayerUpload",
           "ecr:UploadLayerPart",
           "ecr:CompleteLayerUpload"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "apprunner:StartDeployment",
           "apprunner:DescribeService"
         ],
         "Resource": "arn:aws:apprunner:YOUR_REGION:YOUR_ACCOUNT_ID:service/*"
       }
     ]
   }
   ```
   - Name it `GitHubActionsDeployPolicy`
   - Create the policy
   - Go back to user creation and attach this custom policy

4. **Create Access Keys**
   - After creating the user, click on the username
   - Go to "Security credentials" tab
   - Scroll to "Access keys" section
   - Click "Create access key"
   - Select "Application running outside AWS" (for GitHub Actions)
   - Click "Next"
   - Add a description (optional): "GitHub Actions CI/CD"
   - Click "Create access key"
   - **IMPORTANT**: Copy both:
     - **Access key ID** (starts with `AKIA...`)
     - **Secret access key** (you'll only see this once!)
   - Save these securely - you'll need them for GitHub Secrets

### Option B: Use Existing AWS Credentials

If you already have AWS credentials configured locally:

```bash
# Check your current AWS credentials
cat ~/.aws/credentials

# Or check your AWS config
cat ~/.aws/config
```

**Note**: If you use your personal AWS credentials, make sure they have the necessary permissions listed above.

## Step 2: Get Your App Runner Service ARN (Optional)

If you want automatic deployments to trigger, you need your App Runner service ARN:

1. **Via AWS Console**
   - Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
   - Click on your service
   - Copy the "Service ARN" (looks like: `arn:aws:apprunner:us-east-1:123456789012:service/...`)

2. **Via AWS CLI**
   ```bash
   aws apprunner list-services --region us-east-1
   # Look for your service and copy the ServiceArn
   ```

## Step 3: Add Secrets to GitHub

1. **Navigate to Your Repository**
   - Go to your GitHub repository
   - Click on "Settings" (top menu)
   - Click "Secrets and variables" → "Actions" (left sidebar)

2. **Add AWS_ACCESS_KEY_ID**
   - Click "New repository secret"
   - Name: `AWS_ACCESS_KEY_ID`
   - Secret: Paste your Access Key ID (from Step 1)
   - Click "Add secret"

3. **Add AWS_SECRET_ACCESS_KEY**
   - Click "New repository secret"
   - Name: `AWS_SECRET_ACCESS_KEY`
   - Secret: Paste your Secret Access Key (from Step 1)
   - Click "Add secret"

4. **Add AWS_APP_RUNNER_SERVICE_ARN** (Optional but Recommended)
   - Click "New repository secret"
   - Name: `AWS_APP_RUNNER_SERVICE_ARN`
   - Secret: Paste your App Runner Service ARN (from Step 2)
   - Click "Add secret"

## Step 4: Verify Your Setup

1. **Check Your Secrets**
   - Go to Settings → Secrets and variables → Actions
   - You should see all three secrets listed:
     - ✅ `AWS_ACCESS_KEY_ID`
     - ✅ `AWS_SECRET_ACCESS_KEY`
     - ✅ `AWS_APP_RUNNER_SERVICE_ARN` (if you added it)

2. **Test the Workflow**
   - Make a small change to a file in `backend/` directory
   - Commit and push to `main` branch
   - Go to "Actions" tab in GitHub
   - Watch the workflow run - it should now successfully authenticate with AWS

## Troubleshooting

### Error: "Credentials could not be loaded"
- ✅ Verify secrets are named exactly: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (case-sensitive)
- ✅ Check that you copied the full access key (no extra spaces)
- ✅ Ensure the IAM user has the correct permissions

### Error: "Access Denied" when pushing to ECR
- ✅ Verify the IAM user has `AmazonEC2ContainerRegistryFullAccess` policy
- ✅ Check that the ECR repository exists in the correct region

### Error: "Service not found" for App Runner
- ✅ Verify `AWS_APP_RUNNER_SERVICE_ARN` secret is set correctly
- ✅ Check the ARN format matches: `arn:aws:apprunner:REGION:ACCOUNT:service/...`
- ✅ Ensure the service exists in the same region as your workflow (`us-east-1`)

### Test AWS Credentials Locally

You can test if your credentials work:

```bash
# Test AWS authentication
aws sts get-caller-identity

# Test ECR access
aws ecr describe-repositories --region us-east-1

# Test App Runner access (if you have a service)
aws apprunner list-services --region us-east-1
```

## Security Best Practices

1. **Use Separate IAM User for CI/CD**
   - Don't use your personal AWS root account credentials
   - Create a dedicated IAM user with minimal required permissions

2. **Rotate Credentials Regularly**
   - Periodically rotate your access keys
   - Update GitHub Secrets when you rotate

3. **Use Least Privilege**
   - Only grant permissions needed for deployment
   - Use custom IAM policies instead of full access when possible

4. **Monitor Access**
   - Enable CloudTrail to monitor API calls
   - Review IAM user activity regularly

## Quick Reference

**Required Secrets:**
- `AWS_ACCESS_KEY_ID` - Your AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret access key
- `AWS_APP_RUNNER_SERVICE_ARN` - Your App Runner service ARN (optional)

**Workflow File:**
- `.github/workflows/deploy-aws-backend.yml`

**AWS Region:**
- `us-east-1` (as defined in your workflow)

**ECR Repository:**
- `quote-builder-backend`

## Next Steps

Once secrets are configured:
1. ✅ Push a change to trigger the workflow
2. ✅ Monitor the Actions tab for successful deployment
3. ✅ Verify your backend is updated in AWS App Runner



