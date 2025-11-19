# Setting Gemini API Key in AWS App Runner

## Quick Setup Steps

1. **Go to AWS Console**
   - Navigate to: https://console.aws.amazon.com/apprunner/
   - Select your backend service

2. **Add Environment Variable**
   - Click **"Configuration"** → **"Edit"**
   - Scroll to **"Environment variables"** section
   - Click **"Add environment variable"**
   - Enter:
     - **Key**: `GEMINI_API_KEY`
     - **Value**: `AIzaSyDS0kotT_zFdpEjgOEDpFKDyW4UwkuDnXg`
   - Click **"Save changes"**

3. **Wait for Redeployment**
   - App Runner will automatically redeploy (takes 2-5 minutes)
   - Check the deployment status in the "Deployments" tab

4. **Verify It Works**
   - Once deployed, test the AI endpoint
   - The AI Reply button should work in the chat interface

## Alternative: Using AWS CLI

If you prefer command line:

```bash
aws apprunner update-service \
  --service-arn YOUR_SERVICE_ARN \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "YOUR_IMAGE_URI",
      "ImageConfiguration": {
        "RuntimeEnvironmentVariables": {
          "GEMINI_API_KEY": "AIzaSyDS0kotT_zFdpEjgOEDpFKDyW4UwkuDnXg"
        }
      }
    }
  }'
```

## Security Note

⚠️ **Never commit API keys to git!**
- The `.env` file is already in `.gitignore`
- API keys in AWS App Runner are encrypted at rest
- Rotate your key if it's ever exposed

