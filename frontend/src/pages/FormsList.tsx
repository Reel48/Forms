import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formsAPI } from '../api';
import type { Form } from '../api';
import { useAuth } from '../contexts/AuthContext';

function FormsList() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { role } = useAuth();

  useEffect(() => {
    loadForms();
  }, [statusFilter]);

  const loadForms = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: string } = {};
      if (statusFilter) {
        filters.status = statusFilter;
      }
      const response = await formsAPI.getAll(filters);
      setForms(response.data);
    } catch (error: any) {
      console.error('Failed to load forms:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load forms. Please try again.');
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'published':
        return 'badge-sent';
      case 'archived':
        return 'badge-declined';
      default:
        return 'badge-draft';
    }
  };

  const handleDelete = async (formId: string, formName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${formName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await formsAPI.delete(formId);
      loadForms(); // Reload the list
    } catch (error: any) {
      alert(error?.response?.data?.detail || error?.message || 'Failed to delete form. Please try again.');
    }
  };

  if (loading && forms.length === 0) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>Forms</h1>
        {role === 'admin' && (
          <button onClick={() => navigate('/forms/new')} className="btn-primary">
            Create New Form
          </button>
        )}
      </div>

      {/* Status Filter */}
      <div className="card mb-4">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label htmlFor="status-filter" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="btn-secondary"
              style={{ whiteSpace: 'nowrap' }}
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>
            {error}
            <button
              onClick={loadForms}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Retry
            </button>
          </p>
        </div>
      )}

      {forms.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ color: '#374151', marginBottom: '1rem' }}>
              {statusFilter ? 'No forms found' : 'No forms yet'}
            </h2>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              {statusFilter
                ? 'Try adjusting your filters or create a new form.'
                : role === 'admin'
                ? 'Create your first form to get started!'
                : 'No forms have been assigned to you yet.'}
            </p>
            {role === 'admin' && (
              <button onClick={() => navigate('/forms/new')} className="btn-primary">
                Create Your First Form
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          {loading && forms.length > 0 && (
            <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
              Updating...
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Form Name</th>
                <th>Description</th>
                <th>Fields</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  <td>
                    <Link to={`/forms/${form.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '500' }}>
                      {form.name || 'Untitled Form'}
                    </Link>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {form.description || '-'}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted">
                      {form.fields?.length || 0} {form.fields?.length === 1 ? 'field' : 'fields'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(form.status)}`}>
                      {formatStatus(form.status)}
                    </span>
                  </td>
                  <td>{formatDate(form.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link to={`/forms/${form.id}`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        View
                      </Link>
                      {role === 'admin' && (
                        <>
                          <Link to={`/forms/${form.id}/edit`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(form.id, form.name)}
                            className="btn-danger"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {form.public_url_slug && form.status === 'published' && (
                        <a
                          href={`/public/form/${form.public_url_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}
                          title="Open public form"
                        >
                          🔗
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default FormsList;

