#!/bin/bash

# Check AWS SES Setup Status
# This script checks all the requirements for sending emails via AWS SES

set -e

SERVICE_ARN="arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07"
AWS_REGION="us-east-1"
SERVICE_URL="https://uvpc5mx3se.us-east-1.awsapprunner.com"
SES_DOMAIN="reel48.com"

echo "🔍 Checking AWS SES Setup Status..."
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track issues
ISSUES=0

# 1. Check App Runner Service Status
echo "1️⃣  Checking App Runner Service Status..."
SERVICE_STATUS=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.Status' \
    --output text 2>/dev/null || echo "ERROR")

if [ "$SERVICE_STATUS" = "RUNNING" ]; then
    echo -e "${GREEN}   ✅ Service is RUNNING${NC}"
else
    echo -e "${RED}   ❌ Service status: $SERVICE_STATUS${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 2. Check Environment Variables
echo "2️⃣  Checking Environment Variables..."
CURRENT_ENV=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' \
    --output json 2>/dev/null || echo "{}")

echo "   Current environment variables:"
echo "$CURRENT_ENV" | jq -r 'to_entries[] | "   - \(.key) = \(.value)"' 2>/dev/null || echo "   (Unable to parse)"

echo ""
echo "   Required variables check:"

# Check EMAIL_PROVIDER
EMAIL_PROVIDER=$(echo "$CURRENT_ENV" | jq -r '.EMAIL_PROVIDER // "NOT SET"')
if [ "$EMAIL_PROVIDER" = "ses" ] || [ "$EMAIL_PROVIDER" = "NOT SET" ]; then
    if [ "$EMAIL_PROVIDER" = "ses" ]; then
        echo -e "${GREEN}   ✅ EMAIL_PROVIDER = ses${NC}"
    else
        echo -e "${YELLOW}   ⚠️  EMAIL_PROVIDER not set (defaults to ses)${NC}"
    fi
else
    echo -e "${RED}   ❌ EMAIL_PROVIDER = $EMAIL_PROVIDER (should be 'ses')${NC}"
    ISSUES=$((ISSUES + 1))
fi

# Check FROM_EMAIL
FROM_EMAIL=$(echo "$CURRENT_ENV" | jq -r '.FROM_EMAIL // "NOT SET"')
if [[ "$FROM_EMAIL" == *"@$SES_DOMAIN" ]] || [[ "$FROM_EMAIL" == *"@reel48.com" ]] || [[ "$FROM_EMAIL" == *"@reel48.app" ]]; then
    echo -e "${GREEN}   ✅ FROM_EMAIL = $FROM_EMAIL (uses verified domain)${NC}"
elif [ "$FROM_EMAIL" = "NOT SET" ]; then
    echo -e "${RED}   ❌ FROM_EMAIL not set${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${YELLOW}   ⚠️  FROM_EMAIL = $FROM_EMAIL (should use @$SES_DOMAIN)${NC}"
fi

# Check FROM_NAME
FROM_NAME=$(echo "$CURRENT_ENV" | jq -r '.FROM_NAME // "NOT SET"')
if [ "$FROM_NAME" != "NOT SET" ]; then
    echo -e "${GREEN}   ✅ FROM_NAME = $FROM_NAME${NC}"
else
    echo -e "${YELLOW}   ⚠️  FROM_NAME not set (will use default)${NC}"
fi

# Check FRONTEND_URL
FRONTEND_URL=$(echo "$CURRENT_ENV" | jq -r '.FRONTEND_URL // "NOT SET"')
if [ "$FRONTEND_URL" != "NOT SET" ]; then
    echo -e "${GREEN}   ✅ FRONTEND_URL = $FRONTEND_URL${NC}"
else
    echo -e "${YELLOW}   ⚠️  FRONTEND_URL not set${NC}"
fi

# Check AWS_REGION
AWS_REGION_ENV=$(echo "$CURRENT_ENV" | jq -r '.AWS_REGION // "NOT SET"')
if [ "$AWS_REGION_ENV" = "$AWS_REGION" ] || [ "$AWS_REGION_ENV" = "NOT SET" ]; then
    if [ "$AWS_REGION_ENV" = "$AWS_REGION" ]; then
        echo -e "${GREEN}   ✅ AWS_REGION = $AWS_REGION_ENV${NC}"
    else
        echo -e "${YELLOW}   ⚠️  AWS_REGION not set (defaults to us-east-1)${NC}"
    fi
else
    echo -e "${RED}   ❌ AWS_REGION = $AWS_REGION_ENV (should be $AWS_REGION)${NC}"
    ISSUES=$((ISSUES + 1))
fi

# Check for SENDGRID_API_KEY (should not be present)
SENDGRID_KEY=$(echo "$CURRENT_ENV" | jq -r '.SENDGRID_API_KEY // "NOT SET"')
if [ "$SENDGRID_KEY" = "NOT SET" ]; then
    echo -e "${GREEN}   ✅ SENDGRID_API_KEY not set (good, using SES)${NC}"
else
    echo -e "${YELLOW}   ⚠️  SENDGRID_API_KEY is set (not needed for SES)${NC}"
fi

echo ""

# 3. Check IAM Role Permissions
echo "3️⃣  Checking IAM Role Permissions..."
SERVICE_ROLE_ARN=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$AWS_REGION" \
    --query 'Service.ServiceRoleArn' \
    --output text 2>/dev/null || echo "NOT FOUND")

if [ "$SERVICE_ROLE_ARN" != "NOT FOUND" ]; then
    echo "   Service Role: $SERVICE_ROLE_ARN"
    
    # Extract role name from ARN
    ROLE_NAME=$(echo "$SERVICE_ROLE_ARN" | awk -F'/' '{print $NF}')
    
    # Check if role has SES permissions
    SES_POLICIES=$(aws iam list-attached-role-policies \
        --role-name "$ROLE_NAME" \
        --query 'AttachedPolicies[?PolicyName==`AmazonSESFullAccess`]' \
        --output json 2>/dev/null || echo "[]")
    
    SES_INLINE_POLICIES=$(aws iam list-role-policies \
        --role-name "$ROLE_NAME" \
        --output json 2>/dev/null || echo "[]")
    
    if echo "$SES_POLICIES" | jq -e 'length > 0' > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ AmazonSESFullAccess policy attached${NC}"
    elif echo "$SES_INLINE_POLICIES" | jq -e 'length > 0' > /dev/null 2>&1; then
        echo -e "${YELLOW}   ⚠️  Has inline policies (check if SES permissions are included)${NC}"
        echo "   Inline policies:"
        echo "$SES_INLINE_POLICIES" | jq -r '.[]' | while read policy; do
            echo "   - $policy"
        done
    else
        echo -e "${RED}   ❌ No SES permissions found on role${NC}"
        echo "   Action needed: Add AmazonSESFullAccess policy to role: $ROLE_NAME"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo -e "${RED}   ❌ Could not find service role${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 4. Check SES Domain Status
echo "4️⃣  Checking SES Domain Status..."
SES_IDENTITY=$(aws sesv2 get-email-identity \
    --email-identity "$SES_DOMAIN" \
    --region "$AWS_REGION" \
    --query 'VerificationStatus' \
    --output text 2>/dev/null || echo "NOT FOUND")

if [ "$SES_IDENTITY" = "SUCCESS" ]; then
    echo -e "${GREEN}   ✅ Domain $SES_DOMAIN is verified in SES${NC}"
elif [ "$SES_IDENTITY" = "NOT FOUND" ]; then
    echo -e "${RED}   ❌ Domain $SES_DOMAIN not found in SES${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${YELLOW}   ⚠️  Domain $SES_DOMAIN status: $SES_IDENTITY${NC}"
fi

# Check SES account status (sandbox vs production)
SES_ACCOUNT_STATUS=$(aws ses get-account-sending-enabled \
    --region "$AWS_REGION" \
    --query 'Enabled' \
    --output text 2>/dev/null || echo "UNKNOWN")

SEND_QUOTA=$(aws ses get-send-quota \
    --region "$AWS_REGION" \
    --output json 2>/dev/null || echo "{}")

MAX_24H_SEND=$(echo "$SEND_QUOTA" | jq -r '.Max24HourSend // 0')
MAX_SEND_RATE=$(echo "$SEND_QUOTA" | jq -r '.MaxSendRate // 0')

MAX_24H_SEND_INT=$(echo "$MAX_24H_SEND" | cut -d. -f1)
if [ "$MAX_24H_SEND_INT" -gt 200 ]; then
    echo -e "${GREEN}   ✅ Production access enabled (Max: $MAX_24H_SEND emails/day)${NC}"
else
    echo -e "${YELLOW}   ⚠️  Sandbox mode (Max: $MAX_24H_SEND emails/day, can only send to verified emails)${NC}"
    echo "   Action needed: Request production access in SES Console"
fi
echo ""

# 5. Test Email Configuration Endpoint
echo "5️⃣  Testing Email Configuration Endpoint..."
HTTP_CODE=$(curl -s -o /tmp/email-config-response.json -w "%{http_code}" \
    "$SERVICE_URL/api/debug/email-config" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}   ✅ Endpoint is accessible${NC}"
    
    # Parse response
    EMAIL_PROVIDER_RESPONSE=$(cat /tmp/email-config-response.json | jq -r '.email_provider // "NOT SET"' 2>/dev/null || echo "NOT SET")
    CLIENT_INITIALIZED=$(cat /tmp/email-config-response.json | jq -r '.email_service_client_initialized // false' 2>/dev/null || echo "false")
    
    if [ "$EMAIL_PROVIDER_RESPONSE" = "ses" ]; then
        echo -e "${GREEN}   ✅ Email provider: ses${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Email provider: $EMAIL_PROVIDER_RESPONSE${NC}"
    fi
    
    if [ "$CLIENT_INITIALIZED" = "true" ]; then
        echo -e "${GREEN}   ✅ Email service client initialized${NC}"
    else
        echo -e "${RED}   ❌ Email service client not initialized${NC}"
        ISSUES=$((ISSUES + 1))
    fi
    
    echo "   Full response:"
    cat /tmp/email-config-response.json | jq '.' 2>/dev/null || cat /tmp/email-config-response.json
else
    echo -e "${RED}   ❌ Endpoint returned HTTP $HTTP_CODE${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Summary
echo "=================================="
echo "📊 Summary"
echo "=================================="
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! You should be able to send emails.${NC}"
    echo ""
    echo "To test sending an email:"
    echo "  curl -X POST \"$SERVICE_URL/api/debug/test-email?email=your-email@example.com\""
else
    echo -e "${RED}❌ Found $ISSUES issue(s) that need to be fixed.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the issues above"
    echo "  2. See SES_DOMAIN_SETUP_REEL48.md for detailed setup instructions"
    echo "  3. Run this script again after making changes"
fi
echo ""

