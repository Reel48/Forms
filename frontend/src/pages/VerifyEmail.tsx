import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authAPI } from '../api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getLogoForLightBackground } from '../utils/logoUtils';
import './Login.css';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [token, setToken] = useState('');
  const [verificationType, setVerificationType] = useState<'custom' | 'supabase'>('custom');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check for Supabase verification (hash fragments or query params)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const supabaseToken = hashParams.get('token');
    const supabaseType = hashParams.get('type') || searchParams.get('type');
    const accessToken = hashParams.get('access_token');
    
    // Check for custom token in query params
    const tokenFromUrl = searchParams.get('token');
    
    // Supabase verification: can come via hash (token + type) or query params (token + type)
    if ((supabaseToken || tokenFromUrl) && supabaseType === 'email') {
      // Supabase default verification flow
      setVerificationType('supabase');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken) {
        handleSupabaseVerification(accessToken, refreshToken);
      } else {
        setError('Invalid verification link format. Please use the link from your email.');
      }
    } else if (tokenFromUrl && !supabaseType) {
      // Custom token verification flow (no type parameter)
      setToken(tokenFromUrl);
      handleVerify(tokenFromUrl);
    } else {
      setError('Invalid verification link. Please request a new verification email.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSupabaseVerification = async (accessToken: string, refreshToken?: string | null) => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Supabase has already verified the email, we just need to set the session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || ''
      });
      
      if (sessionError) {
        throw sessionError;
      }

      // Refresh user data to get updated email confirmation status
      await refreshUser();
      setSuccess(true);
      
      // Redirect after a short delay
      setTimeout(() => {
        redirectAfterVerification();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to verify email. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

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
      
      // Refresh user data to get updated email confirmation status
      await refreshUser();
      setSuccess(true);
      
      // Redirect after a short delay
      setTimeout(() => {
        redirectAfterVerification();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to verify email. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  const redirectAfterVerification = () => {
    // If user is authenticated, redirect to dashboard
    // Otherwise, redirect to login with success message
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login?verified=true');
    }
  };

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          {/* Reel48 Logo */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img 
              src={getLogoForLightBackground()} 
              alt="Reel48 Logo" 
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
              style={{
                maxHeight: '48px',
                width: 'auto',
                objectFit: 'contain'
              }}
            />
          </div>
          
          <h1>Email Verified!</h1>
          <div className="success-message">
            <p>Your email has been verified successfully.</p>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
              {user ? 'Redirecting you to your dashboard...' : 'You can now log in to your account.'}
            </p>
          </div>
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            {user ? (
              <Link to="/dashboard" className="signup-link">
                Go to Dashboard
              </Link>
            ) : (
              <Link to="/login?verified=true" className="signup-link">
                Go to Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Reel48 Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img 
            src={getLogoForLightBackground()} 
            alt="Reel48 Logo" 
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            style={{
              maxHeight: '48px',
              width: 'auto',
              objectFit: 'contain'
            }}
          />
        </div>
        
        <h1>Verify Email</h1>
        
        {error && (
          <div className="error-message">
            {error}
            <div style={{ marginTop: '15px' }}>
              <Link to="/resend-verification" style={{ color: 'rgb(99 102 241)', textDecoration: 'none' }}>
                Request a new verification link
              </Link>
            </div>
          </div>
        )}

        {!error && !success && (token || verificationType === 'supabase') && (
          <>
            <p style={{ marginBottom: '20px', color: '#666', textAlign: 'center' }}>
              Verifying your email address...
            </p>
            {loading && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  display: 'inline-block',
                  width: '20px',
                  height: '20px',
                  border: '3px solid #e5e7eb',
                  borderTopColor: 'rgb(99 102 241)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginTop: '10px'
                }}></div>
                <style>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            )}
          </>
        )}

        {!token && !error && verificationType === 'custom' && (
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

