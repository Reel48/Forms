import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { quotesAPI, foldersAPI, clientsAPI } from '../api';
import type { Quote, Form, Folder, Client } from '../api';
import CustomerChatWidget from '../components/CustomerChatWidget';

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

function CustomerDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingQuote, setAcceptingQuote] = useState<string | null>(null);
  const [decliningQuote, setDecliningQuote] = useState<string | null>(null);
  const [customerProfile, setCustomerProfile] = useState<Client | null>(null);
  const searchTerm = searchParams.get('search') || '';

  useEffect(() => {
    if (role === 'customer') {
      loadData();
      loadCustomerProfile();
    }
  }, [role]);

  // Refresh data when page becomes visible (user switches back to tab/window)
  useEffect(() => {
    if (role === 'customer') {
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          // Page became visible, refresh data
          loadData();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [role]);

  const loadCustomerProfile = async () => {
    try {
      const response = await clientsAPI.getMyProfile();
      if (response.data) {
        setCustomerProfile(response.data);
      }
    } catch (error) {
      console.error('Failed to load customer profile:', error);
    }
  };

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

  // Convert folders to timeline items and group by status
  const foldersByStatus = useMemo(() => {
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

    // Sort items by date (newest first)
    const sortedItems = items.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Group by status
    const grouped: Record<string, TimelineItem[]> = {
      active: [],
      completed: [],
      archived: [],
      cancelled: [],
    };

    sortedItems.forEach(item => {
      const status = item.status.toLowerCase();
      if (grouped[status]) {
        grouped[status].push(item);
      } else {
        grouped.active.push(item); // Default to active if status unknown
      }
    });

    return grouped;
  }, [folders]);

  // Filter folders by search term
  const filteredFoldersByStatus = useMemo(() => {
    if (!searchTerm.trim()) {
      return foldersByStatus;
    }

    const searchLower = searchTerm.toLowerCase();
    const filterItems = (items: TimelineItem[]) => {
      return items.filter(item => 
      item.title.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower) ||
      (item.type === 'quote' && (item.data as Quote).quote_number?.toLowerCase().includes(searchLower))
    );
    };

    return {
      active: filterItems(foldersByStatus.active),
      completed: filterItems(foldersByStatus.completed),
      archived: filterItems(foldersByStatus.archived),
      cancelled: filterItems(foldersByStatus.cancelled),
    };
  }, [foldersByStatus, searchTerm]);

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

  return (
    <div className="container">
      <CustomerChatWidget />
      
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading...</p>
        </div>
      )}

      {!loading && (
        <>
      {/* Customer Header */}
      {customerProfile && (
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="customer-company-name" style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 0.5rem 0',
            color: 'var(--color-text-primary)',
            fontFamily: '"Rubik", sans-serif'
          }}>
            {customerProfile.company || 'Company Name'}
          </h1>
          <p style={{ 
            fontSize: '1.125rem', 
            fontWeight: '400',
            margin: '0',
            color: 'var(--color-text-secondary)'
          }}>
            {customerProfile.name || 'Customer Name'}
          </p>
        </div>
      )}

      {/* Folders Grouped by Status */}
      {filteredFoldersByStatus.active.length === 0 && filteredFoldersByStatus.completed.length === 0 && filteredFoldersByStatus.archived.length === 0 && filteredFoldersByStatus.cancelled.length === 0 ? (
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
        <>
          {/* Active Folders */}
          {filteredFoldersByStatus.active.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>Active Orders</h2>
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
                  {filteredFoldersByStatus.active.map((item) => (
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
                  <td className="mobile-name-column">
                    <strong style={{ color: 'var(--color-primary, #2563eb)' }}>{item.title}</strong>
                  </td>
                  <td className="mobile-status-column">
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

          {/* Completed Folders */}
          {filteredFoldersByStatus.completed.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>Completed Orders</h2>
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
                  {filteredFoldersByStatus.completed.map((item) => (
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
                      <td className="mobile-name-column">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Archived Folders */}
          {filteredFoldersByStatus.archived.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>Archived Orders</h2>
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
                  {filteredFoldersByStatus.archived.map((item) => (
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
                      <td className="mobile-name-column">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cancelled Folders */}
          {filteredFoldersByStatus.cancelled.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>Cancelled Orders</h2>
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
                  {filteredFoldersByStatus.cancelled.map((item) => (
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
                      <td className="mobile-name-column">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}

export default CustomerDashboard;

