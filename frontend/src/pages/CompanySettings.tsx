import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { companySettingsAPI } from '../api';
import type { CompanySettings } from '../api';

function CompanySettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; linkText: string; url: string }>({
    open: false,
    linkText: '',
    url: '',
  });
  const [formData, setFormData] = useState<Partial<CompanySettings>>({
    company_name: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    tax_id: '',
    logo_url: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await companySettingsAPI.get();
      if (response.data) {
        setFormData({
          company_name: response.data.company_name || '',
          email: response.data.email || '',
          phone: response.data.phone || '',
          address: response.data.address || '',
          website: response.data.website || '',
          tax_id: response.data.tax_id || '',
          logo_url: response.data.logo_url || '',
        });
      }
    } catch (error) {
      console.error('Failed to load company settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await companySettingsAPI.update(formData);
      alert('Company settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save company settings:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to save company settings. Please try again.';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const openLinkDialog = () => {
    setLinkDialog({
      open: true,
      linkText: '',
      url: '',
    });
  };

  const closeLinkDialog = () => {
    setLinkDialog({
      open: false,
      linkText: '',
      url: '',
    });
  };

  const insertLink = () => {
    if (!linkDialog.url) return;
    
    const linkText = linkDialog.linkText || linkDialog.url;
    const markdownLink = `[${linkText}](${linkDialog.url})`;
    
    const currentValue = formData.website || '';
    const newValue = currentValue + (currentValue ? ' ' : '') + markdownLink;
    
    setFormData({
      ...formData,
      website: newValue,
    });
    
    closeLinkDialog();
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Company Settings</h1>
        <p className="text-muted" style={{ marginBottom: '2rem' }}>
          This information will appear on all quotes as the seller/company information.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Company Name *</label>
            <input
              type="text"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              placeholder="Your Company Name"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contact@company.com"
              />
            </div>

            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main St, City, State ZIP"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                <label style={{ marginBottom: 0 }}>Website</label>
                <button
                  type="button"
                  onClick={openLinkDialog}
                  className="btn-outline"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                >
                  + Add Link
                </button>
              </div>
              <textarea
                value={formData.website || ''}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://www.company.com or use markdown format [link text](url)"
                rows={2}
              />
              <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                Tip: Use markdown format [link text](url) or paste URLs directly. They will be clickable when viewing quotes.
              </small>
            </div>

            <div className="form-group">
              <label>Tax ID</label>
              <input
                type="text"
                value={formData.tax_id}
                onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                placeholder="EIN, VAT, etc."
              />
            </div>
          </div>

          <div className="form-group">
            <label>Logo URL</label>
            <input
              type="url"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
            <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
              Enter a URL to your company logo. The logo will appear on quotes.
            </small>
          </div>

          {/* Link Insertion Dialog */}
          {linkDialog.open && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}
              onClick={closeLinkDialog}
            >
              <div
                className="card"
                style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0 }}>Insert Link</h3>
                <div className="form-group">
                  <label>Link Text (optional)</label>
                  <input
                    type="text"
                    value={linkDialog.linkText}
                    onChange={(e) => setLinkDialog({ ...linkDialog, linkText: e.target.value })}
                    placeholder="e.g., Visit Our Website"
                  />
                  <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                    Leave empty to use the URL as the link text
                  </small>
                </div>
                <div className="form-group">
                  <label>URL *</label>
                  <input
                    type="url"
                    value={linkDialog.url}
                    onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value })}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    onClick={insertLink}
                    className="btn-primary"
                    disabled={!linkDialog.url}
                  >
                    Insert Link
                  </button>
                  <button
                    type="button"
                    onClick={closeLinkDialog}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2" style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CompanySettingsPage;

