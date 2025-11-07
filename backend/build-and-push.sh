#!/bin/bash

# Build and Push Container Image to AWS ECR
# This script builds your Docker image and pushes it to ECR for App Runner

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Build and Push Container Image to AWS ECR ===${NC}\n"

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
REPO_NAME="quote-builder-backend"

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo -e "${RED}Error: Docker is not running.${NC}"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed.${NC}"
    echo "Install it with: brew install awscli (macOS)"
    exit 1
fi

# Get AWS account ID
echo -e "${YELLOW}Getting AWS account information...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: AWS credentials not configured.${NC}"
    echo "Run: aws configure"
    exit 1
fi

ECR_REPOSITORY_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}"

echo -e "${GREEN}✓ AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"
echo -e "${GREEN}✓ AWS Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}✓ Repository: ${REPO_NAME}${NC}"
echo -e "${GREEN}✓ ECR URI: ${ECR_REPOSITORY_URI}${NC}\n"

# Step 1: Create ECR repository if it doesn't exist
echo -e "${YELLOW}Step 1: Checking ECR repository...${NC}"
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

# Step 2: Login to ECR
echo -e "\n${YELLOW}Step 2: Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $ECR_REPOSITORY_URI
echo -e "${GREEN}✓ Logged in${NC}"

# Step 3: Build Docker image
echo -e "\n${YELLOW}Step 3: Building Docker image...${NC}"
docker build -t $REPO_NAME:latest .
echo -e "${GREEN}✓ Image built${NC}"

# Step 4: Tag the image
echo -e "\n${YELLOW}Step 4: Tagging image...${NC}"
docker tag $REPO_NAME:latest $ECR_REPOSITORY_URI:latest
echo -e "${GREEN}✓ Image tagged${NC}"

# Step 5: Push to ECR
echo -e "\n${YELLOW}Step 5: Pushing image to ECR...${NC}"
echo "This may take a few minutes..."
docker push $ECR_REPOSITORY_URI:latest
echo -e "${GREEN}✓ Image pushed${NC}"

# Success message
echo -e "\n${GREEN}=== Success! ===${NC}\n"
echo -e "Your container image is now in ECR:"
echo -e "${BLUE}${ECR_REPOSITORY_URI}:latest${NC}\n"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Go to AWS App Runner console: https://console.aws.amazon.com/apprunner/"
echo "2. Create a new service"
echo "3. Select 'Container registry' → 'Amazon ECR'"
echo "4. Choose repository: ${REPO_NAME}"
echo "5. Select image: latest"
echo "6. Configure your service (see AWS_QUICK_START.md for details)"
echo ""

