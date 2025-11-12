/**
 * Password validation utilities
 * Enforces strong password requirements matching backend
 */

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    return { isValid: false, errors: ['Password is required'] };
  }

  // Minimum length
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  // Check for uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z)');
  }

  // Check for lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z)');
  }

  // Check for digit
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number (0-9)');
  }

  // Check for special character
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }

  // Check for common weak passwords
  const commonPasswords = [
    'password', 'password123', '12345678', 'qwerty', 'abc123',
    'letmein', 'welcome', 'admin', 'monkey', 'dragon'
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a more unique password');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function getPasswordRequirementsText(): string {
  return (
    'Password must be at least 12 characters and contain:\n' +
    '• At least one uppercase letter (A-Z)\n' +
    '• At least one lowercase letter (a-z)\n' +
    '• At least one number (0-9)\n' +
    '• At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)'
  );
}

export function getPasswordStrengthScore(password: string): number {
  let score = 0;

  // Length scoring
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;

  // Character variety scoring
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 1;

  // Bonus for mixed case and numbers
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 1;

  return Math.min(score, 10); // Max score of 10
}

export function getPasswordStrengthLabel(score: number): string {
  if (score <= 3) return 'Weak';
  if (score <= 6) return 'Fair';
  if (score <= 8) return 'Good';
  return 'Strong';
}

