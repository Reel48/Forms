import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formsAPI } from '../api';
import type { Form, FormField } from '../api';

function PublicFormView() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [startTime] = useState(Date.now());
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [paymentIntents, setPaymentIntents] = useState<Record<string, { clientSecret: string; paymentIntentId: string }>>({});
  const [paymentProcessing, setPaymentProcessing] = useState<Record<string, boolean>>({});
  const [rankingDragState, setRankingDragState] = useState<Record<string, { draggedIndex: number | null; dragStart: number | null; dragOver: number | null }>>({});
  
  // Typeform-like state: one question at a time
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [visibleFields, setVisibleFields] = useState<FormField[]>([]);
  
  // Touch gesture support for mobile
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  
  // Use ref to track if we're already loading to prevent multiple simultaneous loads
  const isLoadingRef = useRef(false);
  const loadedSlugRef = useRef<string | null>(null);
  const redirectUrlRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Early return if no slug
    if (!slug) {
      setLoading(false);
      return;
    }

    // If slug changed, reset the loaded state
    if (loadedSlugRef.current !== slug) {
      hasLoadedRef.current = false;
      isLoadingRef.current = false;
    }

    // If we've already successfully loaded this exact slug, don't load again
    if (hasLoadedRef.current && loadedSlugRef.current === slug) {
      return;
    }

    // If we're already loading this slug, don't start another load
    if (isLoadingRef.current && loadedSlugRef.current === slug) {
      return;
    }

    // Mark as loading immediately - BEFORE any async operations
    isLoadingRef.current = true;
    loadedSlugRef.current = slug;
    let isMounted = true;

    const loadForm = async () => {
      // Update loading and error states
      setLoading(true);
      setError(null);
      
      try {
        const response = await formsAPI.getBySlug(slug);
        
        if (!isMounted) {
          isLoadingRef.current = false;
          return;
        }
        
        // Double-check we haven't already loaded (for StrictMode protection)
        if (hasLoadedRef.current && loadedSlugRef.current === slug) {
          isLoadingRef.current = false;
          setLoading(false);
          return;
        }
        
        const formData = response.data;
        
        // Store redirect URL in ref for later use
        if (formData?.thank_you_screen?.redirect_url) {
          redirectUrlRef.current = formData.thank_you_screen.redirect_url;
        }
        
        // Mark as loaded BEFORE setting state to prevent re-runs
        hasLoadedRef.current = true;
        isLoadingRef.current = false;
        
        // Set form and loading together - React will batch these
        setForm(formData);
        setLoading(false);
      } catch (error: any) {
        if (!isMounted) {
          isLoadingRef.current = false;
          return;
        }
        
        setError(error?.response?.data?.detail || error?.message || 'Form not found or not available.');
        setLoading(false);
        isLoadingRef.current = false;
        // Mark as "attempted" so we don't retry automatically on the same slug
        // This prevents infinite retry loops while still allowing retry if slug changes
        hasLoadedRef.current = true; // Set to true to prevent retry, even though load failed
      }
    };

    loadForm();

    return () => {
      isMounted = false;
      // Don't reset isLoadingRef here as it might be in the middle of loading
      // The next effect run will handle it properly
    };
  }, [slug]);

  // Handle redirect after submission - only run when submitted changes to true
  useEffect(() => {
    // Only proceed if submitted is true
    if (submitted !== true) {
      return;
    }

    // Get redirect URL from ref (set when form was loaded)
    const redirectUrl = redirectUrlRef.current;
    
    if (!redirectUrl) {
      return;
    }

    const timer = setTimeout(() => {
      window.location.href = redirectUrl;
    }, 3000);
    
    return () => {
      clearTimeout(timer);
    };
  }, [submitted]);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const evaluateConditionalLogic = (field: FormField): boolean => {
    if (!field.conditional_logic || !field.conditional_logic.enabled) {
      return true; // Show field if no conditional logic
    }

    const triggerFieldId = field.conditional_logic.trigger_field_id;
    if (!triggerFieldId) {
      return true;
    }

    const triggerValue = formValues[triggerFieldId];
    const condition = field.conditional_logic.condition || 'equals';
    const expectedValue = field.conditional_logic.value;

    switch (condition) {
      case 'equals':
        return triggerValue === expectedValue || triggerValue === expectedValue?.toString();
      case 'not_equals':
        return triggerValue !== expectedValue && triggerValue !== expectedValue?.toString();
      case 'contains':
        const triggerStr = String(triggerValue || '');
        const expectedStr = String(expectedValue || '');
        return triggerStr.toLowerCase().includes(expectedStr.toLowerCase());
      case 'is_empty':
        return !triggerValue || triggerValue === '' || (Array.isArray(triggerValue) && triggerValue.length === 0);
      case 'is_not_empty':
        return triggerValue !== undefined && triggerValue !== null && triggerValue !== '' && !(Array.isArray(triggerValue) && triggerValue.length === 0);
      default:
        return true;
    }
  };

  // Calculate visible fields based on conditional logic
  useEffect(() => {
    if (!form || !form.fields) {
      setVisibleFields([]);
      return;
    }

    const visible: FormField[] = [];
    for (const field of form.fields) {
      if (evaluateConditionalLogic(field)) {
        visible.push(field);
      }
    }
    setVisibleFields(visible);
    
    // Reset to first question when visible fields change
    if (visible.length > 0 && currentQuestionIndex >= visible.length) {
      setCurrentQuestionIndex(0);
    }
  }, [form, formValues, currentQuestionIndex]);

  const handleNext = useCallback(() => {
    setCurrentQuestionIndex(prev => {
      if (prev < visibleFields.length - 1) {
        setDirection('forward');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return prev + 1;
      }
      return prev;
    });
  }, [visibleFields.length]);

  const handlePrevious = useCallback(() => {
    setCurrentQuestionIndex(prev => {
      if (prev > 0) {
        setDirection('backward');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form) return;

    setSubmitting(true);
    setError(null);

    try {
      // Calculate time spent
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);

      // Prepare submission data
      const submissionData = {
        form_id: form.id,
        started_at: new Date(startTime).toISOString(),
        time_spent_seconds: timeSpent,
        status: 'completed',
        answers: form.fields?.map((field) => {
          const fieldId = field.id || '';
          const value = formValues[fieldId];
          if (value === undefined || value === null || value === '') {
            return null;
          }
          return {
            field_id: fieldId,
            answer_text: typeof value === 'string' ? value : (Array.isArray(value) ? value.join(', ') : JSON.stringify(value)),
            answer_value: typeof value === 'object' && !Array.isArray(value) ? value : { value },
          };
        }).filter(answer => answer && answer.field_id) || [],
      };

      // Submit form
      await formsAPI.submitForm(form.id, submissionData);
      
      setSubmitted(true);
    } catch (error: any) {
      console.error('Failed to submit form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, formValues, startTime]);

  // Touch gesture support for mobile swipe navigation
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartX.current || !touchStartY.current || submitted || loading || !form || visibleFields.length === 0) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchStartX.current - touchEndX;
      const diffY = touchStartY.current - touchEndY;

      // Only handle horizontal swipes (ignore if vertical swipe is larger)
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swipe left - go to next
          if (currentQuestionIndex < visibleFields.length - 1) {
            handleNext();
          } else if (currentQuestionIndex === visibleFields.length - 1) {
            handleSubmit();
          }
        } else {
          // Swipe right - go to previous
          if (currentQuestionIndex > 0) {
            handlePrevious();
          }
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentQuestionIndex, visibleFields.length, submitted, loading, form, handleNext, handlePrevious, handleSubmit]);

  // Enhanced Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (submitted || loading || !form || visibleFields.length === 0) return;
      
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      
      // Don't intercept if user is typing in an input/textarea/select
      if (isInput) {
        // Special handling for textarea (Shift+Enter for new line, Enter to continue)
        if (target.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (currentQuestionIndex < visibleFields.length - 1) {
            handleNext();
          } else if (currentQuestionIndex === visibleFields.length - 1) {
            handleSubmit();
          }
        }
        // For select dropdowns, Enter should select and advance
        if (target.tagName === 'SELECT' && e.key === 'Enter') {
          e.preventDefault();
          if (currentQuestionIndex < visibleFields.length - 1) {
            handleNext();
          } else if (currentQuestionIndex === visibleFields.length - 1) {
            handleSubmit();
          }
        }
        return;
      }
      
      // Global keyboard shortcuts
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (currentQuestionIndex < visibleFields.length - 1) {
          handleNext();
        } else if (currentQuestionIndex === visibleFields.length - 1) {
          handleSubmit();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (currentQuestionIndex > 0) {
          handlePrevious();
        }
      } else if (e.key === 'ArrowLeft' || (e.key === 'Backspace' && e.target === document.body)) {
        e.preventDefault();
        if (currentQuestionIndex > 0) {
          handlePrevious();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentQuestionIndex < visibleFields.length - 1) {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentQuestionIndex, visibleFields.length, submitted, loading, form, handleNext, handlePrevious, handleSubmit]);

  // Initialize payment intents for payment fields
  useEffect(() => {
    if (!form?.id || !form?.fields) return;
    
    form.fields.forEach(field => {
      if (field.field_type === 'payment') {
        const paymentAmount = field.validation_rules?.paymentAmount || 0;
        const paymentCurrency = field.validation_rules?.paymentCurrency || 'usd';
        const fieldId = field.id || '';
        
        if (paymentAmount > 0 && !paymentIntents[fieldId]) {
          formsAPI.createPaymentIntent(form.id, paymentAmount, paymentCurrency)
            .then(response => {
              setPaymentIntents(prev => ({
                ...prev,
                [fieldId]: {
                  clientSecret: response.data.client_secret,
                  paymentIntentId: response.data.payment_intent_id
                }
              }));
            })
            .catch(err => {
              console.error('Failed to initialize payment intent:', err);
            });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.id, form?.fields]);

  // Helper function to render media (image/video) for a field
  const renderMedia = (field: FormField) => {
    const mediaUrl = field.validation_rules?.mediaUrl;
    if (!mediaUrl) return null;

    if (mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return (
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <img 
            src={mediaUrl} 
            alt={field.label}
            style={{ 
              maxWidth: '100%', 
              maxHeight: '400px', 
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      );
    } else if (mediaUrl.match(/\.(mp4|webm|ogg)$/i)) {
      return (
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <video 
            src={mediaUrl} 
            controls 
            style={{ 
              maxWidth: '100%', 
              maxHeight: '400px', 
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}
          />
        </div>
      );
    }
    return null;
  };

  const renderField = (field: FormField, index: number) => {
    const fieldId = (field.id && field.id.trim()) ? field.id : `field-${index}`;
    const value = formValues[fieldId] || '';

    // Check conditional logic
    if (!evaluateConditionalLogic(field)) {
      return null; // Don't render field if condition is not met
    }

    // Render media if present
    const mediaElement = renderMedia(field);

    switch (field.field_type) {
      case 'text':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="text"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <textarea
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
            />
          </div>
        );

      case 'email':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="email"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'number':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="number"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'phone':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="tel"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'url':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="url"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder || 'https://example.com'}
              required={field.required}
            />
          </div>
        );

      case 'date':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="date"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'time':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="time"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="datetime-local"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'date_range':
        const startDateId = `${fieldId}-start`;
        const endDateId = `${fieldId}-end`;
        const startDate = value?.startDate || '';
        const endDate = value?.endDate || '';
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={startDateId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label htmlFor={startDateId} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#6b7280' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  id={startDateId}
                  name={startDateId}
                  value={startDate}
                  onChange={(e) => handleFieldChange(fieldId, { ...value, startDate: e.target.value })}
                  required={field.required}
                />
              </div>
              <div>
                <label htmlFor={endDateId} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#6b7280' }}>
                  End Date
                </label>
                <input
                  type="date"
                  id={endDateId}
                  name={endDateId}
                  value={endDate}
                  onChange={(e) => handleFieldChange(fieldId, { ...value, endDate: e.target.value })}
                  required={field.required}
                  min={startDate || undefined}
                />
              </div>
            </div>
          </div>
        );

      case 'file_upload':
        const uploading = uploadingFiles[fieldId] || false;
        const handleFileUpload = async (file: File) => {
          if (!form?.id) return;
          if (file.size > 10 * 1024 * 1024) {
            setError('File size exceeds 10MB limit');
            return;
          }
          setUploadingFiles(prev => ({ ...prev, [fieldId]: true }));
          try {
            const response = await formsAPI.uploadFile(form.id, file);
            handleFieldChange(fieldId, {
              file_url: response.data.file_url,
              file_name: response.data.file_name,
              file_size: response.data.file_size,
              file_type: response.data.file_type,
              storage_path: response.data.storage_path
            });
          } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to upload file');
          } finally {
            setUploadingFiles(prev => ({ ...prev, [fieldId]: false }));
          }
        };
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ 
              border: '2px dashed #d1d5db', 
              borderRadius: '8px', 
              padding: '2rem', 
              textAlign: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              backgroundColor: value?.file_url ? '#f0fdf4' : '#f9fafb',
              opacity: uploading ? 0.6 : 1
            }}
            onClick={() => !uploading && document.getElementById(`${fieldId}-file`)?.click()}
            onDragOver={(e) => {
              if (uploading) return;
              e.preventDefault();
              e.currentTarget.style.borderColor = '#667eea';
              e.currentTarget.style.backgroundColor = '#f8f9ff';
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (uploading) return;
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                handleFileUpload(files[0]);
              }
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            >
              <input
                type="file"
                id={`${fieldId}-file`}
                name={fieldId}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && !uploading) {
                    handleFileUpload(file);
                  }
                }}
                required={field.required && !value?.file_url}
                disabled={uploading}
              />
              {uploading ? (
                <div>
                  <p style={{ margin: 0, color: '#667eea' }}>Uploading...</p>
                </div>
              ) : value?.file_url ? (
                <div>
                  <p style={{ margin: 0, color: '#22c55e', fontWeight: '500' }}>✓ {value.file_name}</p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    {(value.file_size / 1024).toFixed(2)} KB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFieldChange(fieldId, null);
                      const input = document.getElementById(`${fieldId}-file`) as HTMLInputElement;
                      if (input) input.value = '';
                    }}
                    style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.875rem',
                      background: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>📎 Click or drag file here</p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    Max file size: 10MB
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'dropdown':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <select
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            >
              <option value="">Select an option...</option>
              {field.options?.map((option: any, optIndex: number) => (
                <option key={optIndex} value={option.value || option.label}>
                  {option.label || option.value}
                </option>
              ))}
            </select>
          </div>
        );

      case 'multiple_choice':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="radiogroup" aria-label={field.label} className="typeform-options">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {field.options?.map((option: any, optIndex: number) => {
                  const optionValue = option.value || option.label;
                  const optionId = `${fieldId}-${optIndex}`;
                  const isSelected = value === optionValue;
                  return (
                    <label 
                      key={optIndex} 
                      htmlFor={optionId} 
                      className={`typeform-option ${isSelected ? 'typeform-option-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        id={optionId}
                        name={fieldId}
                        value={optionValue}
                        checked={isSelected}
                        onChange={(e) => {
                          handleFieldChange(fieldId, e.target.value);
                          // Auto-advance after selection (with small delay for visual feedback)
                          const currentIdx = currentQuestionIndex;
                          const totalFields = visibleFields.length;
                          setTimeout(() => {
                            if (currentIdx < totalFields - 1) {
                              handleNext();
                            } else if (currentIdx === totalFields - 1) {
                              handleSubmit();
                            }
                          }, 300);
                        }}
                        required={field.required}
                      />
                      <span className="typeform-option-label">{option.label || option.value}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="group" aria-label={field.label} className="typeform-options">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {field.options?.map((option: any, optIndex: number) => {
                  const optionValue = option.value || option.label;
                  const optionId = `${fieldId}-${optIndex}`;
                  const isChecked = (formValues[fieldId] || []).includes(optionValue);
                  return (
                    <label 
                      key={optIndex} 
                      htmlFor={optionId} 
                      className={`typeform-option typeform-option-checkbox ${isChecked ? 'typeform-option-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        id={optionId}
                        name={fieldId}
                        value={optionValue}
                        checked={isChecked}
                        onChange={(e) => {
                          const currentValues = formValues[fieldId] || [];
                          const newValues = e.target.checked
                            ? [...currentValues, optionValue]
                            : currentValues.filter((v: any) => v !== optionValue);
                          handleFieldChange(fieldId, newValues);
                        }}
                      />
                      <span className="typeform-option-label">{option.label || option.value}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'yes_no':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={`${fieldId}-yes`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="radiogroup" aria-label={field.label} className="typeform-yesno">
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <label 
                  htmlFor={`${fieldId}-yes`} 
                  className={`typeform-yesno-option ${value === 'yes' ? 'typeform-yesno-selected' : ''}`}
                  style={value === 'yes' ? {
                    borderColor: primaryColor,
                    background: backgroundType === 'gradient' 
                      ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                      : primaryColor,
                    color: 'white',
                    boxShadow: `0 4px 12px ${primaryColor}40`,
                  } : {}}
                >
                  <input
                    type="radio"
                    id={`${fieldId}-yes`}
                    name={fieldId}
                    value="yes"
                    checked={value === 'yes'}
                    onChange={(e) => {
                      handleFieldChange(fieldId, e.target.value);
                      // Auto-advance after selection
                      const currentIdx = currentQuestionIndex;
                      const totalFields = visibleFields.length;
                      setTimeout(() => {
                        if (currentIdx < totalFields - 1) {
                          handleNext();
                        } else if (currentIdx === totalFields - 1) {
                          handleSubmit();
                        }
                      }, 300);
                    }}
                    required={field.required}
                  />
                  <span>Yes</span>
                </label>
                <label 
                  htmlFor={`${fieldId}-no`} 
                  className={`typeform-yesno-option ${value === 'no' ? 'typeform-yesno-selected' : ''}`}
                  style={value === 'no' ? {
                    borderColor: primaryColor,
                    background: backgroundType === 'gradient' 
                      ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                      : primaryColor,
                    color: 'white',
                    boxShadow: `0 4px 12px ${primaryColor}40`,
                  } : {}}
                >
                  <input
                    type="radio"
                    id={`${fieldId}-no`}
                    name={fieldId}
                    value="no"
                    checked={value === 'no'}
                    onChange={(e) => {
                      handleFieldChange(fieldId, e.target.value);
                      // Auto-advance after selection
                      const currentIdx = currentQuestionIndex;
                      const totalFields = visibleFields.length;
                      setTimeout(() => {
                        if (currentIdx < totalFields - 1) {
                          handleNext();
                        } else if (currentIdx === totalFields - 1) {
                          handleSubmit();
                        }
                      }, 300);
                    }}
                    required={field.required}
                  />
                  <span>No</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 'rating':
        const maxRating = field.validation_rules?.max || 5;
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div id={fieldId} role="group" aria-label={field.label}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
                  <button
                    key={star}
                    type="button"
                    name={fieldId}
                    onClick={() => {
                      handleFieldChange(fieldId, star);
                      // Auto-advance after rating selection
                      const currentIdx = currentQuestionIndex;
                      const totalFields = visibleFields.length;
                      setTimeout(() => {
                        if (currentIdx < totalFields - 1) {
                          handleNext();
                        } else if (currentIdx === totalFields - 1) {
                          handleSubmit();
                        }
                      }, 300);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '2rem',
                      cursor: 'pointer',
                      color: star <= (value || 0) ? '#fbbf24' : '#d1d5db',
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title={`${star} star${star > 1 ? 's' : ''}`}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
                {value && (
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    ({value} / {maxRating})
                  </span>
                )}
              </div>
            </div>
          </div>
        );

      case 'opinion_scale':
        const scaleMin = field.validation_rules?.min || 1;
        const scaleMax = field.validation_rules?.max || 10;
        const scaleLabels = field.options || [];
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div id={fieldId} role="group" aria-label={field.label}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  {scaleLabels[0] && (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '100px', textAlign: 'left' }}>
                      {scaleLabels[0].label || scaleLabels[0].value}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flex: 1, justifyContent: 'center' }}>
                    {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i).map((num) => (
                      <label
                        key={num}
                        htmlFor={`${fieldId}-${num}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.25rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          id={`${fieldId}-${num}`}
                          name={fieldId}
                          value={num}
                          checked={value === num.toString()}
                          onChange={(e) => {
                            handleFieldChange(fieldId, e.target.value);
                            // Auto-advance after opinion scale selection
                            const currentIdx = currentQuestionIndex;
                            const totalFields = visibleFields.length;
                            setTimeout(() => {
                              if (currentIdx < totalFields - 1) {
                                handleNext();
                              } else if (currentIdx === totalFields - 1) {
                                handleSubmit();
                              }
                            }, 300);
                          }}
                          required={field.required}
                          style={{ margin: 0 }}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{num}</span>
                      </label>
                    ))}
                  </div>
                  {scaleLabels[1] && (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '100px', textAlign: 'right' }}>
                      {scaleLabels[1].label || scaleLabels[1].value}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'matrix':
        const matrixColumns = field.validation_rules?.matrixColumns || [];
        const matrixType = field.validation_rules?.matrixType || 'radio';
        const matrixRows = field.options || [];
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            {matrixRows.length > 0 && matrixColumns.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #e5e7eb', fontWeight: '500' }}></th>
                      {matrixColumns.map((col: string, colIdx: number) => (
                        <th key={colIdx} style={{ textAlign: 'center', padding: '0.75rem', borderBottom: '2px solid #e5e7eb', fontWeight: '500', fontSize: '0.875rem' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRows.map((row: any, rowIdx: number) => {
                      const rowValue = value?.[rowIdx] || (matrixType === 'checkbox' ? [] : '');
                      return (
                        <tr key={rowIdx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', fontWeight: '500' }}>
                            {row.label || row.value}
                          </td>
                          {matrixColumns.map((col: string, colIdx: number) => {
                            const cellId = `${fieldId}-${rowIdx}-${colIdx}`;
                            if (matrixType === 'checkbox') {
                              const isChecked = Array.isArray(rowValue) && rowValue.includes(col);
                              return (
                                <td key={colIdx} style={{ textAlign: 'center', padding: '0.5rem' }}>
                                  <input
                                    type="checkbox"
                                    id={cellId}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const currentRowValue = Array.isArray(rowValue) ? [...rowValue] : [];
                                      const newRowValue = e.target.checked
                                        ? [...currentRowValue, col]
                                        : currentRowValue.filter((v: string) => v !== col);
                                      const newValue = { ...value, [rowIdx]: newRowValue };
                                      handleFieldChange(fieldId, newValue);
                                    }}
                                  />
                                </td>
                              );
                            } else {
                              return (
                                <td key={colIdx} style={{ textAlign: 'center', padding: '0.5rem' }}>
                                  <input
                                    type="radio"
                                    id={cellId}
                                    name={`${fieldId}-${rowIdx}`}
                                    value={col}
                                    checked={rowValue === col}
                                    onChange={(e) => {
                                      const newValue = { ...value, [rowIdx]: e.target.value };
                                      handleFieldChange(fieldId, newValue);
                                    }}
                                  />
                                </td>
                              );
                            }
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Configure rows (Options) and columns (Matrix Configuration) to display the matrix
              </p>
            )}
          </div>
        );

      case 'ranking':
        const rankingOptions = field.options || [];
        const dragState = rankingDragState[fieldId] || { draggedIndex: null, dragStart: null, dragOver: null };
        
        const handleDragStart = (index: number) => {
          setRankingDragState(prev => ({ ...prev, [fieldId]: { draggedIndex: index, dragStart: index, dragOver: null } }));
        };
        
        const handleDragOver = (e: React.DragEvent, index: number) => {
          e.preventDefault();
          setRankingDragState(prev => ({ ...prev, [fieldId]: { ...prev[fieldId] || { draggedIndex: null, dragStart: null, dragOver: null }, dragOver: index } }));
        };
        
        const handleDrop = (e: React.DragEvent, dropIndex: number) => {
          e.preventDefault();
          const startIndex = dragState.dragStart;
          if (startIndex === null) return;
          
          const currentRanking = value || rankingOptions.map((_, idx) => idx);
          const newRanking = [...currentRanking];
          
          // Remove dragged item
          const [dragged] = newRanking.splice(startIndex, 1);
          // Insert at new position
          newRanking.splice(dropIndex, 0, dragged);
          
          handleFieldChange(fieldId, newRanking);
          setRankingDragState(prev => ({ ...prev, [fieldId]: { draggedIndex: null, dragStart: null, dragOver: null } }));
        };
        
        const handleDragEnd = () => {
          setRankingDragState(prev => ({ ...prev, [fieldId]: { draggedIndex: null, dragStart: null, dragOver: null } }));
        };
        
        const currentRanking = value || rankingOptions.map((_, idx) => idx);
        
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {currentRanking.map((optionIndex: number, displayIndex: number) => {
                const option = rankingOptions[optionIndex];
                if (!option) return null;
                return (
                  <div
                    key={optionIndex}
                    draggable
                    onDragStart={() => handleDragStart(displayIndex)}
                    onDragOver={(e) => handleDragOver(e, displayIndex)}
                    onDrop={(e) => handleDrop(e, displayIndex)}
                    onDragEnd={handleDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        backgroundColor: dragState.draggedIndex === displayIndex ? '#f3f4f6' : '#ffffff',
                        cursor: 'grab',
                        transition: 'all 0.2s',
                      }}
                  >
                    <span style={{ fontSize: '1.25rem', color: '#9ca3af' }}>☰</span>
                    <span style={{ flex: 1, fontWeight: '500' }}>{displayIndex + 1}. {option.label || option.value}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Drag items to reorder them
            </p>
          </div>
        );

      case 'payment':
        const paymentAmount = field.validation_rules?.paymentAmount || 0;
        const paymentCurrency = field.validation_rules?.paymentCurrency || 'usd';
        const paymentIntent = paymentIntents[fieldId];
        const isProcessing = paymentProcessing[fieldId] || false;
        
        const formatCurrency = (amount: number, currency: string) => {
          const symbols: Record<string, string> = {
            usd: '$',
            eur: '€',
            gbp: '£',
            cad: '$',
            aud: '$'
          };
          return `${symbols[currency] || '$'}${amount.toFixed(2)}`;
        };
        
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            {paymentAmount > 0 ? (
              <div style={{
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '2rem',
                backgroundColor: '#ffffff',
                textAlign: 'center'
              }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                    {formatCurrency(paymentAmount, paymentCurrency)}
                  </p>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.5rem 0 0 0' }}>
                    {paymentCurrency.toUpperCase()}
                  </p>
                </div>
                {paymentIntent?.clientSecret ? (
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                      Payment will be processed securely via Stripe
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        // In a real implementation, you'd integrate Stripe Elements here
                        // For now, we'll mark as paid when clicked (for testing)
                        handleFieldChange(fieldId, {
                          payment_intent_id: paymentIntent.paymentIntentId,
                          amount: paymentAmount,
                          currency: paymentCurrency,
                          status: 'pending'
                        });
                        setPaymentProcessing(prev => ({ ...prev, [fieldId]: true }));
                        // Simulate payment processing
                        setTimeout(() => {
                          handleFieldChange(fieldId, {
                            payment_intent_id: paymentIntent.paymentIntentId,
                            amount: paymentAmount,
                            currency: paymentCurrency,
                            status: 'succeeded'
                          });
                          setPaymentProcessing(prev => ({ ...prev, [fieldId]: false }));
                        }, 2000);
                      }}
                      disabled={isProcessing || value?.status === 'succeeded'}
                      style={{
                        padding: '0.75rem 2rem',
                        fontSize: '1rem',
                        fontWeight: '500',
                        color: '#ffffff',
                        background: isProcessing || value?.status === 'succeeded' 
                          ? '#9ca3af' 
                          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isProcessing || value?.status === 'succeeded' ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isProcessing ? 'Processing...' : value?.status === 'succeeded' ? '✓ Payment Complete' : 'Pay Now'}
                    </button>
                    {value?.status === 'succeeded' && (
                      <p style={{ fontSize: '0.875rem', color: '#22c55e', marginTop: '1rem', fontWeight: '500' }}>
                        ✓ Payment successful
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Initializing payment...</p>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Please configure the payment amount in the form builder
              </p>
            )}
          </div>
        );

      default:
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>{field.label}</label>
            <input
              type="text"
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <p>Loading form...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>Form Not Available</h2>
          <p className="text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const thankYouMessage = form?.thank_you_screen?.title || 'Thank you!';
    const thankYouDescription = form?.thank_you_screen?.description || 'Your response has been recorded.';
    const redirectUrl = form?.thank_you_screen?.redirect_url;

    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#22c55e', marginBottom: '1rem' }}>✓ {thankYouMessage}</h1>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>{thankYouDescription}</p>
          {redirectUrl && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Redirecting in 3 seconds...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!form) {
    return null;
  }

  const welcomeTitle = form.welcome_screen?.title || form.name;
  const welcomeDescription = form.welcome_screen?.description || form.description;
  const showWelcome = form.welcome_screen?.enabled !== false && !formValues._started;

  if (showWelcome) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '1rem' }}>{welcomeTitle}</h1>
          {welcomeDescription && (
            <p className="text-muted" style={{ marginBottom: '2rem' }}>{welcomeDescription}</p>
          )}
          <button
            onClick={() => setFormValues((prev) => ({ ...prev, _started: true }))}
            className="btn-primary"
            style={{ fontSize: '1.125rem', padding: '0.75rem 2rem' }}
          >
            {form.welcome_screen?.button_text || 'Start'}
          </button>
        </div>
      </div>
    );
  }

  // Typeform-like: Show one question at a time
  const currentField = visibleFields[currentQuestionIndex];
  const progress = visibleFields.length > 0 ? ((currentQuestionIndex + 1) / visibleFields.length) * 100 : 0;
  const isLastQuestion = currentQuestionIndex === visibleFields.length - 1;

  // Apply theme
  const theme = form?.theme || {};
  const primaryColor = theme.primaryColor || '#667eea';
  const secondaryColor = theme.secondaryColor || '#764ba2';
  const fontFamily = theme.fontFamily || 'Inter, system-ui, sans-serif';
  const logoUrl = theme.logoUrl || '';
  const backgroundType = theme.backgroundType || 'gradient';
  const backgroundColor = theme.backgroundColor || primaryColor;

  // Calculate background style
  const containerStyle: React.CSSProperties = {
    fontFamily: fontFamily,
  };

  if (backgroundType === 'gradient') {
    containerStyle.background = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
  } else {
    containerStyle.background = backgroundColor;
  }

  if (!currentField && visibleFields.length === 0) {
    return (
      <div className="typeform-container" style={containerStyle}>
        <div className="typeform-content">
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
            This form has no fields.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="typeform-container" style={containerStyle}>
      {/* Logo */}
      {logoUrl && (
        <div style={{ 
          position: 'fixed', 
          top: '1rem', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          zIndex: 101,
          maxHeight: '60px',
          maxWidth: '200px'
        }}>
          <img 
            src={logoUrl} 
            alt="Logo" 
            style={{ 
              maxHeight: '100%', 
              maxWidth: '100%', 
              objectFit: 'contain' 
            }} 
            onError={(e) => {
              // Hide logo if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Progress Bar */}
      {visibleFields.length > 0 && (
        <div className="typeform-progress" style={{ marginTop: logoUrl ? '80px' : '0' }}>
          <div className="typeform-progress-bar">
            <motion.div
              className="typeform-progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{ background: 'white' }}
            />
          </div>
          <div className="typeform-progress-text">
            {currentQuestionIndex + 1} of {visibleFields.length}
          </div>
        </div>
      )}

      {/* Question Container with Animation */}
      <div className="typeform-content">
        <AnimatePresence mode="wait">
          {currentField && (
            <motion.div
              key={currentQuestionIndex}
              initial={{ 
                opacity: 0, 
                x: direction === 'forward' ? 50 : -50,
                scale: 0.95
              }}
              animate={{ 
                opacity: 1, 
                x: 0,
                scale: 1
              }}
              exit={{ 
                opacity: 0, 
                x: direction === 'forward' ? -50 : 50,
                scale: 0.95
              }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0, 0.2, 1]
              }}
              className="typeform-question"
            >
              {renderField(currentField, currentQuestionIndex)}
              
              {/* Navigation Buttons */}
              <div className="typeform-navigation">
                {currentQuestionIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="typeform-btn typeform-btn-secondary"
                  >
                    ← Previous
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {!isLastQuestion ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="typeform-btn typeform-btn-primary"
                    disabled={currentField.required && !formValues[currentField.id || '']}
                    style={{
                      background: backgroundType === 'gradient' 
                        ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                        : primaryColor,
                    }}
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="typeform-btn typeform-btn-primary"
                    disabled={submitting || (currentField.required && !formValues[currentField.id || ''])}
                    style={{
                      background: backgroundType === 'gradient' 
                        ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                        : primaryColor,
                    }}
                  >
                    {submitting ? 'Submitting...' : (form.thank_you_screen?.submit_button_text || 'Submit')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="typeform-error"
          >
            <p>{error}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default PublicFormView;

