#!/bin/bash

# Create App Runner Instance Role with SES permissions
# This role will be used by the application code to access AWS services like SES

set -e

ROLE_NAME="AppRunnerInstanceRole-forms"
AWS_REGION="us-east-1"
SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"

echo "🔐 Creating App Runner Instance Role with SES permissions"
echo "=========================================================="
echo ""

# Check if role already exists
if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
    echo "✅ Role $ROLE_NAME already exists"
    echo ""
    echo "Adding SES permissions..."
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess
    
    echo -e "\n✅ SES permissions added to existing role"
else
    echo "Creating new role: $ROLE_NAME"
    
    # Create trust policy for App Runner
    cat > /tmp/trust-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "tasks.apprunner.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF
    
    # Create the role
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --description "Instance role for App Runner forms service to access SES" \
        > /dev/null
    
    echo "✅ Role created"
    
    # Attach SES policy
    echo "Adding SES permissions..."
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess
    
    echo "✅ SES permissions attached"
fi

ROLE_ARN="arn:aws:iam::391313099201:role/$ROLE_NAME"
echo ""
echo "Role ARN: $ROLE_ARN"
echo ""
echo "⚠️  Note: You may need to update the App Runner service to use this instance role."
echo "   This can be done via AWS Console or by updating the service configuration."
echo ""
echo "To update via Console:"
echo "   1. Go to: https://console.aws.amazon.com/apprunner/home?region=$AWS_REGION#/services/forms"
echo "   2. Configuration → Security → Instance role → Set to: $ROLE_ARN"
echo ""

