# AWS Backend Migration - Quick Start Guide

This is a condensed guide to get you up and running quickly. For detailed instructions, see `AWS_BACKEND_DEPLOYMENT.md`.

## Prerequisites Checklist

- [ ] AWS account created
- [ ] AWS CLI installed (`brew install awscli` on macOS)
- [ ] AWS CLI configured (`aws configure`)
- [ ] Docker installed and running

## Quick Deployment (App Runner)

### 1. One-Time Setup

```bash
# Navigate to backend directory
cd backend

# Make deployment script executable
chmod +x deploy-to-aws.sh

# Run deployment script
./deploy-to-aws.sh
```

This script will:
- Create ECR repository (if needed)
- Build Docker image
- Push to ECR

### 2. Create App Runner Service

**Option A: Using AWS Console (Easiest)**

1. Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
2. Click "Create service"
3. Choose "Container registry" → "Amazon ECR"
4. Select repository: `quote-builder-backend`
5. Select image: `latest`
6. Service name: `quote-builder-backend`
7. Configure:
   - **CPU:** 0.25 vCPU
   - **Memory:** 0.5 GB
   - **Port:** 8000
8. Add environment variables:
   ```
   SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
   SUPABASE_KEY=your-supabase-key
   ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
9. Enable auto-deploy (optional)
10. Click "Create & deploy"

**Option B: Using AWS CLI**

```bash
# Get your account ID and region
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1

# Create service (update environment variables first!)
aws apprunner create-service \
    --service-name quote-builder-backend \
    --source-configuration '{
        "ImageRepository": {
            "ImageIdentifier": "'$AWS_ACCOUNT_ID'.dkr.ecr.'$AWS_REGION'.amazonaws.com/quote-builder-backend:latest",
            "ImageConfiguration": {
                "Port": "8000",
                "RuntimeEnvironmentVariables": {
                    "SUPABASE_URL": "https://boisewltuwcjfrdjnfwd.supabase.co",
                    "SUPABASE_KEY": "your-key-here",
                    "ALLOWED_ORIGINS": "https://your-app.vercel.app",
                    "STRIPE_SECRET_KEY": "sk_live_...",
                    "STRIPE_WEBHOOK_SECRET": "whsec_..."
                }
            }
        },
        "AutoDeploymentsEnabled": true
    }' \
    --instance-configuration '{
        "Cpu": "0.25 vCPU",
        "Memory": "0.5 GB"
    }' \
    --region $AWS_REGION
```

### 3. Get Your Service URL

After deployment (5-10 minutes), get your URL:

```bash
# Using AWS CLI
aws apprunner describe-service \
    --service-arn <your-service-arn> \
    --query 'Service.ServiceUrl' \
    --output text

# Or check in AWS Console → App Runner → Your service
```

### 4. Update Frontend (Vercel)

1. Go to Vercel project → Settings → Environment Variables
2. Update `VITE_API_URL` to your App Runner URL
3. Redeploy frontend

### 5. Update Stripe Webhooks

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Edit your webhook
3. Update URL to: `https://your-app-runner-url/api/stripe/webhook`
4. Save

### 6. Test

```bash
# Test health endpoint
curl https://your-app-runner-url/health

# Test API docs
open https://your-app-runner-url/docs
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `SUPABASE_KEY` | ✅ Yes | Your Supabase anon key |
| `ALLOWED_ORIGINS` | ✅ Yes | Comma-separated list of allowed CORS origins |
| `STRIPE_SECRET_KEY` | ✅ Yes | Your Stripe secret key (sk_live_... or sk_test_...) |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ Optional | Stripe webhook signing secret |
| `PORT` | ❌ No | Automatically set by App Runner (8000) |

## Common Commands

```bash
# View App Runner service status
aws apprunner describe-service --service-arn <arn>

# View logs
aws logs tail /aws/apprunner/quote-builder-backend --follow

# Trigger manual deployment
aws apprunner start-deployment --service-arn <arn>

# Update environment variables
aws apprunner update-service \
    --service-arn <arn> \
    --source-configuration '{
        "ImageRepository": {
            "ImageIdentifier": "...",
            "ImageConfiguration": {
                "Port": "8000",
                "RuntimeEnvironmentVariables": {
                    "SUPABASE_URL": "new-value"
                }
            }
        }
    }'
```

## Troubleshooting

**Service won't start:**
- Check CloudWatch logs: `/aws/apprunner/quote-builder-backend`
- Verify environment variables are set correctly
- Check Dockerfile CMD is correct

**Health check fails:**
- Verify `/health` endpoint exists and works
- Check port is set to 8000
- Review security group settings

**CORS errors:**
- Verify `ALLOWED_ORIGINS` includes your Vercel domain
- Check frontend `VITE_API_URL` is correct

**Database connection errors:**
- Verify Supabase credentials
- Test connection from local machine first

## Cost Estimate

- **App Runner:** ~$10-30/month for small apps
- **ECR:** ~$0.10/month (first 500MB free)
- **CloudWatch Logs:** ~$0.50/month (first 5GB free)

**Total:** ~$10-30/month

## Next Steps

1. ✅ Deploy backend to AWS
2. ✅ Update Vercel frontend
3. ✅ Update Stripe webhooks
4. ✅ Test everything
5. ⭐ Set up custom domain (optional)
6. ⭐ Configure CI/CD (optional)
7. ⭐ Set up monitoring alerts (optional)

## Need Help?

- See `AWS_BACKEND_DEPLOYMENT.md` for detailed instructions
- See `AWS_MIGRATION_CHECKLIST.md` for step-by-step checklist
- AWS App Runner Docs: https://docs.aws.amazon.com/apprunner/

