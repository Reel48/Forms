#!/bin/bash

# AWS Backend Deployment Script
# This script helps deploy your backend to AWS App Runner

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== AWS Backend Deployment Script ===${NC}\n"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed.${NC}"
    echo "Install it with: brew install awscli (macOS) or see https://aws.amazon.com/cli/"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Install it from: https://www.docker.com/get-started"
    exit 1
fi

# Get AWS account ID and region
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: AWS credentials not configured.${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✓ AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"
echo -e "${GREEN}✓ AWS Region: ${AWS_REGION}${NC}\n"

# ECR Repository name
REPO_NAME="quote-builder-backend"
ECR_REPOSITORY_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}"

echo -e "${YELLOW}Step 1: Checking ECR repository...${NC}"

# Check if repository exists, create if not
if aws ecr describe-repositories --repository-names $REPO_NAME --region $AWS_REGION &> /dev/null; then
    echo -e "${GREEN}✓ Repository exists${NC}"
else
    echo -e "${YELLOW}Creating ECR repository...${NC}"
    aws ecr create-repository \
        --repository-name $REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true
    echo -e "${GREEN}✓ Repository created${NC}"
fi

echo -e "\n${YELLOW}Step 2: Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URI
echo -e "${GREEN}✓ Logged in${NC}"

echo -e "\n${YELLOW}Step 3: Building Docker image for linux/amd64 (AWS App Runner compatibility)...${NC}"
cd backend
docker build --platform linux/amd64 -t $REPO_NAME:latest .
cd ..
echo -e "${GREEN}✓ Image built${NC}"

echo -e "\n${YELLOW}Step 4: Tagging image...${NC}"
docker tag $REPO_NAME:latest $ECR_REPOSITORY_URI:latest
echo -e "${GREEN}✓ Image tagged${NC}"

echo -e "\n${YELLOW}Step 5: Pushing to ECR...${NC}"
docker push $ECR_REPOSITORY_URI:latest
echo -e "${GREEN}✓ Image pushed${NC}"

echo -e "\n${GREEN}=== Deployment Complete ===${NC}\n"
echo -e "Image URI: ${ECR_REPOSITORY_URI}:latest"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Go to AWS App Runner console: https://console.aws.amazon.com/apprunner/"
echo "2. Create a new service using the image: ${ECR_REPOSITORY_URI}:latest"
echo "3. Configure environment variables (see AWS_BACKEND_DEPLOYMENT.md)"
echo "4. Deploy the service"
echo -e "\nOr use the AWS CLI to create the service (see AWS_BACKEND_DEPLOYMENT.md for details)"

