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

  return (
    <div className="folders-list-container">
      <div className="page-header">
        <h1>Folders</h1>
        {role === 'admin' && (
          <button
            onClick={() => navigate('/folders/new')}
            className="btn-primary btn-create"
          >
            + Create Folder
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            id="folders-search"
            name="folders-search"
            placeholder="Search folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
          <select
            id="folders-status-filter"
            name="folders-status-filter"
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
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Description</th>
                <th>Has Quote</th>
                <th>Client ID</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFolders.map((folder) => (
                <tr
                  key={folder.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/folders/${folder.id}`)}
                >
                  <td>
                    <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{folder.name}</strong>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(folder.status)}>
                      {folder.status.charAt(0).toUpperCase() + folder.status.slice(1)}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {folder.description || '-'}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {folder.quote_id ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    {folder.client_id ? (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                        {folder.client_id.substring(0, 8)}...
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {formatDate(folder.created_at)}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => navigate(`/folders/${folder.id}`)}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        View
                      </button>
                      {role === 'admin' && (
                        <button
                          className="btn-danger btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(folder.id, folder.name);
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
    </div>
  );
};

export default FoldersList;

