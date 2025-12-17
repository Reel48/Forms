import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { foldersAPI, type Folder, type FolderSummary } from '../api';
import { useAuth } from '../contexts/AuthContext';
import './FoldersList.css';

const FoldersList: React.FC = () => {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [summariesByFolderId, setSummariesByFolderId] = useState<Record<string, FolderSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter] = useState<string>('all');
  const [needsActionOnly, setNeedsActionOnly] = useState<boolean>(false);
  const [stageFilter, setStageFilter] = useState<string>('all');

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
      const data = response.data || [];
      setFolders(data);

      // Customer-first: fetch per-folder summary from folder content endpoint
      if (role !== 'admin' && data.length > 0) {
        const results = await Promise.allSettled(
          data.map(async (f) => {
            const c = await foldersAPI.getContent(f.id);
            return { id: f.id, summary: c.data.summary };
          })
        );
        const next: Record<string, FolderSummary> = {};
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value?.id && r.value?.summary) {
            next[r.value.id] = r.value.summary;
          }
        }
        setSummariesByFolderId(next);
      } else {
        setSummariesByFolderId({});
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const filteredFolders = folders
    .filter((folder) => (
      folder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      folder.description?.toLowerCase().includes(searchTerm.toLowerCase())
    ))
    .filter((folder) => {
      if (role === 'admin') return true;
      const summary = summariesByFolderId[folder.id];
      if (needsActionOnly && summary?.next_step_owner !== 'customer') return false;
      if (stageFilter !== 'all' && summary?.stage !== stageFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const aTs = (summariesByFolderId[a.id]?.updated_at || a.updated_at || a.created_at || '').toString();
      const bTs = (summariesByFolderId[b.id]?.updated_at || b.updated_at || b.created_at || '').toString();
      return bTs.localeCompare(aTs);
    });

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

  if (authLoading || loading) {
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

          {role !== 'admin' && (
            <>
              <select
                id="folders-stage-filter"
                name="folders-stage-filter"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Stages</option>
                <option value="quote_sent">Quote</option>
                <option value="design_info_needed">Needs Info</option>
                <option value="production">Production</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>

              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={needsActionOnly}
                  onChange={(e) => setNeedsActionOnly(e.target.checked)}
                />
                Needs action from me
              </label>
            </>
          )}
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
                {role === 'admin' ? (
                  <>
                    <th>Status</th>
                    <th>Description</th>
                    <th>Has Quote</th>
                    <th>Client ID</th>
                    <th>Created</th>
                  </>
                ) : (
                  <>
                    <th>Stage</th>
                    <th>Next step</th>
                    <th>Last update</th>
                    <th>ETA</th>
                  </>
                )}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFolders.map((folder) => (
                (() => {
                  const summary = summariesByFolderId[folder.id];
                  const eta = summary?.shipping?.actual_delivery_date || summary?.shipping?.estimated_delivery_date;
                  return (
                <tr
                  key={folder.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/folders/${folder.id}`)}
                >
                  <td className="mobile-name-column">
                    <strong style={{ color: 'rgb(99 102 241)' }}>{folder.name}</strong>
                  </td>
                  {role === 'admin' ? (
                    <>
                      <td className="mobile-status-column">
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
                    </>
                  ) : (
                    <>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {summary?.stage || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {summary?.next_step || '-'}
                          {summary?.next_step_owner ? ` (${summary.next_step_owner})` : ''}
                        </span>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {summary?.updated_at ? formatDate(summary.updated_at) : formatDate(folder.updated_at)}
                        </span>
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {eta ? formatDate(eta) : '-'}
                        </span>
                      </td>
                    </>
                  )}
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
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FoldersList;

