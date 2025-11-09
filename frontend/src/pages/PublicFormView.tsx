import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { formsAPI } from '../api';
import type { Form, FormField } from '../api';

function PublicFormView() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (slug) {
      loadForm(slug);
    }
  }, [slug]);

  const loadForm = async (formSlug: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await formsAPI.getBySlug(formSlug);
      setForm(response.data);
    } catch (error: any) {
      console.error('Failed to load form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Form not found or not available.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormValues({ ...formValues, [fieldId]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form) return;

    setSubmitting(true);
    setError(null);

    try {
      // Calculate time spent
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);

      // Prepare submission data
      const submissionData = {
        form_id: form.id,
        started_at: new Date(startTime).toISOString(),
        time_spent_seconds: timeSpent,
        status: 'completed',
        answers: form.form_fields?.map((field) => {
          const fieldId = field.id || '';
          const value = formValues[fieldId];
          if (value === undefined || value === null || value === '') {
            return null;
          }
          return {
            field_id: fieldId,
            answer_text: typeof value === 'string' ? value : (Array.isArray(value) ? value.join(', ') : JSON.stringify(value)),
            answer_value: typeof value === 'object' && !Array.isArray(value) ? value : { value },
          };
        }).filter(answer => answer && answer.field_id) || [],
      };

      // Submit form
      await formsAPI.submitForm(form.id, submissionData);
      
      setSubmitted(true);
    } catch (error: any) {
      console.error('Failed to submit form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const evaluateConditionalLogic = (field: FormField): boolean => {
    if (!field.conditional_logic || !field.conditional_logic.enabled) {
      return true; // Show field if no conditional logic
    }

    const triggerFieldId = field.conditional_logic.trigger_field_id;
    if (!triggerFieldId) {
      return true;
    }

    const triggerValue = formValues[triggerFieldId];
    const condition = field.conditional_logic.condition || 'equals';
    const expectedValue = field.conditional_logic.value;

    switch (condition) {
      case 'equals':
        return triggerValue === expectedValue || triggerValue === expectedValue?.toString();
      case 'not_equals':
        return triggerValue !== expectedValue && triggerValue !== expectedValue?.toString();
      case 'contains':
        const triggerStr = String(triggerValue || '');
        const expectedStr = String(expectedValue || '');
        return triggerStr.toLowerCase().includes(expectedStr.toLowerCase());
      case 'is_empty':
        return !triggerValue || triggerValue === '' || (Array.isArray(triggerValue) && triggerValue.length === 0);
      case 'is_not_empty':
        return triggerValue !== undefined && triggerValue !== null && triggerValue !== '' && !(Array.isArray(triggerValue) && triggerValue.length === 0);
      default:
        return true;
    }
  };

  const renderField = (field: FormField, index: number) => {
    const fieldId = field.id || `field-${index}`;
    const value = formValues[fieldId] || '';

    // Check conditional logic
    if (!evaluateConditionalLogic(field)) {
      return null; // Don't render field if condition is not met
    }

    switch (field.field_type) {
      case 'text':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <textarea
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
            />
          </div>
        );

      case 'email':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="email"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'number':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'phone':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="tel"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'url':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="url"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder || 'https://example.com'}
              required={field.required}
            />
          </div>
        );

      case 'date':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="date"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'time':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="time"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'dropdown':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <select
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            >
              <option value="">Select an option...</option>
              {field.options?.map((option: any, optIndex: number) => (
                <option key={optIndex} value={option.value || option.label}>
                  {option.label || option.value}
                </option>
              ))}
            </select>
          </div>
        );

      case 'multiple_choice':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {field.options?.map((option: any, optIndex: number) => (
                <label key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    name={fieldId}
                    value={option.value || option.label}
                    checked={value === (option.value || option.label)}
                    onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                    required={field.required}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {field.options?.map((option: any, optIndex: number) => (
                <label key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    value={option.value || option.label}
                    checked={(formValues[fieldId] || []).includes(option.value || option.label)}
                    onChange={(e) => {
                      const currentValues = formValues[fieldId] || [];
                      const newValues = e.target.checked
                        ? [...currentValues, option.value || option.label]
                        : currentValues.filter((v: any) => v !== (option.value || option.label));
                      handleFieldChange(fieldId, newValues);
                    }}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'yes_no':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name={fieldId}
                  value="yes"
                  checked={value === 'yes'}
                  onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                  required={field.required}
                />
                <span>Yes</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name={fieldId}
                  value="no"
                  checked={value === 'no'}
                  onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                  required={field.required}
                />
                <span>No</span>
              </label>
            </div>
          </div>
        );

      case 'rating':
        const maxRating = field.validation_rules?.max || 5;
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleFieldChange(fieldId, star)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '2rem',
                    cursor: 'pointer',
                    color: star <= (value || 0) ? '#fbbf24' : '#d1d5db',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  title={`${star} star${star > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
              {value && (
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  ({value} / {maxRating})
                </span>
              )}
            </div>
          </div>
        );

      case 'opinion_scale':
        const scaleMin = field.validation_rules?.min || 1;
        const scaleMax = field.validation_rules?.max || 10;
        const scaleLabels = field.options || [];
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                {scaleLabels[0] && (
                  <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '100px', textAlign: 'left' }}>
                    {scaleLabels[0].label || scaleLabels[0].value}
                  </span>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flex: 1, justifyContent: 'center' }}>
                  {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i).map((num) => (
                    <label
                      key={num}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={fieldId}
                        value={num}
                        checked={value === num.toString()}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        required={field.required}
                        style={{ margin: 0 }}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{num}</span>
                    </label>
                  ))}
                </div>
                {scaleLabels[1] && (
                  <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '100px', textAlign: 'right' }}>
                    {scaleLabels[1].label || scaleLabels[1].value}
                  </span>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div key={fieldId} className="form-group">
            <label>{field.label}</label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <p>Loading form...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>Form Not Available</h2>
          <p className="text-muted">{error}</p>
        </div>
      </div>
    );
  }

  // Handle redirect after submission
  useEffect(() => {
    if (submitted && form?.thank_you_screen?.redirect_url) {
      const timer = setTimeout(() => {
        const redirectUrl = form.thank_you_screen?.redirect_url;
        if (redirectUrl) {
          window.location.href = redirectUrl;
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [submitted, form?.thank_you_screen?.redirect_url]);

  if (submitted) {
    const thankYouMessage = form?.thank_you_screen?.title || 'Thank you!';
    const thankYouDescription = form?.thank_you_screen?.description || 'Your response has been recorded.';
    const redirectUrl = form?.thank_you_screen?.redirect_url;

    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#22c55e', marginBottom: '1rem' }}>✓ {thankYouMessage}</h1>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>{thankYouDescription}</p>
          {redirectUrl && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Redirecting in 3 seconds...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!form) {
    return null;
  }

  const welcomeTitle = form.welcome_screen?.title || form.name;
  const welcomeDescription = form.welcome_screen?.description || form.description;
  const showWelcome = form.welcome_screen?.enabled !== false && !formValues._started;

  if (showWelcome) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '1rem' }}>{welcomeTitle}</h1>
          {welcomeDescription && (
            <p className="text-muted" style={{ marginBottom: '2rem' }}>{welcomeDescription}</p>
          )}
          <button
            onClick={() => setFormValues({ ...formValues, _started: true })}
            className="btn-primary"
            style={{ fontSize: '1.125rem', padding: '0.75rem 2rem' }}
          >
            {form.welcome_screen?.button_text || 'Start'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '2px solid #e5e7eb' }}>
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{form.name}</h1>
          {form.description && (
            <p style={{ color: '#6b7280', margin: 0 }}>{form.description}</p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {form.form_fields && form.form_fields.length > 0 ? (
            form.form_fields.map((field, index) => renderField(field, index))
          ) : (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
              This form has no fields.
            </p>
          )}

          {error && (
            <div style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem', borderRadius: '6px', marginTop: '1rem' }}>
              <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
            </div>
          )}

          {form.form_fields && form.form_fields.length > 0 && (
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Submitting...' : form.thank_you_screen?.submit_button_text || 'Submit'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default PublicFormView;

