import { useState, useEffect } from 'react';
import { clientsAPI, authAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import AddressInput from '../components/AddressInput';

function Profile() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions' | 'activity'>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginActivity, setLoginActivity] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
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
    if (activeTab === 'activity') {
      loadLoginActivity();
    }
    if (activeTab === 'sessions') {
      loadSessions();
    }
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

  const loadLoginActivity = async () => {
    try {
      setLoadingActivity(true);
      const response = await authAPI.getLoginActivity(20);
      if (response.data) {
        setLoginActivity(response.data.activities || []);
      }
    } catch (error) {
      console.error('Failed to load login activity:', error);
    } finally {
      setLoadingActivity(false);
    }
  };

  const loadSessions = async () => {
    try {
      setLoadingSessions(true);
      const response = await authAPI.getSessions();
      if (response.data) {
        setSessions(response.data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this session?')) {
      return;
    }
    try {
      await authAPI.revokeSession(sessionId);
      await loadSessions(); // Reload sessions
      alert('Session revoked successfully');
    } catch (error: any) {
      console.error('Failed to revoke session:', error);
      alert(error?.response?.data?.detail || 'Failed to revoke session');
    }
  };

  const handleLogoutAll = async () => {
    if (!confirm('Are you sure you want to log out from all devices? You will need to log in again.')) {
      return;
    }
    try {
      await authAPI.logoutAll();
      alert('Logged out from all devices successfully. You will be redirected to login.');
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Failed to logout all devices:', error);
      alert(error?.response?.data?.detail || 'Failed to logout all devices');
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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getDeviceInfo = (session: any) => {
    try {
      const deviceInfo = typeof session.device_info === 'string' 
        ? JSON.parse(session.device_info) 
        : session.device_info;
      return deviceInfo;
    } catch {
      return { type: 'Unknown', browser: 'Unknown' };
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
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'sessions' ? '#007bff' : 'transparent',
              color: activeTab === 'sessions' ? 'white' : '#666',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontWeight: activeTab === 'sessions' ? 'bold' : 'normal'
            }}
          >
            Sessions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'activity' ? '#007bff' : 'transparent',
              color: activeTab === 'activity' ? 'white' : '#666',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontWeight: activeTab === 'activity' ? 'bold' : 'normal'
            }}
          >
            Login Activity
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
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
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
            <label>Notes</label>
            <textarea
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
                    <a href="/resend-verification" style={{ color: '#007bff' }}>
                      Resend verification email
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Active Sessions</h2>
              <button
                onClick={handleLogoutAll}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Log Out All Devices
              </button>
            </div>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              Manage your active sessions. You can revoke any session to force logout from that device.
            </p>
            {loadingSessions ? (
              <p>Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <p style={{ color: '#666' }}>No active sessions found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sessions.map((session) => {
                  const deviceInfo = getDeviceInfo(session);
                  return (
                    <div
                      key={session.id}
                      style={{
                        padding: '1rem',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                          {deviceInfo.type ? deviceInfo.type.charAt(0).toUpperCase() + deviceInfo.type.slice(1) : 'Unknown'} Device
                        </p>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '14px', color: '#666' }}>
                          <strong>Browser:</strong> {deviceInfo.browser || 'Unknown'}
                        </p>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '14px', color: '#666' }}>
                          <strong>IP Address:</strong> {session.ip_address || 'Unknown'}
                        </p>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '14px', color: '#666' }}>
                          <strong>Last Used:</strong> {formatDate(session.last_used_at)}
                        </p>
                        <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
                          <strong>Created:</strong> {formatDate(session.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Login Activity Tab */}
        {activeTab === 'activity' && (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Login Activity</h2>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              View your recent login attempts and account activity.
            </p>
            {loadingActivity ? (
              <p>Loading activity...</p>
            ) : loginActivity.length === 0 ? (
              <p style={{ color: '#666' }}>No login activity found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {loginActivity.map((activity) => (
                  <div
                    key={activity.id}
                    style={{
                      padding: '1rem',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      backgroundColor: activity.success ? '#d4edda' : '#f8d7da'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ margin: '0 0 0.25rem 0', fontWeight: 'bold' }}>
                          {activity.success ? 'Successful Login' : 'Failed Login'}
                        </p>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '14px', color: '#666' }}>
                          <strong>IP Address:</strong> {activity.ip_address || 'Unknown'}
                        </p>
                        {activity.failure_reason && (
                          <p style={{ margin: '0 0 0.25rem 0', fontSize: '14px', color: '#666' }}>
                            <strong>Reason:</strong> {activity.failure_reason}
                          </p>
                        )}
                        <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
                          <strong>Time:</strong> {formatDate(activity.attempted_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;

