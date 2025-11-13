import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { foldersAPI, clientsAPI, type FolderContent, type FolderCreate, type Client } from '../api';
import { useAuth } from '../contexts/AuthContext';
import FolderContentManager from '../components/FolderContentManager';
import './FolderView.css';

const FolderView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [content, setContent] = useState<FolderContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [formData, setFormData] = useState<FolderCreate>({
    name: '',
    description: '',
    client_id: '',
    quote_id: '',
    status: 'active',
  });
  const [saving, setSaving] = useState(false);

  const isNewFolder = id === 'new';

  useEffect(() => {
    if (isNewFolder) {
      loadClients();
      setLoading(false);
    } else if (id) {
      loadFolderContent();
    }
  }, [id, isNewFolder]);

  const loadClients = async () => {
    try {
      const response = await clientsAPI.getAll();
      setClients(response.data);
    } catch (err: any) {
      console.error('Failed to load clients:', err);
    }
  };

  const loadFolderContent = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await foldersAPI.getContent(id!);
      setContent(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load folder content');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Folder name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const folderData: FolderCreate = {
        name: formData.name.trim(),
        description: formData.description || undefined,
        client_id: formData.client_id || undefined,
        quote_id: formData.quote_id || undefined,
        status: formData.status || 'active',
      };
      const response = await foldersAPI.create(folderData);
      navigate(`/folders/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create folder');
    } finally {
      setSaving(false);
    }
  };

  const handleContentChange = () => {
    loadFolderContent();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isNewFolder) {
    return (
      <div className="folder-view-container">
        <div className="folder-header">
          <div className="folder-header-top">
            <button onClick={() => navigate('/folders')} className="btn-back">
              ← Back
            </button>
            <h1>Create New Folder</h1>
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleCreateFolder} className="folder-form">
          <div className="form-group">
            <label htmlFor="name">Folder Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Enter folder name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter folder description (optional)"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="client_id">Client</label>
            <select
              id="client_id"
              name="client_id"
              value={formData.client_id || ''}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value || undefined })}
            >
              <option value="">None</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name || client.email}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={formData.status || 'active'}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/folders')}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !formData.name.trim()}
            >
              {saving ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="folder-view-container">
        <div className="loading">Loading folder...</div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="folder-view-container">
        <div className="error">{error || 'Folder not found'}</div>
        <button onClick={() => navigate('/folders')} className="btn-secondary">
          Back to Folders
        </button>
      </div>
    );
  }

  const { folder, quote, files, forms, esignatures } = content;

  return (
    <div className="folder-view-container">
      <div className="folder-header">
        <div className="folder-header-top">
          <button onClick={() => navigate('/folders')} className="btn-back">
            ← Back
          </button>
          <h1>{folder.name}</h1>
        </div>
        {folder.description && (
          <p className="folder-description">{folder.description}</p>
        )}
        <div className="folder-meta-header">
          <span className={`status-badge status-${folder.status}`}>
            {folder.status.charAt(0).toUpperCase() + folder.status.slice(1)}
          </span>
          <span className="folder-date">Created: {formatDate(folder.created_at)}</span>
        </div>
      </div>

      <div className="folder-content">
        {/* Quote Section */}
        {quote && (
          <section className="content-section">
            <div className="section-header">
              <h2>Quote</h2>
              <button
                onClick={() => navigate(`/quotes/${quote.id}`)}
                className="btn-primary btn-sm"
              >
                View Quote
              </button>
            </div>
            <div className="quote-card">
              <h3>{quote.title || quote.quote_number}</h3>
              <div className="quote-meta">
                <span>Quote #: {quote.quote_number}</span>
                <span>Status: {quote.status}</span>
                <span>Total: ${parseFloat(quote.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Files Section */}
        <section className="content-section">
          <div className="section-header">
            <h2>Files ({files.length})</h2>
            {role === 'admin' && (
              <button
                onClick={() => navigate(`/files?folder_id=${folder.id}`)}
                className="btn-primary btn-sm"
              >
                Add Files
              </button>
            )}
          </div>
          {files.length === 0 ? (
            <div className="empty-content">
              <p>No files in this folder</p>
            </div>
          ) : (
            <div className="files-grid">
              {files.map((file: any) => (
                <div
                  key={file.id}
                  className="content-card"
                  onClick={() => navigate(`/files/${file.id}`)}
                >
                  <div className="content-icon" style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--color-text-muted, #6b7280)' }}>File</div>
                  <h4>{file.name}</h4>
                  <p className="content-meta">
                    {file.file_type} • {(file.file_size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Forms Section */}
        <section className="content-section">
          <div className="section-header">
            <h2>Forms ({forms.length})</h2>
            {role === 'admin' && (
              <button
                onClick={() => navigate(`/forms?folder_id=${folder.id}`)}
                className="btn-primary btn-sm"
              >
                Add Forms
              </button>
            )}
          </div>
          {forms.length === 0 ? (
            <div className="empty-content">
              <p>No forms in this folder</p>
            </div>
          ) : (
            <div className="forms-grid">
              {forms.map((form: any) => (
                <div
                  key={form.id}
                  className="content-card"
                  onClick={() => navigate(`/forms/${form.id}`)}
                >
                  <div className="content-icon" style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--color-text-muted, #6b7280)' }}>Form</div>
                  <h4>{form.name}</h4>
                  <p className="content-meta">
                    {form.status || 'Active'} • {form.submissions_count || 0} submissions
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* E-Signatures Section */}
        <section className="content-section">
          <div className="section-header">
            <h2>E-Signature Documents ({esignatures.length})</h2>
            {role === 'admin' && (
              <button
                onClick={() => navigate(`/esignature?folder_id=${folder.id}`)}
                className="btn-primary btn-sm"
              >
                Add Documents
              </button>
            )}
          </div>
          {esignatures.length === 0 ? (
            <div className="empty-content">
              <p>No e-signature documents in this folder</p>
            </div>
          ) : (
            <div className="esignatures-grid">
              {esignatures.map((esig: any) => (
                <div
                  key={esig.id}
                  className="content-card"
                  onClick={() => navigate(`/esignature/${esig.id}`)}
                >
                  <div className="content-icon" style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--color-text-muted, #6b7280)' }}>E-Signature</div>
                  <h4>{esig.name}</h4>
                  <p className="content-meta">
                    {esig.status} • {esig.signature_mode}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Content Manager (Admin Only) */}
        {role === 'admin' && (
          <section className="content-section">
            <FolderContentManager
              folderId={folder.id}
              onContentAdded={handleContentChange}
              onContentRemoved={handleContentChange}
            />
          </section>
        )}
      </div>
    </div>
  );
};

export default FolderView;

