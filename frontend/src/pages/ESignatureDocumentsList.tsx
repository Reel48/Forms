import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { esignatureAPI, foldersAPI, ESignatureDocument } from '../api';
import { useAuth } from '../contexts/AuthContext';
import FolderAssignmentModal from '../components/FolderAssignmentModal';
import './ESignatureDocumentsList.css';

const ESignatureDocumentsList: React.FC = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [documents, setDocuments] = useState<ESignatureDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ESignatureDocument | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [statusFilter]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      const response = await esignatureAPI.getAllDocuments(filters);
      setDocuments(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadgeClass = (status: string): string => {
    return `status-badge status-${status}`;
  };

  const handleAssignToFolder = (doc: ESignatureDocument) => {
    setSelectedDocument(doc);
    setFolderModalOpen(true);
  };

  const handleFolderAssign = async (folderId: string) => {
    if (!selectedDocument) return;
    await foldersAPI.assignESignature(folderId, selectedDocument.id);
    setFolderModalOpen(false);
    setSelectedDocument(null);
  };

  if (loading) {
    return (
      <div className="esignature-documents-container">
        <div className="loading">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="esignature-documents-container">
      <div className="page-header">
        <h1>E-Signature Documents</h1>
        <button
          onClick={() => navigate('/esignature/new')}
          className="btn-primary btn-create"
        >
          + Create Document
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="signed">Signed</option>
            <option value="declined">Declined</option>
            <option value="expired">Expired</option>
          </select>

          <div className="view-mode-toggle">
            <button
              type="button"
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              ⬜
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="empty-state">
          <p>No documents found</p>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="btn-secondary"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className={`documents-${viewMode}`}>
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => navigate(`/esignature/${doc.id}`)}
            >
              <div className="document-header">
                <h3 className="document-name">{doc.name}</h3>
                <span className={getStatusBadgeClass(doc.status)}>
                  {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                </span>
              </div>

              {doc.description && (
                <p className="document-description">{doc.description}</p>
              )}

              <div className="document-meta">
                <div className="meta-item">
                  <span className="meta-label">Type:</span>
                  <span className="meta-value">
                    {doc.document_type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Mode:</span>
                  <span className="meta-value">
                    {doc.signature_mode.charAt(0).toUpperCase() + doc.signature_mode.slice(1)}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Created:</span>
                  <span className="meta-value">{formatDate(doc.created_at)}</span>
                </div>
                {doc.signed_at && (
                  <div className="meta-item">
                    <span className="meta-label">Signed:</span>
                    <span className="meta-value">{formatDate(doc.signed_at)}</span>
                  </div>
                )}
              </div>

              {doc.expires_at && (
                <div className="expiry-warning">
                  Expires: {formatDate(doc.expires_at)}
                </div>
              )}

              <div className="document-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/esignature/${doc.id}`);
                  }}
                  className="btn-primary btn-sm"
                >
                  {doc.status === 'signed' ? 'View' : 'Sign'}
                </button>
                {role === 'admin' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignToFolder(doc);
                    }}
                    className="btn-secondary btn-sm"
                    title="Assign to Folder"
                  >
                    📁
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDocument && (
        <FolderAssignmentModal
          isOpen={folderModalOpen}
          onClose={() => {
            setFolderModalOpen(false);
            setSelectedDocument(null);
          }}
          onAssign={handleFolderAssign}
          itemType="esignature"
          itemName={selectedDocument.name}
        />
      )}
    </div>
  );
};

export default ESignatureDocumentsList;

