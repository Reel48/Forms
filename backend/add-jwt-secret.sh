#!/bin/bash

# Add SUPABASE_JWT_SECRET to App Runner Service
# This is required for authentication to work

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
ECR_IMAGE_URI="391313099201.dkr.ecr.us-east-1.amazonaws.com/quote-builder-backend:latest"

# JWT Secret
SUPABASE_JWT_SECRET="+ullDBNTS1i9QHBCoqDijN1s68UNh0l0lp1gWn5qTdJUQ/YgiSaj+r/TvEma1GDBURsAwYK+EsiRuDciZpiHvw=="

echo "Adding SUPABASE_JWT_SECRET to App Runner service..."
echo "Service ARN: $SERVICE_ARN"
echo ""

# Get current environment variables
echo "Fetching current service configuration..."
CURRENT_CONFIG=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region $AWS_REGION \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json)

echo "Current environment variables:"
echo "$CURRENT_CONFIG" | jq '.' || echo "$CURRENT_CONFIG"

# Add JWT_SECRET to existing variables
echo ""
echo "Updating service with SUPABASE_JWT_SECRET..."

# Build the environment variables JSON
# We need to merge with existing vars, so let's get them first
ENV_VARS=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region $AWS_REGION \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json)

# Add JWT_SECRET to the existing vars
ENV_VARS_WITH_JWT=$(echo "$ENV_VARS" | jq --arg secret "$SUPABASE_JWT_SECRET" '. + {"SUPABASE_JWT_SECRET": $secret}')

# Update the service
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "{
        \"ImageRepository\": {
            \"ImageIdentifier\": \"$ECR_IMAGE_URI\",
            \"ImageConfiguration\": {
                \"Port\": \"8000\",
                \"RuntimeEnvironmentVariables\": $ENV_VARS_WITH_JWT
            },
            \"ImageRepositoryType\": \"ECR\"
        },
        \"AutoDeploymentsEnabled\": true
    }" \
    --region $AWS_REGION

echo ""
echo "✓ SUPABASE_JWT_SECRET added to service!"
echo "The service will redeploy with the new environment variable."

