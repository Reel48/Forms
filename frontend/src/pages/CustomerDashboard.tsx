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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
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
      
      // Also load quotes and forms for backward compatibility
      try {
        const [quotesResponse, formsResponse] = await Promise.all([
          api.get('/api/customer/quotes'),
          api.get('/api/customer/forms'),
        ]);
        setQuotes(quotesResponse.data || []);
        setForms(formsResponse.data || []);
      } catch (error) {
        // If customer endpoints don't exist, that's okay
        console.warn('Could not load quotes/forms:', error);
      }
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

  // Group items by date
  const groupedItems = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {
      'Today': [],
      'This Week': [],
      'This Month': [],
      'Older': [],
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    filteredItems.forEach(item => {
      const itemDate = new Date(item.created_at);
      
      if (itemDate >= today) {
        groups['Today'].push(item);
      } else if (itemDate >= weekAgo) {
        groups['This Week'].push(item);
      } else if (itemDate >= monthAgo) {
        groups['This Month'].push(item);
      } else {
        groups['Older'].push(item);
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredItems]);

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
              <label htmlFor="view-mode" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                View
              </label>
              <select
                id="view-mode"
                name="view-mode"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'table' | 'cards')}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="table">Table View</option>
                <option value="cards">Card View</option>
              </select>
            </div>

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
        <div>
          {groupedItems.map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom: '2rem' }}>
              <h2 style={{ 
                marginBottom: '1rem', 
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#374151',
              }}>
                {groupName}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="card"
                    style={{
                      transition: 'all 0.2s',
                      borderLeft: `4px solid ${item.type === 'folder' ? '#2196f3' : item.type === 'quote' ? '#667eea' : '#10b981'}`,
                      ...(item.priority === 'high' ? {
                        borderLeftWidth: '6px',
                        borderLeftColor: '#ef4444',
                        backgroundColor: '#fef2f2',
                      } : {}),
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateX(4px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateX(0)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      {/* Icon */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        backgroundColor: item.type === 'folder' ? '#2196f3' : item.type === 'quote' ? '#667eea' : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        flexShrink: 0,
                      }}>
                        {item.type === 'folder' ? '📁' : item.type === 'quote' ? 'Quote' : 'Form'}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                          <h3 style={{ 
                            margin: 0, 
                            fontSize: '1.125rem',
                            fontWeight: 600,
                            color: '#1f2937',
                          }}>
                            {item.title}
                          </h3>
                          {item.priority === 'high' && (
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                            }}>
                              🔥 High Priority
                            </span>
                          )}
                          {getStatusBadge(item.status, item.type)}
                        </div>
                        {item.description && (
                          <p style={{ 
                            margin: '0 0 0.5rem 0',
                            color: '#6b7280',
                            fontSize: '0.875rem',
                          }}>
                            {item.description}
                          </p>
                        )}
                        <div style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          fontSize: '0.875rem',
                          color: '#9ca3af',
                          marginBottom: '0.75rem',
                        }}>
                          <span>{formatDate(item.created_at)}</span>
                          <span>•</span>
                          <span>{item.type === 'folder' ? 'Folder' : item.type === 'quote' ? 'Quote' : 'Form'}</span>
                        </div>
                        
                        {/* Quick Actions */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleItemClick(item)}
                            className="btn-outline"
                            style={{
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            View
                          </button>
                          {item.type === 'folder' && (
                            <button
                              onClick={() => handleItemClick(item)}
                              className="btn-primary"
                              style={{
                                padding: '0.375rem 0.75rem',
                                fontSize: '0.875rem',
                              }}
                            >
                              Open Folder
                            </button>
                          )}
                          {item.type === 'quote' && (
                            <>
                              <button
                                onClick={(e) => handleDownloadPDF(item.data as Quote, e)}
                                className="btn-outline"
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  fontSize: '0.875rem',
                                }}
                              >
                                Download PDF
                              </button>
                              {(item.status === 'draft' || item.status === 'sent' || item.status === 'viewed') && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcceptQuote(item.id);
                                    }}
                                    disabled={acceptingQuote === item.id}
                                    className="btn-primary"
                                    style={{
                                      padding: '0.375rem 0.75rem',
                                      fontSize: '0.875rem',
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
                                    className="btn-danger"
                                    style={{
                                      padding: '0.375rem 0.75rem',
                                      fontSize: '0.875rem',
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
                              className="btn-primary"
                              style={{
                                padding: '0.375rem 0.75rem',
                                fontSize: '0.875rem',
                              }}
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerDashboard;

