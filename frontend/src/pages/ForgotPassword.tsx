import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../api';
import './Login.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await authAPI.requestPasswordReset(email);
      setSuccess(true);
    } catch (err: any) {
      // Always show success message to prevent email enumeration
      // But log the actual error for debugging
      console.error('Password reset request error:', err);
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Reset Password</h1>
        
        {success ? (
          <div>
            <div className="success-message">
              <p>If an account with that email exists, a password reset link has been sent.</p>
              <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                Please check your email and click the link to reset your password.
              </p>
            </div>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Link to="/login" className="signup-link">
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p style={{ marginBottom: '20px', color: '#666', textAlign: 'center' }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>
            
            <form onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Enter your email address"
                />
              </div>

              <button type="submit" disabled={loading} className="submit-button">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p className="signup-link">
              Remember your password? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

