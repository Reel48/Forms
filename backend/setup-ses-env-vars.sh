#!/bin/bash

# Setup SES Environment Variables for App Runner
# This script adds the required environment variables for AWS SES

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
ECR_IMAGE_URI="391313099201.dkr.ecr.us-east-1.awsapprunner.com/quote-builder-backend:latest"

echo "🔧 Setting up AWS SES Environment Variables"
echo "============================================"
echo ""

# Get current environment variables
echo "Getting current environment variables..."
CURRENT_ENV=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json)

echo ""
echo "Current environment variables:"
echo "$CURRENT_ENV" | jq -r 'to_entries[] | "  - \(.key)"' 2>/dev/null || echo "  (Unable to parse)"
echo ""

# Prompt for values
echo "Please provide the following values:"
echo ""

# FROM_EMAIL
read -p "FROM_EMAIL (e.g., noreply@reel48.com): " FROM_EMAIL
if [ -z "$FROM_EMAIL" ]; then
    FROM_EMAIL="noreply@reel48.com"
    echo "Using default: $FROM_EMAIL"
fi

# FROM_NAME
read -p "FROM_NAME (e.g., Forms App) [default: Forms App]: " FROM_NAME
if [ -z "$FROM_NAME" ]; then
    FROM_NAME="Forms App"
fi

# FRONTEND_URL
read -p "FRONTEND_URL (e.g., https://forms-bk39jkt10-reel48s-projects.vercel.app): " FRONTEND_URL
if [ -z "$FRONTEND_URL" ]; then
    FRONTEND_URL="https://forms-bk39jkt10-reel48s-projects.vercel.app"
    echo "Using default: $FRONTEND_URL"
fi

echo ""
echo "Adding/updating environment variables:"
echo "  EMAIL_PROVIDER=ses"
echo "  FROM_EMAIL=$FROM_EMAIL"
echo "  FROM_NAME=$FROM_NAME"
echo "  FRONTEND_URL=$FRONTEND_URL"
echo "  AWS_REGION=$AWS_REGION"
echo ""

read -p "Continue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 1
fi

# Add new environment variables to existing ones
NEW_ENV=$(echo "$CURRENT_ENV" | jq ". + {
    \"EMAIL_PROVIDER\": \"ses\",
    \"FROM_EMAIL\": \"$FROM_EMAIL\",
    \"FROM_NAME\": \"$FROM_NAME\",
    \"FRONTEND_URL\": \"$FRONTEND_URL\",
    \"AWS_REGION\": \"$AWS_REGION\"
}")

# Save to temp file
echo "$NEW_ENV" > /tmp/new-env.json

echo ""
echo "Updating App Runner service..."

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
echo ""
echo "After deployment completes (2-5 minutes), test the configuration:"
echo "  curl https://uvpc5mx3se.us-east-1.awsapprunner.com/api/debug/email-config"
echo ""

