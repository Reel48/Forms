import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCheck, FaChevronRight, FaFolderOpen } from 'react-icons/fa';
import { foldersAPI, clientsAPI, filesAPI, type FolderContent, type FolderCreate, type Client, type FolderEvent, type FolderNote } from '../api';
import { useAuth } from '../contexts/AuthContext';
import FolderContentManager from '../components/FolderContentManager';
import TypeformImportModal from '../components/TypeformImportModal';
import ShipmentTracker from '../components/ShipmentTracker';
import AddShipmentModal from '../components/AddShipmentModal';
import OrderStepper, { type StepperStep } from '../components/OrderStepper';
import EmptyState from '../components/EmptyState';
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
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renamingFileName, setRenamingFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [events, setEvents] = useState<FolderEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [latestNote, setLatestNote] = useState<FolderNote | null>(null);
  const [notesHistory, setNotesHistory] = useState<FolderNote[]>([]);
  const [notesHistoryOpen, setNotesHistoryOpen] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [showTypeformImportModal, setShowTypeformImportModal] = useState(false);

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
      // Load activity feed in parallel (best-effort)
      loadFolderEvents();
      loadLatestNote();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load folder content');
    } finally {
      setLoading(false);
    }
  };

  const loadLatestNote = async () => {
    if (!id || id === 'new') return;
    try {
      setNotesLoading(true);
      const res = await foldersAPI.getNotes(id, { limit: 1, offset: 0 });
      const note = (res.data.notes || [])[0] || null;
      setLatestNote(note);
    } catch (e) {
      setLatestNote(null);
    } finally {
      setNotesLoading(false);
    }
  };

  const openNotesHistory = async () => {
    if (!id || id === 'new') return;
    setNotesHistoryOpen(true);
    try {
      const res = await foldersAPI.getNotes(id, { limit: 50, offset: 0 });
      setNotesHistory(res.data.notes || []);
    } catch (e) {
      setNotesHistory([]);
    }
  };

  const markLatestNoteRead = async () => {
    if (!id || id === 'new' || !latestNote?.id) return;
    if (latestNote.is_read) return;
    try {
      await foldersAPI.markNoteRead(id, latestNote.id);
      setLatestNote({ ...latestNote, is_read: true });
      setNotesHistory((prev) => prev.map((n) => (n.id === latestNote.id ? { ...n, is_read: true } : n)));
    } catch (e) {
      // best-effort
    }
  };

  const createNote = async () => {
    if (!id || id === 'new') return;
    const title = newNoteTitle.trim();
    const body = newNoteBody.trim();
    if (!title || !body) return;
    try {
      setCreatingNote(true);
      await foldersAPI.createNote(id, title, body);
      setNewNoteTitle('');
      setNewNoteBody('');
      await loadLatestNote();
      if (notesHistoryOpen) {
        await openNotesHistory();
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create note');
    } finally {
      setCreatingNote(false);
    }
  };

  const loadFolderEvents = async () => {
    if (!id || id === 'new') return;
    try {
      setEventsLoading(true);
      const res = await foldersAPI.getEvents(id, { limit: 50 });
      setEvents(res.data.events || []);
    } catch (e) {
      // Best-effort: don’t block the page if events fail
      setEvents([]);
    } finally {
      setEventsLoading(false);
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
        const response = await filesAPI.upload(file, {
          folder_id: id,
          // is_reusable will be automatically set to false by backend when folder_id is provided
        });
        console.log('File uploaded:', response.data);
        return response.data;
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      console.log('All files uploaded:', uploadedFiles);
      
      // Small delay to ensure database consistency
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reload folder content to show the new files
      await loadFolderContent();
      
      alert(`Successfully uploaded ${uploadedFiles.length} file(s)!`);
    } catch (err: any) {
      console.error('Upload error:', err);
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

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!newName.trim()) {
      alert('File name cannot be empty');
      return;
    }

    try {
      await filesAPI.update(fileId, { name: newName.trim() });
      // Reload folder content to get updated file name
      await loadFolderContent();
      setRenamingFileId(null);
      setRenamingFileName('');
    } catch (error: any) {
      console.error('Rename error:', error);
      alert(error?.response?.data?.detail || 'Failed to rename file. Please try again.');
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

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
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

  const { folder, quote, files = [], forms = [], esignatures = [], summary } = content || {};
  const actionRequired = summary?.next_step_owner === 'customer';
  const etaDate = summary?.shipping?.actual_delivery_date || summary?.shipping?.estimated_delivery_date;
  const openShipments = summary?.stage === 'shipped' || summary?.stage === 'delivered';
  const tasks = summary?.tasks || [];
  const hasUnreadNote = role !== 'admin' && !!latestNote && latestNote.is_read === false;
  
  // Get primary action task (payment) and secondary tasks
  const primaryTask = tasks.find((t: any) => t.kind === 'quote' && t.status === 'incomplete');
  const secondaryTasks = tasks.filter((t: any) => t.id !== primaryTask?.id);
  const completedTasks = tasks.filter((t: any) => t.status === 'complete');
  
  // Check if payment is required (locks other tasks)
  const paymentRequired = primaryTask && primaryTask.status === 'incomplete';
  
  // Get stepper steps from summary
  const stepperSteps: StepperStep[] = (summary?.stepper_steps || []) as StepperStep[];

  return (
    <div className="folder-view-container">
      <div className="folder-header">
        {/* Breadcrumbs */}
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <button 
            onClick={() => navigate(role === 'admin' ? '/folders' : '/')} 
            className="breadcrumb-link"
          >
            {role === 'admin' ? 'Folders' : 'Dashboard'}
          </button>
          <FaChevronRight className="breadcrumb-separator" />
          <span className="breadcrumb-current">{folder.name}</span>
        </nav>
        
        <div className="folder-header-top">
          <h1>{folder.name}</h1>
        </div>
        {folder.description && (
          <p className="folder-description">{folder.description}</p>
        )}

        {/* Shipping summary (customer only; hidden until a shipment exists) */}
        {role !== 'admin' && summary?.shipping?.has_shipment && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              border: '1px solid var(--color-border, #e5e7eb)',
              borderRadius: '10px',
              background: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Shipping</div>
              <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                Status: {summary.shipping.status || '—'}
                {summary.shipping.tracking_number ? ` • Tracking: ${summary.shipping.tracking_number}` : ''}
                {etaDate ? ` • ${summary.shipping.actual_delivery_date ? 'Delivered' : 'ETA'}: ${formatDate(etaDate)}` : ''}
              </div>
            </div>
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                const el = document.getElementById('shipment-tracking');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              View tracking
            </button>
          </div>
        )}

        {/* Status + Notes stack (explicit sizing so it renders correctly before CSS loads) */}
        {(summary || (latestNote && hasUnreadNote)) && (
          <div
            style={{
              marginTop: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              width: '100%',
              minWidth: 0,
            }}
          >
            {/* Status center (customer clarity) */}
            {summary && (
              <div
                style={{
                  minWidth: 0,
                  width: '100%',
                  padding: '1rem',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '10px',
                  background: 'white',
                }}
              >
                {/* Action Required Badge */}
                {actionRequired && (
                  <div style={{ marginBottom: '1rem' }}>
                    <span className="action-required-badge">
                      Action Required
                    </span>
                  </div>
                )}

                {/* Stepper UI */}
                {stepperSteps.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <OrderStepper steps={stepperSteps} />
                  </div>
                )}

                {summary.next_step && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Next step</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{summary.next_step}</div>
                  </div>
                )}
              </div>
            )}

            {/* Notes (customer: under progress, above Tasks; only moves after acknowledge) */}
            {latestNote && hasUnreadNote && (
              <div
                style={{
                  minWidth: 0,
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '10px',
                  background: 'white',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800 }}>{latestNote.title || 'Update'}</div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#ecfdf5', color: '#166534' }}>
                        New
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {formatDateTime(latestNote.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-secondary btn-sm" onClick={() => openNotesHistory()}>
                      View history
                    </button>
                    <button
                      className="btn-primary btn-sm"
                      onClick={async () => {
                        await markLatestNoteRead();
                      }}
                      disabled={notesLoading}
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {latestNote.body}
                </div>
              </div>
            )}
          </div>
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
        {role !== 'admin' ? (
          <>
            {/* Primary Action Hero Card */}
            {primaryTask && (
              <section className="content-section hero-action-card">
                <div className="hero-action-content">
                  <h2 className="hero-action-title">Your quote is ready for review.</h2>
                  <p className="hero-action-subtitle">
                    Please finalize payment to move your order to production.
                  </p>
                  <button
                    className="btn-hero-primary"
                    onClick={() => {
                      const action = (primaryTask.deeplink || '') as string;
                      if (action) {
                        navigate(action);
                      }
                    }}
                  >
                    Review & Pay Quote
                  </button>
                </div>
              </section>
            )}

            {/* Secondary Tasks */}
            {secondaryTasks.length > 0 && (
              <section className="content-section">
                <div className="section-header">
                  <h2>Next Up</h2>
                </div>
                <div className="card" style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {secondaryTasks
                      .filter((t: any) => t.status === 'incomplete')
                      .map((t: any) => {
                        const isLocked = paymentRequired && t.kind !== 'quote';
                        const action = (t.deeplink || '') as string;
                        return (
                          <div
                            key={t.id}
                            className={`task-item ${isLocked ? 'task-locked' : ''}`}
                          >
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                              <div className="task-checkbox pending">
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700 }}>{t.title}</div>
                                {t.description && (
                                  <div className="text-muted" style={{ fontSize: '0.875rem' }}>{t.description}</div>
                                )}
                                {isLocked && (
                                  <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                    Complete payment to unlock
                                  </div>
                                )}
                              </div>
                            </div>
                            {action && !isLocked && (
                              <button
                                className="btn-secondary-outline btn-sm"
                                onClick={() => {
                                  if (action.includes('#project-files')) {
                                    const el = document.getElementById('project-files');
                                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    return;
                                  }
                                  navigate(action);
                                }}
                              >
                                {t.kind === 'file_review' ? 'Review' : t.kind === 'esignature' ? 'Sign' : 'Open'}
                              </button>
                            )}
                            {isLocked && (
                              <button className="btn-secondary-outline btn-sm" disabled>
                                Locked
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </section>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <section className="content-section">
                <div className="section-header">
                  <h2>Completed</h2>
                </div>
                <div className="card" style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {completedTasks.map((t: any) => (
                      <div key={t.id} className="task-item task-completed">
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                          <div className="task-checkbox completed">
                            <FaCheck style={{ color: 'white', fontSize: '12px' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#6b7280' }}>{t.title}</div>
                            {t.description && (
                              <div className="text-muted" style={{ fontSize: '0.875rem' }}>{t.description}</div>
                            )}
                            <div style={{ marginTop: '0.25rem' }}>
                              <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>Completed</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Shipment Tracking (customer; hidden until shipment exists) */}
            {summary?.shipping?.has_shipment && (
              <section className="content-section" id="shipment-tracking">
                <div className="section-header">
                  <h2>Shipment Tracking</h2>
                </div>
                <ShipmentTracker folderId={folder.id} />
              </section>
            )}

            {/* Project Files (customer) */}
            <section className="content-section" id="project-files">
              <div className="section-header">
                <h2>Project Files ({files.length})</h2>
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
                <EmptyState
                  icon={<FaFolderOpen />}
                  title="No files in this project yet"
                  description="Upload files to share documents, designs, or other project materials."
                />
              ) : (
                <div className="card">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Viewed</th>
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
                          <td className="mobile-name-column">
                            <strong style={{ color: 'rgb(16 185 129)' }}>{file.name}</strong>
                          </td>
                          <td>
                            {file.is_completed ? (
                              <span style={{ color: '#166534', fontWeight: 600 }}>✓</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                              {formatDate(file.created_at)}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => navigate(`/files/${file.id}`)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Notes (moves to bottom after latest is read) */}
            {latestNote && !hasUnreadNote && (
              <section className="content-section">
                <div className="section-header">
                  <h2>Notes</h2>
                  <button className="btn-secondary btn-sm" onClick={() => openNotesHistory()}>
                    View history
                  </button>
                </div>

                <div className="card" style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{latestNote.title || 'Latest update'}</div>
                      <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                        {formatDateTime(latestNote.created_at)}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {latestNote.body}
                  </div>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
        {/* Activity Feed */}
        <section className="content-section">
          <div className="section-header">
            <h2>Activity</h2>
            <button
              onClick={() => loadFolderEvents()}
              className="btn-secondary btn-sm"
              disabled={eventsLoading}
            >
              {eventsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {eventsLoading ? (
            <div className="empty-content"><p>Loading activity…</p></div>
          ) : events.length === 0 ? (
            <div className="empty-content"><p>No activity yet.</p></div>
          ) : (
            <div className="card" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {events.map((ev) => (
                  <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{ev.title}</div>
                      <div className="text-muted" style={{ fontSize: '0.85rem' }}>{ev.event_type}</div>
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {formatDateTime(ev.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Notes (admin) */}
        <section className="content-section">
          <div className="section-header">
            <h2>Notes</h2>
            <button className="btn-secondary btn-sm" onClick={() => openNotesHistory()}>
              View history
            </button>
          </div>

          <div className="card" style={{ padding: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                  Leave an update for the customer
                </div>
                <input
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Title"
                  style={{
                    width: '100%',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: '10px',
                    padding: '0.6rem 0.75rem',
                    marginBottom: '0.5rem',
                  }}
                />
                <textarea
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  rows={4}
                  placeholder="Write an update..."
                  style={{
                    width: '100%',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button className="btn-primary btn-sm" onClick={() => createNote()} disabled={creatingNote || newNoteTitle.trim().length === 0 || newNoteBody.trim().length === 0}>
                    {creatingNote ? 'Posting...' : 'Post note'}
                  </button>
                </div>
              </div>

              {latestNote ? (
                <div style={{ borderTop: '1px solid var(--color-border, #e5e7eb)', paddingTop: '0.75rem' }}>
                  <div style={{ fontWeight: 700 }}>{latestNote.title || 'Latest note'}</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem' }}>{formatDateTime(latestNote.created_at)}</div>
                  <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {latestNote.body}
                  </div>
                </div>
              ) : (
                <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                  No notes yet.
                </div>
              )}
            </div>
          </div>
        </section>

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
                      onClick={() => !renamingFileId && navigate(`/files/${file.id}`)}
                    >
                      <td className="mobile-name-column">
                        {renamingFileId === file.id ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={renamingFileName}
                              onChange={(e) => setRenamingFileName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleRenameFile(file.id, renamingFileName);
                                } else if (e.key === 'Escape') {
                                  setRenamingFileId(null);
                                  setRenamingFileName('');
                                }
                              }}
                              onBlur={() => {
                                if (renamingFileName.trim() && renamingFileName !== file.name) {
                                  handleRenameFile(file.id, renamingFileName);
                                } else {
                                  setRenamingFileId(null);
                                  setRenamingFileName('');
                                }
                              }}
                              autoFocus
                              style={{
                                flex: 1,
                                padding: '0.25rem 0.5rem',
                                border: '1px solid rgb(16 185 129)',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                color: 'rgb(16 185 129)'
                              }}
                            />
                          </div>
                        ) : (
                          <strong
                            style={{
                              color: 'rgb(16 185 129)',
                              cursor: 'pointer'
                            }}
                            onDoubleClick={(e) => {
                              if (role === 'admin') {
                                e.stopPropagation();
                                setRenamingFileId(file.id);
                                setRenamingFileName(file.name);
                              }
                            }}
                            title={role === 'admin' ? 'Double-click to rename' : undefined}
                          >
                            {file.name}
                          </strong>
                        )}
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
                            <>
                              <button
                                className="btn-outline btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingFileId(file.id);
                                  setRenamingFileName(file.name);
                                }}
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                title="Rename file"
                              >
                                Rename
                              </button>
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
                            </>
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
                      <td className="mobile-checkmark-column" onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: form.is_completed ? 'var(--color-success)' : '#e5e7eb',
                            border: '2px solid',
                            borderColor: form.is_completed ? 'var(--color-success)' : '#d1d5db',
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
                      <td className="mobile-name-column">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: 'rgb(16 185 129)' }}>{form.name}</strong>
                          {form.is_template && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.125rem 0.375rem', 
                              backgroundColor: '#E8EBF0', 
                              color: 'rgb(16 185 129)', 
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
                      <td className="mobile-checkmark-column" onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: esig.is_completed ? 'var(--color-success)' : '#e5e7eb',
                            border: '2px solid',
                            borderColor: esig.is_completed ? 'var(--color-success)' : '#d1d5db',
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
                      <td className="mobile-name-column">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: 'rgb(16 185 129)' }}>{esig.name}</strong>
                          {esig.is_template && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.125rem 0.375rem', 
                              backgroundColor: '#E8EBF0', 
                              color: 'rgb(16 185 129)', 
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

        {/* Shipment Tracking Section */}
        <section className="content-section">
          <details open={openShipments}>
            <summary
              style={{
                listStyle: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ margin: 0 }}>Shipment Tracking</h2>
              {role === 'admin' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAddShipment(true);
                  }}
                  className="btn-primary"
                >
                  Add Shipment
                </button>
              )}
            </summary>
            <ShipmentTracker folderId={folder.id} />
          </details>
        </section>

        {/* Content Manager (Admin Only) */}
        {role === 'admin' && (
          <section className="content-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Manage Folder Content</h2>
              <button
                onClick={() => setShowTypeformImportModal(true)}
                className="btn-primary"
                style={{ padding: '0.5rem 1rem' }}
              >
                Import Typeform Form
              </button>
            </div>
            <FolderContentManager
              folderId={folder.id}
              onContentAdded={handleContentChange}
              onContentRemoved={handleContentChange}
            />
          </section>
        )}
          </>
        )}
      </div>

      {notesHistoryOpen && (
        <div
          onClick={() => setNotesHistoryOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 100%)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid var(--color-border, #e5e7eb)',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Note history</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>Latest first</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary btn-sm" onClick={() => openNotesHistory()}>
                  Refresh
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setNotesHistoryOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notesHistory.length === 0 ? (
                <div className="text-muted">No notes yet.</div>
              ) : (
                notesHistory.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      border: '1px solid var(--color-border, #e5e7eb)',
                      borderRadius: '10px',
                      padding: '0.75rem',
                      background: role !== 'admin' && n.is_read === false ? '#ecfdf5' : 'white',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{n.title || 'Update'}</div>
                        <div className="text-muted" style={{ fontSize: '0.85rem' }}>{formatDateTime(n.created_at)}</div>
                      </div>
                      {role !== 'admin' && n.is_read === false && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#ecfdf5', color: '#166534' }}>
                          New
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {n.body}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showTypeformImportModal && id && id !== 'new' && (
        <TypeformImportModal
          folderId={id}
          isOpen={showTypeformImportModal}
          onClose={() => setShowTypeformImportModal(false)}
          onImportComplete={handleContentChange}
        />
      )}

      {showAddShipment && (
        <AddShipmentModal
          folderId={folder.id}
          onClose={() => setShowAddShipment(false)}
          onSuccess={() => {
            // Reload folder content if needed
            loadFolderContent();
          }}
        />
      )}
    </div>
  );
};

export default FolderView;

