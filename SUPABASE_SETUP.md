# Supabase Setup Guide for Quote Builder

This guide will help you set up a new Supabase project for the Quote Builder application.

## Step 1: Create a New Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account)
2. Click **"New Project"**
3. Fill in the project details:
   - **Name**: `quote-builder` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the region closest to you
   - **Pricing Plan**: Free tier is fine for development
4. Click **"Create new project"**
5. Wait 2-3 minutes for the project to be provisioned

## Step 2: Get Your Project Credentials

1. Once your project is ready, go to **Project Settings** (gear icon in the left sidebar)
2. Click on **API** in the settings menu
3. Copy the following values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (the `anon` key under "Project API keys")

## Step 3: Set Up the Database Schema

You have two options:

### Option A: Using Supabase MCP (Recommended if configured)

If you have Supabase MCP configured for this new project, I can apply the schema directly. Just let me know when the project is ready and I'll run the migration.

### Option B: Manual Setup via SQL Editor

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy the entire contents of `database/schema.sql`
4. Paste it into the SQL Editor
5. Click **"Run"** (or press Cmd/Ctrl + Enter)
6. You should see a success message confirming all tables, indexes, and policies were created

## Step 4: Configure Environment Variables

### Backend Configuration

1. Navigate to the `backend` directory
2. Create a `.env` file (copy from `.env.example` if it exists, or create new)
3. Add your Supabase credentials:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key-here
```

Replace:
- `your-project-id` with your actual project ID from Step 2
- `your-anon-key-here` with your actual anon key from Step 2

### Frontend Configuration

1. Navigate to the `frontend` directory
2. Create a `.env` file
3. Add:

```env
VITE_API_URL=http://localhost:8000
```

(For production, update this to your backend deployment URL)

## Step 5: Verify the Setup

1. Check that your tables were created:
   - Go to **Table Editor** in Supabase dashboard
   - You should see three tables: `clients`, `quotes`, and `line_items`

2. Test the backend connection:
   ```bash
   cd backend
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   python -c "from database import supabase; print('Connected!')"
   ```

## Troubleshooting

### "SUPABASE_URL and SUPABASE_KEY must be set"
- Make sure your `.env` file is in the `backend` directory
- Check that the variable names are exactly `SUPABASE_URL` and `SUPABASE_KEY`
- Ensure there are no extra spaces or quotes around the values

### Connection errors
- Verify your Project URL and API key are correct
- Check that your Supabase project is active (not paused)
- Ensure you're using the `anon` key, not the `service_role` key

### Table not found errors
- Make sure you ran the schema.sql file in the SQL Editor
- Check the Table Editor to confirm tables exist
- Verify you're connected to the correct Supabase project

## Next Steps

Once your Supabase project is set up:
1. Start your backend: `cd backend && uvicorn main:app --reload`
2. Start your frontend: `cd frontend && npm run dev`
3. Visit `http://localhost:5173` to use the Quote Builder app

## Security Notes

- The current RLS policies allow all operations for development
- For production, you should implement proper authentication and user-based RLS policies
- Never commit your `.env` files to git (they should be in `.gitignore`)

