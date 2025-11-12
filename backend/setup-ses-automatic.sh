#!/bin/bash

# Automatic SES Setup for reel48.com
# This script sets up all required environment variables and checks IAM permissions

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
ECR_IMAGE_URI="391313099201.dkr.ecr.us-east-1.amazonaws.com/quote-builder-backend:latest"

# Configuration
FROM_EMAIL="noreply@reel48.com"
FROM_NAME="Forms App"
FRONTEND_URL="https://reel48.app"  # Using reel48.app from ALLOWED_ORIGINS

echo "🚀 Setting up AWS SES for reel48.com"
echo "====================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Get current environment variables
echo "📋 Step 1: Getting current environment variables..."
CURRENT_ENV=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json)

echo -e "${GREEN}✅ Current environment variables retrieved${NC}"
echo ""

# Step 2: Add SES environment variables
echo "📝 Step 2: Adding SES environment variables..."
NEW_ENV=$(echo "$CURRENT_ENV" | jq ". + {
    \"EMAIL_PROVIDER\": \"ses\",
    \"FROM_EMAIL\": \"$FROM_EMAIL\",
    \"FROM_NAME\": \"$FROM_NAME\",
    \"FRONTEND_URL\": \"$FRONTEND_URL\",
    \"AWS_REGION\": \"$AWS_REGION\"
}")

echo "   Adding:"
echo "   - EMAIL_PROVIDER=ses"
echo "   - FROM_EMAIL=$FROM_EMAIL"
echo "   - FROM_NAME=$FROM_NAME"
echo "   - FRONTEND_URL=$FRONTEND_URL"
echo "   - AWS_REGION=$AWS_REGION"
echo ""

# Save to temp file
echo "$NEW_ENV" > /tmp/new-env.json

# Step 3: Update App Runner service
echo "🔄 Step 3: Updating App Runner service..."
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

echo -e "${GREEN}✅ Service updated! Deployment started.${NC}"
echo ""

# Step 4: Check IAM permissions
echo "🔐 Step 4: Checking IAM permissions..."
SERVICE_ROLE_ARN=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.ServiceRoleArn' \
    --output text 2>/dev/null || echo "")

if [ -z "$SERVICE_ROLE_ARN" ] || [ "$SERVICE_ROLE_ARN" = "None" ]; then
    echo -e "${YELLOW}⚠️  Could not find service role ARN${NC}"
    echo "   You may need to check the App Runner service configuration"
    echo "   and manually add SES permissions to the service role."
else
    echo "   Service Role: $SERVICE_ROLE_ARN"
    
    # Extract role name
    ROLE_NAME=$(echo "$SERVICE_ROLE_ARN" | awk -F'/' '{print $NF}')
    
    # Check if SES permissions exist
    SES_POLICIES=$(aws iam list-attached-role-policies \
        --role-name "$ROLE_NAME" \
        --query 'AttachedPolicies[?PolicyName==`AmazonSESFullAccess`]' \
        --output json 2>/dev/null || echo "[]")
    
    if echo "$SES_POLICIES" | jq -e 'length > 0' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ SES permissions already configured${NC}"
    else
        echo -e "${YELLOW}⚠️  SES permissions not found on role: $ROLE_NAME${NC}"
        echo ""
        echo "   To add SES permissions:"
        echo "   1. Go to: https://console.aws.amazon.com/iam/"
        echo "   2. Roles → Search for: $ROLE_NAME"
        echo "   3. Add permissions → Attach policies → AmazonSESFullAccess"
        echo ""
    fi
fi

echo ""
echo "====================================="
echo -e "${GREEN}✅ Environment variables configured!${NC}"
echo ""
echo "⏳ Waiting for deployment to complete (2-5 minutes)..."
echo ""
echo "📊 Next steps:"
echo "   1. Wait for App Runner deployment to complete"
echo "   2. Add IAM permissions if needed (see above)"
echo "   3. Test configuration:"
echo "      curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config"
echo ""
echo "🔗 Monitor deployment:"
echo "   https://console.aws.amazon.com/apprunner/home?region=$AWS_REGION#/services/forms"
echo ""

