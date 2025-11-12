import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { quotesAPI, clientsAPI } from '../api';
import type { Quote, QuoteFilters, Client } from '../api';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Assignment {
  user_id: string;
}

// Valid status values
const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined'] as const;
const PAYMENT_STATUSES = ['unpaid', 'paid', 'partially_paid', 'refunded', 'failed', 'voided', 'uncollectible'] as const;
const SORT_FIELDS = [
  { value: 'created_at', label: 'Created Date' },
  { value: 'total', label: 'Total Amount' },
  { value: 'status', label: 'Status' },
  { value: 'quote_number', label: 'Quote Number' },
  { value: 'title', label: 'Title' },
] as const;

const ITEMS_PER_PAGE = 25;

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function QuotesList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [users, setUsers] = useState<Record<string, User>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState<string | null>(null);
  const [showSendEmailModal, setShowSendEmailModal] = useState<string | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showFilterPresets, setShowFilterPresets] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const { role } = useAuth();

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    quoteNumber: true,
    title: true,
    client: true,
    total: true,
    quoteStatus: true,
    paymentStatus: true,
    priority: true,
    assignedTo: true,
    created: true,
    actions: true,
  });

  // Filter presets (stored in localStorage)
  const [filterPresets, setFilterPresets] = useState<Array<{ name: string; filters: Record<string, string> }>>(() => {
    try {
      const saved = localStorage.getItem('quoteFilterPresets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Get filter values from URL params
  const searchTerm = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const paymentStatusFilter = searchParams.get('payment_status') || '';
  const clientFilter = searchParams.get('client_id') || '';
  const createdFrom = searchParams.get('created_from') || '';
  const createdTo = searchParams.get('created_to') || '';
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortOrder = (searchParams.get('sort_order') || 'desc') as 'asc' | 'desc';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // Debounce search term to avoid excessive API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Check if any filters are active
  const hasActiveFilters = Boolean(
    debouncedSearchTerm || 
    statusFilter || 
    paymentStatusFilter || 
    clientFilter || 
    createdFrom || 
    createdTo
  );

  // Mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      // Ctrl/Cmd + N to create new quote (admin only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && role === 'admin') {
        e.preventDefault();
        navigate('/quotes/new');
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowQuickActions(null);
        setShowSendEmailModal(null);
        setShowColumnSettings(false);
        setShowFilterPresets(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, role]);

  // Load clients for filter
  useEffect(() => {
    if (role === 'admin') {
      loadClients();
    }
  }, [role]);

  // Load quotes when filters change
  useEffect(() => {
    loadQuotes();
  }, [debouncedSearchTerm, statusFilter, paymentStatusFilter, clientFilter, createdFrom, createdTo, sortBy, sortOrder, currentPage]);

  // Load users for assignment display (admin only)
  useEffect(() => {
    if (role === 'admin' && quotes.length > 0) {
      loadUsers();
      loadAllAssignments();
    }
  }, [quotes, role]);

  // Refresh assignments when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (role === 'admin' && quotes.length > 0) {
        loadAllAssignments();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [quotes, role]);

  // Update selected quotes when quotes change
  useEffect(() => {
    setSelectedQuotes(new Set());
  }, [quotes]);

  const loadClients = async () => {
    try {
      const response = await clientsAPI.getAll();
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

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

  const loadAllAssignments = async () => {
    try {
      const assignmentsMap: Record<string, Assignment[]> = {};
      await Promise.all(
        quotes.map(async (quote) => {
          try {
            const response = await api.get(`/api/quotes/${quote.id}/assignments`);
            assignmentsMap[quote.id] = response.data || [];
          } catch (error) {
            console.error(`Failed to load assignments for quote ${quote.id}:`, error);
            assignmentsMap[quote.id] = [];
          }
        })
      );
      setAssignments(assignmentsMap);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const loadQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: QuoteFilters = {};
      if (debouncedSearchTerm.trim()) {
        filters.search = debouncedSearchTerm.trim();
      }
      if (statusFilter) {
        filters.status = statusFilter;
      }
      if (paymentStatusFilter) {
        filters.payment_status = paymentStatusFilter;
      }
      if (clientFilter) {
        filters.client_id = clientFilter;
      }
      if (createdFrom) {
        filters.created_from = createdFrom;
      }
      if (createdTo) {
        filters.created_to = createdTo;
      }
      filters.sort_by = sortBy;
      filters.sort_order = sortOrder;
      filters.limit = ITEMS_PER_PAGE;
      filters.offset = (currentPage - 1) * ITEMS_PER_PAGE;

      const response = await quotesAPI.getAll(filters);
      setQuotes(response.data);
      // For now, we'll use the response length. In a real app, you'd get total count from backend
      setTotalCount(response.data.length);
    } catch (error: any) {
      console.error('Failed to load quotes:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to load quotes. Please try again.';
      setError(errorMessage);
      setQuotes([]);
      setTotalCount(null);
    } finally {
      setLoading(false);
    }
  };

  const getAssignedToText = (quoteId: string): string => {
    const quoteAssignments = assignments[quoteId] || [];
    if (quoteAssignments.length === 0) {
      return '-';
    }
    if (quoteAssignments.length === 1) {
      const user = users[quoteAssignments[0].user_id];
      if (user) {
        return user.name && user.name !== user.email ? user.name : user.email;
      }
      return 'Unknown';
    }
    return `${quoteAssignments.length} people`;
  };

  // Update URL params when filters change
  const updateFilter = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
      // Reset to page 1 when filters change
      if (key !== 'page') {
        newParams.delete('page');
      }
      return newParams;
    });
  }, [setSearchParams]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateFilter('search', value);
  };


  // Handle payment status filter change
  const handlePaymentStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilter('payment_status', e.target.value);
  };

  // Handle client filter change
  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilter('client_id', e.target.value);
  };

  // Handle date filter changes
  const handleDateFilterChange = (key: 'created_from' | 'created_to', value: string) => {
    updateFilter(key, value);
  };

  // Handle sort change
  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      // Toggle order if same field
      updateFilter('sort_order', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      updateFilter('sort_by', field);
      updateFilter('sort_order', 'desc');
    }
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    updateFilter('page', page.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchParams({});
  };

  // Toggle quote selection
  const toggleQuoteSelection = (quoteId: string) => {
    setSelectedQuotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(quoteId)) {
        newSet.delete(quoteId);
      } else {
        newSet.add(quoteId);
      }
      return newSet;
    });
  };

  // Toggle all quotes selection
  const toggleAllQuotes = () => {
    if (selectedQuotes.size === quotes.length) {
      setSelectedQuotes(new Set());
    } else {
      setSelectedQuotes(new Set(quotes.map(q => q.id)));
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedQuotes.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedQuotes.size} quote(s)?`)) return;

    setBulkActionLoading(true);
    try {
      await quotesAPI.bulkDelete(Array.from(selectedQuotes));
      setSelectedQuotes(new Set());
      await loadQuotes();
      alert(`Successfully deleted ${selectedQuotes.size} quote(s)`);
    } catch (error: any) {
      console.error('Failed to delete quotes:', error);
      alert('Failed to delete quotes. Please try again.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk status update
  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedQuotes.size === 0) return;

    setBulkActionLoading(true);
    try {
      await quotesAPI.bulkUpdateStatus(Array.from(selectedQuotes), status);
      setSelectedQuotes(new Set());
      await loadQuotes();
      alert(`Successfully updated ${selectedQuotes.size} quote(s) to ${formatStatus(status)}`);
    } catch (error: any) {
      console.error('Failed to update quotes:', error);
      alert('Failed to update quotes. Please try again.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Quote Number', 'Title', 'Client', 'Total', 'Status', 'Payment Status', 'Created', 'Priority'];
    const rows = quotes.map(quote => [
      quote.quote_number,
      quote.title,
      quote.clients?.name || '',
      quote.total,
      quote.status,
      quote.payment_status || '',
      formatDate(quote.created_at),
      quote.priority || 'normal',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `quotes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Duplicate quote
  const handleDuplicateQuote = async (quoteId: string) => {
    try {
      const quote = quotes.find(q => q.id === quoteId);
      if (!quote) return;

      const duplicateData = {
        title: `${quote.title} (Copy)`,
        client_id: quote.client_id || '',
        notes: quote.notes || '',
        terms: quote.terms || '',
        tax_rate: quote.tax_rate,
        currency: quote.currency,
        status: 'draft',
        line_items: quote.line_items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || '0',
          tax_rate: item.tax_rate || '0',
        })),
      };

      await quotesAPI.create(duplicateData);
      await loadQuotes();
      alert('Quote duplicated successfully!');
    } catch (error: any) {
      console.error('Failed to duplicate quote:', error);
      alert('Failed to duplicate quote. Please try again.');
    }
  };

  // Send email
  const handleSendEmail = async (quoteId: string, toEmail: string, customMessage?: string, includePdf?: boolean) => {
    try {
      setSendingEmail(true);
      await quotesAPI.sendEmail(quoteId, toEmail, customMessage, includePdf);
      setShowSendEmailModal(null);
      alert('Quote sent successfully!');
    } catch (error: any) {
      console.error('Failed to send email:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to send email. Please try again.';
      alert(errorMessage);
    } finally {
      setSendingEmail(false);
    }
  };

  // Save filter preset
  const handleSaveFilterPreset = (name: string) => {
    const filters = {
      search: searchTerm,
      status: statusFilter,
      payment_status: paymentStatusFilter,
      client_id: clientFilter,
      created_from: createdFrom,
      created_to: createdTo,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    
    const newPreset = { name, filters };
    const updated = [...filterPresets, newPreset];
    setFilterPresets(updated);
    localStorage.setItem('quoteFilterPresets', JSON.stringify(updated));
    setShowFilterPresets(false);
    alert('Filter preset saved!');
  };

  // Load filter preset
  const handleLoadFilterPreset = (preset: { name: string; filters: Record<string, string> }) => {
    const newParams = new URLSearchParams();
    Object.entries(preset.filters).forEach(([key, value]) => {
      if (value) newParams.set(key, value);
    });
    setSearchParams(newParams);
    setShowFilterPresets(false);
  };

  // Delete filter preset
  const handleDeleteFilterPreset = (index: number) => {
    const updated = filterPresets.filter((_, i) => i !== index);
    setFilterPresets(updated);
    localStorage.setItem('quoteFilterPresets', JSON.stringify(updated));
  };

  // Toggle column visibility
  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Format status for display
  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  };

  // Get sort icon
  const getSortIcon = (field: string) => {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  // Calculate pagination
  const totalPages = totalCount ? Math.ceil(totalCount / ITEMS_PER_PAGE) : 1;
  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalCount || 0);

  // Loading skeleton
  if (loading && quotes.length === 0) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ 
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '1rem'
            }}></div>
            <p>Loading quotes...</p>
          </div>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <h1>Quotes</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {role === 'admin' && quotes.length > 0 && (
            <button onClick={handleExportCSV} className="btn-outline" style={{ fontSize: '0.875rem' }}>
              Export CSV
            </button>
          )}
          {role === 'admin' && (
            <button onClick={() => navigate('/quotes/new')} className="btn-primary">
              Create New Quote
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {role === 'admin' && selectedQuotes.size > 0 && (
        <div className="card mb-4" style={{ 
          backgroundColor: '#eff6ff', 
          borderColor: '#3b82f6',
          borderWidth: '2px',
          borderStyle: 'solid',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ fontWeight: '600', color: '#1e40af' }}>
            {selectedQuotes.size} quote(s) selected
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              id="bulk-status-select"
              name="bulk-status-select"
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkStatusUpdate(e.target.value);
                  e.target.value = '';
                }
              }}
              disabled={bulkActionLoading}
              style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
            >
              <option value="">Change Status...</option>
              {QUOTE_STATUSES.map(status => (
                <option key={status} value={status}>{formatStatus(status)}</option>
              ))}
            </select>
            <button
              onClick={handleBulkDelete}
              disabled={bulkActionLoading}
              className="btn-danger"
              style={{ fontSize: '0.875rem' }}
            >
              {bulkActionLoading ? 'Deleting...' : 'Delete Selected'}
            </button>
            <button
              onClick={() => setSelectedQuotes(new Set())}
              className="btn-outline"
              style={{ fontSize: '0.875rem' }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="card mb-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search Input */}
          <div>
            <input
              type="text"
              id="quote-search"
              name="quote-search"
              placeholder="Search quotes by title, number, or client..."
              value={searchTerm}
              onChange={handleSearchChange}
              style={{ width: '100%', padding: '0.75rem' }}
            />
          </div>

          {/* Status Filter Chips */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Quote Status
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => updateFilter('status', '')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  backgroundColor: statusFilter === '' ? '#667eea' : 'white',
                  color: statusFilter === '' ? 'white' : '#374151',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: statusFilter === '' ? '600' : '400',
                }}
              >
                All
              </button>
              {QUOTE_STATUSES.map((status) => (
                <button
                  key={status}
                  onClick={() => updateFilter('status', statusFilter === status ? '' : status)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: statusFilter === status ? '#667eea' : 'white',
                    color: statusFilter === status ? 'white' : '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: statusFilter === status ? '600' : '400',
                  }}
                >
                  {formatStatus(status)}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Row 1 */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>

            <div style={{ flex: '1', minWidth: '200px' }}>
              <label htmlFor="payment-status-filter" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Payment Status
              </label>
              <select
                id="payment-status-filter"
                value={paymentStatusFilter}
                onChange={handlePaymentStatusChange}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="">All Payment Statuses</option>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </div>

            {role === 'admin' && (
              <div style={{ flex: '1', minWidth: '200px' }}>
                <label htmlFor="client-filter" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Client
                </label>
                <select
                  id="client-filter"
                  value={clientFilter}
                  onChange={handleClientChange}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                >
                  <option value="">All Clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} {client.company ? `(${client.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter Presets and Clear */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {filterPresets.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowFilterPresets(!showFilterPresets)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Presets
                  </button>
                  {showFilterPresets && (
                    <>
                      <div
                        style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 998
                        }}
                        onClick={() => setShowFilterPresets(false)}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: '0.5rem',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                          zIndex: 999,
                          minWidth: '200px',
                          padding: '0.5rem'
                        }}
                      >
                        {filterPresets.map((preset, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', gap: '0.5rem' }}>
                            <button
                              onClick={() => handleLoadFilterPreset(preset)}
                              style={{
                                flex: 1,
                                padding: '0.5rem',
                                textAlign: 'left',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '0.875rem'
                              }}
                            >
                              {preset.name}
                            </button>
                            <button
                              onClick={() => handleDeleteFilterPreset(index)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                border: 'none',
                                background: '#ef4444',
                                color: 'white',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const name = prompt('Enter preset name:');
                            if (name) handleSaveFilterPreset(name);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            marginTop: '0.5rem',
                            border: '1px dashed #d1d5db',
                            background: 'white',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          + Save Current Filters
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
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
              )}
              {!hasActiveFilters && filterPresets.length === 0 && (
                <button
                  onClick={() => {
                    const name = prompt('Enter preset name:');
                    if (name) handleSaveFilterPreset(name);
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Save Filters
                </button>
              )}
            </div>
          </div>

          {/* Date Range Filters */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label htmlFor="created-from" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Created From
              </label>
              <input
                id="created-from"
                type="date"
                value={createdFrom}
                onChange={(e) => handleDateFilterChange('created_from', e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label htmlFor="created-to" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Created To
              </label>
              <input
                id="created-to"
                type="date"
                value={createdTo}
                onChange={(e) => handleDateFilterChange('created_to', e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </div>
          </div>

          {/* Result Count and Sort */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {!loading && totalCount !== null && (
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {hasActiveFilters ? (
                  <>Showing {startItem}-{endItem} of {totalCount} {totalCount === 1 ? 'quote' : 'quotes'}</>
                ) : (
                  <>Total: {totalCount} {totalCount === 1 ? 'quote' : 'quotes'}</>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {role === 'admin' && !isMobile && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowColumnSettings(!showColumnSettings)}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Columns
                  </button>
                  {showColumnSettings && (
                    <>
                      <div
                        style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 998
                        }}
                        onClick={() => setShowColumnSettings(false)}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: '0.5rem',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                          zIndex: 999,
                          minWidth: '200px',
                          padding: '0.5rem'
                        }}
                      >
                        <div style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Show Columns:</div>
                        {Object.entries({
                          quoteNumber: 'Quote Number',
                          title: 'Title',
                          client: 'Client',
                          total: 'Total',
                          quoteStatus: 'Quote Status',
                          paymentStatus: 'Payment Status',
                          priority: 'Priority',
                          assignedTo: 'Assigned To',
                          created: 'Created',
                          actions: 'Actions',
                        }).map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              id={`column-toggle-${key}`}
                              name={`column-toggle-${key}`}
                              checked={visibleColumns[key as keyof typeof visibleColumns]}
                              onChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                            />
                            <span style={{ fontSize: '0.875rem' }}>{label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <label htmlFor="sort-by" style={{ fontSize: '0.875rem', fontWeight: '500' }}>Sort by:</label>
              <select
                id="sort-by"
                name="sort-by"
                value={sortBy}
                onChange={(e) => updateFilter('sort_by', e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
              >
                {SORT_FIELDS.map(field => (
                  <option key={field.value} value={field.value}>{field.label}</option>
                ))}
              </select>
              <button
                onClick={() => updateFilter('sort_order', sortOrder === 'asc' ? 'desc' : 'asc')}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
                title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>
            {error}
            <button
              onClick={loadQuotes}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                backgroundColor: '#dc2626',
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

      {/* Quotes Table/Cards */}
      {!error && (
        <>
          {quotes.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <h2 style={{ marginBottom: '0.5rem' }}>
                  {hasActiveFilters ? 'No quotes found' : 'No quotes yet'}
                </h2>
                <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                  {hasActiveFilters
                    ? 'Try adjusting your filters to see more results.'
                    : role === 'admin' 
                      ? 'Create your first quote to get started!'
                      : 'You don\'t have any quotes assigned yet.'}
                </p>
                {role === 'admin' && !hasActiveFilters && (
                  <button onClick={() => navigate('/quotes/new')} className="btn-primary">
                    Create Your First Quote
                  </button>
                )}
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="btn-outline">
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {isMobile ? (
                // Mobile Card View
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {quotes.map((quote) => (
                    <div key={quote.id} className="card" style={{ position: 'relative' }}>
                      {role === 'admin' && (
                        <input
                          type="checkbox"
                          checked={selectedQuotes.has(quote.id)}
                          onChange={() => toggleQuoteSelection(quote.id)}
                          style={{
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer'
                          }}
                        />
                      )}
                      <div style={{ paddingRight: role === 'admin' ? '2.5rem' : '0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div>
                            <Link to={`/quotes/${quote.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
                              {quote.title}
                            </Link>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                              {quote.quote_number}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                              ${parseFloat(quote.total).toFixed(2)}
                            </div>
                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <span className={`badge badge-${quote.status}`} style={{ fontSize: '0.75rem' }}>
                                {formatStatus(quote.status)}
                              </span>
                              {quote.payment_status && (
                                <span className={`badge badge-${quote.payment_status}`} style={{ fontSize: '0.75rem' }}>
                                  {formatStatus(quote.payment_status)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.75rem' }}>
                          <div><strong>Client:</strong> {quote.clients?.name || '-'}</div>
                          <div style={{ marginTop: '0.25rem' }}><strong>Created:</strong> {formatDate(quote.created_at)}</div>
                          {role === 'admin' && (
                            <>
                              <div style={{ marginTop: '0.25rem' }}>
                                <strong>Priority:</strong>{' '}
                                <select
                                  id={`quote-priority-${quote.id}`}
                                  name={`quote-priority-${quote.id}`}
                                  value={quote.priority || 'normal'}
                                  onChange={async (e) => {
                                    try {
                                      await quotesAPI.update(quote.id, { priority: e.target.value });
                                      loadQuotes();
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
                              </div>
                              <div style={{ marginTop: '0.25rem' }}>
                                <strong>Assigned To:</strong> {getAssignedToText(quote.id)}
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <Link to={`/quotes/${quote.id}`} className="btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                            View
                          </Link>
                          {role === 'admin' && (
                            <>
                              <Link to={`/quotes/${quote.id}/edit`} className="btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                                Edit
                              </Link>
                              <button
                                onClick={() => handleDuplicateQuote(quote.id)}
                                className="btn-outline"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                              >
                                Duplicate
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Desktop Table View
                <div className="card">
                  {loading && quotes.length > 0 && (
                    <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                      Updating results...
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          {role === 'admin' && (
                            <th style={{ width: '40px' }}>
                              <input
                                type="checkbox"
                                id="select-all-quotes"
                                name="select-all-quotes"
                                checked={selectedQuotes.size === quotes.length && quotes.length > 0}
                                onChange={toggleAllQuotes}
                                style={{ cursor: 'pointer' }}
                              />
                            </th>
                          )}
                          {visibleColumns.quoteNumber && (
                            <th 
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => handleSortChange('quote_number')}
                            >
                              Quote Number {getSortIcon('quote_number')}
                            </th>
                          )}
                          {visibleColumns.title && (
                            <th 
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => handleSortChange('title')}
                            >
                              Title {getSortIcon('title')}
                            </th>
                          )}
                          {visibleColumns.client && <th>Client</th>}
                          {visibleColumns.total && (
                            <th 
                              style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                              onClick={() => handleSortChange('total')}
                            >
                              Total {getSortIcon('total')}
                            </th>
                          )}
                          {visibleColumns.quoteStatus && (
                            <th 
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => handleSortChange('status')}
                            >
                              Quote Status {getSortIcon('status')}
                            </th>
                          )}
                          {visibleColumns.paymentStatus && <th>Payment Status</th>}
                          {role === 'admin' && visibleColumns.priority && <th>Priority</th>}
                          {role === 'admin' && visibleColumns.assignedTo && <th>Assigned To</th>}
                          {visibleColumns.created && (
                            <th 
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => handleSortChange('created_at')}
                            >
                              Created {getSortIcon('created_at')}
                            </th>
                          )}
                          {visibleColumns.actions && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.map((quote) => (
                          <tr key={quote.id}>
                            {role === 'admin' && (
                              <td>
                                <input
                                  type="checkbox"
                                  id={`quote-select-${quote.id}`}
                                  name={`quote-select-${quote.id}`}
                                  checked={selectedQuotes.has(quote.id)}
                                  onChange={() => toggleQuoteSelection(quote.id)}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                            )}
                            {visibleColumns.quoteNumber && <td>{quote.quote_number}</td>}
                            {visibleColumns.title && (
                              <td>
                                <Link to={`/quotes/${quote.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                                  {quote.title}
                                </Link>
                              </td>
                            )}
                            {visibleColumns.client && <td>{quote.clients?.name || '-'}</td>}
                            {visibleColumns.total && <td className="text-right">${parseFloat(quote.total).toFixed(2)}</td>}
                            {visibleColumns.quoteStatus && (
                              <td>
                                <span className={`badge badge-${quote.status}`}>{formatStatus(quote.status)}</span>
                              </td>
                            )}
                            {visibleColumns.paymentStatus && (
                              <td>
                                {quote.payment_status ? (
                                  <span className={`badge badge-${quote.payment_status}`}>{formatStatus(quote.payment_status)}</span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            )}
                            {role === 'admin' && visibleColumns.priority && (
                              <td>
                                <select
                                  id={`quote-priority-${quote.id}`}
                                  name={`quote-priority-${quote.id}`}
                                  value={quote.priority || 'normal'}
                                  onChange={async (e) => {
                                    try {
                                      await quotesAPI.update(quote.id, { priority: e.target.value });
                                      loadQuotes();
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
                            {role === 'admin' && visibleColumns.assignedTo && (
                              <td>
                                <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                                  {getAssignedToText(quote.id)}
                                </span>
                              </td>
                            )}
                            {visibleColumns.created && <td>{formatDate(quote.created_at)}</td>}
                            {visibleColumns.actions && (
                              <td>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                  <button
                                    onClick={() => setShowQuickActions(showQuickActions === quote.id ? null : quote.id)}
                                    className="btn-outline"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  >
                                    ⋮
                                  </button>
                                  {showQuickActions === quote.id && (
                                    <>
                                      <div
                                        style={{
                                          position: 'fixed',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          bottom: 0,
                                          zIndex: 998
                                        }}
                                        onClick={() => setShowQuickActions(null)}
                                      />
                                      <div
                                        style={{
                                          position: 'absolute',
                                          right: 0,
                                          top: '100%',
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                          zIndex: 999,
                                          minWidth: '150px'
                                        }}
                                      >
                                        <Link
                                          to={`/quotes/${quote.id}`}
                                          style={{
                                            display: 'block',
                                            padding: '0.5rem 1rem',
                                            textDecoration: 'none',
                                            color: '#374151',
                                            fontSize: '0.875rem'
                                          }}
                                          onClick={() => setShowQuickActions(null)}
                                        >
                                          View
                                        </Link>
                                        {role === 'admin' && (
                                          <>
                                            <Link
                                              to={`/quotes/${quote.id}/edit`}
                                              style={{
                                                display: 'block',
                                                padding: '0.5rem 1rem',
                                                textDecoration: 'none',
                                                color: '#374151',
                                                fontSize: '0.875rem',
                                                borderTop: '1px solid #e5e7eb'
                                              }}
                                              onClick={() => setShowQuickActions(null)}
                                            >
                                              Edit
                                            </Link>
                                            <button
                                              onClick={() => {
                                                setShowSendEmailModal(quote.id);
                                                setShowQuickActions(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 1rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                color: '#374151',
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                borderTop: '1px solid #e5e7eb'
                                              }}
                                            >
                                              Send Email
                                            </button>
                                            <button
                                              onClick={() => {
                                                handleDuplicateQuote(quote.id);
                                                setShowQuickActions(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 1rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                color: '#374151',
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                borderTop: '1px solid #e5e7eb'
                                              }}
                                            >
                                              Duplicate
                                            </button>
                                            <button
                                              onClick={async () => {
                                                if (confirm('Are you sure you want to delete this quote?')) {
                                                  try {
                                                    await quotesAPI.delete(quote.id);
                                                    await loadQuotes();
                                                    setShowQuickActions(null);
                                                  } catch (error) {
                                                    console.error('Failed to delete quote:', error);
                                                    alert('Failed to delete quote. Please try again.');
                                                  }
                                                }
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 1rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                color: '#dc2626',
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                borderTop: '1px solid #e5e7eb'
                                              }}
                                            >
                                              Delete
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="btn-outline"
                      style={{ fontSize: '0.875rem' }}
                    >
                      Previous
                    </button>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={currentPage === pageNum ? 'btn-primary' : 'btn-outline'}
                            style={{ fontSize: '0.875rem', minWidth: '2.5rem' }}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="btn-outline"
                      style={{ fontSize: '0.875rem' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Send Email Modal */}
      {showSendEmailModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSendEmailModal(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Send Quote via Email</h3>
            <SendEmailForm
              quote={quotes.find(q => q.id === showSendEmailModal)}
              onSend={(email, message, includePdf) => {
                if (showSendEmailModal) {
                  handleSendEmail(showSendEmailModal, email, message, includePdf);
                }
              }}
              onCancel={() => setShowSendEmailModal(null)}
              sending={sendingEmail}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Send Email Form Component
function SendEmailForm({ quote, onSend, onCancel, sending }: { quote?: Quote; onSend: (email: string, message?: string, includePdf?: boolean) => void; onCancel: () => void; sending: boolean }) {
  const [email, setEmail] = useState(quote?.clients?.email || '');
  const [message, setMessage] = useState('');
  const [includePdf, setIncludePdf] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(email, message || undefined, includePdf);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          To Email *
        </label>
        <input
          type="email"
          id="send-email-to-list"
          name="send-email-to-list"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Custom Message (optional)
        </label>
        <textarea
          id="send-email-message-list"
          name="send-email-message-list"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a personal message..."
          style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            id="send-email-include-pdf-list"
            name="send-email-include-pdf-list"
            checked={includePdf}
            onChange={(e) => setIncludePdf(e.target.checked)}
          />
          <span>Include PDF attachment</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn-outline" disabled={sending}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={sending || !email}>
          {sending ? 'Sending...' : 'Send Email'}
        </button>
      </div>
    </form>
  );
}

export default QuotesList;
