import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formsAPI } from '../api';

function FormsList() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadForms();
  }, []);

  const loadForms = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await formsAPI.getAll();
      setForms(response.data);
    } catch (error: any) {
      console.error('Failed to load forms:', error);
      // For now, just set empty array since backend might not be ready
      setForms([]);
      // Don't show error for now since this is a placeholder
      // setError(error?.response?.data?.detail || error?.message || 'Failed to load forms.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && forms.length === 0) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>Forms</h1>
        <button onClick={() => navigate('/forms/new')} className="btn-primary">
          Create New Form
        </button>
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
            <h2 style={{ color: '#374151', marginBottom: '1rem' }}>Forms Section</h2>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              This section is coming soon! You'll be able to create and manage forms for your customers here.
            </p>
            <button onClick={() => navigate('/forms/new')} className="btn-primary">
              Create Your First Form
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Form Name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  <td>
                    <Link to={`/forms/${form.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                      {form.name || 'Untitled Form'}
                    </Link>
                  </td>
                  <td>
                    <span className="badge badge-draft">Draft</span>
                  </td>
                  <td>{new Date(form.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/forms/${form.id}`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                      View
                    </Link>
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

