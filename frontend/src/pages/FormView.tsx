import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formsAPI } from '../api';

function FormView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadForm(id);
    }
  }, [id]);

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

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <div>
          <button onClick={() => navigate('/forms')} className="btn-outline" style={{ marginBottom: '1rem' }}>
            ← Back to Forms
          </button>
          <h1>{form?.name || 'Form Details'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link to={`/forms/${id}/edit`} className="btn-primary">
            Edit
          </Link>
          <button onClick={handleDelete} className="btn-danger">
            Delete
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <h2 style={{ color: '#374151', marginBottom: '1rem' }}>Form View</h2>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>
            The form view is coming soon! You'll be able to see form details, submissions, and manage form settings here.
          </p>
          
          {form && (
            <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
              <div className="form-group">
                <label>Form Name</label>
                <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                  {form.name || 'Untitled Form'}
                </p>
              </div>
              
              {form.created_at && (
                <div className="form-group">
                  <label>Created</label>
                  <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    {new Date(form.created_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FormView;

