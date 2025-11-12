import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authAPI } from '../api';
import './Login.css';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get token from URL query parameter
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      // Auto-verify if token is present
      handleVerify(tokenFromUrl);
    } else {
      setError('Invalid verification link. Please request a new verification email.');
    }
  }, [searchParams]);

  const handleVerify = async (verifyToken?: string) => {
    const tokenToUse = verifyToken || token;
    if (!tokenToUse) {
      setError('Invalid verification token');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await authAPI.verifyEmail(tokenToUse);
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to verify email. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>Email Verified!</h1>
          <div className="success-message">
            <p>Your email has been verified successfully.</p>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
              You can now log in to your account.
            </p>
          </div>
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <Link to="/login" className="signup-link">
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Verify Email</h1>
        
        {error && (
          <div className="error-message">
            {error}
            <div style={{ marginTop: '15px' }}>
              <Link to="/resend-verification" style={{ color: '#667eea', textDecoration: 'none' }}>
                Request a new verification link
              </Link>
            </div>
          </div>
        )}

        {!error && !success && token && (
          <>
            <p style={{ marginBottom: '20px', color: '#666', textAlign: 'center' }}>
              Verifying your email address...
            </p>
            {loading && (
              <div style={{ textAlign: 'center' }}>
                <div>Please wait...</div>
              </div>
            )}
          </>
        )}

        {!token && !error && (
          <div>
            <p style={{ marginBottom: '20px', color: '#666', textAlign: 'center' }}>
              No verification token found. Please check your email for the verification link.
            </p>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Link to="/resend-verification" className="signup-link">
                Resend Verification Email
              </Link>
            </div>
          </div>
        )}

        <p className="signup-link" style={{ marginTop: '20px' }}>
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}

