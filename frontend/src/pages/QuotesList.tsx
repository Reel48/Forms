import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { quotesAPI } from '../api';
import type { Quote, QuoteFilters } from '../api';
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
  const { role } = useAuth();

  // Get filter values from URL params
  const searchTerm = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const paymentStatusFilter = searchParams.get('payment_status') || '';

  // Debounce search term to avoid excessive API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Check if any filters are active
  const hasActiveFilters = Boolean(debouncedSearchTerm || statusFilter || paymentStatusFilter);

  // Load quotes when filters change
  useEffect(() => {
    loadQuotes();
  }, [debouncedSearchTerm, statusFilter, paymentStatusFilter]);

  // Load users for assignment display (admin only)
  useEffect(() => {
    if (role === 'admin' && quotes.length > 0) {
      loadUsers();
      loadAllAssignments();
    }
  }, [quotes, role]);

  // Refresh assignments when window gains focus (e.g., navigating back to tab)
  useEffect(() => {
    const handleFocus = () => {
      if (role === 'admin' && quotes.length > 0) {
        loadAllAssignments();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [quotes, role]);

  // Refresh assignments when component mounts (e.g., navigating to this page)
  useEffect(() => {
    if (role === 'admin' && quotes.length > 0) {
      // Small delay to ensure quotes are loaded first
      const timer = setTimeout(() => {
        loadAllAssignments();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

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

      const response = await quotesAPI.getAll(filters);
      setQuotes(response.data);
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
      return newParams;
    });
  }, [setSearchParams]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateFilter('search', value);
  };

  // Handle status filter change
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilter('status', e.target.value);
  };

  // Handle payment status filter change
  const handlePaymentStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilter('payment_status', e.target.value);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchParams({});
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

  if (loading && quotes.length === 0) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>Quotes</h1>
        {role === 'admin' && (
          <button onClick={() => navigate('/quotes/new')} className="btn-primary">
            Create New Quote
          </button>
        )}
      </div>

      {/* Filters Section */}
      <div className="card mb-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search Input */}
          <div>
            <input
              type="text"
              placeholder="Search quotes by title, number, or client..."
              value={searchTerm}
              onChange={handleSearchChange}
              style={{ width: '100%', padding: '0.75rem' }}
            />
          </div>

          {/* Filter Dropdowns */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label htmlFor="status-filter" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Quote Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={handleStatusChange}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="">All Statuses</option>
                {QUOTE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </div>

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

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <div>
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
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Result Count */}
          {!loading && totalCount !== null && (
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {hasActiveFilters ? (
                <>Showing {totalCount} {totalCount === 1 ? 'quote' : 'quotes'}</>
              ) : (
                <>Total: {totalCount} {totalCount === 1 ? 'quote' : 'quotes'}</>
              )}
            </div>
          )}
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

      {/* Quotes Table */}
      {!error && (
        <>
          {quotes.length === 0 ? (
            <div className="card">
              <p className="text-center text-muted">
                {hasActiveFilters
                  ? 'No quotes found matching your filters.'
                  : 'No quotes yet. Create your first quote!'}
              </p>
            </div>
          ) : (
            <div className="card">
              {loading && quotes.length > 0 && (
                <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                  Updating results...
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Quote Number</th>
                    <th>Title</th>
                    <th>Client</th>
                    <th>Total</th>
                    <th>Quote Status</th>
                    <th>Payment Status</th>
                    {role === 'admin' && <th>Assigned To</th>}
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.quote_number}</td>
                      <td>
                        <Link to={`/quotes/${quote.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                          {quote.title}
                        </Link>
                      </td>
                      <td>{quote.clients?.name || '-'}</td>
                      <td className="text-right">${parseFloat(quote.total).toFixed(2)}</td>
                      <td>
                        <span className={`badge badge-${quote.status}`}>{formatStatus(quote.status)}</span>
                      </td>
                      <td>
                        {quote.payment_status ? (
                          <span className={`badge badge-${quote.payment_status}`}>{formatStatus(quote.payment_status)}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      {role === 'admin' && (
                        <td>
                          <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                            {getAssignedToText(quote.id)}
                          </span>
                        </td>
                      )}
                      <td>{formatDate(quote.created_at)}</td>
                      <td>
                        <Link to={`/quotes/${quote.id}`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default QuotesList;
