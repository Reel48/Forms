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
  
  // Typeform-like state: one question at a time
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [visibleFields, setVisibleFields] = useState<FormField[]>([]);
  
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (submitted || loading || !form || visibleFields.length === 0) return;
      
      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // Allow Enter in textarea (Shift+Enter for new line)
        if (target.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (currentQuestionIndex < visibleFields.length - 1) {
            handleNext();
          } else if (currentQuestionIndex === visibleFields.length - 1) {
            handleSubmit();
          }
        }
        return;
      }
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (currentQuestionIndex < visibleFields.length - 1) {
          handleNext();
        } else if (currentQuestionIndex === visibleFields.length - 1) {
          handleSubmit();
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

  const renderField = (field: FormField, index: number) => {
    const fieldId = (field.id && field.id.trim()) ? field.id : `field-${index}`;
    const value = formValues[fieldId] || '';

    // Check conditional logic
    if (!evaluateConditionalLogic(field)) {
      return null; // Don't render field if condition is not met
    }

    switch (field.field_type) {
      case 'text':
        return (
          <div key={fieldId} className="form-group">
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

      case 'dropdown':
        return (
          <div key={fieldId} className="form-group">
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
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="radiogroup" aria-label={field.label}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {field.options?.map((option: any, optIndex: number) => {
                  const optionValue = option.value || option.label;
                  const optionId = `${fieldId}-${optIndex}`;
                  return (
                    <label key={optIndex} htmlFor={optionId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        id={optionId}
                        name={fieldId}
                        value={optionValue}
                        checked={value === optionValue}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        required={field.required}
                      />
                      <span>{option.label || option.value}</span>
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
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="group" aria-label={field.label}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {field.options?.map((option: any, optIndex: number) => {
                  const optionValue = option.value || option.label;
                  const optionId = `${fieldId}-${optIndex}`;
                  return (
                    <label key={optIndex} htmlFor={optionId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id={optionId}
                        name={fieldId}
                        value={optionValue}
                        checked={(formValues[fieldId] || []).includes(optionValue)}
                        onChange={(e) => {
                          const currentValues = formValues[fieldId] || [];
                          const newValues = e.target.checked
                            ? [...currentValues, optionValue]
                            : currentValues.filter((v: any) => v !== optionValue);
                          handleFieldChange(fieldId, newValues);
                        }}
                      />
                      <span>{option.label || option.value}</span>
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
            <label htmlFor={`${fieldId}-yes`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="radiogroup" aria-label={field.label}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label htmlFor={`${fieldId}-yes`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    id={`${fieldId}-yes`}
                    name={fieldId}
                    value="yes"
                    checked={value === 'yes'}
                    onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                    required={field.required}
                  />
                  <span>Yes</span>
                </label>
                <label htmlFor={`${fieldId}-no`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    id={`${fieldId}-no`}
                    name={fieldId}
                    value="no"
                    checked={value === 'no'}
                    onChange={(e) => handleFieldChange(fieldId, e.target.value)}
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
                    onClick={() => handleFieldChange(fieldId, star)}
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
                          onChange={(e) => handleFieldChange(fieldId, e.target.value)}
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

  if (!currentField && visibleFields.length === 0) {
    return (
      <div className="typeform-container">
        <div className="typeform-content">
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
            This form has no fields.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="typeform-container">
      {/* Progress Bar */}
      {visibleFields.length > 0 && (
        <div className="typeform-progress">
          <div className="typeform-progress-bar">
            <motion.div
              className="typeform-progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
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
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="typeform-btn typeform-btn-primary"
                    disabled={submitting || (currentField.required && !formValues[currentField.id || ''])}
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

