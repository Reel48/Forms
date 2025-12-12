#!/bin/bash

# AWS Configuration Constants
# This file defines the expected AWS account and region for deployments
# All deployment scripts should source this file and validate against these values

export EXPECTED_AWS_ACCOUNT_ID="391313099201"
export AWS_REGION="us-east-1"
export ECR_REPOSITORY_NAME="quote-builder-backend"
export APP_RUNNER_SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"

# Function to verify AWS account
verify_aws_account() {
    local ACTUAL_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    
    if [ -z "$ACTUAL_ACCOUNT_ID" ]; then
        echo "❌ Error: AWS credentials not configured."
        echo "Run: aws configure"
        return 1
    fi
    
    if [ "$ACTUAL_ACCOUNT_ID" != "$EXPECTED_AWS_ACCOUNT_ID" ]; then
        echo "❌ ERROR: AWS Account ID mismatch!"
        echo "Expected Account ID: $EXPECTED_AWS_ACCOUNT_ID"
        echo "Actual Account ID: $ACTUAL_ACCOUNT_ID"
        echo "Deployment aborted to prevent deploying to wrong account."
        echo "Please configure AWS credentials for account $EXPECTED_AWS_ACCOUNT_ID"
        return 1
    fi
    
    echo "✅ Verified AWS Account ID: $ACTUAL_ACCOUNT_ID"
    return 0
}


