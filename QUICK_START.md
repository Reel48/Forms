# Quick Start: Create New Supabase Project

## Step 1: Create Project (2 minutes)

1. Go to https://supabase.com and sign in
2. Click **"New Project"** button
3. Fill in:
   - **Name**: `quote-builder` (or any name you prefer)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to you
   - **Plan**: Free tier is fine
4. Click **"Create new project"**
5. Wait 2-3 minutes for provisioning

## Step 2: Get Credentials (1 minute)

1. In your new project dashboard, click **Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL** (e.g., `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

## Step 3: Apply Schema

### Option A: Via SQL Editor (Easiest)
1. Click **SQL Editor** in left sidebar
2. Click **"New query"**
3. Copy ALL contents from `database/schema.sql`
4. Paste and click **"Run"** (or Cmd+Enter)

### Option B: Via MCP Migration (If MCP configured)
Once you configure MCP to point to your new project, I can run:
```bash
# I'll create a migration from schema.sql
```

## Step 4: Configure Environment Variables

After you have your credentials, I'll help you create the `.env` files.

---

**Once you've created the project, share:**
- Your Project URL
- Whether you want me to help apply the schema via MCP (if configured) or manually

Then I'll help you finish the setup!

