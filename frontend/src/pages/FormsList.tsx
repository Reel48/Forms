import { useState, useEffect, memo, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { formsAPI, foldersAPI } from '../api';
import type { Form } from '../api';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import FolderAssignmentModal from '../components/FolderAssignmentModal';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Assignment {
  user_id: string;
}

function FormsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [users, setUsers] = useState<Record<string, User>>({});
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [selectedForms, setSelectedForms] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [selectedFormForFolder, setSelectedFormForFolder] = useState<Form | null>(null);
  const { role } = useAuth();
  
  // Track previous location to detect navigation back to forms list
  const prevLocationRef = useRef<string>(location.pathname);

  // Use ref to track if we've loaded forms initially
  const hasLoadedFormsRef = useRef(false);

  const loadUsers = async () => {
    try {
      const response = await api.get('/api/auth/users');
      const usersMap: Record<string, User> = {};
      response.data.forEach((user: User) => {
        usersMap[user.id] = user;
      });
      setUsers(usersMap);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadAllAssignments = useCallback(async () => {
    // Use current forms state
    const currentForms = forms;
    if (currentForms.length === 0) return;
    
    try {
      const assignmentsMap: Record<string, Assignment[]> = {};
      await Promise.all(
        currentForms.map(async (form) => {
          try {
            const response = await api.get(`/api/forms/${form.id}/assignments`);
            assignmentsMap[form.id] = response.data || [];
          } catch (error) {
            console.error(`Failed to load assignments for form ${form.id}:`, error);
            assignmentsMap[form.id] = [];
          }
        })
      );
      setAssignments(assignmentsMap);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  }, [forms]);

  const loadSubmissionCounts = useCallback(async () => {
    // Use current forms state
    const currentForms = forms;
    if (currentForms.length === 0) return;
    
    try {
      const countsMap: Record<string, number> = {};
      await Promise.all(
        currentForms.map(async (form) => {
          try {
            const response = await formsAPI.getSubmissions(form.id);
            countsMap[form.id] = response.data?.length || 0;
          } catch (error) {
            console.error(`Failed to load submission count for form ${form.id}:`, error);
            countsMap[form.id] = 0;
          }
        })
      );
      setSubmissionCounts(countsMap);
    } catch (error) {
      console.error('Failed to load submission counts:', error);
    }
  }, [forms]);

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: string; search?: string; templates_only?: boolean } = {
        templates_only: true  // Show only templates in template library
      };
      if (statusFilter) {
        filters.status = statusFilter;
      }
      if (searchQuery.trim()) {
        filters.search = searchQuery.trim();
      }
      const response = await formsAPI.getAll(filters);
      let filteredForms = response.data;
      
      // Apply date filters on frontend (backend doesn't support date filtering yet)
      if (dateFrom || dateTo) {
        filteredForms = filteredForms.filter(form => {
          const formDate = new Date(form.created_at).toISOString().split('T')[0];
          if (dateFrom && formDate < dateFrom) return false;
          if (dateTo && formDate > dateTo) return false;
          return true;
        });
      }
      
      setForms(filteredForms);
      hasLoadedFormsRef.current = true;
    } catch (error: any) {
      console.error('Failed to load forms:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load forms. Please try again.');
      setForms([]);
      hasLoadedFormsRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, dateFrom, dateTo]);
  
  // Memoize form IDs to prevent unnecessary re-renders
  const formsIds = useMemo(() => forms.map(f => f.id).join(','), [forms]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  // Load users for assignment display (admin only)
  // Only run after forms have been loaded and when form IDs change
  useEffect(() => {
    if (role === 'admin' && forms.length > 0 && hasLoadedFormsRef.current) {
      loadUsers();
      loadAllAssignments();
      loadSubmissionCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formsIds, role]);

  // Refresh assignments when window gains focus (e.g., navigating back to tab)
  useEffect(() => {
    const handleFocus = () => {
      if (role === 'admin' && forms.length > 0) {
        loadAllAssignments();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formsIds, role]);

  // Refresh assignments when navigating back to forms list from a form detail page
  useEffect(() => {
    const isFormsListPage = location.pathname === '/forms';
    const wasOnFormDetail = prevLocationRef.current && prevLocationRef.current.match(/^\/forms\/[^/]+$/);
    
    // If we navigated from a form detail page (e.g., /forms/123) back to the forms list (/forms), refresh assignments
    if (wasOnFormDetail && isFormsListPage && role === 'admin' && forms.length > 0) {
      loadAllAssignments();
    }
    
    prevLocationRef.current = location.pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, role, forms.length]);

  const getAssignedToText = (formId: string): string => {
    const formAssignments = assignments[formId] || [];
    if (formAssignments.length === 0) {
      return '-';
    }
    if (formAssignments.length === 1) {
      const user = users[formAssignments[0].user_id];
      if (user) {
        return user.name && user.name !== user.email ? user.name : user.email;
      }
      return 'Unknown';
    }
    return `${formAssignments.length} people`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'published':
        return 'badge-sent';
      case 'archived':
        return 'badge-declined';
      default:
        return 'badge-draft';
    }
  };

  const handleDelete = async (formId: string, formName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${formName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await formsAPI.delete(formId);
      loadForms(); // Reload the list
    } catch (error: any) {
      alert(error?.response?.data?.detail || error?.message || 'Failed to delete form. Please try again.');
    }
  };

  const handleDuplicate = async (formId: string) => {
    try {
      const response = await formsAPI.duplicate(formId);
      if (response.data) {
        loadForms(); // Reload the list
        alert('Form duplicated successfully!');
      }
    } catch (error: any) {
      console.error('Failed to duplicate form:', error);
      const errorMessage = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Failed to duplicate form. Please try again.';
      alert(errorMessage);
    }
  };

  const handleAssignToFolder = (form: Form) => {
    setSelectedFormForFolder(form);
    setFolderModalOpen(true);
  };

  const handleFolderAssign = async (folderId: string) => {
    if (!selectedFormForFolder) return;
    await foldersAPI.assignForm(folderId, selectedFormForFolder.id);
    setFolderModalOpen(false);
    setSelectedFormForFolder(null);
  };

  const handleSelectForm = (formId: string) => {
    setSelectedForms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(formId)) {
        newSet.delete(formId);
      } else {
        newSet.add(formId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedForms.size === forms.length) {
      setSelectedForms(new Set());
    } else {
      setSelectedForms(new Set(forms.map(f => f.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForms.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedForms.size} form${selectedForms.size > 1 ? 's' : ''}? This action cannot be undone.`)) {
      return;
    }

    setBulkActionLoading(true);
    try {
      await Promise.all(Array.from(selectedForms).map(formId => formsAPI.delete(formId)));
      setSelectedForms(new Set());
      loadForms();
    } catch (error: any) {
      alert(error?.response?.data?.detail || error?.message || 'Failed to delete forms. Please try again.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedForms.size === 0) return;

    setBulkActionLoading(true);
    try {
      await Promise.all(Array.from(selectedForms).map(formId => formsAPI.update(formId, { status: newStatus as any })));
      setSelectedForms(new Set());
      loadForms();
    } catch (error: any) {
      alert(error?.response?.data?.detail || error?.message || 'Failed to update forms. Please try again.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  if (loading && forms.length === 0) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <div>
          <h1>Form Templates</h1>
          <p className="page-subtitle" style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Reusable templates for your projects</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {role === 'admin' && (
            <>
              <button onClick={() => navigate('/forms/import-typeform')} className="btn-primary">
                Import from Typeform
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card mb-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '250px' }}>
              <label htmlFor="search-input" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Search Forms
              </label>
              <input
                id="search-input"
                name="search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or description..."
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label htmlFor="status-filter" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Status
              </label>
              <select
                id="status-filter"
                name="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label htmlFor="date-from" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Created From
              </label>
              <input
                id="date-from"
                name="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label htmlFor="date-to" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Created To
              </label>
              <input
                id="date-to"
                name="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </div>
            {(statusFilter || searchQuery || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setStatusFilter('');
                  setSearchQuery('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="card mb-4" style={{ backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger-light)', padding: '1rem' }}>
          <p style={{ color: 'var(--color-danger)', margin: 0 }}>
            {error}
            <button
              onClick={loadForms}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                backgroundColor: 'var(--color-danger)',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Retry
            </button>
          </p>
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      {role === 'admin' && selectedForms.size > 0 && (
        <div className="card mb-4" style={{ backgroundColor: 'var(--color-primary-light)', borderColor: 'var(--color-primary)', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontWeight: '500', color: 'var(--color-primary)' }}>
                {selectedForms.size} form{selectedForms.size > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedForms(new Set())}
                className="btn-outline"
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
              >
                Clear Selection
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                id="bulk-status-select"
                name="bulk-status-select"
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkStatusChange(e.target.value);
                    e.target.value = '';
                  }
                }}
                disabled={bulkActionLoading}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-primary)',
                  borderRadius: '0.375rem',
                  backgroundColor: 'white',
                  cursor: bulkActionLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Change Status...</option>
                <option value="draft">Set to Draft</option>
                <option value="published">Set to Published</option>
                <option value="archived">Archive</option>
              </select>
              <button
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
                className="btn-danger"
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
              >
                {bulkActionLoading ? 'Deleting...' : `Delete ${selectedForms.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {forms.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              {(statusFilter || searchQuery || dateFrom || dateTo) ? 'No forms found' : 'No forms yet'}
            </h2>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              {(statusFilter || searchQuery || dateFrom || dateTo)
                ? 'Try adjusting your filters or create a new form.'
                : role === 'admin'
                ? 'Create your first form to get started!'
                : 'No forms have been assigned to you yet.'}
            </p>
            {role === 'admin' && (
              <button onClick={() => navigate('/forms/new')} className="btn-primary">
                Create Your First Form
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          {loading && forms.length > 0 && (
            <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              Updating...
            </div>
          )}
          <table>
            <thead>
              <tr>
                {role === 'admin' && (
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      id="select-all-forms"
                      name="select-all-forms"
                      checked={selectedForms.size === forms.length && forms.length > 0}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th>Form Name</th>
                <th>Description</th>
                <th>Fields</th>
                <th>Submissions</th>
                <th>Status</th>
                {role === 'admin' && <th>Priority</th>}
                {role === 'admin' && <th>Assigned To</th>}
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  {role === 'admin' && (
                    <td>
                      <input
                        type="checkbox"
                        id={`form-select-${form.id}`}
                        name={`form-select-${form.id}`}
                        checked={selectedForms.has(form.id)}
                        onChange={() => handleSelectForm(form.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  <td className="mobile-name-column">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Link to={`/forms/${form.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>
                        {form.name || 'Untitled Form'}
                      </Link>
                      {form.is_typeform_form && (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: '#6366f1',
                            color: 'white',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                          }}
                          title="Typeform form"
                        >
                          Typeform
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {form.description || '-'}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted">
                      {form.fields?.length || 0} {form.fields?.length === 1 ? 'field' : 'fields'}
                    </span>
                  </td>
                  <td>
                    {role === 'admin' && submissionCounts[form.id] !== undefined ? (
                      <span
                        className="badge"
                        style={{
                          backgroundColor: submissionCounts[form.id] > 0 ? 'var(--color-success)' : 'var(--color-text-light)',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}
                      >
                        {submissionCounts[form.id]} {submissionCounts[form.id] === 1 ? 'submission' : 'submissions'}
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>-</span>
                    )}
                  </td>
                  <td className="mobile-status-column">
                    <span className={`badge ${getStatusBadgeClass(form.status)}`}>
                      {formatStatus(form.status)}
                    </span>
                  </td>
                  {role === 'admin' && (
                    <td>
                      <select
                        id={`form-priority-${form.id}`}
                        name={`form-priority-${form.id}`}
                        value={form.priority || 'normal'}
                        onChange={async (e) => {
                          try {
                            await formsAPI.update(form.id, { priority: e.target.value });
                            loadForms();
                          } catch (error) {
                            console.error('Failed to update priority:', error);
                            alert('Failed to update priority. Please try again.');
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.875rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </td>
                  )}
                  {role === 'admin' && (
                    <td>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                        {getAssignedToText(form.id)}
                      </span>
                    </td>
                  )}
                  <td>{formatDate(form.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link to={`/forms/${form.id}`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        View
                      </Link>
                      {role === 'admin' && (
                        <>
                          <Link to={`/forms/${form.id}/edit`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDuplicate(form.id)}
                            className="btn-outline"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            title="Duplicate form"
                          >
                            Duplicate
                          </button>
                          {form.is_template && (
                            <button
                              onClick={() => handleAssignToFolder(form)}
                              className="btn-primary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                              title="Use this template in a folder"
                            >
                              Use Template
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(form.id, form.name)}
                            className="btn-danger"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {form.public_url_slug && form.status === 'published' && (
                        <a
                          href={`/public/form/${form.public_url_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}
                          title="Open public form"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedFormForFolder && (
        <FolderAssignmentModal
          isOpen={folderModalOpen}
          onClose={() => {
            setFolderModalOpen(false);
            setSelectedFormForFolder(null);
          }}
          onAssign={handleFolderAssign}
          itemType="form"
          itemName={selectedFormForFolder.name}
        />
      )}
    </div>
  );
}

export default memo(FormsList);

