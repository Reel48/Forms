#!/bin/bash

# Diagnose and Fix AWS App Runner Deployment Rollback
# This script checks deployment status, identifies issues, and redeploys

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
EXPECTED_ACCOUNT_ID="391313099201"
ECR_REPOSITORY_URI="${EXPECTED_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/quote-builder-backend:latest"

echo "🔍 Diagnosing AWS App Runner Deployment Issue..."
echo ""

# Step 1: Verify AWS credentials
echo "Step 1: Verifying AWS credentials..."
ACTUAL_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

if [ -z "$ACTUAL_ACCOUNT_ID" ]; then
    echo "❌ Error: AWS credentials not configured."
    echo "Run: aws configure"
    exit 1
fi

if [ "$ACTUAL_ACCOUNT_ID" != "$EXPECTED_ACCOUNT_ID" ]; then
    echo "❌ ERROR: AWS Account ID mismatch!"
    echo "Expected: $EXPECTED_ACCOUNT_ID"
    echo "Actual: $ACTUAL_ACCOUNT_ID"
    exit 1
fi

echo "✅ AWS credentials verified"
echo ""

# Step 2: Check service status
echo "Step 2: Checking service status..."
SERVICE_STATUS=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.Status' \
    --output text 2>&1)

echo "Service Status: $SERVICE_STATUS"
echo ""

# Step 3: Check recent operations for failures
echo "Step 3: Checking recent operations..."
FAILED_OPS=$(aws apprunner list-operations \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --max-results 5 \
    --query 'OperationSummaryList[?Status==`FAILED`]' \
    --output json)

if [ "$FAILED_OPS" != "[]" ] && [ -n "$FAILED_OPS" ]; then
    echo "❌ Found failed operations:"
    echo "$FAILED_OPS" | jq -r '.[] | "  - Operation ID: \(.Id), Type: \(.Type), Started: \(.StartedAt)"'
    
    # Get details of latest failed operation
    LATEST_FAILED_ID=$(echo "$FAILED_OPS" | jq -r '.[0].Id')
    echo ""
    echo "📝 Latest failed operation details:"
    aws apprunner describe-operation \
        --operation-arn "arn:aws:apprunner:${AWS_REGION}:${EXPECTED_ACCOUNT_ID}:operation/forms/${LATEST_FAILED_ID}" \
        --region "$AWS_REGION" \
        --query 'Operation.{Status:Status,Type:Type,ErrorMessage:ErrorMessage,TargetArn:TargetArn}' \
        --output json | jq '.'
else
    echo "✅ No failed operations found"
fi

echo ""

# Step 4: Check CloudWatch logs
echo "Step 4: Checking CloudWatch logs (last 20 lines)..."
LOG_GROUP="/aws/apprunner/forms/7006f11f5c404deebe576b190dc9ea07/service"

if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$AWS_REGION" --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q .; then
    ACTUAL_LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$AWS_REGION" --query 'logGroups[0].logGroupName' --output text)
    echo "Log Group: $ACTUAL_LOG_GROUP"
    echo "Recent logs:"
    aws logs tail "$ACTUAL_LOG_GROUP" --region "$AWS_REGION" --since 1h --format short 2>/dev/null | tail -20 || echo "No recent logs"
else
    echo "⚠️  Log group not found"
fi

echo ""

# Step 5: Check ECR image
echo "Step 5: Verifying ECR image exists..."
if aws ecr describe-images \
    --repository-name quote-builder-backend \
    --image-ids imageTag=latest \
    --region "$AWS_REGION" &>/dev/null; then
    echo "✅ Latest image exists in ECR"
    IMAGE_DETAILS=$(aws ecr describe-images \
        --repository-name quote-builder-backend \
        --image-ids imageTag=latest \
        --region "$AWS_REGION" \
        --query 'imageDetails[0].{PushedAt:imagePushedAt,Size:imageSizeInBytes}' \
        --output json)
    echo "$IMAGE_DETAILS" | jq '.'
else
    echo "❌ Latest image not found in ECR"
    echo "You may need to build and push a new image first"
fi

echo ""

# Step 6: Check health endpoint configuration
echo "Step 6: Checking health check configuration..."
HEALTH_CONFIG=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.HealthCheckConfiguration' \
    --output json)

echo "Health Check Config:"
echo "$HEALTH_CONFIG" | jq '.'

echo ""

# Step 7: Ask if user wants to redeploy
echo "Step 7: Ready to redeploy?"
read -p "Do you want to trigger a new deployment? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Triggering new deployment..."
    
    # Trigger deployment
    DEPLOYMENT_ID=$(aws apprunner start-deployment \
        --service-arn "$SERVICE_ARN" \
        --region "$AWS_REGION" \
        --query 'OperationId' \
        --output text)
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment triggered successfully!"
        echo "Deployment ID: $DEPLOYMENT_ID"
        echo ""
        echo "Monitor deployment at:"
        echo "https://console.aws.amazon.com/apprunner/home?region=$AWS_REGION#/services/forms"
        echo ""
        echo "Or check status with:"
        echo "aws apprunner describe-operation --operation-arn arn:aws:apprunner:${AWS_REGION}:${EXPECTED_ACCOUNT_ID}:operation/forms/${DEPLOYMENT_ID} --region $AWS_REGION"
    else
        echo "❌ Failed to trigger deployment"
        exit 1
    fi
else
    echo "Deployment cancelled. Review the diagnostics above and fix any issues manually."
fi

