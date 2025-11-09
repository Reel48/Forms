import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formsAPI } from '../api';

function FormBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  
  const [formName, setFormName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode && id) {
      loadForm(id);
    }
  }, [isEditMode, id]);

  const loadForm = async (formId: string) => {
    setLoading(true);
    try {
      const response = await formsAPI.getById(formId);
      // Set form data when available
      setFormName(response.data.name || '');
    } catch (error: any) {
      console.error('Failed to load form:', error);
      setError('Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isEditMode && id) {
        await formsAPI.update(id, { name: formName });
      } else {
        await formsAPI.create({ name: formName });
      }
      navigate('/forms');
    } catch (error: any) {
      console.error('Failed to save form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to save form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEditMode) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>{isEditMode ? 'Edit Form' : 'Create New Form'}</h1>
        <button onClick={() => navigate('/forms')} className="btn-secondary">
          Cancel
        </button>
      </div>

      {error && (
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
        </div>
      )}

      <div className="card">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <h2 style={{ color: '#374151', marginBottom: '1rem' }}>Form Builder</h2>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>
            The form builder is coming soon! You'll be able to create custom forms with various field types for your customers to fill out.
          </p>
          
          <form onSubmit={handleSubmit} style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div className="form-group">
              <label htmlFor="form-name">Form Name</label>
              <input
                id="form-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Enter form name"
                required
              />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => navigate('/forms')}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !formName.trim()}
              >
                {loading ? 'Saving...' : isEditMode ? 'Update Form' : 'Create Form'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default FormBuilder;

