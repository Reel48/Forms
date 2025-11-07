import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { quotesAPI, stripeAPI, companySettingsAPI } from '../api';
import type { Quote, CompanySettings } from '../api';
import { renderTextWithLinks } from '../utils/textUtils';

// Helper function to strip HTML tags and get clean numeric value
const getCleanNumericValue = (value: string | number): number => {
  if (typeof value === 'number') return value;
  // Remove any HTML tags that might be in the string
  const cleanValue = String(value).replace(/<[^>]*>/g, '').trim();
  return parseFloat(cleanValue) || 0;
};

function QuoteView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  useEffect(() => {
    loadQuote();
    loadCompanySettings();
  }, [id]);

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

  const handleDownloadPDF = async () => {
    try {
      const response = await quotesAPI.generatePDF(id!);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Use quote number as filename (e.g., "QT-20250101-ABC123.pdf")
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

  const handleAcceptQuote = async () => {
    if (!confirm('Are you sure you want to accept this quote?')) return;
    
    try {
      await quotesAPI.accept(id!);
      await loadQuote(); // Reload to get updated status
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
      await loadQuote(); // Reload to get updated invoice info
      alert('Invoice created successfully! You can now send it to the client.');
    } catch (error: any) {
      console.error('Failed to create invoice:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to create invoice. Please try again.';
      alert(errorMessage);
    } finally {
      setCreatingInvoice(false);
    }
  };

  useEffect(() => {
    // Load invoice URL if invoice exists
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
    });
  };

  return (
    <div className="container">
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

        <div className="flex-between mb-4">
          <div>
            <h1>{quote.title}</h1>
            <p className="text-muted">Quote #{quote.quote_number}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDownloadPDF} className="btn-primary">
              Download PDF
            </button>
            <Link to={`/quotes/${id}/edit`} className="btn-secondary">
              Edit
            </Link>
            <button onClick={handleDelete} className="btn-danger">
              Delete
            </button>
          </div>
        </div>

        <div className="form-row mb-4">
          <div>
            <strong>Status:</strong> <span className={`badge badge-${quote.status}`}>{quote.status}</span>
          </div>
          {quote.payment_status && (
            <div>
              <strong>Payment:</strong> <span className={`badge badge-${quote.payment_status}`}>{quote.payment_status}</span>
            </div>
          )}
          <div>
            <strong>Created:</strong> {formatDate(quote.created_at)}
          </div>
          {quote.expiration_date && (
            <div>
              <strong>Expires:</strong> {formatDate(quote.expiration_date)}
            </div>
          )}
        </div>

        {/* Payment Actions */}
        {quote.status === 'sent' || quote.status === 'viewed' ? (
          <div className="mb-4 p-3" style={{ backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Quote Actions</h3>
            <div className="flex gap-2">
              <button onClick={handleAcceptQuote} className="btn-primary">
                Accept Quote
              </button>
            </div>
          </div>
        ) : null}

        {quote.status === 'accepted' && !quote.stripe_invoice_id && quote.clients ? (
          <div className="mb-4 p-3" style={{ backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
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

        {quote.stripe_invoice_id && (
          <div className="mb-4 p-3" style={{ backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
            <h3>Invoice Created</h3>
            <p>Stripe invoice has been created for this quote.</p>
            <div className="flex gap-2">
              {invoiceUrl && (
                <a 
                  href={invoiceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  View Invoice
                </a>
              )}
            </div>
          </div>
        )}

        <div className="mb-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
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
      </div>
    </div>
  );
}

export default QuoteView;

