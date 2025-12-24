import React, { useState, useEffect, useRef, useCallback } from 'react';
import { knowledgeAPI, type KnowledgeDocument, type KnowledgeEntry } from '../api';
import { useNotifications } from '../components/NotificationSystem';
import { FaUpload, FaTrash, FaFile, FaSpinner, FaCheckCircle, FaExclamationCircle, FaTimesCircle, FaSearch, FaList } from 'react-icons/fa';
import './KnowledgeBaseUpload.css';

const KnowledgeBaseUpload: React.FC = () => {
  const { showNotification } = useNotifications();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'entries'>('documents');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [similarEntries, setSimilarEntries] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.pptx', '.ppt', '.docx'];
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await knowledgeAPI.listDocuments();
      setDocuments(response.data.documents || []);
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      showNotification({ type: 'error', message: 'Failed to load documents' });
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const response = await knowledgeAPI.listEntries({
        search: searchQuery || undefined,
        category: categoryFilter || undefined,
        source: sourceFilter || undefined,
        limit: 100
      });
      setEntries(response.data.entries || []);
      setCategories(response.data.categories || []);
    } catch (error: any) {
      console.error('Failed to load entries:', error);
      showNotification({ type: 'error', message: 'Failed to load knowledge entries' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, sourceFilter, showNotification]);

  const loadStats = useCallback(async () => {
    try {
      const response = await knowledgeAPI.getStats();
      setStats(response.data);
    } catch (error: any) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  const loadSimilarEntries = async (entryId: string) => {
    try {
      setLoadingSimilar(true);
      const response = await knowledgeAPI.findSimilar(entryId, { threshold: 0.7, limit: 10 });
      setSimilarEntries(response.data.similar_entries || []);
    } catch (error: any) {
      console.error('Failed to load similar entries:', error);
      showNotification({ type: 'error', message: 'Failed to load similar entries' });
    } finally {
      setLoadingSimilar(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'documents') {
      loadDocuments();
      const interval = setInterval(() => {
        loadDocuments();
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(true);
      loadEntries();
      loadStats();
    }
  }, [activeTab, loadDocuments, loadEntries, loadStats]);

  useEffect(() => {
    if (activeTab === 'entries') {
      loadEntries();
    }
  }, [activeTab, searchQuery, categoryFilter, sourceFilter, loadEntries]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum: ${formatFileSize(MAX_FILE_SIZE)}`;
    }
    return null;
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0]; // Single file upload
    const error = validateFile(file);
    
    if (error) {
      showNotification({ type: 'error', message: error });
      return;
    }

    setUploading(true);
    try {
      await knowledgeAPI.upload(file);
      showNotification({ type: 'success', message: `Document "${file.name}" uploaded. Processing in background...` });
      await loadDocuments(); // Refresh list
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Upload failed';
      showNotification({ type: 'error', message: `Upload failed: ${errorMsg}` });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (documentId: string, filename: string) => {
    if (!confirm(`Delete "${filename}" and all its chunks? This cannot be undone.`)) {
      return;
    }

    try {
      await knowledgeAPI.deleteDocument(documentId);
      showNotification({ type: 'success', message: 'Document deleted successfully' });
      await loadDocuments();
      if (activeTab === 'entries') {
        await loadEntries();
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Delete failed';
      showNotification({ type: 'error', message: `Delete failed: ${errorMsg}` });
    }
  };

  const handleDeleteEntry = async (entryId: string, title?: string) => {
    if (!confirm(`Delete entry "${title || entryId}"? This cannot be undone.`)) {
      return;
    }

    try {
      await knowledgeAPI.deleteEntry(entryId);
      showNotification({ type: 'success', message: 'Entry deleted successfully' });
      await loadEntries();
      if (selectedEntry?.id === entryId) {
        setSelectedEntry(null);
        setSimilarEntries([]);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Delete failed';
      showNotification({ type: 'error', message: `Delete failed: ${errorMsg}` });
    }
  };

  const handleViewEntry = async (entry: KnowledgeEntry) => {
    setSelectedEntry(entry);
    await loadSimilarEntries(entry.id);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaCheckCircle className="status-icon completed" />;
      case 'processing':
        return <FaSpinner className="status-icon processing spinning" />;
      case 'failed':
        return <FaExclamationCircle className="status-icon failed" />;
      default:
        return <FaSpinner className="status-icon pending" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing...';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="knowledge-base-upload-page">
      <div className="page-header">
        <h1>Knowledge Base Management</h1>
        <p>Upload documents and manage knowledge entries for your AI chatbot</p>
      </div>

      {/* Tabs */}
      <div className="knowledge-tabs">
        <button
          className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <FaFile /> Documents
        </button>
        <button
          className={`tab-button ${activeTab === 'entries' ? 'active' : ''}`}
          onClick={() => setActiveTab('entries')}
        >
          <FaList /> All Entries ({stats?.total_entries || 0})
        </button>
      </div>

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <>
      {/* Upload Area */}
      <div className="upload-section">
        <div
          className={`upload-area ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileUpload(e.dataTransfer.files);
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.pptx,.ppt,.docx"
            onChange={(e) => handleFileUpload(e.target.files)}
            style={{ display: 'none' }}
            disabled={uploading}
          />
          
          {uploading ? (
            <>
              <FaSpinner className="upload-icon spinning" />
              <p>Uploading...</p>
            </>
          ) : (
            <>
              <FaUpload className="upload-icon" />
              <p>Drag & drop a document here, or click to browse</p>
              <p className="upload-hint">
                Supported: PDF, Excel (.xlsx, .xls), PowerPoint (.pptx, .ppt), Word (.docx)
                <br />
                Max size: 50MB
              </p>
            </>
          )}
        </div>
      </div>

      {/* Documents List */}
      <div className="documents-section">
        <h2>Uploaded Documents ({documents.length})</h2>
        
        {loading ? (
          <div className="loading-state">
            <FaSpinner className="spinning" />
            <span>Loading documents...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FaFile />
            <p>No documents uploaded yet</p>
            <p className="empty-hint">Upload your first document to get started</p>
          </div>
        ) : (
          <div className="documents-list">
            {documents.map((doc) => (
              <div key={doc.id} className="document-card">
                <div className="document-info">
                  <div className="document-header">
                    <FaFile className="file-icon" />
                    <div className="document-details">
                      <h3>{doc.filename}</h3>
                      <div className="document-meta">
                        <span className="file-type">{doc.file_type.toUpperCase()}</span>
                        <span className="file-size">{formatFileSize(doc.file_size)}</span>
                        {doc.chunk_count > 0 && (
                          <span className="chunk-count">{doc.chunk_count} chunks</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="document-status">
                    {getStatusIcon(doc.processing_status)}
                    <span className={`status-text ${doc.processing_status}`}>
                      {getStatusText(doc.processing_status)}
                    </span>
                    {doc.error_message && (
                      <span className="error-message" title={doc.error_message}>
                        {doc.error_message}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="document-actions">
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    title="Delete document"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {/* Entries Tab */}
      {activeTab === 'entries' && (
        <div className="entries-section">
          {/* Filters */}
          <div className="entries-filters">
            <div className="search-box">
              <FaSearch />
              <input
                type="text"
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Sources</option>
              <option value="manual">Manual Entries</option>
              <option value="document">Document Chunks</option>
            </select>
          </div>

          {/* Stats */}
          {stats && (
            <div className="stats-bar">
              <div className="stat-item">
                <span className="stat-label">Total:</span>
                <span className="stat-value">{stats.total_entries}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Manual:</span>
                <span className="stat-value">{stats.manual_entries}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">From Documents:</span>
                <span className="stat-value">{stats.document_entries}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">With Embeddings:</span>
                <span className="stat-value">{stats.with_embeddings}</span>
              </div>
            </div>
          )}

          {/* Entries List */}
          {loading ? (
            <div className="loading-state">
              <FaSpinner className="spinning" />
              <span>Loading entries...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="empty-state">
              <FaList />
              <p>No entries found</p>
              {searchQuery || categoryFilter || sourceFilter ? (
                <p className="empty-hint">Try adjusting your filters</p>
              ) : (
                <p className="empty-hint">Upload documents or add manual entries to get started</p>
              )}
            </div>
          ) : (
            <div className="entries-list">
              {entries.map((entry) => (
                <div key={entry.id} className="entry-card">
                  <div className="entry-header">
                    <div className="entry-title-row">
                      <h3>{entry.title || `Entry ${entry.id.slice(0, 8)}`}</h3>
                      <div className="entry-badges">
                        <span className="category-badge">{entry.category}</span>
                        {entry.document_id && (
                          <span className="source-badge document">
                            {entry.knowledge_documents?.filename || 'Document'}
                          </span>
                        )}
                        {!entry.document_id && (
                          <span className="source-badge manual">Manual</span>
                        )}
                        {entry.chunk_index !== undefined && (
                          <span className="chunk-badge">Chunk {entry.chunk_index + 1}</span>
                        )}
                      </div>
                    </div>
                    <div className="entry-content-preview">
                      {entry.content.length > 200
                        ? entry.content.substring(0, 200) + '...'
                        : entry.content}
                    </div>
                  </div>
                  <div className="entry-actions">
                    <button
                      className="view-btn"
                      onClick={() => handleViewEntry(entry)}
                      title="View details and similar entries"
                    >
                      <FaSearch /> View
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleDeleteEntry(entry.id, entry.title)}
                      title="Delete entry"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Entry Detail Modal */}
          {selectedEntry && (
            <div className="entry-modal-overlay" onClick={() => { setSelectedEntry(null); setSimilarEntries([]); }}>
              <div className="entry-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{selectedEntry.title || 'Entry Details'}</h2>
                  <button className="close-btn" onClick={() => { setSelectedEntry(null); setSimilarEntries([]); }}>
                    <FaTimesCircle />
                  </button>
                </div>
                <div className="modal-content">
                  <div className="entry-detail-section">
                    <div className="detail-row">
                      <strong>Category:</strong> <span>{selectedEntry.category}</span>
                    </div>
                    <div className="detail-row">
                      <strong>Source:</strong>{' '}
                      <span>
                        {selectedEntry.document_id
                          ? `Document: ${selectedEntry.knowledge_documents?.filename || 'Unknown'}`
                          : 'Manual Entry'}
                      </span>
                    </div>
                    {selectedEntry.chunk_index !== undefined && (
                      <div className="detail-row">
                        <strong>Chunk Index:</strong> <span>{selectedEntry.chunk_index + 1}</span>
                      </div>
                    )}
                    <div className="detail-row">
                      <strong>Content:</strong>
                      <div className="content-display">{selectedEntry.content}</div>
                    </div>
                  </div>

                  {/* Similar Entries */}
                  <div className="similar-entries-section">
                    <h3>Similar/Duplicate Entries</h3>
                    {loadingSimilar ? (
                      <div className="loading-state">
                        <FaSpinner className="spinning" />
                        <span>Finding similar entries...</span>
                      </div>
                    ) : similarEntries.length === 0 ? (
                      <p className="no-similar">No similar entries found (threshold: 70% similarity)</p>
                    ) : (
                      <div className="similar-list">
                        {similarEntries.map((similar) => (
                          <div key={similar.id} className="similar-entry">
                            <div className="similar-header">
                              <span className="similarity-score">
                                {Math.round(similar.similarity * 100)}% similar
                              </span>
                              <span className="similar-category">{similar.category}</span>
                            </div>
                            <div className="similar-title">{similar.title || 'Untitled'}</div>
                            <div className="similar-content">{similar.content}</div>
                            <div className="similar-actions">
                              <button
                                className="view-btn"
                                onClick={async () => {
                                  try {
                                    const entryResponse = await knowledgeAPI.getEntry(similar.id);
                                    setSelectedEntry(null);
                                    setSimilarEntries([]);
                                    await handleViewEntry(entryResponse.data);
                                  } catch (error) {
                                    showNotification({ type: 'error', message: 'Failed to load entry' });
                                  }
                                }}
                              >
                                View
                              </button>
                              {similar.similarity > 0.9 && (
                                <span className="duplicate-warning">⚠ Possible duplicate</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseUpload;

