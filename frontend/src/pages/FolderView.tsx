import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';
import { foldersAPI, clientsAPI, filesAPI, type FolderContent, type FolderCreate, type Client } from '../api';
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleStatusChange = async (newStatus: string) => {
    if (!id || !content?.folder) return;
    
    try {
      await foldersAPI.update(id, { status: newStatus });
      // Reload folder content to get updated status
      await loadFolderContent();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update folder status');
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id || id === 'new') return;

    setUploading(true);
    setError(null);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        await filesAPI.upload(file, {
          folder_id: id,
          // is_reusable will be automatically set to false by backend when folder_id is provided
        });
      });

      await Promise.all(uploadPromises);
      await loadFolderContent();
      alert('Files uploaded successfully!');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to upload files';
      setError(errorMessage);
      alert(`Upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This action cannot be undone.`)) return;

    try {
      await filesAPI.delete(fileId);
      await loadFolderContent();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete file');
    }
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
          <button onClick={() => navigate(role === 'admin' ? '/folders' : '/')} className="btn-back">
            ← {role === 'admin' ? 'Back' : 'Back to Dashboard'}
          </button>
          <h1>{folder.name}</h1>
        </div>
        {folder.description && (
          <p className="folder-description">{folder.description}</p>
        )}
        <div className="folder-meta-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`status-badge status-${folder.status}`}>
              {folder.status.charAt(0).toUpperCase() + folder.status.slice(1)}
            </span>
            {role === 'admin' && (
              <select
                value={folder.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  fontSize: '0.875rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>
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
            <div 
              className="quote-card"
              style={{
                ...(quote.payment_status === 'paid' ? {
                  backgroundColor: '#d1fae5',
                  borderColor: '#065f46',
                  borderWidth: '2px',
                  borderStyle: 'solid'
                } : {})
              }}
            >
              <h3>{quote.title || quote.quote_number}</h3>
              <div className="quote-meta">
                <span>Quote #: {quote.quote_number}</span>
                <span>Status: {quote.status}</span>
                <span>Total: ${parseFloat(quote.total || 0).toFixed(2)}</span>
                {quote.payment_status === 'paid' && (
                  <span style={{ 
                    color: '#065f46', 
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    ✓ Paid
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Files Section - Separate from Tasks */}
        <section className="content-section">
          <div className="section-header">
            <h2>Files ({files.length})</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                disabled={uploading}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary btn-sm"
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Files'}
              </button>
            </div>
          </div>
          {files.length === 0 ? (
            <div className="empty-content">
              <p>No files in this folder. Upload files to get started.</p>
            </div>
          ) : (
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file: any) => (
                    <tr
                      key={file.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/files/${file.id}`)}
                    >
                      <td>
                        <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{file.name}</strong>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>{file.file_type}</span>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {(file.file_size / 1024).toFixed(1)} KB
                        </span>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {formatDate(file.created_at)}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/files/${file.id}`);
                            }}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            View
                          </button>
                          {role === 'admin' && (
                            <button
                              className="btn-danger btn-sm"
                              onClick={async (e) => {
                                e.stopPropagation();
                                handleDeleteFile(file.id, file.name);
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Tasks Section (Forms and E-Signatures only) */}
        <section className="content-section">
          <div className="section-header">
            <h2>Tasks ({forms.length + esignatures.length})</h2>
            {role === 'admin' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => navigate(`/forms?folder_id=${folder.id}`)}
                  className="btn-primary btn-sm"
                >
                  Add Forms
                </button>
                <button
                  onClick={() => navigate(`/esignature?folder_id=${folder.id}`)}
                  className="btn-primary btn-sm"
                >
                  Add Documents
                </button>
              </div>
            )}
          </div>
          {forms.length === 0 && esignatures.length === 0 ? (
            <div className="empty-content">
              <p>No tasks in this folder</p>
            </div>
          ) : (
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Forms */}
                  {forms.map((form: any) => (
                    <tr
                      key={`form-${form.id}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/forms/${form.id}`)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: form.is_completed ? '#10b981' : '#e5e7eb',
                            border: '2px solid',
                            borderColor: form.is_completed ? '#10b981' : '#d1d5db',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'default'
                          }}
                          title={form.is_completed ? 'Completed' : 'Not completed'}
                        >
                          {form.is_completed && (
                            <FaCheck style={{ color: 'white', fontSize: '12px' }} />
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.25rem 0.5rem', 
                          backgroundColor: '#fef3c7', 
                          color: '#92400e', 
                          borderRadius: '0.25rem',
                          fontWeight: 500
                        }}>
                          Form
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{form.name}</strong>
                          {form.is_template && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.125rem 0.375rem', 
                              backgroundColor: '#dbeafe', 
                              color: '#1e40af', 
                              borderRadius: '0.25rem',
                              fontWeight: 500
                            }}>
                              Template
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {form.status || 'Active'} • {form.submissions_count || 0} {form.submissions_count === 1 ? 'submission' : 'submissions'}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {role === 'admin' && (
                          <button
                            className="btn-danger btn-sm"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Remove "${form.name}" from this folder?`)) return;
                              try {
                                await foldersAPI.removeForm(folder.id, form.id);
                                loadFolderContent();
                              } catch (err: any) {
                                alert(err.response?.data?.detail || 'Failed to remove form from folder');
                              }
                            }}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  
                  {/* E-Signatures */}
                  {esignatures.map((esig: any) => (
                    <tr
                      key={`esignature-${esig.id}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/esignature/${esig.id}`)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: esig.is_completed ? '#10b981' : '#e5e7eb',
                            border: '2px solid',
                            borderColor: esig.is_completed ? '#10b981' : '#d1d5db',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'default'
                          }}
                          title={esig.is_completed ? 'Completed' : 'Not completed'}
                        >
                          {esig.is_completed && (
                            <FaCheck style={{ color: 'white', fontSize: '12px' }} />
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.25rem 0.5rem', 
                          backgroundColor: '#fce7f3', 
                          color: '#9f1239', 
                          borderRadius: '0.25rem',
                          fontWeight: 500
                        }}>
                          E-Signature
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{esig.name}</strong>
                          {esig.is_template && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.125rem 0.375rem', 
                              backgroundColor: '#dbeafe', 
                              color: '#1e40af', 
                              borderRadius: '0.25rem',
                              fontWeight: 500
                            }}>
                              Template
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {esig.status} • {esig.signature_mode}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {esig.is_completed && esig.signed_file_id && (
                            <button
                              className="btn-primary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/files/${esig.signed_file_id}`);
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              View
                            </button>
                          )}
                          {role === 'admin' && (
                            <button
                              className="btn-danger btn-sm"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Remove "${esig.name}" from this folder?`)) return;
                                try {
                                  await foldersAPI.removeESignature(folder.id, esig.id);
                                  loadFolderContent();
                                } catch (err: any) {
                                  alert(err.response?.data?.detail || 'Failed to remove e-signature from folder');
                                }
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

