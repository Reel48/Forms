import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formsAPI } from '../api';
import type { Form } from '../api';
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
  const { role } = useAuth();

  useEffect(() => {
    if (id) {
      loadForm(id);
      loadAssignments();
    }
  }, [id]);

  const loadAssignments = async () => {
    try {
      const response = await api.get(`/api/forms/${id}/assignments`);
      setAssignments(response.data || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const handleAssign = async (userIds: string[]) => {
    try {
      await api.post(`/api/forms/${id}/assign`, { user_ids: userIds });
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

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  if (error) {
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

  if (!form) {
    return (
      <div className="container">
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>Form not found</p>
          <button onClick={() => navigate('/forms')} className="btn-secondary" style={{ marginTop: '1rem' }}>
            Back to Forms
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <div>
          <button onClick={() => navigate('/forms')} className="btn-outline" style={{ marginBottom: '1rem' }}>
            ← Back to Forms
          </button>
          <h1>{form.name || 'Form Details'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {role === 'admin' && (
            <button onClick={() => setShowAssignmentModal(true)} className="btn-primary">
              Assign to Customers
            </button>
          )}
          {role === 'admin' && (
            <button onClick={() => navigate(`/forms/${id}/edit`)} className="btn-primary">
            Edit
          </button>
          <button onClick={handleDelete} className="btn-danger">
            Delete
          </button>
        </div>
      </div>

      {/* Form Details */}
      <div className="card mb-4">
        <h2 style={{ marginTop: 0 }}>Form Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Form Name
            </label>
            <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {form.name || 'Untitled Form'}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Status
            </label>
            <p style={{ margin: 0 }}>
              <span className={`badge ${form.status === 'published' ? 'badge-sent' : form.status === 'archived' ? 'badge-declined' : 'badge-draft'}`}>
                {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
              </span>
            </p>
          </div>
          {form.description && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                Description
              </label>
              <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                {form.description}
              </p>
            </div>
          )}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Created
            </label>
            <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {new Date(form.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
              Last Updated
            </label>
            <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {new Date(form.updated_at).toLocaleString()}
            </p>
          </div>
          {form.public_url_slug && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                Public Form URL
              </label>
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
                  📋 Copy
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
                  🔗 Open
                </a>
              </div>
              {form.status !== 'published' && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#dc2626' }}>
                  ⚠️ Form must be published for the public URL to work
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
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#6b7280' }}>
                          Options:
                        </label>
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
    </div>
  );
}

export default FormView;

