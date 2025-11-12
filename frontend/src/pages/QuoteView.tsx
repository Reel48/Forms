import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { quotesAPI, stripeAPI, companySettingsAPI } from '../api';
import type { Quote, CompanySettings } from '../api';
import { renderTextWithLinks } from '../utils/textUtils';
import { useAuth } from '../contexts/AuthContext';
import { AssignmentModal } from '../components/AssignmentModal';
import { AssignmentsList } from '../components/AssignmentsList';
import api from '../api';

// Helper function to strip HTML tags and get clean numeric value
const getCleanNumericValue = (value: string | number): number => {
  if (typeof value === 'number') return value;
  const cleanValue = String(value).replace(/<[^>]*>/g, '').trim();
  return parseFloat(cleanValue) || 0;
};

interface Activity {
  id: string;
  activity_type: string;
  user_name?: string;
  user_email?: string;
  description?: string;
  metadata?: any;
  created_at: string;
}

interface Comment {
  id: string;
  comment: string;
  user_name?: string;
  user_email?: string;
  is_internal: boolean;
  created_at: string;
}

interface Version {
  id: string;
  version_number: number;
  change_description?: string;
  changed_by?: string;
  created_at: string;
}

function QuoteView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'activities' | 'comments' | 'versions' | 'client-history'>('details');
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [showShareLinkModal, setShowShareLinkModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [clientHistory, setClientHistory] = useState<Quote[]>([]);
  const [loadingClientHistory, setLoadingClientHistory] = useState(false);
  const { role } = useAuth();

  useEffect(() => {
    loadQuote();
    loadCompanySettings();
    loadAssignments();
    if (role === 'admin') {
      loadActivities();
      loadComments();
      loadVersions();
      loadShareLink();
    }
    
    // Refresh quote every 10 seconds to catch webhook updates
    const interval = setInterval(() => {
      loadQuote();
    }, 10000);
    
    // Mobile detection
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save (if editing)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Save functionality would go here if we add edit mode
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowSendEmailModal(false);
        setShowShareLinkModal(false);
        setShowReminderModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [id, role]);

  useEffect(() => {
    // Load client history when quote is loaded and has a client
    if (quote?.client_id && role === 'admin') {
      loadClientHistory(quote.client_id);
    }
  }, [quote?.client_id, role]);

  const loadAssignments = async () => {
    try {
      const response = await api.get(`/api/quotes/${id}/assignments`);
      setAssignments(response.data || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const loadActivities = async () => {
    try {
      const response = await quotesAPI.getActivities(id!);
      setActivities(response.data || []);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  };

  const loadComments = async () => {
    try {
      const response = await quotesAPI.getComments(id!);
      setComments(response.data || []);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const loadVersions = async () => {
    try {
      const response = await quotesAPI.getVersions(id!);
      setVersions(response.data || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  };

  const loadShareLink = async () => {
    try {
      const response = await quotesAPI.getShareLink(id!);
      if (response.data.share_url) {
        setShareLink(response.data.share_url);
      }
    } catch (error) {
      console.error('Failed to load share link:', error);
    }
  };

  const loadClientHistory = async (clientId: string) => {
    try {
      setLoadingClientHistory(true);
      const response = await quotesAPI.getClientHistory(clientId);
      // Filter out current quote
      setClientHistory(response.data.filter((q: Quote) => q.id !== id));
    } catch (error) {
      console.error('Failed to load client history:', error);
    } finally {
      setLoadingClientHistory(false);
    }
  };

  const handleAssign = async (userIds: string[]) => {
    try {
      await api.post(`/api/quotes/${id}/assign`, { user_ids: userIds });
      await loadAssignments();
      await loadActivities();
    } catch (error) {
      throw error;
    }
  };

  const loadQuote = async () => {
    try {
      const response = await quotesAPI.getById(id!);
      setQuote(response.data);
    } catch (error) {
      console.error('Failed to load quote:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanySettings = async () => {
    try {
      const response = await companySettingsAPI.get();
      setCompanySettings(response.data);
    } catch (error) {
      console.error('Failed to load company settings:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this quote?')) return;
    
    try {
      await quotesAPI.delete(id!);
      navigate('/');
    } catch (error: any) {
      console.error('Failed to delete quote:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to delete quote. Please try again.';
      alert(errorMessage);
    }
  };

  const handleDuplicateQuote = async () => {
    if (!quote) return;
    
    try {
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
      navigate('/');
      alert('Quote duplicated successfully!');
    } catch (error: any) {
      console.error('Failed to duplicate quote:', error);
      alert('Failed to duplicate quote. Please try again.');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await quotesAPI.generatePDF(id!);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quote?.quote_number || 'quote'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Failed to generate PDF:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to generate PDF. Please try again.';
      alert(errorMessage);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAcceptQuote = async () => {
    if (!confirm('Are you sure you want to accept this quote?')) return;
    
    try {
      await quotesAPI.accept(id!);
      await loadQuote();
      await loadActivities();
      // Show different message based on role
      if (role === 'customer') {
        alert('Quote accepted successfully! An invoice has been created for payment.');
      } else {
        alert('Quote accepted successfully!');
      }
    } catch (error: any) {
      console.error('Failed to accept quote:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to accept quote. Please try again.';
      alert(errorMessage);
    }
  };

  const handleCreateInvoice = async () => {
    if (!quote?.clients) {
      alert('Quote must have an associated client to create an invoice.');
      return;
    }

    try {
      setCreatingInvoice(true);
      const response = await stripeAPI.createInvoice(id!);
      setInvoiceUrl(response.data.invoice_url);
      await loadQuote();
      await loadActivities();
      alert('Invoice created successfully! You can now send it to the client.');
    } catch (error: any) {
      console.error('Failed to create invoice:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to create invoice. Please try again.';
      alert(errorMessage);
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleSendEmail = async (toEmail: string, customMessage?: string, includePdf?: boolean) => {
    try {
      setSendingEmail(true);
      await quotesAPI.sendEmail(id!, toEmail, customMessage, includePdf);
      setShowSendEmailModal(false);
      await loadActivities();
      alert('Quote sent successfully!');
    } catch (error: any) {
      console.error('Failed to send email:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to send email. Please try again.';
      alert(errorMessage);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCreateShareLink = async (expiresAt?: string, maxViews?: number) => {
    try {
      const response = await quotesAPI.createShareLink(id!, expiresAt, maxViews);
      setShareLink(response.data.share_url);
      setShowShareLinkModal(false);
      await loadActivities();
      alert('Share link created successfully!');
    } catch (error: any) {
      console.error('Failed to create share link:', error);
      alert('Failed to create share link. Please try again.');
    }
  };

  const handleCopyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      alert('Share link copied to clipboard!');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    
    try {
      await quotesAPI.createComment(id!, newComment, true);
      setNewComment('');
      await loadComments();
      await loadActivities();
    } catch (error: any) {
      console.error('Failed to add comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };

  const handleSetReminder = async (reminderDate: string) => {
    try {
      await quotesAPI.setReminder(id!, reminderDate);
      setShowReminderModal(false);
      await loadQuote();
      alert('Reminder set successfully!');
    } catch (error: any) {
      console.error('Failed to set reminder:', error);
      alert('Failed to set reminder. Please try again.');
    }
  };

  const handleDeleteReminder = async () => {
    try {
      await quotesAPI.deleteReminder(id!);
      await loadQuote();
      alert('Reminder deleted successfully!');
    } catch (error: any) {
      console.error('Failed to delete reminder:', error);
      alert('Failed to delete reminder. Please try again.');
    }
  };

  useEffect(() => {
    if (quote?.stripe_invoice_id && !invoiceUrl) {
      stripeAPI.getInvoice(quote.stripe_invoice_id)
        .then(response => {
          setInvoiceUrl(response.data.hosted_invoice_url);
        })
        .catch(error => {
          console.error('Failed to load invoice:', error);
        });
    }
  }, [quote?.stripe_invoice_id]);

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  if (!quote) {
    return <div className="container">Quote not found</div>;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getActivityIcon = (_type: string) => {
    // Icons removed - using text labels instead
    return '';
  };

  const getPaymentStatusDetails = () => {
    if (!quote.payment_status) return null;
    
    const status = quote.payment_status.toLowerCase();
    const statusMap: Record<string, { label: string; color: string; icon: string }> = {
      'paid': { label: 'Paid', color: '#065f46', icon: '' },
      'unpaid': { label: 'Unpaid', color: '#991b1b', icon: '' },
      'partially_paid': { label: 'Partially Paid', color: '#92400e', icon: '' },
      'refunded': { label: 'Refunded', color: '#7c2d12', icon: '' },
      'failed': { label: 'Payment Failed', color: '#991b1b', icon: '' },
      'voided': { label: 'Voided', color: '#6b7280', icon: '' },
      'uncollectible': { label: 'Uncollectible', color: '#991b1b', icon: '' },
    };
    
    return statusMap[status] || { label: status, color: '#6b7280', icon: '' };
  };

  const paymentStatusDetails = getPaymentStatusDetails();

  return (
    <>
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-break {
            page-break-after: always;
          }
          body {
            background: white;
          }
          .card {
            box-shadow: none;
            border: none;
          }
        }
      `}</style>
      <div className="container">
        <div className="no-print" style={{ marginBottom: '1rem' }}>
          <button onClick={() => navigate('/')} className="btn-outline" style={{ marginBottom: '1rem' }}>
            ← Back to Quotes
          </button>
        </div>

        {/* Tabs for Admin */}
        {role === 'admin' && (
          <div className="no-print card mb-4" style={{ padding: '0' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('details')}
                style={{
                  padding: '1rem 1.5rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'details' ? '2px solid #667eea' : '2px solid transparent',
                  color: activeTab === 'details' ? '#667eea' : '#6b7280',
                  fontWeight: activeTab === 'details' ? '600' : '400',
                }}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('activities')}
                style={{
                  padding: '1rem 1.5rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'activities' ? '2px solid #667eea' : '2px solid transparent',
                  color: activeTab === 'activities' ? '#667eea' : '#6b7280',
                  fontWeight: activeTab === 'activities' ? '600' : '400',
                }}
              >
                Activity Timeline
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                style={{
                  padding: '1rem 1.5rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'comments' ? '2px solid #667eea' : '2px solid transparent',
                  color: activeTab === 'comments' ? '#667eea' : '#6b7280',
                  fontWeight: activeTab === 'comments' ? '600' : '400',
                }}
              >
                Comments ({comments.length})
              </button>
              <button
                onClick={() => setActiveTab('versions')}
                style={{
                  padding: '1rem 1.5rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'versions' ? '2px solid #667eea' : '2px solid transparent',
                  color: activeTab === 'versions' ? '#667eea' : '#6b7280',
                  fontWeight: activeTab === 'versions' ? '600' : '400',
                }}
              >
                Versions ({versions.length})
              </button>
              {quote?.client_id && (
                <button
                  onClick={() => setActiveTab('client-history')}
                  style={{
                    padding: '1rem 1.5rem',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    borderBottom: activeTab === 'client-history' ? '2px solid #667eea' : '2px solid transparent',
                    color: activeTab === 'client-history' ? '#667eea' : '#6b7280',
                    fontWeight: activeTab === 'client-history' ? '600' : '400',
                  }}
                >
                  Client History ({clientHistory.length})
                </button>
              )}
            </div>
          </div>
        )}

        <div className="card">
          {/* Logo at top left */}
          {companySettings?.logo_url && (
            <div style={{ marginBottom: '1.5rem' }}>
              <img 
                src={companySettings.logo_url} 
                alt={companySettings.company_name || 'Company Logo'} 
                style={{ 
                  maxHeight: '80px', 
                  maxWidth: '200px',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            </div>
          )}

          <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1>{quote.title}</h1>
              <p className="text-muted">Quote #{quote.quote_number}</p>
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {role === 'admin' && (
                <>
                  <button onClick={() => setShowSendEmailModal(true)} className="btn-primary">
                    Send Email
                  </button>
                  {shareLink ? (
                    <button onClick={handleCopyShareLink} className="btn-outline">
                      Copy Share Link
                    </button>
                  ) : (
                    <button onClick={() => setShowShareLinkModal(true)} className="btn-outline">
                      Create Share Link
                    </button>
                  )}
                  <button onClick={() => setShowReminderModal(true)} className="btn-outline">
                    Reminder
                  </button>
                  <button onClick={() => setShowAssignmentModal(true)} className="btn-primary">
                    Assign
                  </button>
                </>
              )}
              <button onClick={handleDownloadPDF} className="btn-primary">
                Download PDF
              </button>
              <button onClick={handlePrint} className="btn-outline no-print">
                Print
              </button>
              {role === 'admin' && (
                <>
                  <button onClick={handleDuplicateQuote} className="btn-outline">
                    Duplicate
                  </button>
                  <Link to={`/quotes/${id}/edit`} className="btn-secondary">
                    Edit
                  </Link>
                  <button onClick={handleDelete} className="btn-danger">
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Status and Payment Info */}
          <div className="mb-4" style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem' 
          }}>
            <div>
              <strong>Quote Status:</strong>{' '}
              <span className={`badge badge-${quote.status}`}>
                {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
              </span>
            </div>
            {quote.payment_status && paymentStatusDetails && (
              <div>
                <strong>Payment Status:</strong>{' '}
                <span style={{ 
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.375rem',
                  backgroundColor: `${paymentStatusDetails.color}20`,
                  color: paymentStatusDetails.color,
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}>
                  {paymentStatusDetails.icon} {paymentStatusDetails.label}
                </span>
              </div>
            )}
            <div>
              <strong>Created:</strong> {formatDateShort(quote.created_at)}
            </div>
            {quote.expiration_date && (
              <div>
                <strong>Expires:</strong> {formatDateShort(quote.expiration_date)}
              </div>
            )}
            {quote.reminder_date && role === 'admin' && (
              <div>
                <strong>Reminder:</strong> {formatDateShort(quote.reminder_date)}
                <button 
                  onClick={handleDeleteReminder}
                  style={{ 
                    marginLeft: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: 'none',
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Invoice Status - Enhanced */}
          {quote.stripe_invoice_id && (
            <div className="mb-4 p-3" style={{ 
              backgroundColor: paymentStatusDetails?.color === '#065f46' ? '#d1fae5' : '#e3f2fd', 
              borderRadius: '8px',
              border: `2px solid ${paymentStatusDetails?.color || '#3b82f6'}` 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>Invoice Status</h3>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: paymentStatusDetails?.color }}>
                    {paymentStatusDetails?.icon} {paymentStatusDetails?.label}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                    Invoice ID: {quote.stripe_invoice_id}
                  </p>
                  {quote.updated_at && (
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      Last updated: {formatDate(quote.updated_at)}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {invoiceUrl && (
                    <a 
                      href={invoiceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn-primary"
                      style={{ fontSize: '0.875rem' }}
                    >
                      View Invoice
                    </a>
                  )}
                  <button 
                    onClick={loadQuote} 
                    className="btn-outline"
                    style={{ fontSize: '0.875rem' }}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Details Tab Content */}
          {(activeTab === 'details' || role !== 'admin') && (
            <>
              {/* Payment Actions */}
              {quote.status === 'draft' || quote.status === 'sent' || quote.status === 'viewed' ? (
                <div className="mb-4 p-3 no-print" style={{ backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                  <h3>Quote Actions</h3>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <button onClick={handleAcceptQuote} className="btn-primary">
                      Accept Quote
                    </button>
                  </div>
                  {quote.status === 'draft' && role === 'customer' && (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      Accept this quote to proceed with payment.
                    </p>
                  )}
                  {quote.status === 'draft' && role === 'admin' && (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      Accept this quote to create a Stripe invoice for payment collection.
                    </p>
                  )}
                </div>
              ) : null}

              {quote.status === 'accepted' && !quote.stripe_invoice_id && quote.clients && role === 'admin' ? (
                <div className="mb-4 p-3 no-print" style={{ backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
                  <h3>Create Invoice</h3>
                  <p>This quote has been accepted. Create a Stripe invoice to collect payment.</p>
                  <button 
                    onClick={handleCreateInvoice} 
                    className="btn-primary"
                    disabled={creatingInvoice}
                  >
                    {creatingInvoice ? 'Creating Invoice...' : 'Create Stripe Invoice'}
                  </button>
                </div>
              ) : null}

              <div className="mb-4" style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
                gap: '2rem' 
              }}>
                {/* Company/Seller Information */}
                {companySettings && (companySettings.company_name || companySettings.email || companySettings.phone || companySettings.address) && (
                  <div>
                    <h2>From</h2>
                    {companySettings.company_name && <p><strong>{companySettings.company_name}</strong></p>}
                    {companySettings.address && <p>{companySettings.address}</p>}
                    {companySettings.email && <p><strong>Email:</strong> {companySettings.email}</p>}
                    {companySettings.phone && <p><strong>Phone:</strong> {companySettings.phone}</p>}
                    {companySettings.website && (
                      <p>
                        <strong>Website:</strong>{' '}
                        {renderTextWithLinks(companySettings.website)}
                      </p>
                    )}
                    {companySettings.tax_id && <p><strong>Tax ID:</strong> {companySettings.tax_id}</p>}
                  </div>
                )}

                {/* Client Information */}
                {quote.clients && (
                  <div>
                    <h2>Bill To</h2>
                    <p><strong>Name:</strong> {quote.clients.name}</p>
                    {quote.clients.company && <p><strong>Company:</strong> {quote.clients.company}</p>}
                    {quote.clients.email && <p><strong>Email:</strong> {quote.clients.email}</p>}
                    {quote.clients.phone && <p><strong>Phone:</strong> {quote.clients.phone}</p>}
                    {quote.clients.address && <p><strong>Address:</strong> {quote.clients.address}</p>}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <h2>Line Items</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="text-right">Quantity</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Discount</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.line_items.map((item, index) => {
                        const qty = parseFloat(item.quantity) || 0;
                        const price = parseFloat(item.unit_price) || 0;
                        const discount = parseFloat(item.discount_percent || '0') || 0;
                        const subtotal = qty * price;
                        const discountAmount = subtotal * (discount / 100);
                        const total = subtotal - discountAmount;
                        
                        return (
                          <tr key={index}>
                            <td>{item.description}</td>
                            <td className="text-right">{qty}</td>
                            <td className="text-right">${price.toFixed(2)}</td>
                            <td className="text-right">{discount > 0 ? `${discount}%` : '-'}</td>
                            <td className="text-right">${total.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: '2rem', marginLeft: 'auto', width: '300px' }}>
                <table>
                  <tbody>
                    <tr>
                      <td className="text-right"><strong>Subtotal:</strong></td>
                      <td className="text-right">${getCleanNumericValue(quote.subtotal).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="text-right"><strong>Tax ({quote.tax_rate}%):</strong></td>
                      <td className="text-right">${getCleanNumericValue(quote.tax_amount).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="text-right"><strong>Total:</strong></td>
                      <td className="text-right"><strong>${getCleanNumericValue(quote.total).toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {quote.notes && (
                <div className="mb-4 mt-4">
                  <h2>Notes</h2>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {renderTextWithLinks(quote.notes)}
                  </div>
                </div>
              )}

              {quote.terms && (
                <div className="mb-4">
                  <h2>Terms & Conditions</h2>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {renderTextWithLinks(quote.terms)}
                  </div>
                </div>
              )}

              {role === 'admin' && (
                <AssignmentsList
                  quoteId={id}
                  onUnassign={loadAssignments}
                />
              )}
            </>
          )}

          {/* Activities Tab */}
          {activeTab === 'activities' && role === 'admin' && (
            <div>
              <h2>Activity Timeline</h2>
              {activities.length === 0 ? (
                <p className="text-muted">No activities yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  {activities.map((activity) => (
                    <div 
                      key={activity.id} 
                      style={{
                        padding: '1rem',
                        borderLeft: '4px solid #667eea',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.375rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{getActivityIcon(activity.activity_type)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <strong>{activity.description || activity.activity_type.replace(/_/g, ' ')}</strong>
                              {activity.user_name && (
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                                  by {activity.user_name}
                                </p>
                              )}
                            </div>
                            <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                              {formatDate(activity.created_at)}
                            </span>
                          </div>
                          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                              {activity.metadata.old_status && activity.metadata.new_status && (
                                <span>
                                  Status: {activity.metadata.old_status} → {activity.metadata.new_status}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && role === 'admin' && (
            <div>
              <h2>Internal Comments</h2>
              <div className="mb-4" style={{ marginTop: '1rem' }}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add an internal comment..."
                  style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                />
                <button 
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="btn-primary"
                  style={{ marginTop: '0.5rem' }}
                >
                  Add Comment
                </button>
              </div>
              {comments.length === 0 ? (
                <p className="text-muted">No comments yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {comments.map((comment) => (
                    <div 
                      key={comment.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.375rem',
                        borderLeft: '4px solid #667eea'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div>
                          <strong>{comment.user_name || comment.user_email || 'Unknown'}</strong>
                          {comment.is_internal && (
                            <span style={{ 
                              marginLeft: '0.5rem',
                              padding: '0.125rem 0.5rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '0.25rem'
                            }}>
                              Internal
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                          {formatDate(comment.created_at)}
                        </span>
                      </div>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{comment.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Versions Tab */}
          {activeTab === 'versions' && role === 'admin' && (
            <div>
              <h2>Version History</h2>
              {versions.length === 0 ? (
                <p className="text-muted">No version history yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  {versions.map((version) => (
                    <div 
                      key={version.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.375rem',
                        borderLeft: '4px solid #10b981'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <strong>Version {version.version_number}</strong>
                          {version.change_description && (
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                              {version.change_description}
                            </p>
                          )}
                        </div>
                        <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                          {formatDate(version.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Client History Tab */}
          {activeTab === 'client-history' && role === 'admin' && quote?.client_id && (
            <div>
              <h2>Client Quote History</h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                All quotes for {quote.clients?.name || 'this client'}
              </p>
              {loadingClientHistory ? (
                <p className="text-muted">Loading...</p>
              ) : clientHistory.length === 0 ? (
                <p className="text-muted">No other quotes for this client.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  {clientHistory.map((historyQuote) => (
                    <div 
                      key={historyQuote.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.375rem',
                        borderLeft: '4px solid #3b82f6',
                        cursor: 'pointer'
                      }}
                      onClick={() => navigate(`/quotes/${historyQuote.id}`)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <Link 
                              to={`/quotes/${historyQuote.id}`}
                              style={{ fontWeight: '600', color: '#2563eb', textDecoration: 'none' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {historyQuote.title}
                            </Link>
                            <span className={`badge badge-${historyQuote.status}`} style={{ fontSize: '0.75rem' }}>
                              {historyQuote.status}
                            </span>
                          </div>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                            {historyQuote.quote_number} • {formatDateShort(historyQuote.created_at)}
                          </p>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '600', color: '#059669' }}>
                            ${parseFloat(historyQuote.total).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals */}
        {role === 'admin' && (
          <>
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
                onClick={() => setShowSendEmailModal(false)}
              >
                <div
                  className="card"
                  style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 style={{ marginTop: 0 }}>Send Quote via Email</h3>
                  <SendEmailForm
                    quote={quote}
                    onSend={handleSendEmail}
                    onCancel={() => setShowSendEmailModal(false)}
                    sending={sendingEmail}
                  />
                </div>
              </div>
            )}

            {/* Share Link Modal */}
            {showShareLinkModal && (
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
                onClick={() => setShowShareLinkModal(false)}
              >
                <div
                  className="card"
                  style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 style={{ marginTop: 0 }}>Create Share Link</h3>
                  <ShareLinkForm
                    onCreate={handleCreateShareLink}
                    onCancel={() => setShowShareLinkModal(false)}
                  />
                </div>
              </div>
            )}

            {/* Reminder Modal */}
            {showReminderModal && (
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
                onClick={() => setShowReminderModal(false)}
              >
                <div
                  className="card"
                  style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 style={{ marginTop: 0 }}>Set Reminder</h3>
                  <ReminderForm
                    currentReminder={quote.reminder_date}
                    onSet={handleSetReminder}
                    onCancel={() => setShowReminderModal(false)}
                  />
                </div>
              </div>
            )}

            <AssignmentModal
              isOpen={showAssignmentModal}
              onClose={() => setShowAssignmentModal(false)}
              onAssign={handleAssign}
              title={`Assign Quote: ${quote.title}`}
              existingAssignments={assignments}
            />
          </>
        )}
      </div>
    </>
  );
}

// Send Email Form Component
function SendEmailForm({ quote, onSend, onCancel, sending }: { quote: Quote; onSend: (email: string, message?: string, includePdf?: boolean) => void; onCancel: () => void; sending: boolean }) {
  const [email, setEmail] = useState(quote.clients?.email || '');
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

// Share Link Form Component
function ShareLinkForm({ onCreate, onCancel }: { onCreate: (expiresAt?: string, maxViews?: number) => void; onCancel: () => void }) {
  const [expiresAt, setExpiresAt] = useState('');
  const [maxViews, setMaxViews] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(expiresAt || undefined, maxViews ? parseInt(maxViews) : undefined);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Expires At (optional)
        </label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Max Views (optional)
        </label>
        <input
          type="number"
          value={maxViews}
          onChange={(e) => setMaxViews(e.target.value)}
          min="1"
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Create Share Link
        </button>
      </div>
    </form>
  );
}

// Reminder Form Component
function ReminderForm({ currentReminder, onSet, onCancel }: { currentReminder?: string; onSet: (date: string) => void; onCancel: () => void }) {
  const [reminderDate, setReminderDate] = useState(
    currentReminder ? new Date(currentReminder).toISOString().slice(0, 16) : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reminderDate) {
      onSet(new Date(reminderDate).toISOString());
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Reminder Date & Time *
        </label>
        <input
          type="datetime-local"
          value={reminderDate}
          onChange={(e) => setReminderDate(e.target.value)}
          required
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!reminderDate}>
          Set Reminder
        </button>
      </div>
    </form>
  );
}

export default QuoteView;
