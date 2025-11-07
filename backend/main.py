from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import quotes, clients, pdf, stripe
from decimal import Decimal
import os

load_dotenv()

# FastAPI JSON encoder for Decimal (converts to string for JSON serialization)
app = FastAPI(title="Quote Builder API", version="1.0.0", json_encoders={Decimal: str})

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
app.include_router(quotes.router)
app.include_router(clients.router)
app.include_router(pdf.router)
app.include_router(stripe.router)

@app.get("/")
async def root():
    return {"message": "Quote Builder API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

