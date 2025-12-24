# AWS Deployment Troubleshooting Guide

## Quick Fix Steps

### 1. Fix AWS Credentials

If you see "The security token included in the request is invalid":

```bash
# Configure AWS credentials
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_DEFAULT_REGION="us-east-1"
```

### 2. Run Diagnostic Script

```bash
cd backend
./diagnose-and-fix-deployment.sh
```

This script will:
- Check AWS credentials
- Verify service status
- Check for failed operations
- Review CloudWatch logs
- Verify ECR image exists
- Optionally trigger a new deployment

### 3. Common Rollback Causes

#### Health Check Failures
- **Symptom:** Service starts but health checks fail
- **Fix:** Verify `/health` endpoint responds correctly
- **Check:** `curl https://your-service-url/health`

#### Application Startup Errors
- **Symptom:** Application crashes on startup
- **Check:** CloudWatch logs for Python import errors
- **Common causes:**
  - Missing dependencies in `requirements.txt`
  - Import errors (circular imports, missing modules)
  - Environment variables not set

#### Port Configuration Issues
- **Symptom:** Service can't bind to port
- **Fix:** Ensure App Runner is configured for port 8000
- **Check:** Service configuration in AWS Console

#### Missing Environment Variables
- **Symptom:** Application fails when accessing external services
- **Fix:** Verify all required env vars are set in App Runner config
- **Required vars:**
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `ALLOWED_ORIGINS`
  - Others as needed

### 4. Manual Deployment Steps

If automatic deployment fails:

```bash
# 1. Build and push new image
cd backend
./deploy-to-aws.sh

# 2. Trigger deployment
./trigger-deployment.sh

# 3. Monitor status
./check-deployment-status.sh
```

### 5. Check CloudWatch Logs

```bash
# Get log group name
LOG_GROUP="/aws/apprunner/forms/7006f11f5c404deebe576b190dc9ea07/service"

# View recent logs
aws logs tail "$LOG_GROUP" --region us-east-1 --since 1h --format short
```

### 6. Verify Service Configuration

```bash
# Check service configuration
aws apprunner describe-service \
    --service-arn "arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07" \
    --region us-east-1 \
    --query 'Service.{Status:Status,ServiceUrl:ServiceUrl,HealthCheck:HealthCheckConfiguration}' \
    --output json | jq '.'
```

## Recent Changes That Could Cause Issues

### New Dependencies
- `requests` - Already in requirements.txt ✅
- `google-generativeai` - Already in requirements.txt ✅
- All imports tested locally ✅

### New Code
- `embeddings_service.py` - Uses optional imports (graceful fallback) ✅
- `rag_service.py` - Uses embeddings_service (graceful fallback) ✅
- Streaming endpoint - Uses existing FastAPI patterns ✅

### Potential Issues to Check

1. **Environment Variables:**
   - `GEMINI_API_KEY` - Required for embeddings (but has fallback)
   - `SUPABASE_SERVICE_ROLE_KEY` - Required for database access

2. **Import Errors:**
   - Check if `embeddings_service` or `rag_service` cause circular imports
   - Verify all imports resolve correctly

3. **Startup Time:**
   - Large dependencies might slow startup
   - Health check might timeout if startup takes too long

## Quick Redeploy Command

```bash
# One-liner to redeploy
cd backend && \
aws apprunner start-deployment \
    --service-arn "arn:aws:apprunner:us-east-1:391313099201:service/forms/7006f11f5c404deebe576b190dc9ea07" \
    --region us-east-1
```

## Next Steps After Fix

1. Monitor deployment in AWS Console
2. Check health endpoint: `curl https://your-service-url/health`
3. Test a simple API call
4. Review CloudWatch logs for any warnings

