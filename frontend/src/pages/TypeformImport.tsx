import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface TypeformForm {
  id: string;
  title: string;
  workspace?: {
    href: string;
    name?: string;
  };
  [key: string]: any;
}

interface TypeformWorkspace {
  id: string;
  name: string;
  [key: string]: any;
}

function TypeformImport() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [workspaces, setWorkspaces] = useState<TypeformWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [forms, setForms] = useState<TypeformForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importName, setImportName] = useState<Record<string, string>>({});

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/forms');
      return;
    }
    loadWorkspaces();
  }, [role, navigate]);

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    setError(null);
    try {
      const response = await formsAPI.listTypeformWorkspaces();
      setWorkspaces(response.data || []);
    } catch (err: any) {
      console.error('Failed to load workspaces:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load Typeform workspaces. Make sure TYPEFORM_PERSONAL_TOKEN is configured.');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const loadForms = async (workspaceId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await formsAPI.listTypeformForms(workspaceId);
      setForms(response.data || []);
    } catch (err: any) {
      console.error('Failed to load forms:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load Typeform forms.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorkspaceId) {
      loadForms(selectedWorkspaceId);
    } else if (workspaces.length > 0) {
      // Load all forms if no workspace selected
      loadForms();
    }
  }, [selectedWorkspaceId]);

  const handleImport = async (form: TypeformForm) => {
    setImporting(form.id);
    setError(null);
    try {
      const name = importName[form.id] || form.title;
      const workspaceId = selectedWorkspaceId || form.workspace?.href?.split('/').pop();
      
      await formsAPI.importTypeformForm(form.id, name, workspaceId);
      
      // Success - navigate back to forms list
      navigate('/forms');
    } catch (err: any) {
      console.error('Failed to import form:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to import form.');
      setImporting(null);
    }
  };

  if (role !== 'admin') {
    return null;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <div>
          <h1>Import from Typeform</h1>
          <p className="page-subtitle" style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Import forms created in Typeform into your system
          </p>
        </div>
        <button onClick={() => navigate('/forms')} className="btn-secondary">
          Back to Forms
        </button>
      </div>

      {error && (
        <div className="card mb-4" style={{ backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', padding: '1rem' }}>
          <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Workspace Selector */}
      <div className="card mb-4">
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Select Workspace</h2>
        {loadingWorkspaces ? (
          <p>Loading workspaces...</p>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', minWidth: '200px' }}
            >
              <option value="">All Workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name || workspace.id}
                </option>
              ))}
            </select>
            <button onClick={loadWorkspaces} className="btn-outline" style={{ padding: '0.75rem 1rem' }}>
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Forms List */}
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Available Forms</h2>
        {loading ? (
          <p>Loading forms...</p>
        ) : forms.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {selectedWorkspaceId ? 'No forms found in this workspace.' : 'No forms found. Make sure you have forms in your Typeform account.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {forms.map((form) => (
              <div
                key={form.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{form.title}</h3>
                  <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    ID: {form.id}
                  </p>
                  {form.workspace?.name && (
                    <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                      Workspace: {form.workspace.name}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Custom name (optional)"
                    value={importName[form.id] || ''}
                    onChange={(e) => setImportName({ ...importName, [form.id]: e.target.value })}
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      minWidth: '200px'
                    }}
                  />
                  <button
                    onClick={() => handleImport(form)}
                    disabled={importing === form.id}
                    className="btn-primary"
                    style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                  >
                    {importing === form.id ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TypeformImport;

