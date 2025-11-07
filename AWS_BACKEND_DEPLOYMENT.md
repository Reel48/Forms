# AWS Backend Deployment Guide

This guide will help you deploy your FastAPI backend to AWS, keeping Vercel for frontend and Supabase for database.

## Prerequisites

1. AWS Account ([sign up here](https://aws.amazon.com/))
2. AWS CLI installed and configured ([install guide](https://aws.amazon.com/cli/))
3. Docker installed (for container builds)
4. Your Supabase credentials
5. Your Stripe credentials

## Choose Your AWS Service

You have two main options:

### Option 1: AWS App Runner (Recommended) ⭐

**Best for:** Simple deployment, automatic scaling, minimal configuration

**Pros:**
- Easiest to set up
- Automatic scaling
- Built-in load balancing
- Pay-per-use pricing
- Automatic HTTPS

**Cons:**
- Less control than Beanstalk
- Requires container image (ECR)

---

### Option 2: AWS Elastic Beanstalk

**Best for:** More control, familiar deployment model

**Pros:**
- More configuration options
- Better for complex setups
- Can use Docker or Python platform
- Environment management

**Cons:**
- More complex setup
- Slightly more expensive
- More configuration needed

---

## Deployment: AWS App Runner (Recommended)

### Step 1: Set Up AWS CLI

```bash
# Install AWS CLI (if not already installed)
# macOS:
brew install awscli

# Configure AWS credentials
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Enter default region (e.g., us-east-1)
# Enter default output format (json)
```

### Step 2: Create ECR Repository

ECR (Elastic Container Registry) stores your Docker images.

```bash
# Set your AWS region
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create ECR repository
aws ecr create-repository \
    --repository-name quote-builder-backend \
    --region $AWS_REGION

# Get login token and login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

### Step 3: Build and Push Docker Image

```bash
# Navigate to backend directory
cd backend

# Build Docker image
docker build -t quote-builder-backend .

# Tag the image
docker tag quote-builder-backend:latest \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest
```

### Step 4: Create App Runner Service

#### Option A: Using AWS Console

1. Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
2. Click "Create service"
3. Choose "Container registry" → "Amazon ECR"
4. Select your repository: `quote-builder-backend`
5. Select image: `latest`
6. Click "Next"

**Configure service:**
- **Service name:** `quote-builder-backend`
- **Virtual CPU:** 0.25 vCPU (for small apps)
- **Memory:** 0.5 GB (for small apps)
- **Port:** `8000`
- **Environment variables:** Add all your environment variables (see Step 5)

7. Click "Next"
8. **Auto-deploy:** Enable if you want automatic deployments on image push
9. Click "Create & deploy"

#### Option B: Using AWS CLI

```bash
# Create apprunner service configuration
cat > apprunner-service.json << EOF
{
  "ServiceName": "quote-builder-backend",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest",
      "ImageConfiguration": {
        "Port": "8000",
        "RuntimeEnvironmentVariables": {
          "SUPABASE_URL": "YOUR_SUPABASE_URL",
          "SUPABASE_KEY": "YOUR_SUPABASE_KEY",
          "ALLOWED_ORIGINS": "https://your-vercel-app.vercel.app,http://localhost:5173",
          "STRIPE_SECRET_KEY": "YOUR_STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET": "YOUR_STRIPE_WEBHOOK_SECRET"
        }
      }
    },
    "AutoDeploymentsEnabled": true
  },
  "InstanceConfiguration": {
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  }
}
EOF

# Create the service
aws apprunner create-service \
    --cli-input-json file://apprunner-service.json \
    --region $AWS_REGION
```

### Step 5: Configure Environment Variables

In the App Runner service configuration, add these environment variables:

```
SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
SUPABASE_KEY=your-supabase-key-here
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173
STRIPE_SECRET_KEY=sk_live_... (or sk_test_...)
STRIPE_WEBHOOK_SECRET=whsec_... (optional)
```

**Note:** For production, use AWS Systems Manager Parameter Store or Secrets Manager for sensitive values.

### Step 6: Get Your Service URL

After deployment (5-10 minutes), App Runner will provide a URL like:
```
https://xxxxx.us-east-1.awsapprunner.com
```

### Step 7: Update Frontend (Vercel)

1. Go to your Vercel project settings
2. Add/Update environment variable:
   ```
   VITE_API_URL=https://xxxxx.us-east-1.awsapprunner.com
   ```
3. Redeploy your frontend

### Step 8: Update Stripe Webhooks

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Edit your webhook endpoint
3. Update URL to: `https://xxxxx.us-east-1.awsapprunner.com/api/stripe/webhook`
4. Save changes

### Step 9: Test Everything

1. Test API health: `https://xxxxx.us-east-1.awsapprunner.com/health`
2. Test API docs: `https://xxxxx.us-east-1.awsapprunner.com/docs`
3. Test frontend connection
4. Test Stripe webhooks

---

## Deployment: AWS Elastic Beanstalk (Alternative)

### Step 1: Install EB CLI

```bash
# macOS
brew install awsebcli

# Or using pip
pip install awsebcli
```

### Step 2: Initialize Elastic Beanstalk

```bash
cd backend

# Initialize EB
eb init -p "Docker running on 64bit Amazon Linux 2" quote-builder-backend --region us-east-1
```

### Step 3: Create Environment

```bash
# Create environment
eb create quote-builder-backend-prod \
    --instance-type t3.micro \
    --envvars SUPABASE_URL=your-url,SUPABASE_KEY=your-key,ALLOWED_ORIGINS=your-origins
```

**Note:** For sensitive values, use `eb setenv` after creation or use AWS Systems Manager.

### Step 4: Set Environment Variables

```bash
eb setenv \
    SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co \
    SUPABASE_KEY=your-supabase-key \
    ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173 \
    STRIPE_SECRET_KEY=sk_live_... \
    STRIPE_WEBHOOK_SECRET=whsec_...
```

### Step 5: Deploy

```bash
# Build and deploy
eb deploy
```

### Step 6: Get URL and Update Frontend

```bash
# Get your environment URL
eb status

# Update Vercel and Stripe webhooks (same as App Runner steps above)
```

---

## Using AWS Secrets Manager (Recommended for Production)

For better security, store sensitive values in AWS Secrets Manager:

### Create Secrets

```bash
# Create Supabase secret
aws secretsmanager create-secret \
    --name quote-builder/supabase \
    --secret-string '{"url":"https://boisewltuwcjfrdjnfwd.supabase.co","key":"your-key"}' \
    --region us-east-1

# Create Stripe secret
aws secretsmanager create-secret \
    --name quote-builder/stripe \
    --secret-string '{"secret_key":"sk_live_...","webhook_secret":"whsec_..."}' \
    --region us-east-1
```

### Update Backend to Use Secrets

You'll need to modify `main.py` to fetch secrets from AWS Secrets Manager on startup. This requires the `boto3` library:

```python
# Add to requirements.txt
boto3==1.34.0

# Example code to fetch secrets (add to main.py or a config module)
import boto3
import json

def get_secret(secret_name, region_name='us-east-1'):
    client = boto3.client('secretsmanager', region_name=region_name)
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])
```

---

## Custom Domain Setup

### App Runner Custom Domain

1. Go to App Runner service → Custom domains
2. Click "Add domain"
3. Enter your domain (e.g., `api.yourdomain.com`)
4. Follow DNS instructions
5. AWS will automatically provision SSL certificate

### Elastic Beanstalk Custom Domain

1. Go to Elastic Beanstalk → Configuration → Load balancer
2. Add listener for HTTPS (port 443)
3. Request SSL certificate in AWS Certificate Manager
4. Configure Route 53 for your domain
5. Point domain to EB environment

---

## Monitoring and Logs

### App Runner

```bash
# View logs
aws apprunner list-operations \
    --service-arn arn:aws:apprunner:region:account:service/name/id

# View in CloudWatch
# Go to CloudWatch → Log groups → /aws/apprunner/quote-builder-backend
```

### Elastic Beanstalk

```bash
# View logs
eb logs

# Or in CloudWatch
# Go to CloudWatch → Log groups → /aws/elasticbeanstalk/quote-builder-backend-prod
```

### Set Up CloudWatch Alarms

1. Go to CloudWatch → Alarms
2. Create alarm for:
   - High CPU usage
   - High memory usage
   - Error rate
   - Request latency

---

## Cost Optimization

### App Runner

- Start with 0.25 vCPU and 0.5 GB RAM
- Monitor usage and adjust if needed
- Estimated cost: $10-30/month for small apps

### Elastic Beanstalk

- Use t3.micro instance (free tier eligible for first year)
- Enable auto-scaling only if needed
- Estimated cost: $15-50/month

### Cost Monitoring

1. Set up AWS Cost Explorer
2. Create billing alerts
3. Monitor daily spend

---

## Troubleshooting

### Common Issues

**1. Container fails to start**
- Check CloudWatch logs
- Verify environment variables are set
- Check Dockerfile CMD command

**2. Health check fails**
- Verify `/health` endpoint works
- Check port configuration
- Review security group settings

**3. CORS errors**
- Verify `ALLOWED_ORIGINS` includes your Vercel domain
- Check frontend `VITE_API_URL` is correct

**4. Database connection errors**
- Verify Supabase credentials
- Check security group allows outbound connections
- Test Supabase connection from local machine

**5. Stripe webhook errors**
- Verify webhook URL is correct
- Check webhook secret matches
- Review Stripe dashboard for webhook events

### Debug Commands

```bash
# App Runner: View service details
aws apprunner describe-service \
    --service-arn <your-service-arn>

# Elastic Beanstalk: SSH into instance (if enabled)
eb ssh

# View recent deployments
eb events
```

---

## CI/CD Setup (Optional)

### GitHub Actions for Auto-Deploy

Create `.github/workflows/deploy-aws.yml`:

```yaml
name: Deploy to AWS App Runner

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
      
      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: quote-builder-backend
          IMAGE_TAG: latest
        run: |
          cd backend
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
      
      - name: Trigger App Runner deployment
        run: |
          aws apprunner start-deployment \
            --service-arn ${{ secrets.AWS_APP_RUNNER_SERVICE_ARN }}
```

---

## Rollback Plan

### App Runner

App Runner keeps previous versions. To rollback:

1. Go to App Runner service
2. Click "Deployments"
3. Select previous version
4. Click "Deploy"

### Elastic Beanstalk

```bash
# List previous versions
eb list

# Deploy previous version
eb deploy --version <version-label>
```

---

## Next Steps

1. ✅ Deploy backend to AWS
2. ✅ Update Vercel frontend API URL
3. ✅ Update Stripe webhook URL
4. ✅ Test all functionality
5. ✅ Set up monitoring and alerts
6. ✅ Configure custom domain (optional)
7. ✅ Set up CI/CD (optional)

## Support

- [AWS App Runner Documentation](https://docs.aws.amazon.com/apprunner/)
- [AWS Elastic Beanstalk Documentation](https://docs.aws.amazon.com/elasticbeanstalk/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

## Quick Reference

### App Runner Service URL Format
```
https://<service-id>.<region>.awsapprunner.com
```

### Environment Variables Required
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ALLOWED_ORIGINS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (optional)

### Useful Commands

```bash
# App Runner: Get service URL
aws apprunner describe-service --service-arn <arn> --query 'Service.ServiceUrl'

# Elastic Beanstalk: Get environment URL
eb status

# View logs
aws logs tail /aws/apprunner/quote-builder-backend --follow
```

