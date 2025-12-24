from fastapi import FastAPI, Request, Depends, HTTPException
# Trigger deployment test - GitHub Secrets configured
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from routers import quotes, clients, pdf, stripe, company_settings, forms, auth, assignments, email_debug, files, esignature, folders, chat, shipments, calcom, webhooks, knowledge
from rate_limiter import limiter
from slowapi.errors import RateLimitExceeded
from decimal import Decimal
import os
import logging
import traceback
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from chat_cleanup import cleanup_old_chat_history, cleanup_expired_sessions
from auth import get_current_admin
from database import supabase_storage

# Load environment variables first
load_dotenv()

# Configure logging early (before middleware that uses logger)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class WebSocketLoggingMiddleware:
    """
    Lightweight ASGI middleware to log websocket connection attempts (path + origin).
    Helps confirm whether websocket requests reach the app (vs. being blocked upstream).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "websocket":
            try:
                headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in (scope.get("headers") or [])}
                origin = headers.get("origin")
                path = scope.get("path")
                client = scope.get("client")
                logger.info("WS connect attempt: path=%s origin=%s client=%s", path, origin, client)
            except Exception:
                # Never break the WS due to logging
                pass
        await self.app(scope, receive, send)

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

# Optional regex origin matcher (useful for preview subdomains).
# Example: ^https://([a-z0-9-]+\.)?example\.com$|^https://.*\.vercel\.app$
allowed_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or None

# Log allowed origins for debugging (don't log in production with sensitive data)
if os.getenv("ENVIRONMENT") != "production":
    logger.info("Allowed CORS origins: %s", allowed_origins)

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
    if os.getenv("ENVIRONMENT") == "production":
        response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    else:
        response = JSONResponse(status_code=500, content={"detail": f"Internal server error: {str(exc)}"})
    
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
    if os.getenv("ENVIRONMENT") == "production":
        response = JSONResponse(status_code=422, content={"detail": exc.errors()})
    else:
        response = JSONResponse(status_code=422, content={"detail": exc.errors(), "body": exc.body})
    
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
    allow_origin_regex=allowed_origin_regex,
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
app.include_router(shipments.router)
app.include_router(chat.router)
app.include_router(calcom.router)
app.include_router(email_debug.router)
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
app.include_router(knowledge.router)

@app.get("/")
async def root():
    return {"message": "Quote Builder API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/debug/routes")
async def debug_routes(current_admin: dict = Depends(get_current_admin)):
    """Debug endpoint to list all registered routes"""
    if os.getenv("ENVIRONMENT") == "production":
        raise HTTPException(status_code=404, detail="Not found")
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
async def debug_jwt_config(current_admin: dict = Depends(get_current_admin)):
    """Debug endpoint to check JWT configuration (admin-only; disabled in production)."""
    if os.getenv("ENVIRONMENT") == "production":
        raise HTTPException(status_code=404, detail="Not found")
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
    return {
        "jwt_secret_configured": bool(jwt_secret),
        "jwt_secret_length": len(jwt_secret) if jwt_secret else 0,
        "supabase_url": os.getenv("SUPABASE_URL"),
    }

# Scheduled maintenance (chat + auth/security housekeeping)
def run_security_maintenance():
    """
    Run periodic security maintenance tasks.
    Best-effort: failures should not impact API availability.
    """
    tasks = [
        "cleanup_expired_verification_tokens",
        "cleanup_expired_revoked_tokens",
        "cleanup_expired_sessions",
        "cleanup_expired_reset_tokens",
        "cleanup_old_login_attempts",
        "unlock_expired_accounts",
    ]

    for fn in tasks:
        try:
            supabase_storage.rpc(fn, {}).execute()
            logger.info("Security maintenance ran: %s()", fn)
        except Exception as e:
            # Function might not exist yet in some environments; don't fail startup
            logger.warning("Security maintenance failed for %s(): %s", fn, str(e))


def setup_schedulers():
    """Setup daily background maintenance jobs"""
    scheduler = BackgroundScheduler()
    
    # Run cleanup daily at 2 AM UTC (adjust timezone as needed)
    # This runs once per day to clean up messages/conversations older than retention period
    scheduler.add_job(
        cleanup_old_chat_history,
        trigger=CronTrigger(hour=2, minute=0),  # 2 AM UTC daily
        id='chat_cleanup',
        name='Cleanup old chat history',
        replace_existing=True
    )

    # Run security maintenance daily at 3 AM UTC
    scheduler.add_job(
        run_security_maintenance,
        trigger=CronTrigger(hour=3, minute=0),  # 3 AM UTC daily
        id='security_maintenance',
        name='Security maintenance cleanup',
        replace_existing=True
    )
    
    # Optional: session cleanup (DISABLED by default).
    # Customers should be able to keep a full chat history; session cleanup must never delete messages.
    # Enable explicitly via env:
    #   ENABLE_CHAT_SESSION_CLEANUP=true
    # If enabled, it runs infrequently to avoid any perceived "refreshing".
    enable_session_cleanup = str(os.getenv("ENABLE_CHAT_SESSION_CLEANUP", "false")).lower() in ("1", "true", "yes")
    if enable_session_cleanup:
        scheduler.add_job(
            cleanup_expired_sessions,
            trigger=CronTrigger(hour='*/6', minute=0),  # Every 6 hours
            id='session_cleanup',
            name='Expired session cleanup (every 6 hours)',
            replace_existing=True
        )
    
    scheduler.start()
    logger.info(
        "Schedulers started (chat cleanup + security maintenance%s)",
        " + session cleanup" if enable_session_cleanup else ""
    )
    return scheduler

# Start scheduler when app starts
scheduler = None
try:
    scheduler = setup_schedulers()
except Exception as e:
    logger.error(f"Failed to start chat cleanup scheduler: {str(e)}", exc_info=True)
    # Don't fail app startup if scheduler fails - cleanup can be done manually

# Wrap app with websocket logging middleware (outermost)
app = WebSocketLoggingMiddleware(app)

