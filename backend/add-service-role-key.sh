#!/bin/bash

# Add SUPABASE_SERVICE_ROLE_KEY to App Runner Service
# This is needed to bypass RLS when querying user_roles

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
ECR_IMAGE_URI="391313099201.dkr.ecr.us-east-1.awsapprunner.com/quote-builder-backend:latest"

echo "⚠️  IMPORTANT: You need to get your SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard"
echo "   1. Go to: https://supabase.com/dashboard/project/boisewltuwcjfrdjnfwd/settings/api"
echo "   2. Find 'service_role' key (NOT the anon key)"
echo "   3. Copy it (it starts with 'eyJ...')"
echo ""
read -p "Enter your SUPABASE_SERVICE_ROLE_KEY: " SERVICE_ROLE_KEY

if [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "Error: Service role key is required"
    exit 1
fi

echo ""
echo "Getting current environment variables..."

# Get current environment variables
CURRENT_ENV=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json)

# Add the new environment variable
echo "$CURRENT_ENV" | jq ". + {\"SUPABASE_SERVICE_ROLE_KEY\": \"$SERVICE_ROLE_KEY\"}" > /tmp/new-env.json

echo "Updating App Runner service with SUPABASE_SERVICE_ROLE_KEY..."

# Update the service
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "{
        \"ImageRepository\": {
            \"ImageIdentifier\": \"$ECR_IMAGE_URI\",
            \"ImageConfiguration\": {
                \"Port\": \"8000\",
                \"RuntimeEnvironmentVariables\": $(cat /tmp/new-env.json)
            },
            \"ImageRepositoryType\": \"ECR\"
        },
        \"AutoDeploymentsEnabled\": true
    }" \
    --region "$AWS_REGION" > /dev/null

echo ""
echo "✅ Service updated! The service will automatically redeploy."
echo ""
echo "You can monitor the deployment in the AWS Console:"
echo "https://console.aws.amazon.com/apprunner/home?region=$AWS_REGION#/services/forms"


