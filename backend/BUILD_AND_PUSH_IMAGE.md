# Build and Push Container Image to AWS ECR

This guide will help you build your Docker image and push it to AWS ECR (Elastic Container Registry) for use with App Runner.

## Prerequisites

1. Docker Desktop installed and running
2. AWS CLI installed and configured
3. AWS account with appropriate permissions

## Step 1: Start Docker

Make sure Docker Desktop is running on your machine.

**macOS:**
```bash
# Open Docker Desktop application, or
open -a Docker
```

**Verify Docker is running:**
```bash
docker ps
# Should return container list (even if empty)
```

## Step 2: Set Up AWS ECR Repository

```bash
# Set your AWS region (change if needed)
export AWS_REGION=us-east-1

# Get your AWS account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create ECR repository (if it doesn't exist)
aws ecr create-repository \
    --repository-name quote-builder-backend \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

## Step 3: Build the Docker Image

```bash
# Navigate to backend directory
cd backend

# Build the image
docker build -t quote-builder-backend:latest .

# Verify the image was created
docker images | grep quote-builder-backend
```

## Step 4: Tag the Image for ECR

```bash
# Tag the image with your ECR repository URI
docker tag quote-builder-backend:latest \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest
```

## Step 5: Push to ECR

```bash
# Push the image to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest
```

This may take a few minutes depending on your internet connection.

## Step 6: Verify Image in ECR

```bash
# List images in your repository
aws ecr list-images \
    --repository-name quote-builder-backend \
    --region $AWS_REGION
```

Or check in AWS Console:
1. Go to [ECR Console](https://console.aws.amazon.com/ecr/)
2. Select your repository: `quote-builder-backend`
3. You should see your image with tag `latest`

## Complete Script (All Steps Together)

Save this as a script or run it step by step:

```bash
#!/bin/bash
set -e

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
REPO_NAME="quote-builder-backend"

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}"

echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
echo "ECR Repository URI: $ECR_REPOSITORY_URI"
echo ""

# Step 1: Create repository if it doesn't exist
echo "Checking ECR repository..."
if aws ecr describe-repositories --repository-names $REPO_NAME --region $AWS_REGION &> /dev/null; then
    echo "✓ Repository exists"
else
    echo "Creating ECR repository..."
    aws ecr create-repository \
        --repository-name $REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true
    echo "✓ Repository created"
fi

# Step 2: Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $ECR_REPOSITORY_URI
echo "✓ Logged in"

# Step 3: Build image
echo "Building Docker image..."
cd backend
docker build -t $REPO_NAME:latest .
echo "✓ Image built"

# Step 4: Tag image
echo "Tagging image..."
docker tag $REPO_NAME:latest $ECR_REPOSITORY_URI:latest
echo "✓ Image tagged"

# Step 5: Push image
echo "Pushing image to ECR..."
docker push $ECR_REPOSITORY_URI:latest
echo "✓ Image pushed"

echo ""
echo "=== Success! ==="
echo "Image URI: $ECR_REPOSITORY_URI:latest"
echo ""
echo "Next: Create App Runner service using this image URI"
```

## Using the Deployment Script

You can also use the provided deployment script:

```bash
cd backend
chmod +x deploy-to-aws.sh
./deploy-to-aws.sh
```

## Image URI for App Runner

After pushing, your image URI will be:
```
<AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/quote-builder-backend:latest
```

Example:
```
123456789012.dkr.ecr.us-east-1.amazonaws.com/quote-builder-backend:latest
```

Use this URI when creating your App Runner service.

## Troubleshooting

### Docker daemon not running
```bash
# macOS: Start Docker Desktop
open -a Docker

# Wait for it to start, then verify
docker ps
```

### AWS credentials not configured
```bash
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Enter default region (e.g., us-east-1)
# Enter default output format (json)
```

### Permission denied errors
Make sure your AWS IAM user has these permissions:
- `ecr:CreateRepository`
- `ecr:GetAuthorizationToken`
- `ecr:BatchCheckLayerAvailability`
- `ecr:GetDownloadUrlForLayer`
- `ecr:BatchGetImage`
- `ecr:PutImage`
- `ecr:InitiateLayerUpload`
- `ecr:UploadLayerPart`
- `ecr:CompleteLayerUpload`

### Image push fails
- Check your internet connection
- Verify you're logged into ECR (run login command again)
- Check AWS region matches in all commands
- Verify repository exists in the correct region

## Next Steps

Once your image is in ECR:

1. Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
2. Create a new service
3. Select "Container registry" → "Amazon ECR"
4. Choose your repository: `quote-builder-backend`
5. Select image: `latest`
6. Configure your service (see `AWS_QUICK_START.md`)

## Updating the Image

When you make changes to your backend:

```bash
# Rebuild
docker build -t quote-builder-backend:latest .

# Retag
docker tag quote-builder-backend:latest \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest

# Push (this will update the latest tag)
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/quote-builder-backend:latest
```

If you have auto-deploy enabled in App Runner, it will automatically deploy the new image.

