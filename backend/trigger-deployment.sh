#!/bin/bash

# Trigger App Runner Deployment
# Waits for service to be ready, then triggers deployment

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"

echo "Waiting for App Runner service to be ready..."
echo "Service ARN: $SERVICE_ARN"
echo ""

# Wait for service to be in RUNNING state (max 5 minutes)
MAX_WAIT=300
ELAPSED=0
INTERVAL=10

while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$AWS_REGION" --query 'Service.Status' --output text 2>&1)
    
    echo "Current status: $STATUS (waited ${ELAPSED}s)"
    
    if [ "$STATUS" = "RUNNING" ]; then
        echo ""
        echo "✓ Service is ready!"
        echo "Triggering deployment..."
        
        DEPLOYMENT_ID=$(aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$AWS_REGION" --query 'OperationId' --output text 2>&1)
        
        if [ $? -eq 0 ]; then
            echo "✓ Deployment triggered successfully!"
            echo "Deployment ID: $DEPLOYMENT_ID"
            echo ""
            echo "Monitor deployment at:"
            echo "https://console.aws.amazon.com/apprunner/home?region=$AWS_REGION#/services/forms"
            exit 0
        else
            echo "✗ Failed to trigger deployment"
            exit 1
        fi
    elif [ "$STATUS" = "CREATE_FAILED" ] || [ "$STATUS" = "DELETE_FAILED" ] || [ "$STATUS" = "UPDATE_FAILED" ]; then
        echo "✗ Service is in failed state: $STATUS"
        exit 1
    fi
    
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "✗ Timeout waiting for service to be ready"
echo "Current status: $STATUS"
echo "Please check the AWS Console manually"
exit 1

