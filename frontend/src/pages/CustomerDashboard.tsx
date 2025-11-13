import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { quotesAPI, foldersAPI } from '../api';
import type { Quote, Form, Folder } from '../api';

interface TimelineItem {
  id: string;
  type: 'folder' | 'quote' | 'form';
  title: string;
  description?: string;
  status: string;
  priority?: string;
  created_at: string;
  data: Folder | Quote | Form;
}

const FOLDER_STATUSES = ['active', 'completed', 'archived', 'cancelled'] as const;
const SORT_OPTIONS = [
  { value: 'date', label: 'Date (Newest)' },
  { value: 'date_oldest', label: 'Date (Oldest)' },
  { value: 'status', label: 'Status' },
] as const;

function CustomerDashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('date');
  const [acceptingQuote, setAcceptingQuote] = useState<string | null>(null);
  const [decliningQuote, setDecliningQuote] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'customer') {
      loadData();
    }
  }, [role]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load folders (main organizing structure)
      const foldersResponse = await foldersAPI.getAll();
      setFolders(foldersResponse.data || []);
      
      // Quotes and forms are now accessed through folders
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Convert folders to timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = folders.map(folder => ({
      id: folder.id,
      type: 'folder' as const,
      title: folder.name,
      description: folder.description || `Order folder${folder.quote_id ? ' with quote' : ''}`,
      status: folder.status,
      priority: 'normal',
      created_at: folder.created_at,
      data: folder,
    }));

    // Apply status filter
    let filtered = items;
    if (statusFilter) {
      filtered = items.filter(item => item.status === statusFilter);
    }

    // Sort items
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date_oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'status':
          const statusOrder = { 'active': 0, 'completed': 1, 'archived': 2, 'cancelled': 3 };
          const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
          const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [folders, statusFilter, sortBy]);

  // Filter timeline items by search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return timelineItems;
    }

    const searchLower = searchTerm.toLowerCase();
    return timelineItems.filter(item => 
      item.title.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower) ||
      (item.type === 'quote' && (item.data as Quote).quote_number?.toLowerCase().includes(searchLower))
    );
  }, [timelineItems, searchTerm]);

  // Handle accept quote
  const handleAcceptQuote = async (quoteId: string) => {
    setAcceptingQuote(quoteId);
    try {
      await quotesAPI.accept(quoteId);
      await loadData();
      alert('Quote accepted successfully! An invoice has been created for payment.');
    } catch (error: any) {
      console.error('Failed to accept quote:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to accept quote. Please try again.';
      alert(errorMessage);
    } finally {
      setAcceptingQuote(null);
    }
  };

  // Handle decline quote
  const handleDeclineQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to decline this quote?')) return;
    
    setDecliningQuote(quoteId);
    try {
      await quotesAPI.update(quoteId, { status: 'declined' });
      await loadData();
      alert('Quote declined.');
    } catch (error: any) {
      console.error('Failed to decline quote:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to decline quote. Please try again.';
      alert(errorMessage);
    } finally {
      setDecliningQuote(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const getStatusBadge = (status: string, type: 'quote' | 'form' | 'folder') => {
    const statusLower = status.toLowerCase();
    let badgeClass = 'badge-draft';
    let label = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
    let icon = '';

    if (type === 'quote') {
      switch (statusLower) {
        case 'accepted':
          badgeClass = 'badge-accepted';
          icon = '';
          break;
        case 'declined':
          badgeClass = 'badge-declined';
          icon = '';
          break;
        case 'sent':
          badgeClass = 'badge-sent';
          icon = '';
          break;
        case 'viewed':
          badgeClass = 'badge-sent';
          icon = '';
          break;
        default:
          badgeClass = 'badge-draft';
          icon = '';
      }
    } else if (type === 'folder') {
      switch (statusLower) {
        case 'active':
          badgeClass = 'badge-sent';
          icon = '';
          break;
        case 'completed':
          badgeClass = 'badge-accepted';
          icon = '';
          break;
        case 'archived':
          badgeClass = 'badge-declined';
          icon = '';
          break;
        case 'cancelled':
          badgeClass = 'badge-declined';
          icon = '';
          break;
        default:
          badgeClass = 'badge-draft';
          icon = '';
      }
    } else {
      switch (statusLower) {
        case 'published':
          badgeClass = 'badge-sent';
          icon = '';
          break;
        case 'archived':
          badgeClass = 'badge-declined';
          icon = '';
          break;
        default:
          badgeClass = 'badge-draft';
          icon = '';
      }
    }

    return <span className={`badge ${badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      {icon}{label}
    </span>;
  };

  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'folder') {
      navigate(`/folders/${item.id}`);
    } else if (item.type === 'quote') {
      navigate(`/quotes/${item.id}`);
    } else {
      navigate(`/forms/${item.id}`);
    }
  };

  const handleDownloadPDF = async (quote: Quote, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    try {
      const response = await api.get(`/api/pdf/quote/${quote.id}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quote.quote_number || 'quote'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  const handleCompleteForm = (form: Form, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    // Navigate to public form view to complete it
    if (form.public_url_slug) {
      window.open(`/public/form/${form.public_url_slug}`, '_blank');
    } else {
      navigate(`/forms/${form.id}`);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p className="text-center">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Filters and Search */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <label htmlFor="customer-dashboard-search" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Search
            </label>
            <input
              type="text"
              id="customer-dashboard-search"
              name="customer-dashboard-search"
              placeholder="Search quotes and forms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '1rem 1.5rem',
                fontSize: '1.125rem',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#667eea';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e0e0e0';
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Filter Row */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1', minWidth: '150px' }}>
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
                {FOLDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1', minWidth: '150px' }}>
              <label htmlFor="sort-by" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Sort By
              </label>
              <select
                id="sort-by"
                name="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {(statusFilter || searchTerm) && (
              <div>
                <button
                  onClick={() => {
                    setStatusFilter('');
                    setSearchTerm('');
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {filteredItems.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>
              {searchTerm ? 'No results found' : 'No assignments yet'}
            </h2>
            <p className="text-muted">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'You don\'t have any quotes or forms assigned to you yet.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Description</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={`${item.type}-${item.id}`}
                  style={{
                    cursor: 'pointer',
                    ...(item.priority === 'high' ? {
                      backgroundColor: '#fef2f2',
                    } : {}),
                  }}
                  onClick={() => handleItemClick(item)}
                >
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {item.type === 'folder' ? 'Folder' : item.type === 'quote' ? 'Quote' : 'Form'}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{item.title}</strong>
                  </td>
                  <td>
                    {getStatusBadge(item.status, item.type)}
                  </td>
                  <td>
                    {item.priority === 'high' ? (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                      }}>
                        High Priority
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {item.description || '-'}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {formatDate(item.created_at)}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleItemClick(item)}
                        className="btn-outline btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        View
                      </button>
                      {item.type === 'folder' && (
                        <button
                          onClick={() => handleItemClick(item)}
                          className="btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Open
                        </button>
                      )}
                      {item.type === 'quote' && (
                        <>
                          <button
                            onClick={(e) => handleDownloadPDF(item.data as Quote, e)}
                            className="btn-outline btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            PDF
                          </button>
                          {(item.status === 'draft' || item.status === 'sent' || item.status === 'viewed') && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAcceptQuote(item.id);
                                }}
                                disabled={acceptingQuote === item.id}
                                className="btn-primary btn-sm"
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem',
                                  opacity: acceptingQuote === item.id ? 0.6 : 1,
                                }}
                              >
                                {acceptingQuote === item.id ? 'Accepting...' : 'Accept'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeclineQuote(item.id);
                                }}
                                disabled={decliningQuote === item.id}
                                className="btn-danger btn-sm"
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem',
                                  opacity: decliningQuote === item.id ? 0.6 : 1,
                                }}
                              >
                                {decliningQuote === item.id ? 'Declining...' : 'Decline'}
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {item.type === 'form' && (
                        <button
                          onClick={(e) => handleCompleteForm(item.data as Form, e)}
                          className="btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Complete
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
}

export default CustomerDashboard;

