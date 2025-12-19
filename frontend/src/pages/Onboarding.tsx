import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import AddressInput from '../components/AddressInput';
import { getLogoForDarkBackground } from '../utils/logoUtils';
import { clearProfileCompletionCache } from '../hooks/useProfileCompletion';

function Onboarding() {
  const navigate = useNavigate();
  const { refreshUser, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    address: '',
    // Structured address fields
    address_line1: '',
    address_line2: '',
    address_city: '',
    address_state: '',
    address_postal_code: '',
    address_country: 'US',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Onboarding always requires structured address mode
  const [addressMode] = useState<'simple' | 'structured'>('structured');

  useEffect(() => {
    // Load existing profile data if available
    const loadProfile = async () => {
      try {
        setLoading(true);
        const response = await clientsAPI.getMyProfile();
        if (response.data) {
          const client = response.data;
          setFormData({
            name: client.name || '',
            email: client.email || '',
            company: client.company || '',
            phone: client.phone || '',
            address: client.address || '',
            address_line1: client.address_line1 || '',
            address_line2: client.address_line2 || '',
            address_city: client.address_city || '',
            address_state: client.address_state || '',
            address_postal_code: client.address_postal_code || '',
            address_country: client.address_country || 'US',
          });
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || !formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email || !formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }

    if (!formData.company || !formData.company.trim()) {
      newErrors.company = 'Company is required';
    }

    if (!formData.phone || !formData.phone.trim()) {
      newErrors.phone = 'Phone is required';
    }

    // Validate structured address fields
    if (addressMode === 'structured') {
      if (!formData.address_line1 || !formData.address_line1.trim()) {
        newErrors.address_line1 = 'Street address is required';
      }
      if (!formData.address_city || !formData.address_city.trim()) {
        newErrors.address_city = 'City is required';
      }
      if (!formData.address_state || !formData.address_state.trim()) {
        newErrors.address_state = 'State/Province is required';
      }
      if (!formData.address_postal_code || !formData.address_postal_code.trim()) {
        newErrors.address_postal_code = 'ZIP/Postal code is required';
      }
    } else {
      if (!formData.address || !formData.address.trim()) {
        newErrors.address = 'Address is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      // Prepare data for API - remove empty string values for optional fields
      const apiData: any = { ...formData };
      Object.keys(apiData).forEach(key => {
        if (apiData[key] === '') {
          apiData[key] = undefined;
        }
      });

      // Onboarding always uses structured address mode
      // Remove simple address field
      delete apiData.address;
      
      // Ensure address_country has a default value if not set
      if (!apiData.address_country) {
        apiData.address_country = 'US';
      }

      const response = await clientsAPI.updateMyProfile(apiData);
      
      // Verify the profile was updated successfully
      if (!response.data) {
        throw new Error('Profile update failed: No data returned');
      }
      
      // Verify all required fields are present in the response
      const updatedProfile = response.data;
      const requiredFields = {
        name: updatedProfile.name,
        email: updatedProfile.email,
        company: updatedProfile.company,
        phone: updatedProfile.phone,
        address_line1: updatedProfile.address_line1,
        address_city: updatedProfile.address_city,
        address_state: updatedProfile.address_state,
        address_postal_code: updatedProfile.address_postal_code,
      };
      
      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value || (typeof value === 'string' && !value.trim()))
        .map(([key]) => key);
      
      if (missingFields.length > 0) {
        throw new Error(`Profile update incomplete. Missing fields: ${missingFields.join(', ')}`);
      }
      
      // Verify profile_completed_at was set in the response
      if (!updatedProfile.profile_completed_at) {
        console.warn('Profile completed but profile_completed_at not set. This may cause issues.');
      }
      
      // Clear the profile completion cache so it will be re-checked
      clearProfileCompletionCache();
      
      // Refresh user context to ensure auth state is up to date
      await refreshUser();
      
      // Redirect based on user role
      // Admins go to home page (/) which shows QuotesList
      // Customers go to dashboard (/dashboard) which shows CustomerDashboard
      const redirectPath = role === 'admin' ? '/' : '/dashboard';
      
      // Force a page reload to clear any cached profile completion state
      // This ensures the ProtectedRoute will re-check with fresh data
      window.location.href = redirectPath;
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to save profile. Please try again.';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        backgroundColor: '#1B2B41'
      }}>
        <div style={{ color: '#ffffff' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1B2B41',
      padding: '2rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'center'
    }}>
      {/* Logo */}
      <div style={{ 
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <img 
          src={getLogoForDarkBackground()} 
          alt="Reel48 Logo" 
          style={{
            height: '48px',
            width: 'auto',
            objectFit: 'contain'
          }}
          onError={(e) => {
            // Fallback if logo doesn't exist
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      </div>

      <div style={{
        maxWidth: '600px',
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '2rem',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ 
            fontSize: '1.875rem', 
            fontWeight: '700', 
            marginBottom: '0.5rem',
            color: '#111827'
          }}>
            Welcome! Let's set up your profile
          </h1>
          <p style={{ 
            color: '#6b7280', 
            fontSize: '1rem'
          }}>
            Please complete your profile information to get started. All fields are required.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="onboarding-name" style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: '#374151'
            }}>
              Name *
            </label>
            <input
              type="text"
              id="onboarding-name"
              name="onboarding-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              style={{ 
                width: '100%', 
                padding: '0.625rem', 
                border: `1px solid ${errors.name ? '#ef4444' : '#d1d5db'}`, 
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            {errors.name && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.name}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="onboarding-email" style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: '#374151'
            }}>
              Email *
            </label>
            <input
              type="email"
              id="onboarding-email"
              name="onboarding-email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              style={{ 
                width: '100%', 
                padding: '0.625rem', 
                border: `1px solid ${errors.email ? '#ef4444' : '#d1d5db'}`, 
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            {errors.email && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.email}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="onboarding-company" style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: '#374151'
            }}>
              Company *
            </label>
            <input
              type="text"
              id="onboarding-company"
              name="onboarding-company"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              required
              style={{ 
                width: '100%', 
                padding: '0.625rem', 
                border: `1px solid ${errors.company ? '#ef4444' : '#d1d5db'}`, 
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            {errors.company && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.company}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="onboarding-phone" style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: '#374151'
            }}>
              Phone *
            </label>
            <input
              type="tel"
              id="onboarding-phone"
              name="onboarding-phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              style={{ 
                width: '100%', 
                padding: '0.625rem', 
                border: `1px solid ${errors.phone ? '#ef4444' : '#d1d5db'}`, 
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            {errors.phone && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.phone}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: '#374151'
            }}>
              Address *
            </label>
            <AddressInput
              value={formData}
              onChange={(addressData) => setFormData({ ...formData, ...addressData })}
              mode="structured"
            />
            {(errors.address || errors.address_line1 || errors.address_city || errors.address_state || errors.address_postal_code) && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.address || errors.address_line1 || errors.address_city || errors.address_state || errors.address_postal_code}
              </p>
            )}
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button 
              type="submit" 
              disabled={saving}
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                backgroundColor: saving ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }
              }}
            >
              {saving ? 'Saving...' : 'Complete Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Onboarding;

