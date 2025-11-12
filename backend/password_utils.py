"""
Password validation utilities
Enforces strong password requirements
"""
import re
from typing import Tuple, Optional


def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
    """
    Validate password strength.
    Requirements:
    - Minimum 12 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)
    
    Returns:
        Tuple[bool, Optional[str]]: (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"
    
    # Minimum length
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
    
    # Check for uppercase letter
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    # Check for lowercase letter
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    # Check for digit
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    
    # Check for special character
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]', password):
        return False, "Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)"
    
    # Check for common weak passwords
    common_passwords = [
        'password', 'password123', '12345678', 'qwerty', 'abc123',
        'letmein', 'welcome', 'admin', 'monkey', 'dragon'
    ]
    if password.lower() in common_passwords:
        return False, "Password is too common. Please choose a more unique password"
    
    return True, None


def get_password_requirements_text() -> str:
    """Get human-readable password requirements text"""
    return (
        "Password must be at least 12 characters and contain:\n"
        "• At least one uppercase letter (A-Z)\n"
        "• At least one lowercase letter (a-z)\n"
        "• At least one number (0-9)\n"
        "• At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)"
    )

