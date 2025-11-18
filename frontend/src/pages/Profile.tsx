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
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
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
        setProfilePictureUrl(client.profile_picture_url || null);
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

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      setUploadingPicture(true);
      const response = await clientsAPI.uploadProfilePicture(file);
      if (response.data?.profile_picture_url) {
        setProfilePictureUrl(response.data.profile_picture_url);
        alert('Profile picture uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Failed to upload profile picture:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to upload profile picture. Please try again.';
      alert(errorMessage);
    } finally {
      setUploadingPicture(false);
      // Reset input
      e.target.value = '';
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

            {/* Profile Picture Section */}
            <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Profile"
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '3px solid var(--color-border)',
                      boxShadow: 'var(--shadow-md)'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '3px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '3rem',
                      color: 'var(--color-text-muted)',
                      fontWeight: 'bold'
                    }}
                  >
                    {formData.name ? formData.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <label
                  htmlFor="profile-picture-upload"
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: 'var(--color-primary)',
                    color: 'white',
                    borderRadius: 'var(--radius-md)',
                    cursor: uploadingPicture ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    opacity: uploadingPicture ? 0.6 : 1,
                    pointerEvents: uploadingPicture ? 'none' : 'auto'
                  }}
                >
                  {uploadingPicture ? 'Uploading...' : profilePictureUrl ? 'Change Picture' : 'Upload Picture'}
                </label>
                <input
                  type="file"
                  id="profile-picture-upload"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingPicture}
                />
                <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
                  Max size: 5MB. JPG, PNG, or GIF.
                </p>
              </div>
            </div>

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

