# Database Setup Instructions

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the contents of `schema.sql` into the SQL Editor
4. Run the SQL to create all tables, indexes, and policies

## Get Your Credentials

1. Go to Project Settings > API
2. Copy your:
   - Project URL (for `SUPABASE_URL`)
   - Anon/Public Key (for `SUPABASE_KEY`)

## Environment Variables

Update your `.env` files with the credentials:

### Backend (.env)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

## Alternative: Using Supabase MCP

If you have Supabase MCP configured, you can also use the migration tool:
```bash
# The schema.sql file can be applied using Supabase migrations
```

