from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from routers import quotes, clients, pdf, stripe, company_settings, forms, auth, assignments, email_debug, files, esignature, folders, chat
from rate_limiter import limiter
from slowapi.errors import RateLimitExceeded
from decimal import Decimal
import os
import logging
import traceback

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Chat router is imported above with other routers

# FastAPI JSON encoder for Decimal (converts to string for JSON serialization)
app = FastAPI(title="Quote Builder API", version="1.0.0", json_encoders={Decimal: str})

# Add rate limiter to app state
app.state.limiter = limiter

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

# Add global exception handler to catch all errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler to log all unhandled errors
    """
    logger.error(f"Unhandled exception: {str(exc)}")
    logger.error(f"Request path: {request.url.path}")
    logger.error(f"Request method: {request.method}")
    logger.error(traceback.format_exc())
    
    # Create response with CORS headers
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )
    
    # Ensure CORS headers are added even on errors
    origin = request.headers.get("origin")
    if origin and origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response

# Add validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handler for request validation errors
    """
    logger.error(f"Validation error: {exc.errors()}")
    logger.error(f"Request path: {request.url.path}")
    logger.error(f"Request method: {request.method}")
    
    # Create response with CORS headers
    response = JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body}
    )
    
    # Ensure CORS headers are added even on errors
    origin = request.headers.get("origin")
    if origin and origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all incoming requests for debugging
    """
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code} for {request.method} {request.url.path}")
        return response
    except Exception as e:
        logger.error(f"Error processing request {request.method} {request.url.path}: {str(e)}")
        logger.error(traceback.format_exc())
        raise

# CORS middleware
# Note: FastAPI CORS doesn't support wildcards like *.vercel.app
# You must list each domain explicitly
# IMPORTANT: CORS middleware must be added before other middleware to ensure headers are always added
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
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
app.include_router(files.router)
app.include_router(esignature.router)
app.include_router(folders.router)
app.include_router(chat.router)
app.include_router(email_debug.router)

@app.get("/")
async def root():
    return {"message": "Quote Builder API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/debug/routes")
async def debug_routes():
    """Debug endpoint to list all registered routes"""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'N/A')
            })
    return {
        "total_routes": len(routes),
        "routes": routes,
        "chat_router_available": True
    }

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

