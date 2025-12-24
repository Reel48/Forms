#!/bin/bash

# Check AWS App Runner Deployment Status
# This script helps diagnose why a deployment rolled back

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"

echo "🔍 Checking AWS App Runner Deployment Status..."
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &>/dev/null; then
    echo "❌ Error: AWS credentials not configured."
    echo "Please run: aws configure"
    exit 1
fi

echo "✅ AWS credentials configured"
echo ""

# Get service status
echo "📊 Service Status:"
aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.{Status:Status,ServiceUrl:ServiceUrl,HealthCheck:HealthCheckConfiguration}' \
    --output table

echo ""
echo "📋 Recent Operations (last 10):"
aws apprunner list-operations \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --max-results 10 \
    --query 'OperationSummaryList[*].{Id:Id,Type:Type,Status:Status,StartedAt:StartedAt,CompletedAt:CompletedAt}' \
    --output table

echo ""
echo "🔍 Checking for failed operations..."
FAILED_OPS=$(aws apprunner list-operations \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --max-results 10 \
    --query 'OperationSummaryList[?Status==`FAILED`]' \
    --output json)

if [ "$FAILED_OPS" != "[]" ] && [ -n "$FAILED_OPS" ]; then
    echo "❌ Found failed operations:"
    echo "$FAILED_OPS" | jq -r '.[] | "Operation ID: \(.Id), Type: \(.Type), Started: \(.StartedAt)"'
    
    # Get details of the most recent failed operation
    LATEST_FAILED_ID=$(echo "$FAILED_OPS" | jq -r '.[0].Id')
    echo ""
    echo "📝 Details of latest failed operation ($LATEST_FAILED_ID):"
    aws apprunner describe-operation \
        --operation-arn "arn:aws:apprunner:${AWS_REGION}:391313099201:operation/forms/${LATEST_FAILED_ID}" \
        --region "$AWS_REGION" \
        --output json | jq '.'
else
    echo "✅ No failed operations found in recent history"
fi

echo ""
echo "📜 CloudWatch Logs (last 50 lines):"
LOG_GROUP="/aws/apprunner/forms/7006f11f5c404deebe576b190dc9ea07/service"
if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$AWS_REGION" --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q .; then
    ACTUAL_LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$AWS_REGION" --query 'logGroups[0].logGroupName' --output text)
    echo "Log Group: $ACTUAL_LOG_GROUP"
    aws logs tail "$ACTUAL_LOG_GROUP" --region "$AWS_REGION" --since 1h --format short 2>/dev/null | tail -50 || echo "No recent logs found"
else
    echo "⚠️  Could not find log group. Checking all App Runner log groups..."
    aws logs describe-log-groups --log-group-name-prefix "/aws/apprunner" --region "$AWS_REGION" --query 'logGroups[*].logGroupName' --output table
fi

echo ""
echo "✅ Diagnostic complete!"

