import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formsAPI } from '../api';
import type { Form, FormSubmission } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { AssignmentModal } from '../components/AssignmentModal';
import { AssignmentsList } from '../components/AssignmentsList';
import api from '../api';

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Short Text',
  textarea: 'Long Text',
  email: 'Email',
  number: 'Number',
  phone: 'Phone',
  date: 'Date',
  dropdown: 'Dropdown',
  multiple_choice: 'Multiple Choice',
  checkbox: 'Checkboxes',
  yes_no: 'Yes/No',
};

function FormView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showEmbedCode, setShowEmbedCode] = useState(false);
  const { role } = useAuth();

  useEffect(() => {
    if (id) {
      loadForm(id);
      loadAssignments();
      if (role === 'admin') {
        loadSubmissions();
      }
    }
  }, [id, role]);

  const loadAssignments = async () => {
    try {
      const response = await api.get(`/api/forms/${id}/assignments`);
      setAssignments(response.data || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const loadSubmissions = async () => {
    if (!id) return;
    setLoadingSubmissions(true);
    try {
      const response = await formsAPI.getSubmissions(id);
      setSubmissions(response.data || []);
    } catch (error) {
      console.error('Failed to load submissions:', error);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleAssign = async (folderIds: string[]) => {
    try {
      await api.post(`/api/forms/${id}/assign`, { folder_ids: folderIds });
      await loadAssignments();
    } catch (error) {
      throw error;
    }
  };

  const loadForm = async (formId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await formsAPI.getById(formId);
      setForm(response.data);
    } catch (error: any) {
      console.error('Failed to load form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Are you sure you want to delete this form?')) {
      return;
    }

    try {
      await formsAPI.delete(id);
      navigate('/forms');
    } catch (error: any) {
      console.error('Failed to delete form:', error);
      alert(error?.response?.data?.detail || error?.message || 'Failed to delete form. Please try again.');
    }
  };

  if (error && !loading) {
    return (
      <div className="container">
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
          <button onClick={() => navigate('/forms')} className="btn-secondary" style={{ marginTop: '1rem' }}>
            Back to Forms
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="container">
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={() => navigate(role === 'admin' ? '/forms' : '/')} className="btn-outline" style={{ marginBottom: '1rem' }}>
          ← {role === 'admin' ? 'Back to Forms' : 'Back to Dashboard'}
        </button>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading form...</p>
        </div>
      )}

      {!loading && form && (
        <>
          <div className="flex-between mb-4">
            <div>
              <h1>{form.name || 'Form Details'}</h1>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
          {role === 'admin' && (
            <button onClick={() => setShowAssignmentModal(true)} className="btn-primary">
              Assign to Customers
            </button>
          )}
          {role === 'admin' && (
            <>
              <button onClick={() => navigate(`/forms/${id}/edit`)} className="btn-primary">
                Edit
              </button>
              <button onClick={handleDelete} className="btn-danger">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Form Details */}
      <div className="card mb-4">
        <h2 style={{ marginTop: 0 }}>Form Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Form Name
            </div>
            <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {form.name || 'Untitled Form'}
            </p>
          </div>
          <div>
            <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Status
            </div>
            <p style={{ margin: 0 }}>
              <span className={`badge ${form.status === 'published' ? 'badge-sent' : form.status === 'archived' ? 'badge-declined' : 'badge-draft'}`}>
                {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
              </span>
            </p>
          </div>
          {form.description && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                Description
              </div>
              <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                {form.description}
              </p>
            </div>
          )}
          <div>
            <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Created
            </div>
            <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {new Date(form.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Last Updated
            </div>
            <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {new Date(form.updated_at).toLocaleString()}
            </p>
          </div>
          {form.public_url_slug && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                Public Form URL
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <a
                    href={`/public/form/${form.public_url_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ 
                      flex: 1, 
                      fontFamily: 'monospace', 
                      fontSize: '0.875rem',
                      color: '#2563eb',
                      textDecoration: 'none',
                      wordBreak: 'break-all'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                  >
                    {window.location.origin}/public/form/{form.public_url_slug}
                  </a>
                </div>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/public/form/${form.public_url_slug}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      alert('URL copied to clipboard!');
                    } catch (err) {
                      // Fallback for older browsers
                      const textArea = document.createElement('textarea');
                      textArea.value = url;
                      textArea.style.position = 'fixed';
                      textArea.style.opacity = '0';
                      document.body.appendChild(textArea);
                      textArea.select();
                      try {
                        document.execCommand('copy');
                        alert('URL copied to clipboard!');
                      } catch (fallbackErr) {
                        alert('Failed to copy URL. Please copy manually.');
                      }
                      document.body.removeChild(textArea);
                    }
                  }}
                  className="btn-outline"
                  style={{ 
                    padding: '0.625rem 1rem',
                    whiteSpace: 'nowrap',
                    fontSize: '0.875rem'
                  }}
                  title="Copy URL to clipboard"
                >
                  Copy
                </button>
                <button
                  onClick={() => setShowQRCode(!showQRCode)}
                  className="btn-outline"
                  style={{ 
                    padding: '0.625rem 1rem',
                    whiteSpace: 'nowrap',
                    fontSize: '0.875rem'
                  }}
                  title="Show QR code"
                >
                  {showQRCode ? 'Hide QR' : 'QR Code'}
                </button>
                <button
                  onClick={async () => {
                    if (!id) return;
                    try {
                      const response = await formsAPI.createShortUrl(id);
                      const shortUrl = response.data;
                      const fullUrl = `${window.location.origin}${shortUrl.short_url}`;
                      await navigator.clipboard.writeText(fullUrl);
                      alert(`Short URL created and copied to clipboard!\n${fullUrl}`);
                    } catch (error: any) {
                      console.error('Failed to create short URL:', error);
                      alert(error?.response?.data?.detail || 'Failed to create short URL');
                    }
                  }}
                  className="btn-outline"
                  style={{ 
                    padding: '0.625rem 1rem',
                    whiteSpace: 'nowrap',
                    fontSize: '0.875rem'
                  }}
                  title="Generate short URL"
                >
                  Short URL
                </button>
                <button
                  onClick={() => setShowEmbedCode(!showEmbedCode)}
                  className="btn-outline"
                  style={{ 
                    padding: '0.625rem 1rem',
                    whiteSpace: 'nowrap',
                    fontSize: '0.875rem'
                  }}
                  title="Show embed code"
                >
                  {showEmbedCode ? 'Hide Embed' : 'Embed'}
                </button>
                <a
                  href={`/public/form/${form.public_url_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ 
                    padding: '0.625rem 1rem',
                    whiteSpace: 'nowrap',
                    fontSize: '0.875rem',
                    textDecoration: 'none'
                  }}
                >
                  Open
                </a>
              </div>
              {showQRCode && form.public_url_slug && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#ffffff', borderRadius: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    Scan to open form
                  </p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/public/form/${form.public_url_slug}`)}`}
                    alt="QR Code"
                    style={{ 
                      maxWidth: '200px', 
                      height: 'auto',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      backgroundColor: '#ffffff'
                    }}
                  />
                  <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    Share this QR code to allow easy access to your form
                  </p>
                </div>
              )}
              {showEmbedCode && form.public_url_slug && form.status === 'published' && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151', fontSize: '0.875rem' }}>
                    Embed Code
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <textarea
                      readOnly
                      value={`<iframe src="${window.location.origin}/public/form/${form.public_url_slug}" width="100%" height="600" frameborder="0"></iframe>`}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        backgroundColor: 'white',
                        resize: 'vertical',
                        minHeight: '80px',
                      }}
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <button
                      onClick={async () => {
                        const embedCode = `<iframe src="${window.location.origin}/public/form/${form.public_url_slug}" width="100%" height="600" frameborder="0"></iframe>`;
                        try {
                          await navigator.clipboard.writeText(embedCode);
                          alert('Embed code copied to clipboard!');
                        } catch (err) {
                          const textArea = document.createElement('textarea');
                          textArea.value = embedCode;
                          textArea.style.position = 'fixed';
                          textArea.style.opacity = '0';
                          document.body.appendChild(textArea);
                          textArea.select();
                          try {
                            document.execCommand('copy');
                            alert('Embed code copied to clipboard!');
                          } catch (fallbackErr) {
                            alert('Failed to copy. Please copy manually.');
                          }
                          document.body.removeChild(textArea);
                        }
                      }}
                      className="btn-primary"
                      style={{ 
                        padding: '0.625rem 1rem',
                        whiteSpace: 'nowrap',
                        fontSize: '0.875rem',
                        alignSelf: 'flex-start'
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                    Copy and paste this code into your website to embed the form
                  </p>
                </div>
              )}
              {showEmbedCode && form.status !== 'published' && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#dc2626' }}>
                    Form must be published to generate embed code
                  </p>
                </div>
              )}
              {form.status !== 'published' && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#dc2626' }}>
                  Warning: Form must be published for the public URL to work
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Form Fields */}
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>
          Form Fields ({form.fields?.length || 0})
        </h2>
        
        {!form.fields || form.fields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <p>No fields in this form yet.</p>
            <Link to={`/forms/${id}/edit`} className="btn-primary" style={{ marginTop: '1rem' }}>
              Add Fields
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {form.fields.map((field, index) => (
              <div
                key={field.id || index}
                className="card"
                style={{ border: '1px solid #e5e7eb' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span className="badge badge-draft" style={{ fontSize: '0.75rem' }}>
                        {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                      </span>
                      {field.required && (
                        <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: '500' }}>* Required</span>
                      )}
                      <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                        Order: {field.order_index + 1}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>
                      {field.label || 'Untitled Field'}
                    </h3>
                    {field.description && (
                      <p style={{ margin: '0.25rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        {field.description}
                      </p>
                    )}
                    {field.placeholder && (
                      <p style={{ margin: '0.25rem 0', color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>
                        Placeholder: {field.placeholder}
                      </p>
                    )}
                    {(field.options && field.options.length > 0) && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#6b7280' }}>
                          Options:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                          {field.options.map((option: any, optIndex: number) => (
                            <li key={optIndex}>
                              {option.label || option.value || `Option ${optIndex + 1}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

          {/* Analytics Section */}
          {role === 'admin' && (
            <FormAnalytics form={form} submissions={submissions} loading={loadingSubmissions} />
          )}

          {/* Webhooks Section */}
          {role === 'admin' && (
            <WebhooksSection formId={id || ''} />
          )}

          {/* Form Versions Section */}
          {role === 'admin' && (
            <FormVersionsSection formId={id || ''} />
          )}

          {/* Submissions Section */}
          {role === 'admin' && (
            <div className="card mt-4">
              <div className="flex-between">
                <div>
                  <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Submissions</h3>
                  <p className="text-muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                    View and manage all form responses
                  </p>
                </div>
                <button onClick={() => navigate(`/forms/${id}/submissions`)} className="btn-primary">
                  View Submissions
                </button>
              </div>
            </div>
          )}

          {role === 'admin' && (
            <AssignmentsList
              formId={id}
              onUnassign={loadAssignments}
            />
          )}

          {role === 'admin' && (
            <AssignmentModal
              isOpen={showAssignmentModal}
              onClose={() => setShowAssignmentModal(false)}
              onAssign={handleAssign}
              title={`Assign Form: ${form.name}`}
              existingAssignments={assignments}
            />
          )}
        </>
      )}
    </div>
  );
}

// Form Analytics Component
interface FormAnalyticsProps {
  form: Form | null;
  submissions: FormSubmission[];
  loading: boolean;
}

function FormAnalytics({ form, submissions, loading }: FormAnalyticsProps) {
  const analytics = useMemo(() => {
    if (!form || !submissions || submissions.length === 0) {
      return null;
    }

    const completed = submissions.filter(s => s.status === 'completed');
    const abandoned = submissions.filter(s => s.status === 'abandoned');
    const totalSubmissions = submissions.length;
    const completionRate = totalSubmissions > 0 ? (completed.length / totalSubmissions) * 100 : 0;
    
    // Calculate average time spent
    const timesWithData = completed
      .map(s => s.time_spent_seconds)
      .filter((t): t is number => t !== undefined && t !== null);
    const avgTimeSeconds = timesWithData.length > 0
      ? Math.round(timesWithData.reduce((a, b) => a + b, 0) / timesWithData.length)
      : 0;
    
    const formatTime = (seconds: number) => {
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    };

    // Field-level analytics
    const fieldAnalytics = (form.fields || []).map(field => {
      const answersForField = submissions
        .flatMap(s => s.answers)
        .filter(a => a.field_id === field.id);
      
      const answeredCount = answersForField.length;
      const skippedCount = totalSubmissions - answeredCount;
      const skipRate = totalSubmissions > 0 ? (skippedCount / totalSubmissions) * 100 : 0;

      // For choice fields, count answer distribution
      const answerDistribution: Record<string, number> = {};
      if (['dropdown', 'multiple_choice', 'checkbox', 'yes_no'].includes(field.field_type)) {
        answersForField.forEach(answer => {
          const answerText = answer.answer_text || '';
          if (answerText) {
            // For checkboxes, split by comma
            if (field.field_type === 'checkbox') {
              answerText.split(',').forEach(val => {
                const trimmed = val.trim();
                if (trimmed) {
                  answerDistribution[trimmed] = (answerDistribution[trimmed] || 0) + 1;
                }
              });
            } else {
              answerDistribution[answerText] = (answerDistribution[answerText] || 0) + 1;
            }
          }
        });
      }

      return {
        field,
        answeredCount,
        skippedCount,
        skipRate,
        answerDistribution,
      };
    });

    // Submission trends (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const submissionsByDate = last7Days.map(date => {
      const count = submissions.filter(s => {
        const submissionDate = new Date(s.submitted_at).toISOString().split('T')[0];
        return submissionDate === date;
      }).length;
      return { date, count };
    });

    return {
      totalSubmissions,
      completed: completed.length,
      abandoned: abandoned.length,
      completionRate: Math.round(completionRate * 10) / 10,
      avgTimeSeconds,
      avgTimeFormatted: formatTime(avgTimeSeconds),
      fieldAnalytics,
      submissionsByDate,
    };
  }, [form, submissions]);

  if (loading) {
    return (
      <div className="card mt-4">
        <h2 style={{ marginTop: 0 }}>Analytics</h2>
        <p className="text-muted">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics || analytics.totalSubmissions === 0) {
    return (
      <div className="card mt-4">
        <h2 style={{ marginTop: 0 }}>Analytics</h2>
        <p className="text-muted">No submissions yet. Analytics will appear here once you receive responses.</p>
      </div>
    );
  }

  return (
    <div className="card mt-4">
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Analytics</h2>
      
      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Submissions</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>{analytics.totalSubmissions}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Completion Rate</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#22c55e' }}>{analytics.completionRate}%</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Avg. Time to Complete</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>{analytics.avgTimeFormatted}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Abandoned</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>{analytics.abandoned}</div>
        </div>
      </div>

      {/* Submission Trends */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem' }}>Submissions (Last 7 Days)</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '150px', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          {analytics.submissionsByDate.map(({ date, count }) => {
            const maxCount = Math.max(...analytics.submissionsByDate.map(d => d.count), 1);
            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            
            return (
              <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                  <div
                    style={{
                      width: '100%',
                      height: `${height}%`,
                      backgroundColor: '#667eea',
                      borderRadius: '4px 4px 0 0',
                      minHeight: count > 0 ? '4px' : '0',
                      transition: 'all 0.3s',
                    }}
                    title={`${count} submission${count !== 1 ? 's' : ''} on ${dayName}`}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>{dayName}</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field Analytics */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem' }}>Field Analytics</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {analytics.fieldAnalytics.map(({ field, answeredCount, skippedCount, skipRate, answerDistribution }) => (
            <div key={field.id} style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: '500' }}>{field.label || 'Untitled Field'}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {answeredCount} answered • {skippedCount} skipped ({Math.round(skipRate)}%)
                </div>
              </div>
              {skipRate > 0 && (
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${skipRate}%`,
                      height: '100%',
                      backgroundColor: '#ef4444',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              )}
              {Object.keys(answerDistribution).length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#6b7280' }}>Answer Distribution:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {Object.entries(answerDistribution)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([answer, count]) => {
                        const percentage = (count / answeredCount) * 100;
                        return (
                          <div key={answer}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                              <span>{answer}</span>
                              <span style={{ fontWeight: '500' }}>{count} ({Math.round(percentage)}%)</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${percentage}%`,
                                  height: '100%',
                                  backgroundColor: '#667eea',
                                  transition: 'width 0.3s',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Webhooks Section Component
interface WebhooksSectionProps {
  formId: string;
}

function WebhooksSection({ formId }: WebhooksSectionProps) {
  const [webhooks, setWebhooks] = useState<Array<{id: string; url: string; events: string[]; is_active: boolean; created_at: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['submission.created']);
  // const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);

  useEffect(() => {
    if (formId) {
      loadWebhooks();
    }
  }, [formId]);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const response = await formsAPI.getWebhooks(formId);
      setWebhooks(response.data);
    } catch (error: any) {
      // Handle 404 gracefully - webhooks endpoint may not be available yet
      if (error?.response?.status === 404) {
        setWebhooks([]);
      } else {
        console.error('Failed to load webhooks:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddWebhook = async () => {
    if (!newWebhookUrl.trim()) {
      alert('Webhook URL is required');
      return;
    }
    try {
      await formsAPI.createWebhook(formId, {
        url: newWebhookUrl.trim(),
        secret: newWebhookSecret.trim() || undefined,
        events: newWebhookEvents,
        is_active: true,
      });
      setNewWebhookUrl('');
      setNewWebhookSecret('');
      setNewWebhookEvents(['submission.created']);
      setShowAddWebhook(false);
      loadWebhooks();
    } catch (error: any) {
      console.error('Failed to create webhook:', error);
      alert(error?.response?.data?.detail || 'Failed to create webhook');
    }
  };

  const handleToggleWebhook = async (webhookId: string, isActive: boolean) => {
    try {
      await formsAPI.updateWebhook(formId, webhookId, { is_active: !isActive });
      loadWebhooks();
    } catch (error: any) {
      console.error('Failed to update webhook:', error);
      alert(error?.response?.data?.detail || 'Failed to update webhook');
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    try {
      await formsAPI.deleteWebhook(formId, webhookId);
      loadWebhooks();
    } catch (error: any) {
      console.error('Failed to delete webhook:', error);
      alert(error?.response?.data?.detail || 'Failed to delete webhook');
    }
  };

  return (
    <div className="card mt-4">
      <div className="flex-between mb-3">
        <h2 style={{ marginTop: 0 }}>Webhooks</h2>
        <button
          onClick={() => setShowAddWebhook(!showAddWebhook)}
          className="btn-primary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
        >
          {showAddWebhook ? 'Cancel' : '+ Add Webhook'}
        </button>
      </div>

      {showAddWebhook && (
        <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>New Webhook</h3>
          <div className="form-group">
            <label htmlFor="webhook-url-input">Webhook URL *</label>
            <input
              id="webhook-url-input"
              type="url"
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="webhook-secret-input">Secret (optional)</label>
            <input
              id="webhook-secret-input"
              type="text"
              value={newWebhookSecret}
              onChange={(e) => setNewWebhookSecret(e.target.value)}
              placeholder="Secret for signature verification"
              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Optional secret for HMAC SHA256 signature verification
            </p>
          </div>
          <div className="form-group">
            <div style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Events</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="webhook-event-submission-created" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  id="webhook-event-submission-created"
                  type="checkbox"
                  checked={newWebhookEvents.includes('submission.created')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNewWebhookEvents([...newWebhookEvents, 'submission.created']);
                    } else {
                      setNewWebhookEvents(newWebhookEvents.filter(e => e !== 'submission.created'));
                    }
                  }}
                />
                <span>Submission Created</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleAddWebhook}
            disabled={!newWebhookUrl.trim()}
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
          >
            Create Webhook
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading webhooks...</p>
      ) : webhooks.length === 0 ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
          No webhooks configured. Add a webhook to receive real-time notifications when forms are submitted.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="card"
              style={{ border: '1px solid #e5e7eb', padding: '1rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className={`badge ${webhook.is_active ? 'badge-sent' : 'badge-draft'}`}>
                      {webhook.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontFamily: 'monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}>
                    {webhook.url}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {webhook.events.map((event, idx) => (
                      <span key={idx} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: '#e5e7eb', borderRadius: '4px' }}>
                        {event}
                      </span>
                    ))}
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                    Created: {new Date(webhook.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleToggleWebhook(webhook.id, webhook.is_active)}
                    className={webhook.is_active ? 'btn-outline' : 'btn-primary'}
                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    {webhook.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeleteWebhook(webhook.id)}
                    className="btn-danger"
                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Form Versions Section Component
interface FormVersionsSectionProps {
  formId: string;
}

function FormVersionsSection({ formId }: FormVersionsSectionProps) {
  const [versions, setVersions] = useState<Array<{id: string; version_number: number; notes?: string; created_at: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [versionNotes, setVersionNotes] = useState('');

  useEffect(() => {
    if (formId) {
      loadVersions();
    }
  }, [formId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await formsAPI.getFormVersions(formId);
      setVersions(response.data);
    } catch (error: any) {
      // Handle 404 gracefully - versions endpoint may not be available yet
      if (error?.response?.status === 404) {
        setVersions([]);
      } else {
        console.error('Failed to load versions:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    try {
      await formsAPI.createFormVersion(formId, versionNotes);
      setVersionNotes('');
      setShowCreateVersion(false);
      loadVersions();
      alert('Version created successfully!');
    } catch (error: any) {
      console.error('Failed to create version:', error);
      alert(error?.response?.data?.detail || 'Failed to create version');
    }
  };

  const handleRestoreVersion = async (versionId: string, versionNumber: number) => {
    if (!confirm(`Are you sure you want to restore this form to version ${versionNumber}? This will overwrite the current form.`)) return;
    try {
      await formsAPI.restoreFormVersion(formId, versionId);
      alert('Form restored successfully!');
      window.location.reload(); // Reload to show restored form
    } catch (error: any) {
      console.error('Failed to restore version:', error);
      alert(error?.response?.data?.detail || 'Failed to restore version');
    }
  };

  return (
    <div className="card mt-4">
      <div className="flex-between mb-3">
        <h2 style={{ marginTop: 0 }}>Version History</h2>
        <button
          onClick={() => setShowCreateVersion(!showCreateVersion)}
          className="btn-primary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
        >
          {showCreateVersion ? 'Cancel' : '+ Create Version'}
        </button>
      </div>

      {showCreateVersion && (
        <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Create New Version</h3>
          <div className="form-group">
            <label htmlFor="version-notes-input">Notes (optional)</label>
            <textarea
              id="version-notes-input"
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              placeholder="e.g., Added new fields, updated validation rules"
              rows={3}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Add notes about what changed in this version
            </p>
          </div>
          <button
            onClick={handleCreateVersion}
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
          >
            Create Version
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
          No versions saved. Create a version to track changes to this form.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {versions.map((version) => (
            <div
              key={version.id}
              className="card"
              style={{ border: '1px solid #e5e7eb', padding: '1rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>Version {version.version_number}</h3>
                    <span className="badge badge-draft" style={{ fontSize: '0.75rem' }}>
                      {new Date(version.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {version.notes && (
                    <p style={{ margin: '0.5rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
                      {version.notes}
                    </p>
                  )}
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    Created: {new Date(version.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRestoreVersion(version.id, version.version_number)}
                  className="btn-primary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FormView;

