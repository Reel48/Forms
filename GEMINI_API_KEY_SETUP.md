# How to Set Up Gemini API Key

## Step 1: Get Your API Key

1. Go to **https://makersuite.google.com/app/apikey**
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the API key (it will look like: `AIzaSy...`)

## Step 2: Set the Environment Variable

### For Local Development:

1. Navigate to the `backend/` directory
2. Create or edit the `.env` file:
   ```bash
   cd backend
   nano .env  # or use your preferred editor
   ```

3. Add this line:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

4. Replace `your_api_key_here` with your actual API key

5. Restart your backend server:
   ```bash
   # If using uvicorn directly:
   uvicorn main:app --reload

   # If using Docker:
   docker-compose restart
   ```

### For AWS App Runner:

1. Go to **AWS Console** → **App Runner** → Your Service
2. Click **"Configuration"** → **"Edit"**
3. Scroll to **"Environment variables"**
4. Click **"Add environment variable"**
5. Enter:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: `your_api_key_here` (paste your API key)
6. Click **"Save"**
7. App Runner will automatically redeploy with the new environment variable

### For Docker/Docker Compose:

Add to your `docker-compose.yml`:
```yaml
services:
  backend:
    environment:
      - GEMINI_API_KEY=your_api_key_here
```

Or use an `.env` file:
```bash
# .env file
GEMINI_API_KEY=your_api_key_here
```

Then in `docker-compose.yml`:
```yaml
services:
  backend:
    env_file:
      - .env
```

## Step 3: Verify It's Working

1. Start your backend server
2. Check the logs - you should NOT see:
   - `"GEMINI_API_KEY not found in environment variables"`
   - `"AI service is not configured"`

3. Test the AI endpoint:
   ```bash
   curl -X POST "http://localhost:8000/api/chat/conversations/{conversation_id}/ai-response" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Troubleshooting

**Error: "AI service is not configured"**
- Make sure the environment variable is set correctly
- Restart the backend server after adding the variable
- Check for typos in the variable name (should be exactly `GEMINI_API_KEY`)

**Error: "google-generativeai package is not installed"**
- Run: `pip install google-generativeai==0.3.2`
- Or: `pip install -r requirements.txt`

**Error: "Invalid API key"**
- Make sure you copied the entire API key
- Check that there are no extra spaces
- Verify the API key is active in Google Cloud Console

## Security Notes

⚠️ **Never commit your API key to git!**
- The `.env` file should be in `.gitignore`
- Never share your API key publicly
- Rotate your API key if it's accidentally exposed

## Cost Information

- Gemini Pro pricing: ~$0.0005 per 1K characters input, $0.0015 per 1K characters output
- Average AI response: ~$0.01-0.05 per response
- Very affordable for most use cases

