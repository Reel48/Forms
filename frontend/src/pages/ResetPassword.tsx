import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authAPI } from '../api';
import { validatePassword } from '../utils/passwordValidation';
import './Login.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get token from URL query parameter
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    const validation = validatePassword(password);
    if (!validation.isValid) {
      setError(validation.errors.join('. '));
      return;
    }

    if (!token) {
      setError('Invalid reset token. Please request a new password reset.');
      return;
    }

    setLoading(true);

    try {
      await authAPI.confirmPasswordReset(token, password);
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token && !error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>Reset Password</h1>
          <p style={{ color: '#666', textAlign: 'center' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Reset Password</h1>
        
        {success ? (
          <div>
            <div className="success-message">
              <p>Your password has been reset successfully!</p>
              <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                Redirecting to sign in page...
              </p>
            </div>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Link to="/login" className="submit-button" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Go to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && !token && (
              <div className="error-message">
                {error}
                <div style={{ marginTop: '15px' }}>
                  <Link to="/forgot-password" style={{ color: '#667eea', textDecoration: 'none' }}>
                    Request a new reset link
                  </Link>
                </div>
              </div>
            )}

            {token && (
              <>
                <p style={{ marginBottom: '20px', color: '#666', textAlign: 'center' }}>
                  Enter your new password below.
                </p>
                
                <form onSubmit={handleSubmit}>
                  {error && <div className="error-message">{error}</div>}
                  
                  <div className="form-group">
                    <label htmlFor="password">New Password</label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      placeholder="At least 12 characters with uppercase, lowercase, number, and special character"
                      minLength={12}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      placeholder="Confirm new password"
                      minLength={12}
                    />
                  </div>

                  <button type="submit" disabled={loading} className="submit-button">
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>

                <p className="signup-link">
                  Remember your password? <Link to="/login">Sign in</Link>
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

