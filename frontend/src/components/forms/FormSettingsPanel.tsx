import type { FormCreate } from '../../api';

interface FormSettingsPanelProps {
  formData: FormCreate;
  onUpdate: (updates: Partial<FormCreate> | ((prev: FormCreate) => FormCreate)) => void;
}

export function FormSettingsPanel({ formData, onUpdate }: FormSettingsPanelProps) {
  const updateSettings = (updates: Record<string, any>) => {
    const settings = formData.settings || {};
    onUpdate({ settings: { ...settings, ...updates } });
  };

  const updateWelcomeScreen = (updates: Record<string, any>) => {
    const welcome_screen = formData.welcome_screen || {};
    onUpdate({ welcome_screen: { ...welcome_screen, ...updates } });
  };

  const updateThankYouScreen = (updates: Record<string, any>) => {
    const thank_you_screen = formData.thank_you_screen || {};
    onUpdate({ thank_you_screen: { ...thank_you_screen, ...updates } });
  };

  return (
    <div className="card mb-4">
      <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Form Details</h2>
      
      <div className="form-group">
        <label htmlFor="form-name">Form Name *</label>
        <input
          id="form-name"
          type="text"
          value={formData.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Enter form name"
          required
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="form-description">Description</label>
        <textarea
          id="form-description"
          value={formData.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Enter form description"
          rows={3}
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="form-status">Status</label>
        <select
          id="form-status"
          value={formData.status}
          onChange={(e) => onUpdate({ status: e.target.value as any })}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Form Scheduling */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Schedule Publishing</h3>
        
        <div className="form-group">
          <label htmlFor="publish-date-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="publish-date-checkbox"
              checked={!!formData.settings?.publish_date}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ publish_date: new Date().toISOString().split('T')[0] });
                } else {
                  const { publish_date, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            Schedule Publish Date
          </label>
          {formData.settings?.publish_date && (
            <input
              id="publish-date"
              type="datetime-local"
              value={formData.settings.publish_date ? new Date(formData.settings.publish_date).toISOString().slice(0, 16) : ''}
              onChange={(e) => updateSettings({ publish_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Form will automatically become published at this date/time
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="unpublish-date-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="unpublish-date-checkbox"
              checked={!!formData.settings?.unpublish_date}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ unpublish_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] });
                } else {
                  const { unpublish_date, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            Schedule Unpublish Date
          </label>
          {formData.settings?.unpublish_date && (
            <input
              id="unpublish-date"
              type="datetime-local"
              value={formData.settings.unpublish_date ? new Date(formData.settings.unpublish_date).toISOString().slice(0, 16) : ''}
              onChange={(e) => updateSettings({ unpublish_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Form will automatically be archived at this date/time
          </p>
        </div>

        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="expiration-date-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="expiration-date-checkbox"
              checked={!!formData.settings?.expiration_date}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] });
                } else {
                  const { expiration_date, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            Form Expiration Date
          </label>
          {formData.settings?.expiration_date && (
            <input
              id="expiration-date"
              type="date"
              value={formData.settings.expiration_date ? new Date(formData.settings.expiration_date).toISOString().split('T')[0] : ''}
              onChange={(e) => updateSettings({ expiration_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Form will stop accepting submissions after this date
          </p>
        </div>

        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="max-submissions-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="max-submissions-checkbox"
              checked={!!formData.settings?.max_submissions}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ max_submissions: 100 });
                } else {
                  const { max_submissions, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            Maximum Submissions
          </label>
          {formData.settings?.max_submissions !== undefined && (
            <input
              id="max-submissions"
              type="number"
              min="1"
              value={formData.settings.max_submissions || ''}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (value > 0) {
                  updateSettings({ max_submissions: value });
                } else {
                  const { max_submissions, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Stop accepting submissions after reaching this limit
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="form-password-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="form-password-checkbox"
              checked={!!formData.settings?.password}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ password: '' });
                } else {
                  const { password, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            Password Protection
          </label>
          {formData.settings?.password !== undefined && (
            <input
              id="form-password"
              type="password"
              value={formData.settings.password || ''}
              onChange={(e) => updateSettings({ password: e.target.value })}
              placeholder="Enter password to protect this form"
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Require a password to access this form
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="form-captcha" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="form-captcha"
              checked={!!formData.settings?.captcha_enabled}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ captcha_enabled: true, captcha_site_key: '' });
                } else {
                  const { captcha_enabled, captcha_site_key, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            CAPTCHA Protection
          </label>
          {formData.settings?.captcha_enabled && (
            <input
              type="text"
              id="captcha-site-key"
              value={formData.settings.captcha_site_key || ''}
              onChange={(e) => updateSettings({ captcha_site_key: e.target.value })}
              placeholder="reCAPTCHA Site Key (from Google)"
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Require CAPTCHA verification before submission. Get your keys from{' '}
            <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer">
              Google reCAPTCHA
            </a>
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="rate-limit" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="rate-limit"
              checked={formData.settings?.rate_limit_per_hour !== undefined}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSettings({ rate_limit_per_hour: 10 });
                } else {
                  const { rate_limit_per_hour, ...rest } = formData.settings || {};
                  onUpdate({ settings: rest });
                }
              }}
            />
            Rate Limiting (per IP)
          </label>
          {formData.settings?.rate_limit_per_hour !== undefined && (
            <input
              type="number"
              id="rate-limit"
              min="1"
              value={formData.settings.rate_limit_per_hour || 10}
              onChange={(e) => updateSettings({ rate_limit_per_hour: parseInt(e.target.value) || 10 })}
              style={{ marginTop: '0.5rem' }}
            />
          )}
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Limit number of submissions per hour from the same IP address
          </p>
        </div>
      </div>

      {/* Welcome Screen */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Welcome Screen</h3>
        <div className="form-group">
          <label htmlFor="welcome-enabled" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="welcome-enabled"
              checked={!!formData.welcome_screen?.enabled}
              onChange={(e) => updateWelcomeScreen({ enabled: e.target.checked })}
            />
            Show welcome screen
          </label>
        </div>
        {formData.welcome_screen?.enabled && (
          <>
            <div className="form-group">
              <label htmlFor="welcome-title">Title</label>
              <input
                id="welcome-title"
                type="text"
                value={formData.welcome_screen?.title || ''}
                onChange={(e) => updateWelcomeScreen({ title: e.target.value })}
                placeholder="Welcome to our form"
              />
            </div>
            <div className="form-group">
              <label htmlFor="welcome-description">Description</label>
              <textarea
                id="welcome-description"
                value={formData.welcome_screen?.description || ''}
                onChange={(e) => updateWelcomeScreen({ description: e.target.value })}
                placeholder="Please fill out this form..."
                rows={3}
              />
            </div>
          </>
        )}
      </div>

      {/* Thank You Screen */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Thank You Screen</h3>
        <div className="form-group">
          <label htmlFor="thank-you-title">Title</label>
          <input
            id="thank-you-title"
            type="text"
            value={formData.thank_you_screen?.title || ''}
            onChange={(e) => updateThankYouScreen({ title: e.target.value })}
            placeholder="Thank you!"
          />
        </div>
        <div className="form-group">
          <label htmlFor="thank-you-description">Description</label>
          <textarea
            id="thank-you-description"
            value={formData.thank_you_screen?.description || ''}
            onChange={(e) => updateThankYouScreen({ description: e.target.value })}
            placeholder="Your submission has been received."
            rows={3}
          />
        </div>
        <div className="form-group">
          <label htmlFor="thank-you-redirect">Redirect URL (optional)</label>
          <input
            id="thank-you-redirect"
            type="url"
            value={formData.thank_you_screen?.redirect_url || ''}
            onChange={(e) => updateThankYouScreen({ redirect_url: e.target.value })}
            placeholder="https://example.com"
          />
        </div>
      </div>
    </div>
  );
}

