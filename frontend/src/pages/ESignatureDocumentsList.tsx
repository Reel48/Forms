import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { esignatureAPI, foldersAPI, type ESignatureDocument } from '../api';
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
            id="esignature-search"
            name="esignature-search"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
          <select
            id="esignature-status-filter"
            name="esignature-status-filter"
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
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Created</th>
                <th>Signed</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => (
                <tr
                  key={doc.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/esignature/${doc.id}`)}
                >
                  <td>
                    <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{doc.name}</strong>
                    {doc.description && (
                      <div className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        {doc.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(doc.status)}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {doc.document_type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {doc.signature_mode.charAt(0).toUpperCase() + doc.signature_mode.slice(1)}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {formatDate(doc.created_at)}
                    </span>
                  </td>
                  <td>
                    {doc.signed_at ? (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                        {formatDate(doc.signed_at)}
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>-</span>
                    )}
                  </td>
                  <td>
                    {doc.expires_at ? (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                        {formatDate(doc.expires_at)}
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>-</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => navigate(`/esignature/${doc.id}`)}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        {doc.status === 'signed' ? 'View' : 'Sign'}
                      </button>
                      {role === 'admin' && (
                        <button
                          className="btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAssignToFolder(doc);
                          }}
                          title="Assign to Folder"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Assign
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

