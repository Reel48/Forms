import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clientsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import AddressInput from '../components/AddressInput';

function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    address: '',
    notes: '',
    // Structured address fields
    address_line1: '',
    address_line2: '',
    address_city: '',
    address_state: '',
    address_postal_code: '',
    address_country: 'US',
  });

  useEffect(() => {
    loadProfile();
  }, [activeTab]);

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
          notes: client.notes || '',
          // Structured address fields
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

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      // Prepare data for API - remove empty string values for optional fields
      const apiData: any = { ...formData };
      Object.keys(apiData).forEach(key => {
        if (apiData[key] === '') {
          apiData[key] = undefined;
        }
      });

      await clientsAPI.updateMyProfile(apiData);
      alert('Profile saved successfully!');
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to save profile. Please try again.';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>My Profile</h1>
        
        {/* Tabs */}
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          marginBottom: '2rem',
          borderBottom: '2px solid #e0e0e0',
          paddingBottom: '10px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'profile' ? '#007bff' : 'transparent',
              color: activeTab === 'profile' ? 'white' : '#666',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontWeight: activeTab === 'profile' ? 'bold' : 'normal'
            }}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'security' ? '#007bff' : 'transparent',
              color: activeTab === 'security' ? 'white' : '#666',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontWeight: activeTab === 'security' ? 'bold' : 'normal'
            }}
          >
            Security
          </button>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              Update your profile information. This information will be used for quotes and invoices.
            </p>

            <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="profile-name">Name *</label>
              <input
                type="text"
                id="profile-name"
                name="profile-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-email">Email</label>
              <input
                type="email"
                id="profile-email"
                name="profile-email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="profile-company">Company</label>
              <input
                type="text"
                id="profile-company"
                name="profile-company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-phone">Phone</label>
              <input
                type="tel"
                id="profile-phone"
                name="profile-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <AddressInput
              value={formData}
              onChange={(addressData) => setFormData({ ...formData, ...addressData })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="profile-notes">Notes</label>
            <textarea
              id="profile-notes"
              name="profile-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-2" style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
        </>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Security Settings</h2>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Account Security</h3>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                Manage your account security settings and view security information.
              </p>
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <p><strong>Email:</strong> {user?.email}</p>
                <p><strong>Email Verified:</strong> {user?.email_confirmed_at ? 'Yes' : 'No'}</p>
                {!user?.email_confirmed_at && (
                  <p style={{ marginTop: '0.5rem' }}>
                    <Link to="/resend-verification" className="btn-outline btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}>
                      Resend verification email
                    </Link>
                  </p>
                )}
              </div>
            </div>
            <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Logout</h3>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                Sign out of your account. You will need to log in again to access your account.
              </p>
              <button
                onClick={handleLogout}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                }}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;

