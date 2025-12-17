import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { validatePassword, getPasswordStrengthScore, getPasswordStrengthLabel } from '../utils/passwordValidation';
import './Login.css';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const passwordStrength = password ? getPasswordStrengthScore(password) : 0;
  const passwordStrengthLabel = password ? getPasswordStrengthLabel(passwordStrength) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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

    setLoading(true);

    try {
      const result = await signUp(email, password);
      if (result && 'requiresVerification' in result && result.requiresVerification) {
        navigate('/login?registered=true');
        return;
      }
      // Fallback: if backend didn't require verification, send to login
      navigate('/login?registered=true');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Sign Up</h1>
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
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={12}
              placeholder="At least 12 characters with uppercase, lowercase, number, and special character"
            />
            {password && (
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                <div style={{ marginBottom: '4px' }}>
                  Strength: <strong>{passwordStrengthLabel}</strong> ({passwordStrength}/10)
                </div>
                <div style={{ 
                  width: '100%', 
                  height: '4px', 
                  backgroundColor: 'var(--color-bg-secondary)', 
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(passwordStrength / 10) * 100}%`,
                    height: '100%',
                    backgroundColor: passwordStrength <= 3 ? 'rgb(239 68 68)' : passwordStrength <= 6 ? 'rgb(245 158 11)' : passwordStrength <= 8 ? 'rgb(59 130 246)' : 'rgb(16 185 129)', /* red-500, amber-500, blue-500, emerald-500 */
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
              Password must be at least 12 characters and contain uppercase, lowercase, number, and special character
            </div>
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
              minLength={12}
            />
          </div>

          <button type="submit" disabled={loading} className="submit-button">
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="signup-link">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

