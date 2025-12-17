import { useState, useEffect } from 'react';
import { formsAPI, foldersAPI } from '../api';

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

interface TypeformImportModalProps {
  folderId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

function TypeformImportModal({ folderId, isOpen, onClose, onImportComplete }: TypeformImportModalProps) {
  const [workspaces, setWorkspaces] = useState<TypeformWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [forms, setForms] = useState<TypeformForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importName, setImportName] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadWorkspaces();
      // Reset state when modal opens
      setError(null);
      setImporting(null);
      setImportName({});
      setSelectedWorkspaceId('');
      setForms([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && selectedWorkspaceId) {
      loadForms(selectedWorkspaceId);
    } else if (isOpen && workspaces.length > 0 && !selectedWorkspaceId) {
      // Load all forms if no workspace selected
      loadForms();
    }
  }, [selectedWorkspaceId, isOpen, workspaces.length]);

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    setError(null);
    try {
      const response = await formsAPI.listTypeformWorkspaces();
      setWorkspaces(response.data || []);
      // Auto-load forms when workspaces are loaded
      if (response.data && response.data.length > 0) {
        loadForms();
      }
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

  const handleImportAndAssign = async (form: TypeformForm) => {
    setImporting(form.id);
    setError(null);
    try {
      const name = importName[form.id] || form.title;
      const workspaceId = selectedWorkspaceId || form.workspace?.href?.split('/').pop();
      
      // Step 1: Import the form
      const importResponse = await formsAPI.importTypeformForm(form.id, name, workspaceId);
      const importedFormId = importResponse.data.id;
      
      // Step 2: Automatically assign to folder
      await foldersAPI.assignForm(folderId, importedFormId);
      
      // Success - close modal and refresh folder content
      setImporting(null);
      onImportComplete();
      onClose();
    } catch (err: any) {
      console.error('Failed to import and assign form:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to import and assign form.');
      setImporting(null);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Import Typeform Form</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem 0.5rem',
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              borderColor: '#ef4444',
              border: '1px solid',
              borderRadius: '0.375rem',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Workspace Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Select Workspace</h3>
          {loadingWorkspaces ? (
            <p>Loading workspaces...</p>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  minWidth: '200px',
                }}
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
        <div>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Available Forms</h3>
          {loading ? (
            <p>Loading forms...</p>
          ) : forms.length === 0 ? (
            <p style={{ color: '#6b7280' }}>
              {selectedWorkspaceId ? 'No forms found in this workspace.' : 'No forms found. Make sure you have forms in your Typeform account.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
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
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>{form.title}</h4>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                      ID: {form.id}
                    </p>
                    {form.workspace?.name && (
                      <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
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
                        minWidth: '200px',
                      }}
                    />
                    <button
                      onClick={() => handleImportAndAssign(form)}
                      disabled={importing === form.id}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                    >
                      {importing === form.id ? 'Importing...' : 'Import & Assign'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TypeformImportModal;

