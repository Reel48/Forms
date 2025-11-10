import { useState, useEffect } from 'react';
import { clientsAPI } from '../api';
import AddressInput from '../components/AddressInput';

function Profile() {
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
  }, []);

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
      </div>
    </div>
  );
}

export default Profile;

