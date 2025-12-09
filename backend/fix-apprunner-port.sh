#!/bin/bash

# Fix App Runner Port Configuration
# This script updates the App Runner service to use port 8000

set -e

SERVICE_NAME="quote-builder-backend"
AWS_REGION="us-east-1"
EXPECTED_ACCOUNT_ID="391313099201"

# Verify we're using the correct AWS account
echo "Verifying AWS account..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "❌ Error: AWS credentials not configured."
    echo "Run: aws configure"
    exit 1
fi

if [ "$AWS_ACCOUNT_ID" != "$EXPECTED_ACCOUNT_ID" ]; then
    echo "❌ ERROR: AWS Account ID mismatch!"
    echo "Expected Account ID: $EXPECTED_ACCOUNT_ID"
    echo "Actual Account ID: $AWS_ACCOUNT_ID"
    echo "Operation aborted to prevent modifying wrong account."
    exit 1
fi

echo "✅ Verified AWS Account ID: $AWS_ACCOUNT_ID"
ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/quote-builder-backend:latest"

echo ""
echo "Getting App Runner service ARN..."
SERVICE_ARN=$(aws apprunner list-services --region $AWS_REGION --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" --output text)

if [ -z "$SERVICE_ARN" ]; then
    echo "Error: Service not found. Make sure the service name is correct."
    exit 1
fi

echo "Service ARN: $SERVICE_ARN"
echo ""
echo "Updating service configuration to use port 8000..."

# Create update configuration
cat > /tmp/apprunner-update.json << EOF
{
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "$ECR_IMAGE_URI",
      "ImageConfiguration": {
        "Port": "8000",
        "RuntimeEnvironmentVariables": {}
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": true
  },
  "InstanceConfiguration": {
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
EOF

# Update the service
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration file:///tmp/apprunner-update.json \
    --instance-configuration file:///tmp/apprunner-update.json \
    --health-check-configuration file:///tmp/apprunner-update.json \
    --region $AWS_REGION

echo ""
echo "Service update initiated. The service will redeploy with the correct port configuration."
echo "You can monitor the deployment in the AWS Console."

