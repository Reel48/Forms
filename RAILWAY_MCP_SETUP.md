# Railway MCP Server Setup Guide

## What is Railway MCP?

Railway MCP (Model Context Protocol) Server allows Cursor to interact with your Railway projects directly. This enables:
- Deploying and managing services
- Viewing logs
- Managing environment variables
- Checking deployment status
- And more!

## Setup Steps

### Step 1: Install Railway CLI

The Railway MCP server uses the Railway CLI for authentication. Install it:

**macOS (Homebrew):**
```bash
brew install railway
```

**Other platforms:**
```bash
npm install -g @railway/cli
```

Or download from: https://docs.railway.com/develop/cli

### Step 2: Authenticate Railway CLI

Railway CLI uses browser-based authentication. Run:

```bash
railway login
```

This will open your browser to authenticate. **OR** you can use browserless login:

```bash
railway login --browserless
```

Then follow the prompts to authenticate.

**Alternative: Using Railway Token Directly**

If you have a Railway API token, you can set it as an environment variable. The Railway MCP server may use this:

```bash
export RAILWAY_TOKEN=bf239955-4a92-4f20-aa66-76d0045f8e0a
```

**Note**: The Railway MCP server uses the Railway CLI for authentication, so you need to authenticate via `railway login` first. The token can be used for API calls but CLI authentication is separate.

### Step 3: Verify Railway CLI

Test that Railway CLI is working:

```bash
railway whoami
```

This should show your Railway account information.

### Step 4: Configure Cursor MCP

The `.cursor/mcp.json` file has been created with the Railway MCP server configuration:

```json
{
  "mcpServers": {
    "railway": {
      "command": "npx",
      "args": ["-y", "@railway/mcp-server"]
    }
  }
}
```

### Step 5: Restart Cursor

After configuring:
1. **Restart Cursor** completely (quit and reopen)
2. The Railway MCP server should automatically connect

### Step 6: Verify Connection

After restarting Cursor, you can verify the MCP connection by:
- Checking if Railway-related tools/functions are available
- The AI assistant should be able to interact with Railway

## Using Railway MCP

Once connected, you can ask the AI assistant to:
- "Deploy my backend to Railway"
- "Check Railway deployment status"
- "View Railway logs"
- "Update Railway environment variables"
- "List my Railway services"

## Troubleshooting

### Railway CLI Not Found
- Make sure Railway CLI is installed: `which railway`
- Add Railway CLI to your PATH if needed

### Authentication Failed
- Verify your token is correct: `railway whoami`
- Re-authenticate: `railway login`

### MCP Server Not Connecting
- Restart Cursor completely
- Check `.cursor/mcp.json` exists and is valid JSON
- Verify Railway CLI is authenticated: `railway whoami`

### Token Security
- Your Railway token is sensitive - never commit it to git
- The token is stored in Railway CLI's config (not in the project)
- Token location: `~/.railway/config.json` (on macOS/Linux)

## Railway Token

Your Railway token:
```
bf239955-4a92-4f20-aa66-76d0045f8e0a
```

**Note**: 
- Railway CLI uses browser-based authentication (`railway login`)
- The token can be used for API calls if needed
- The Railway MCP server uses Railway CLI authentication
- Token location (after CLI login): `~/.railway/config.json` (on macOS/Linux)

## Next Steps

1. Install Railway CLI
2. Authenticate with your token
3. Restart Cursor
4. Start using Railway MCP features!

## Useful Railway CLI Commands

```bash
# Login
railway login

# Check authentication
railway whoami

# Link to a project
railway link

# View logs
railway logs

# Set environment variables
railway variables set KEY=value

# Deploy
railway up
```

