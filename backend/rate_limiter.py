"""
Rate limiting utilities for authentication endpoints
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from typing import Callable

# Create limiter instance
limiter = Limiter(key_func=get_remote_address)

# Rate limit decorators for different endpoints
def login_rate_limit():
    """Rate limit for login: 5 attempts per 15 minutes per IP"""
    return limiter.limit("5/15minutes")

def register_rate_limit():
    """Rate limit for registration: 3 accounts per hour per IP"""
    return limiter.limit("3/hour")

def password_reset_rate_limit():
    """Rate limit for password reset: 3 requests per hour per IP"""
    return limiter.limit("3/hour")

def password_reset_confirm_rate_limit():
    """Rate limit for password reset confirmation: 5 attempts per 15 minutes per IP"""
    return limiter.limit("5/15minutes")

def email_based_rate_limit():
    """Rate limit based on email: 3 requests per hour per email"""
    def get_email_key(request: Request) -> str:
        """Extract email from request body for rate limiting"""
        try:
            # Try to get email from request body
            # Note: This requires the request body to be available
            # For POST requests, we'll need to parse it
            if hasattr(request.state, 'email'):
                return request.state.email
            # Fallback to IP if email not available
            return get_remote_address(request)
        except:
            return get_remote_address(request)
    
    return limiter.limit("3/hour", key_func=get_email_key)

