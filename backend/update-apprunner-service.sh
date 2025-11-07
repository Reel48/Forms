#!/bin/bash

# Update App Runner Service Configuration
# Fixes port and health check settings

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="391313099201"
ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/quote-builder-backend:latest"

echo "Updating App Runner service configuration..."
echo "Service ARN: $SERVICE_ARN"
echo ""

# Create update configuration JSON
cat > /tmp/apprunner-update.json << 'EOF'
{
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "391313099201.dkr.ecr.us-east-1.amazonaws.com/quote-builder-backend:latest",
      "ImageConfiguration": {
        "Port": "8000"
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": true
  },
  "InstanceConfiguration": {
    "Cpu": "256",
    "Memory": "512"
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
    --source-configuration '{
        "ImageRepository": {
            "ImageIdentifier": "'$ECR_IMAGE_URI'",
            "ImageConfiguration": {
                "Port": "8000"
            },
            "ImageRepositoryType": "ECR"
        },
        "AutoDeploymentsEnabled": true
    }' \
    --instance-configuration '{
        "Cpu": "256",
        "Memory": "512"
    }' \
    --health-check-configuration '{
        "Protocol": "HTTP",
        "Path": "/health",
        "Interval": 10,
        "Timeout": 5,
        "HealthyThreshold": 1,
        "UnhealthyThreshold": 5
    }' \
    --region $AWS_REGION

echo ""
echo "✓ Service update initiated!"
echo "The service will redeploy with:"
echo "  - Port: 8000"
echo "  - Health check: HTTP /health"
echo "  - Instance: 0.25 vCPU, 0.5 GB"
echo ""
echo "Monitor the deployment in AWS Console:"
echo "https://console.aws.amazon.com/apprunner/home?region=us-east-1#/services/forms"

