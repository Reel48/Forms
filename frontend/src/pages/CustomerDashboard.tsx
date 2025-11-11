import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import type { Quote, Form } from '../api';

interface TimelineItem {
  id: string;
  type: 'quote' | 'form';
  title: string;
  description?: string;
  status: string;
  priority?: string;
  created_at: string;
  data: Quote | Form;
}

function CustomerDashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (role === 'customer') {
      loadData();
    }
  }, [role]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [quotesResponse, formsResponse] = await Promise.all([
        api.get('/api/customer/quotes'),
        api.get('/api/customer/forms'),
      ]);
      setQuotes(quotesResponse.data || []);
      setForms(formsResponse.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Combine and sort timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [
      ...quotes.map(quote => ({
        id: quote.id,
        type: 'quote' as const,
        title: quote.title,
        description: `Quote #${quote.quote_number}`,
        status: quote.status,
        priority: quote.priority || 'normal',
        created_at: quote.created_at,
        data: quote,
      })),
      ...forms.map(form => ({
        id: form.id,
        type: 'form' as const,
        title: form.name,
        description: form.description || '',
        status: form.status,
        priority: form.priority || 'normal',
        created_at: form.created_at,
        data: form,
      })),
    ];

    // Sort by priority first (high priority first), then by created_at descending (newest first)
    return items.sort((a, b) => {
      // High priority items first
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (a.priority !== 'high' && b.priority === 'high') return 1;
      // Then by date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [quotes, forms]);

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

  const getStatusBadge = (status: string, type: 'quote' | 'form') => {
    const statusLower = status.toLowerCase();
    let badgeClass = 'badge-draft';
    let label = status.charAt(0).toUpperCase() + status.slice(1);

    if (type === 'quote') {
      switch (statusLower) {
        case 'accepted':
          badgeClass = 'badge-accepted';
          break;
        case 'declined':
          badgeClass = 'badge-declined';
          break;
        case 'sent':
        case 'viewed':
          badgeClass = 'badge-sent';
          break;
        default:
          badgeClass = 'badge-draft';
      }
    } else {
      switch (statusLower) {
        case 'published':
          badgeClass = 'badge-sent';
          break;
        case 'archived':
          badgeClass = 'badge-declined';
          break;
        default:
          badgeClass = 'badge-draft';
      }
    }

    return <span className={`badge ${badgeClass}`}>{label}</span>;
  };

  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'quote') {
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
      {/* Large Search Box */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
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
                      borderLeft: `4px solid ${item.type === 'quote' ? '#667eea' : '#10b981'}`,
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
                        backgroundColor: item.type === 'quote' ? '#667eea' : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        flexShrink: 0,
                      }}>
                        {item.type === 'quote' ? '💰' : '📝'}
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
                          <span>{item.type === 'quote' ? 'Quote' : 'Form'}</span>
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
                          {item.type === 'quote' && (
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

