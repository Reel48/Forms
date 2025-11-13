import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { foldersAPI, type Folder } from '../api';
import { useAuth } from '../contexts/AuthContext';
import './FoldersList.css';

const FoldersList: React.FC = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter] = useState<string>('all');

  useEffect(() => {
    loadFolders();
  }, [statusFilter, clientFilter]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (clientFilter !== 'all') {
        filters.client_id = clientFilter;
      }
      const response = await foldersAPI.getAll(filters);
      setFolders(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const filteredFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    folder.description?.toLowerCase().includes(searchTerm.toLowerCase())
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

  const handleDelete = async (folderId: string, folderName: string) => {
    if (!window.confirm(`Are you sure you want to delete folder "${folderName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await foldersAPI.delete(folderId);
      setFolders(folders.filter(f => f.id !== folderId));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete folder');
    }
  };

  if (loading) {
    return (
      <div className="folders-list-container">
        <div className="loading">Loading folders...</div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="folders-list-container">
        <div className="error">Access denied. Admin only.</div>
      </div>
    );
  }

  return (
    <div className="folders-list-container">
      <div className="page-header">
        <h1>Folders</h1>
        <button
          onClick={() => navigate('/folders/new')}
          className="btn-primary btn-create"
        >
          + Create Folder
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search folders..."
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
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {filteredFolders.length === 0 ? (
        <div className="empty-state">
          <p>No folders found</p>
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
        <div className="folders-grid">
          {filteredFolders.map((folder) => (
            <div
              key={folder.id}
              className="folder-card"
              onClick={() => navigate(`/folders/${folder.id}`)}
            >
              <div className="folder-header">
                <h3 className="folder-name">{folder.name}</h3>
                <span className={getStatusBadgeClass(folder.status)}>
                  {folder.status.charAt(0).toUpperCase() + folder.status.slice(1)}
                </span>
              </div>

              {folder.description && (
                <p className="folder-description">{folder.description}</p>
              )}

              <div className="folder-meta">
                <div className="meta-item">
                  <span className="meta-label">Created:</span>
                  <span className="meta-value">{formatDate(folder.created_at)}</span>
                </div>
                {folder.quote_id && (
                  <div className="meta-item">
                    <span className="meta-label">Has Quote:</span>
                    <span className="meta-value">Yes</span>
                  </div>
                )}
                {folder.client_id && (
                  <div className="meta-item">
                    <span className="meta-label">Client ID:</span>
                    <span className="meta-value">{folder.client_id.substring(0, 8)}...</span>
                  </div>
                )}
              </div>

              <div className="folder-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/folders/${folder.id}`);
                  }}
                  className="btn-primary btn-sm"
                >
                  View
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(folder.id, folder.name);
                  }}
                  className="btn-danger btn-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FoldersList;

