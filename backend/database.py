from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")

# Main client using anon key (for database operations with RLS)
supabase: Client = create_client(supabase_url, supabase_key)

# Service role client for storage operations (bypasses RLS)
# Falls back to anon key if service_role key is not set
if supabase_service_role_key:
    supabase_storage: Client = create_client(
        supabase_url, 
        supabase_service_role_key,
        options={
            "auth": {
                "persist_session": False,
                "auto_refresh_token": False,
            }
        }
    )
    print(f"✅ Service role client created (RLS bypass enabled)")
else:
    print(f"⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY not set! Using anon key - RLS will be enforced!")
    supabase_storage: Client = create_client(
        supabase_url, 
        supabase_key
    )

# Export URL and service role key for direct REST API calls
__all__ = ['supabase', 'supabase_storage', 'supabase_url', 'supabase_service_role_key']

