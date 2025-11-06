# Railway Deployment Configuration

This project uses Railway for backend deployment. The backend is located in the `backend/` directory.

## Railway Configuration Files

- `railway.json` (root) - Main Railway configuration
- `backend/railway.json` - Backend-specific configuration  
- `backend/railway.toml` - Alternative TOML configuration
- `backend/Procfile` - Process file for Railway
- `backend/runtime.txt` - Python version specification
- `backend/requirements.txt` - Python dependencies

## Railway Setup Instructions

1. **In Railway Dashboard**:
   - Set **Root Directory** to `backend`
   - Railway will auto-detect Python from `requirements.txt` and `runtime.txt`
   - The builder is set to `railpack` in `railway.json`

2. **Environment Variables** (set in Railway dashboard):
   ```
   SUPABASE_URL=https://boisewltuwcjfrdjnfwd.supabase.co
   SUPABASE_KEY=your-anon-key-here
   ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173
   ```

3. **Start Command** (auto-detected from railway.json):
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

## Troubleshooting

If you get a "Railpack" error:
- ✅ Ensure `railway.json` exists with `"builder": "railpack"`
- ✅ Check that `requirements.txt` is in the backend directory
- ✅ Verify Root Directory is set to `backend` in Railway dashboard
- ✅ Make sure Python version in `runtime.txt` is supported (3.11 or 3.12)

If build fails:
- Check Railway build logs for specific errors
- Verify all dependencies in `requirements.txt` are correct
- Ensure Python version compatibility

