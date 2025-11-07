#!/bin/bash

# Update CORS Configuration for App Runner Service
# This adds the new Vercel domain to ALLOWED_ORIGINS

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
ECR_IMAGE_URI="391313099201.dkr.ecr.us-east-1.amazonaws.com/quote-builder-backend:latest"

echo "Updating CORS configuration..."
echo ""

# Get current environment variables
echo "Fetching current environment variables..."
CURRENT_ENV=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region $AWS_REGION \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json)

# Extract current values
SUPABASE_URL=$(echo $CURRENT_ENV | jq -r '.SUPABASE_URL // empty')
SUPABASE_KEY=$(echo $CURRENT_ENV | jq -r '.SUPABASE_KEY // empty')
CURRENT_ORIGINS=$(echo $CURRENT_ENV | jq -r '.ALLOWED_ORIGINS // empty')
STRIPE_SECRET_KEY=$(echo $CURRENT_ENV | jq -r '.STRIPE_SECRET_KEY // empty')
STRIPE_WEBHOOK_SECRET=$(echo $CURRENT_ENV | jq -r '.STRIPE_WEBHOOK_SECRET // empty')

echo "Current ALLOWED_ORIGINS: $CURRENT_ORIGINS"
echo ""

# Add the new Vercel domain
NEW_DOMAIN="https://forms-ten-self.vercel.app"

if [[ "$CURRENT_ORIGINS" == *"$NEW_DOMAIN"* ]]; then
    echo "✓ Domain $NEW_DOMAIN is already in ALLOWED_ORIGINS"
    ALLOWED_ORIGINS="$CURRENT_ORIGINS"
else
    # Add new domain to the list
    if [ -z "$CURRENT_ORIGINS" ]; then
        ALLOWED_ORIGINS="$NEW_DOMAIN,http://localhost:5173,http://localhost:3000"
    else
        ALLOWED_ORIGINS="$CURRENT_ORIGINS,$NEW_DOMAIN"
    fi
    echo "New ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
fi

echo ""
echo "Updating App Runner service with new CORS configuration..."
echo "This will trigger a redeploy..."

# Build the environment variables JSON
ENV_VARS_JSON=$(jq -n \
    --arg supabase_url "$SUPABASE_URL" \
    --arg supabase_key "$SUPABASE_KEY" \
    --arg allowed_origins "$ALLOWED_ORIGINS" \
    --arg stripe_secret "$STRIPE_SECRET_KEY" \
    --arg stripe_webhook "$STRIPE_WEBHOOK_SECRET" \
    '{
        "SUPABASE_URL": $supabase_url,
        "SUPABASE_KEY": $supabase_key,
        "ALLOWED_ORIGINS": $allowed_origins,
        "STRIPE_SECRET_KEY": $stripe_secret,
        "STRIPE_WEBHOOK_SECRET": $stripe_webhook
    }')

# Update the service
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "{
        \"ImageRepository\": {
            \"ImageIdentifier\": \"$ECR_IMAGE_URI\",
            \"ImageConfiguration\": {
                \"Port\": \"8000\",
                \"RuntimeEnvironmentVariables\": $ENV_VARS_JSON
            },
            \"ImageRepositoryType\": \"ECR\"
        },
        \"AutoDeploymentsEnabled\": true
    }" \
    --region $AWS_REGION > /dev/null

echo ""
echo "✓ CORS configuration updated!"
echo "✓ Service is redeploying with new ALLOWED_ORIGINS"
echo ""
echo "New ALLOWED_ORIGINS includes:"
echo "  - $NEW_DOMAIN"
echo "  - http://localhost:5173"
echo "  - http://localhost:3000"
echo ""
echo "Wait 2-3 minutes for the deployment to complete, then try creating a client again."

