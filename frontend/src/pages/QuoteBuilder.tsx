import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaTimes, FaCheck } from 'react-icons/fa';
import { quotesAPI, clientsAPI } from '../api';
import type { QuoteCreate, Client, LineItem } from '../api';
import { renderTextWithLinks } from '../utils/textUtils';
import { useAuth } from '../contexts/AuthContext';

// Currency symbols mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: '$',
  AUD: '$',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  BRL: 'R$',
  MXN: '$',
};

function QuoteBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isEdit = !!id;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [selectedLineItems, setSelectedLineItems] = useState<Set<number>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('unsaved');
  
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
    create_folder: true, // Default to true for new quotes
  });
  const [quoteHasFolder, setQuoteHasFolder] = useState<boolean>(false);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load initial data
  useEffect(() => {
    loadClients();
    if (isEdit) {
      loadQuote();
    } else {
      // Try to load auto-saved draft for new quotes (stored in localStorage)
      loadLocalAutoSave();
    }
  }, [id, role]);

  // Auto-save functionality
  useEffect(() => {
    if (isEdit && role === 'admin') {
      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
      
      // Set up auto-save every 30 seconds
      autoSaveTimerRef.current = setInterval(() => {
        autoSaveDraft();
      }, 30000);
      
      return () => {
        if (autoSaveTimerRef.current) {
          clearInterval(autoSaveTimerRef.current);
        }
      };
    }
  }, [formData, id, isEdit, role]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const form = document.querySelector('form');
        if (form) {
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
        }
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowBulkEdit(false);
        setShowPreview(false);
        closeLinkDialog();
      }
      // Ctrl/Cmd + P to toggle preview
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowPreview(!showPreview);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPreview]);

  // Real-time validation
  useEffect(() => {
    validateForm();
  }, [formData]);

  const loadClients = async () => {
    try {
      const response = await clientsAPI.getAll();
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };



  const loadLocalAutoSave = () => {
    try {
      const saved = localStorage.getItem('quoteBuilderDraft');
      if (saved) {
        const draft = JSON.parse(saved);
        setFormData(draft);
      }
    } catch (error) {
      console.error('Failed to load local auto-save:', error);
    }
  };

  const saveLocalAutoSave = useCallback(() => {
    try {
      localStorage.setItem('quoteBuilderDraft', JSON.stringify(formData));
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('unsaved'), 2000);
    } catch (error) {
      console.error('Failed to save local auto-save:', error);
    }
  }, [formData]);

  const autoSaveDraft = useCallback(async () => {
    if (!isEdit || !id) {
      saveLocalAutoSave();
      return;
    }
    
    try {
      setAutoSaveStatus('saving');
      const currentData = JSON.stringify(formData);
      if (currentData === lastSavedRef.current) {
        setAutoSaveStatus('saved');
        return; // No changes
      }
      
      await quotesAPI.autoSaveQuote(id, formData);
      lastSavedRef.current = currentData;
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('unsaved'), 2000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAutoSaveStatus('unsaved');
    }
  }, [formData, id, isEdit, saveLocalAutoSave]);

  const loadQuote = async () => {
    try {
      setLoading(true);
      const response = await quotesAPI.getById(id!);
      const quote = response.data;
      
      // Try to load auto-saved draft first
      try {
        const draftResponse = await quotesAPI.getAutoSavedDraft(id!);
        if (draftResponse.data.draft_data) {
          const draft = draftResponse.data.draft_data;
          setFormData({
            title: draft.title || quote.title,
            client_id: draft.client_id || quote.client_id || '',
            notes: draft.notes || quote.notes || '',
            terms: draft.terms || quote.terms || '',
            tax_rate: draft.tax_rate || quote.tax_rate,
            currency: draft.currency || quote.currency,
            status: draft.status || quote.status,
            line_items: draft.line_items || quote.line_items.map(item => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_percent: item.discount_percent || '0',
              tax_rate: item.tax_rate || '0',
            })),
          });
          return;
        }
      } catch (error) {
        console.error('Failed to load auto-saved draft:', error);
      }
      
      // Load regular quote data
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
        create_folder: !quote.folder_id, // If quote doesn't have a folder, allow creating one
      });
      setQuoteHasFolder(!!quote.folder_id);
    } catch (error) {
      console.error('Failed to load quote:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      errors.title = 'Quote title is required';
    }
    
    formData.line_items.forEach((item, index) => {
      if (!item.description.trim()) {
        errors[`line_item_${index}_description`] = 'Description is required';
      }
      if (parseFloat(item.quantity) <= 0) {
        errors[`line_item_${index}_quantity`] = 'Quantity must be greater than 0';
      }
      if (parseFloat(item.unit_price) < 0) {
        errors[`line_item_${index}_unit_price`] = 'Unit price cannot be negative';
      }
      if (parseFloat(item.discount_percent || '0') < 0 || parseFloat(item.discount_percent || '0') > 100) {
        errors[`line_item_${index}_discount`] = 'Discount must be between 0 and 100';
      }
    });
    
    if (parseFloat(formData.tax_rate) < 0) {
      errors.tax_rate = 'Tax rate cannot be negative';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addLineItem = (template?: any) => {
    const newItem: LineItem = template ? {
      description: template.description,
      quantity: template.default_quantity?.toString() || '1',
      unit_price: template.default_unit_price?.toString() || '0',
      discount_percent: template.default_discount_percent?.toString() || '0',
      tax_rate: template.default_tax_rate?.toString() || '0',
    } : {
      description: '',
      quantity: '1',
      unit_price: '0',
      discount_percent: '0',
      tax_rate: '0',
    };
    
    setFormData({
      ...formData,
      line_items: [...formData.line_items, newItem],
    });
  };

  const duplicateLineItem = (index: number) => {
    const item = formData.line_items[index];
    const newItem = { ...item };
    setFormData({
      ...formData,
      line_items: [
        ...formData.line_items.slice(0, index + 1),
        newItem,
        ...formData.line_items.slice(index + 1),
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
    setSelectedLineItems(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  const toggleLineItemSelection = (index: number) => {
    setSelectedLineItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const bulkEditLineItems = (field: keyof LineItem, value: string) => {
    const updated = [...formData.line_items];
    selectedLineItems.forEach(index => {
      updated[index] = { ...updated[index], [field]: value };
    });
    setFormData({ ...formData, line_items: updated });
    setSelectedLineItems(new Set());
    setShowBulkEdit(false);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, _index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const items = [...formData.line_items];
    const draggedItem = items[draggedIndex];
    items.splice(draggedIndex, 1);
    items.splice(dropIndex, 0, draggedItem);
    
    setFormData({ ...formData, line_items: items });
    setDraggedIndex(null);
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
    
    if (!validateForm()) {
      alert('Please fix validation errors before saving.');
      return;
    }
    
    try {
      setSaving(true);
      let response;
      if (isEdit) {
        response = await quotesAPI.update(id!, formData);
      } else {
        response = await quotesAPI.create(formData);
        // Clear local auto-save after successful creation
        localStorage.removeItem('quoteBuilderDraft');
      }
      
      // Check if folder was created
      console.log('Quote save response:', response);
      console.log('Response data:', response?.data);
      console.log('Folder ID in response:', response?.data?.folder_id);
      console.log('Create folder was checked:', formData.create_folder);
      
      if (formData.create_folder) {
        if (response?.data?.folder_id) {
          alert(`Quote ${isEdit ? 'updated' : 'created'} successfully! A folder has been created and linked to this quote.`);
        } else {
          // Check if folder exists by querying folders endpoint
          console.log('Folder ID not in response, checking if folder was created...');
          alert(`Quote ${isEdit ? 'updated' : 'created'} successfully. ${isEdit ? 'If you checked "Create a folder", please check the folders section to verify it was created.' : 'A folder should have been created - please check the folders section.'}`);
        }
      }
      
      navigate('/');
    } catch (error: any) {
      console.error('Failed to save quote:', error);
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
      setSaving(false);
    }
  };


  const handleDuplicateQuote = async () => {
    if (!isEdit || !id) return;
    
    try {
      const response = await quotesAPI.getById(id);
      const quote = response.data;
      
      const duplicateData = {
        title: `${quote.title} (Copy)`,
        client_id: quote.client_id || '',
        notes: quote.notes || '',
        terms: quote.terms || '',
        tax_rate: quote.tax_rate,
        currency: quote.currency,
        status: 'draft',
        line_items: quote.line_items.map((item: any) => ({
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

  const { subtotal, taxAmount, total } = calculateTotals();
  const currencySymbol = formData.currency ? (CURRENCY_SYMBOLS[formData.currency] || formData.currency) : 'USD';

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
        <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h1>{isEdit ? 'Edit Quote' : 'Create New Quote'}</h1>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {autoSaveStatus === 'saving' && (
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Saving...</span>
            )}
            {autoSaveStatus === 'saved' && (
              <span style={{ fontSize: '0.875rem', color: '#10b981' }}>Saved</span>
            )}
            {role === 'admin' && isEdit && (
              <button
                type="button"
                onClick={handleDuplicateQuote}
                className="btn-outline"
                style={{ fontSize: '0.875rem' }}
              >
                Duplicate
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="btn-outline"
              style={{ fontSize: '0.875rem' }}
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </div>

        {showPreview ? (
          <PreviewMode
            formData={formData}
            clients={clients}
            currencySymbol={currencySymbol}
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            onClose={() => setShowPreview(false)}
          />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="quote-title">Quote Title *</label>
              <input
                type="text"
                id="quote-title"
                name="quote-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                style={{
                  borderColor: validationErrors.title ? '#ef4444' : undefined
                }}
              />
              {validationErrors.title && (
                <span style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                  {validationErrors.title}
                </span>
              )}
            </div>

            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="quote-client">Client</label>
                <select
                  id="quote-client"
                  name="quote-client"
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
                <label htmlFor="quote-tax-rate">Tax Rate (%)</label>
                <input
                  type="number"
                  id="quote-tax-rate"
                  name="quote-tax-rate"
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  style={{
                    borderColor: validationErrors.tax_rate ? '#ef4444' : undefined
                  }}
                />
                {validationErrors.tax_rate && (
                  <span style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                    {validationErrors.tax_rate}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="quote-currency">Currency</label>
                <select
                  id="quote-currency"
                  name="quote-currency"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  {Object.entries(CURRENCY_SYMBOLS).map(([code, symbol]) => (
                    <option key={code} value={code}>
                      {code} ({symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="quote-status">Status</label>
                <select
                  id="quote-status"
                  name="quote-status"
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
              <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <h2>Line Items</h2>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedLineItems.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBulkEdit(true)}
                      className="btn-outline"
                      style={{ fontSize: '0.875rem' }}
                    >
                      Bulk Edit ({selectedLineItems.size})
                    </button>
                  )}
                  <button type="button" onClick={() => addLineItem()} className="btn-primary" style={{ fontSize: '0.875rem' }}>
                    + Add Item
                  </button>
                </div>
              </div>

              {formData.line_items.length === 0 ? (
                <p className="text-muted">No line items yet. Click "Add Item" to get started.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        {role === 'admin' && <th style={{ width: '40px' }}></th>}
                        <th style={{ width: '40px' }}></th>
                        <th>Description</th>
                        <th style={{ width: '100px' }}>Quantity</th>
                        <th style={{ width: '120px' }}>Unit Price</th>
                        <th style={{ width: '100px' }}>Discount %</th>
                        <th style={{ width: '120px' }}>Total</th>
                        <th style={{ width: '120px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.line_items.map((item, index) => (
                        <tr
                          key={index}
                          draggable={role === 'admin'}
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={(e) => handleDrop(e, index)}
                          style={{
                            cursor: role === 'admin' ? 'move' : 'default',
                            opacity: draggedIndex === index ? 0.5 : 1,
                            backgroundColor: selectedLineItems.has(index) ? '#eff6ff' : undefined,
                          }}
                        >
                          {role === 'admin' && (
                            <td>
                              <input
                                type="checkbox"
                                id={`line-item-checkbox-${index}`}
                                name={`line-item-checkbox-${index}`}
                                checked={selectedLineItems.has(index)}
                                onChange={() => toggleLineItemSelection(index)}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                          )}
                          <td style={{ cursor: 'grab', userSelect: 'none' }}>⋮⋮</td>
                          <td>
                            <input
                              type="text"
                              id={`line-item-description-${index}`}
                              name={`line-item-description-${index}`}
                              value={item.description}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                              placeholder="Item description"
                              required
                              style={{
                                width: '100%',
                                borderColor: validationErrors[`line_item_${index}_description`] ? '#ef4444' : undefined
                              }}
                            />
                            {validationErrors[`line_item_${index}_description`] && (
                              <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                                {validationErrors[`line_item_${index}_description`]}
                              </span>
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              id={`line-item-quantity-${index}`}
                              name={`line-item-quantity-${index}`}
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                              required
                              style={{
                                width: '100%',
                                borderColor: validationErrors[`line_item_${index}_quantity`] ? '#ef4444' : undefined
                              }}
                            />
                            {validationErrors[`line_item_${index}_quantity`] && (
                              <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                                {validationErrors[`line_item_${index}_quantity`]}
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span>{currencySymbol}</span>
                              <input
                                type="number"
                                id={`line-item-unit-price-${index}`}
                                name={`line-item-unit-price-${index}`}
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                                required
                                style={{
                                  flex: 1,
                                  borderColor: validationErrors[`line_item_${index}_unit_price`] ? '#ef4444' : undefined
                                }}
                              />
                            </div>
                            {validationErrors[`line_item_${index}_unit_price`] && (
                              <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                                {validationErrors[`line_item_${index}_unit_price`]}
                              </span>
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              id={`line-item-discount-${index}`}
                              name={`line-item-discount-${index}`}
                              step="0.01"
                              value={item.discount_percent || '0'}
                              onChange={(e) => updateLineItem(index, 'discount_percent', e.target.value)}
                              style={{
                                width: '100%',
                                borderColor: validationErrors[`line_item_${index}_discount`] ? '#ef4444' : undefined
                              }}
                            />
                            {validationErrors[`line_item_${index}_discount`] && (
                              <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                                {validationErrors[`line_item_${index}_discount`]}
                              </span>
                            )}
                          </td>
                          <td className="text-right">
                            {currencySymbol}{calculateLineTotal(item).toFixed(2)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {role === 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => duplicateLineItem(index)}
                                  className="btn-outline"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  title="Duplicate"
                                >
                                  Copy
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeLineItem(index)}
                                className="btn-danger"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                title="Remove"
                              >
                                <FaTimes />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ marginTop: '2rem', marginLeft: 'auto', width: '300px' }}>
              <table>
                <tbody>
                  <tr>
                    <td className="text-right"><strong>Subtotal:</strong></td>
                    <td className="text-right">{currencySymbol}{subtotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="text-right"><strong>Tax ({formData.tax_rate}%):</strong></td>
                    <td className="text-right">{currencySymbol}{taxAmount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="text-right"><strong>Total:</strong></td>
                    <td className="text-right"><strong>{currencySymbol}{total.toFixed(2)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="form-group">
              <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                <label htmlFor="quote-notes" style={{ marginBottom: 0 }}>Notes</label>
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
                id="quote-notes"
                name="quote-notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes for the quote... Use [link text](url) format or paste URLs directly."
                rows={4}
              />
              <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                Tip: Use markdown format [link text](url) or paste URLs directly. They will be clickable when viewing the quote.
              </small>
            </div>

            <div className="form-group">
              <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                <label htmlFor="quote-terms" style={{ marginBottom: 0 }}>Terms & Conditions</label>
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
                id="quote-terms"
                name="quote-terms"
                value={formData.terms || ''}
                onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                placeholder="Terms and conditions... Use [link text](url) format or paste URLs directly."
                rows={4}
              />
              <small className="text-muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                Tip: Use markdown format [link text](url) or paste URLs directly. They will be clickable when viewing the quote.
              </small>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '500' }}>
                <input
                  type="checkbox"
                  id="create-folder"
                  name="create-folder"
                  checked={formData.create_folder || false}
                  onChange={(e) => setFormData({ ...formData, create_folder: e.target.checked })}
                  disabled={quoteHasFolder && isEdit}
                  style={{ cursor: quoteHasFolder && isEdit ? 'not-allowed' : 'pointer', width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '1rem' }}>
                  {quoteHasFolder && isEdit 
                    ? (
                      <>
                        <FaCheck style={{ marginRight: '0.5rem' }} />
                        This quote already has a folder
                      </>
                    ) 
                    : 'Create a folder for this quote'}
                </span>
              </label>
              <small className="text-muted" style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.875rem', marginLeft: '1.75rem' }}>
                {quoteHasFolder && isEdit 
                  ? 'The folder is already created and linked to this quote. You can view it from the folders section.'
                  : 'A folder will be automatically created to organize files, forms, and e-signatures related to this quote.'}
              </small>
            </div>

            <div className="flex gap-2" style={{ marginTop: '2rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn-primary" disabled={saving || Object.keys(validationErrors).length > 0}>
                {saving ? 'Saving...' : isEdit ? 'Update Quote' : 'Create Quote'}
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
        )}
      </div>

      {/* Modals */}
      {showBulkEdit && selectedLineItems.size > 0 && (
        <BulkEditModal
          selectedCount={selectedLineItems.size}
          onEdit={bulkEditLineItems}
          onClose={() => {
            setShowBulkEdit(false);
            setSelectedLineItems(new Set());
          }}
        />
      )}

      {linkDialog.open && (
        <LinkDialog
          linkDialog={linkDialog}
          onUpdate={setLinkDialog}
          onInsert={insertLink}
          onClose={closeLinkDialog}
        />
      )}
    </div>
  );
}

// Preview Mode Component
function PreviewMode({ formData, clients, currencySymbol, subtotal, taxAmount, total, onClose }: any) {
  const client = clients.find((c: Client) => c.id === formData.client_id);
  
  return (
    <div>
      <div className="flex-between mb-4">
        <h2>Preview</h2>
        <button onClick={onClose} className="btn-outline">Back to Edit</button>
      </div>
      
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '2rem', backgroundColor: 'white' }}>
        <h1>{formData.title || 'Untitled Quote'}</h1>
        
        {client && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h3>Bill To</h3>
            <p><strong>{client.name}</strong></p>
            {client.company && <p>{client.company}</p>}
            {client.email && <p>{client.email}</p>}
            {client.address && <p>{client.address}</p>}
          </div>
        )}
        
        <div style={{ marginTop: '2rem' }}>
          <h3>Line Items</h3>
          <table style={{ width: '100%', marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Description</th>
                <th className="text-right">Quantity</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {formData.line_items.map((item: LineItem, index: number) => {
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
                    <td className="text-right">{currencySymbol}{price.toFixed(2)}</td>
                    <td className="text-right">{currencySymbol}{total.toFixed(2)}</td>
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
                <td className="text-right">{currencySymbol}{subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="text-right"><strong>Tax ({formData.tax_rate}%):</strong></td>
                <td className="text-right">{currencySymbol}{taxAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="text-right"><strong>Total:</strong></td>
                <td className="text-right"><strong>{currencySymbol}{total.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        {formData.notes && (
          <div style={{ marginTop: '2rem' }}>
            <h3>Notes</h3>
            <div style={{ whiteSpace: 'pre-wrap' }}>{renderTextWithLinks(formData.notes)}</div>
          </div>
        )}
        
        {formData.terms && (
          <div style={{ marginTop: '2rem' }}>
            <h3>Terms & Conditions</h3>
            <div style={{ whiteSpace: 'pre-wrap' }}>{renderTextWithLinks(formData.terms)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Template modals have been removed

// Bulk Edit Modal Component
function BulkEditModal({ selectedCount, onEdit, onClose }: any) {
  const [field, setField] = useState<keyof LineItem>('discount_percent');
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEdit(field, value);
  };

  return (
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
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '400px', width: '90%', margin: '1rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Bulk Edit {selectedCount} Item(s)</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="bulk-edit-field">Field to Edit</label>
            <select id="bulk-edit-field" name="bulk-edit-field" value={field} onChange={(e) => setField(e.target.value as keyof LineItem)}>
              <option value="discount_percent">Discount %</option>
              <option value="tax_rate">Tax Rate %</option>
              <option value="quantity">Quantity</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="bulk-edit-value">New Value</label>
            <input
              type="number"
              id="bulk-edit-value"
              name="bulk-edit-value"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn-primary">Apply to Selected</button>
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Link Dialog Component
function LinkDialog({ linkDialog, onUpdate, onInsert, onClose }: any) {
  return (
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
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Insert Link</h3>
        <div className="form-group">
          <label htmlFor="link-text">Link Text (optional)</label>
          <input
            type="text"
            id="link-text"
            name="link-text"
            value={linkDialog.linkText}
            onChange={(e) => onUpdate({ ...linkDialog, linkText: e.target.value })}
            placeholder="e.g., Terms of Service"
          />
        </div>
        <div className="form-group">
          <label htmlFor="link-url">URL *</label>
          <input
            type="url"
            id="link-url"
            name="link-url"
            value={linkDialog.url}
            onChange={(e) => onUpdate({ ...linkDialog, url: e.target.value })}
            placeholder="https://example.com"
            required
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button onClick={onInsert} className="btn-primary" disabled={!linkDialog.url}>
            Insert Link
          </button>
          <button onClick={onClose} className="btn-outline">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default QuoteBuilder;
