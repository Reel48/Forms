import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quotesAPI, clientsAPI } from '../api';
import type { QuoteCreate, Client, LineItem } from '../api';

function QuoteBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; field: 'notes' | 'terms' | null; linkText: string; url: string }>({
    open: false,
    field: null,
    linkText: '',
    url: '',
  });
  const [formData, setFormData] = useState<QuoteCreate>({
    title: '',
    client_id: '',
    notes: '',
    terms: '',
    tax_rate: '0',
    currency: 'USD',
    status: 'draft',
    line_items: [],
  });

  useEffect(() => {
    loadClients();
    if (isEdit) {
      loadQuote();
    }
  }, [id]);

  const loadClients = async () => {
    try {
      const response = await clientsAPI.getAll();
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const loadQuote = async () => {
    try {
      setLoading(true);
      const response = await quotesAPI.getById(id!);
      const quote = response.data;
      setFormData({
        title: quote.title,
        client_id: quote.client_id || '',
        notes: quote.notes || '',
        terms: quote.terms || '',
        tax_rate: quote.tax_rate,
        currency: quote.currency,
        status: quote.status,
        line_items: quote.line_items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || '0',
          tax_rate: item.tax_rate || '0',
        })),
      });
    } catch (error) {
      console.error('Failed to load quote:', error);
    } finally {
      setLoading(false);
    }
  };

  const addLineItem = () => {
    setFormData({
      ...formData,
      line_items: [
        ...formData.line_items,
        {
          description: '',
          quantity: '1',
          unit_price: '0',
          discount_percent: '0',
          tax_rate: '0',
        },
      ],
    });
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    const updated = [...formData.line_items];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, line_items: updated });
  };

  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      line_items: formData.line_items.filter((_, i) => i !== index),
    });
  };

  const calculateLineTotal = (item: LineItem): number => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const discount = parseFloat(item.discount_percent || '0') || 0;
    const subtotal = qty * price;
    const discountAmount = subtotal * (discount / 100);
    return subtotal - discountAmount;
  };

  const calculateTotals = () => {
    const subtotal = formData.line_items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
    const taxRate = parseFloat(formData.tax_rate) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (isEdit) {
        await quotesAPI.update(id!, formData);
      } else {
        await quotesAPI.create(formData);
      }
      navigate('/');
    } catch (error: any) {
      console.error('Failed to save quote:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response,
        request: error?.request,
        config: error?.config
      });
      
      let errorMessage = 'Failed to save quote. Please try again.';
      
      if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
        errorMessage = `Network Error: Cannot connect to backend API. Please check your connection and try again.`;
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, taxAmount, total } = calculateTotals();

  const openLinkDialog = (field: 'notes' | 'terms') => {
    setLinkDialog({
      open: true,
      field,
      linkText: '',
      url: '',
    });
  };

  const closeLinkDialog = () => {
    setLinkDialog({
      open: false,
      field: null,
      linkText: '',
      url: '',
    });
  };

  const insertLink = () => {
    if (!linkDialog.field || !linkDialog.url) return;
    
    const linkText = linkDialog.linkText || linkDialog.url;
    const markdownLink = `[${linkText}](${linkDialog.url})`;
    
    const currentValue = formData[linkDialog.field] || '';
    const newValue = currentValue + (currentValue ? ' ' : '') + markdownLink;
    
    setFormData({
      ...formData,
      [linkDialog.field]: newValue,
    });
    
    closeLinkDialog();
  };

  if (loading && isEdit) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>{isEdit ? 'Edit Quote' : 'Create New Quote'}</h1>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Quote Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Client</label>
              <select
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              >
                <option value="">Select a client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.company ? `(${client.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={formData.tax_rate}
                onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="viewed">Viewed</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <div className="flex-between">
              <h2>Line Items</h2>
              <button type="button" onClick={addLineItem} className="btn-primary">
                Add Item
              </button>
            </div>

            {formData.line_items.length === 0 ? (
              <p className="text-muted">No line items yet. Click "Add Item" to get started.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ width: '100px' }}>Quantity</th>
                    <th style={{ width: '120px' }}>Unit Price</th>
                    <th style={{ width: '100px' }}>Discount %</th>
                    <th style={{ width: '120px' }}>Total</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {formData.line_items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={item.discount_percent || '0'}
                          onChange={(e) => updateLineItem(index, 'discount_percent', e.target.value)}
                        />
                      </td>
                      <td className="text-right">
                        ${calculateLineTotal(item).toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="btn-danger"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: '2rem', marginLeft: 'auto', width: '300px' }}>
            <table>
              <tbody>
                <tr>
                  <td className="text-right"><strong>Subtotal:</strong></td>
                  <td className="text-right">${subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="text-right"><strong>Tax ({formData.tax_rate}%):</strong></td>
                  <td className="text-right">${taxAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="text-right"><strong>Total:</strong></td>
                  <td className="text-right"><strong>${total.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-group">
            <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
              <label style={{ marginBottom: 0 }}>Notes</label>
              <button
                type="button"
                onClick={() => openLinkDialog('notes')}
                className="btn-outline"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              >
                + Add Link
              </button>
            </div>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes for the quote... Use [link text](url) format or paste URLs directly."
            />
            <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
              Tip: Use markdown format [link text](url) or paste URLs directly. They will be clickable when viewing the quote.
            </small>
          </div>

          <div className="form-group">
            <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
              <label style={{ marginBottom: 0 }}>Terms & Conditions</label>
              <button
                type="button"
                onClick={() => openLinkDialog('terms')}
                className="btn-outline"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              >
                + Add Link
              </button>
            </div>
            <textarea
              value={formData.terms || ''}
              onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
              placeholder="Terms and conditions... Use [link text](url) format or paste URLs directly."
            />
            <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
              Tip: Use markdown format [link text](url) or paste URLs directly. They will be clickable when viewing the quote.
            </small>
          </div>

          {/* Link Insertion Dialog */}
          {linkDialog.open && (
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
              onClick={closeLinkDialog}
            >
              <div
                className="card"
                style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0 }}>Insert Link</h3>
                <div className="form-group">
                  <label>Link Text (optional)</label>
                  <input
                    type="text"
                    value={linkDialog.linkText}
                    onChange={(e) => setLinkDialog({ ...linkDialog, linkText: e.target.value })}
                    placeholder="e.g., Terms of Service"
                  />
                  <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                    Leave empty to use the URL as the link text
                  </small>
                </div>
                <div className="form-group">
                  <label>URL *</label>
                  <input
                    type="url"
                    value={linkDialog.url}
                    onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value })}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    onClick={insertLink}
                    className="btn-primary"
                    disabled={!linkDialog.url}
                  >
                    Insert Link
                  </button>
                  <button
                    type="button"
                    onClick={closeLinkDialog}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2" style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : isEdit ? 'Update Quote' : 'Create Quote'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuoteBuilder;

