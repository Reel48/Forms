from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from routers import quotes, clients, pdf, stripe, company_settings, forms, auth, assignments, email_debug
from rate_limiter import limiter
from slowapi.errors import RateLimitExceeded
from decimal import Decimal
import os

load_dotenv()

# FastAPI JSON encoder for Decimal (converts to string for JSON serialization)
app = FastAPI(title="Quote Builder API", version="1.0.0", json_encoders={Decimal: str})

# Add rate limiter to app state
app.state.limiter = limiter

# Add rate limit exception handler
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom handler for rate limit exceeded errors
    """
    response = JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded: {exc.detail}. Please try again later."
        }
    )
    response = request.app.state.limiter._inject_headers(
        response, request.state.view_rate_limit
    )
    return response

# Get allowed origins from environment or use defaults
# In production, set ALLOWED_ORIGINS to include your Vercel domain(s)
# Example: ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main.vercel.app
allowed_origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
)
allowed_origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]

# Log allowed origins for debugging (don't log in production with sensitive data)
if os.getenv("ENVIRONMENT") != "production":
    print(f"DEBUG: Allowed CORS origins: {allowed_origins}")

# CORS middleware
# Note: FastAPI CORS doesn't support wildcards like *.vercel.app
# You must list each domain explicitly
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(assignments.router)
app.include_router(quotes.router)
app.include_router(clients.router)
app.include_router(pdf.router)
app.include_router(stripe.router)
app.include_router(company_settings.router)
app.include_router(forms.router)
app.include_router(email_debug.router)

@app.get("/")
async def root():
    return {"message": "Quote Builder API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/debug/jwt-config")
async def debug_jwt_config():
    """Debug endpoint to check JWT configuration (remove in production)"""
    import os
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
    return {
        "jwt_secret_configured": bool(jwt_secret),
        "jwt_secret_length": len(jwt_secret) if jwt_secret else 0,
        "jwt_secret_preview": jwt_secret[:20] + "..." if jwt_secret and len(jwt_secret) > 20 else jwt_secret if jwt_secret else None,
        "supabase_url": os.getenv("SUPABASE_URL"),
    }

