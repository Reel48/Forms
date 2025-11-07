#!/bin/bash

# Add Environment Variables to App Runner Service
# Run this after the service is successfully deployed

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
ECR_IMAGE_URI="391313099201.dkr.ecr.us-east-1.amazonaws.com/quote-builder-backend:latest"

echo "Adding environment variables to App Runner service..."
echo ""
echo "⚠️  IMPORTANT: Update the values below with your actual credentials!"
echo ""

# Update these values with your actual credentials
SUPABASE_URL="${SUPABASE_URL:-https://boisewltuwcjfrdjnfwd.supabase.co}"
SUPABASE_KEY="${SUPABASE_KEY:-your-supabase-key-here}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://your-vercel-app.vercel.app,http://localhost:5173}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_live_...}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_...}"

echo "Current values (update if needed):"
echo "  SUPABASE_URL: $SUPABASE_URL"
echo "  SUPABASE_KEY: [hidden]"
echo "  ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
echo "  STRIPE_SECRET_KEY: [hidden]"
echo "  STRIPE_WEBHOOK_SECRET: [hidden]"
echo ""
read -p "Continue with these values? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. Update the script with your values and run again."
    exit 1
fi

# Update service with environment variables
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration '{
        "ImageRepository": {
            "ImageIdentifier": "'$ECR_IMAGE_URI'",
            "ImageConfiguration": {
                "Port": "8000",
                "RuntimeEnvironmentVariables": {
                    "SUPABASE_URL": "'$SUPABASE_URL'",
                    "SUPABASE_KEY": "'$SUPABASE_KEY'",
                    "ALLOWED_ORIGINS": "'$ALLOWED_ORIGINS'",
                    "STRIPE_SECRET_KEY": "'$STRIPE_SECRET_KEY'",
                    "STRIPE_WEBHOOK_SECRET": "'$STRIPE_WEBHOOK_SECRET'"
                }
            },
            "ImageRepositoryType": "ECR"
        },
        "AutoDeploymentsEnabled": true
    }' \
    --region $AWS_REGION

echo ""
echo "✓ Environment variables added!"
echo "The service will redeploy with the new configuration."

