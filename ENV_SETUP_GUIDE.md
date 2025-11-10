# Environment Variables Setup Guide

## File Locations

### Backend Environment Variables
**File:** `/Users/brayden/Forms/Forms/backend/.env`

Add this line to your existing `.env` file:
```env
SUPABASE_JWT_SECRET=+ullDBNTS1i9QHBCoqDijN1s68UNh0l0lp1gWn5qTdJUQ/YgiSaj+r/TvEma1GDBURsAwYK+EsiRuDciZpiHvw==
```

Your backend `.env` file should look something like this:
```env
SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4
SUPABASE_JWT_SECRET=+ullDBNTS1i9QHBCoqDijN1s68UNh0l0lp1gWn5qTdJUQ/YgiSaj+r/TvEma1GDBURsAwYK+EsiRuDciZpiHvw==
# ... other variables you may have
```

### Frontend Environment Variables
**File:** `/Users/brayden/Forms/Forms/frontend/.env`

Add or update these lines in your `.env` file:
```env
VITE_SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4
VITE_API_URL=http://localhost:8000
```

## How to Edit

### Option 1: Using Your Code Editor
1. Open the file in your editor:
   - Backend: `backend/.env`
   - Frontend: `frontend/.env`
2. Add the variables as shown above
3. Save the file

### Option 2: Using Terminal

**Backend:**
```bash
cd /Users/brayden/Forms/Forms/backend
echo "SUPABASE_JWT_SECRET=+ullDBNTS1i9QHBCoqDijN1s68UNh0l0lp1gWn5qTdJUQ/YgiSaj+r/TvEma1GDBURsAwYK+EsiRuDciZpiHvw==" >> .env
```

**Frontend:**
```bash
cd /Users/brayden/Forms/Forms/frontend
cat > .env << 'EOF'
VITE_SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4
VITE_API_URL=http://localhost:8000
EOF
```

## Important Notes

1. **No spaces around `=`** - Make sure there are no spaces: `KEY=value` not `KEY = value`
2. **No quotes needed** - Don't wrap values in quotes unless the value itself contains spaces
3. **Restart required** - After adding variables:
   - Restart your backend server (if running)
   - Restart your frontend dev server (if running)
4. **File location** - Make sure you're editing the `.env` files in the correct directories:
   - Backend: `backend/.env`
   - Frontend: `frontend/.env`

## Verification

After adding the variables, you can verify they're set:

**Backend:**
```bash
cd backend
python3 -c "from dotenv import load_dotenv; import os; load_dotenv(); print('JWT Secret:', 'SET' if os.getenv('SUPABASE_JWT_SECRET') else 'NOT SET')"
```

**Frontend:**
The frontend will automatically load these when you start the dev server. Check the browser console for any errors.

## Troubleshooting

- **"JWT secret not configured"** - Make sure `SUPABASE_JWT_SECRET` is in `backend/.env`
- **Frontend can't connect** - Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are in `frontend/.env`
- **Variables not loading** - Restart your servers after adding variables

