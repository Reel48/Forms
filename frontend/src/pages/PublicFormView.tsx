import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Widget } from '@typeform/embed-react';
import { formsAPI } from '../api';
import type { Form, FormField } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getLogoForDarkBackground } from '../utils/logoUtils';

function PublicFormView() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth(); // Get authenticated user if available
  const [form, setForm] = useState<Form | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState<any>(null);
  const [loadingPreviousSubmission, setLoadingPreviousSubmission] = useState(false);
  const [viewMode, setViewMode] = useState<'fill' | 'view'>('fill'); // 'fill' or 'view' (view previous answers)
  const [startTime] = useState(Date.now());
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [paymentIntents, setPaymentIntents] = useState<Record<string, { clientSecret: string; paymentIntentId: string }>>({});
  const [paymentProcessing, setPaymentProcessing] = useState<Record<string, boolean>>({});
  const [rankingDragState, setRankingDragState] = useState<Record<string, { draggedIndex: number | null; dragStart: number | null; dragOver: number | null }>>({});
  
  // Typeform-like state: one question at a time
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [visibleFields, setVisibleFields] = useState<FormField[]>([]);
  
  // Multi-page support: group fields by sections into pages
  const [pages, setPages] = useState<Array<{section?: FormField; fields: FormField[]}>>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  // Password protection
  const [passwordEntered, setPasswordEntered] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  
  // CAPTCHA
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  
  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
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
        
        // Check if user has already submitted this form (if authenticated)
        if (user && user.email && formData?.id) {
          try {
            setLoadingPreviousSubmission(true);
            const submissionResponse = await formsAPI.getMySubmission(formData.id);
            if (submissionResponse.data) {
              setPreviousSubmission(submissionResponse.data);
              setViewMode('view');
              // Pre-fill form values with previous answers for display
              const previousAnswers: Record<string, any> = {};
              submissionResponse.data.answers?.forEach((answer: any) => {
                if (answer.field_id) {
                  // Handle different answer types
                  if (answer.answer_value) {
                    try {
                      // Try to parse JSON if it's a complex value
                      const parsed = JSON.parse(answer.answer_value);
                      previousAnswers[answer.field_id] = parsed;
                    } catch {
                      // If not JSON, use as-is
                      previousAnswers[answer.field_id] = answer.answer_value;
                    }
                  }
                }
              });
              setFormValues(previousAnswers);
            }
          } catch (err: any) {
            // 404 means no previous submission, which is fine
            if (err.response?.status !== 404) {
              console.warn('Failed to load previous submission:', err);
            }
            setViewMode('fill');
          } finally {
            setLoadingPreviousSubmission(false);
          }
        }
        
        // Check if form has password protection
        const passwordRequired = formData?.settings?.password_required;
        if (passwordRequired) {
          // Check if password is already verified in sessionStorage
          const isVerified = sessionStorage.getItem(`form_password_verified_${formData.id}`);
          if (isVerified === 'true') {
            setPasswordEntered(true);
          } else {
            setPasswordEntered(false);
            setLoading(false);
            return;
          }
        } else {
          setPasswordEntered(true);
        }
        
        // Load CAPTCHA if enabled
        if (formData?.settings?.captcha_enabled && formData?.settings?.captcha_site_key) {
          // CAPTCHA will be loaded when form is ready
          const loadCaptcha = () => {
            if (typeof window !== 'undefined' && (window as any).grecaptcha && captchaRef.current) {
              try {
                (window as any).grecaptcha.render(captchaRef.current, {
                  sitekey: formData.settings?.captcha_site_key || '',
                  callback: (token: string) => {
                    setCaptchaToken(token);
                  },
                  'expired-callback': () => {
                    setCaptchaToken(null);
                  },
                });
              } catch (e) {
                console.error('Failed to render CAPTCHA:', e);
              }
            }
          };
          
          // Try to load immediately, or wait for grecaptcha to be available
          if ((window as any).grecaptcha) {
            setTimeout(loadCaptcha, 100);
          } else {
            const checkInterval = setInterval(() => {
              if ((window as any).grecaptcha) {
                clearInterval(checkInterval);
                loadCaptcha();
              }
            }, 100);
            setTimeout(() => clearInterval(checkInterval), 10000); // Give up after 10 seconds
          }
        }
        
        // Pre-fill from URL parameters first (takes precedence over saved progress)
        const urlPrefilledValues: Record<string, any> = {};
        if (formData?.fields) {
          formData.fields.forEach((field: FormField) => {
            const paramValue = searchParams.get(field.id || '');
            if (paramValue !== null) {
              // Handle different field types
              if (['checkbox', 'multiple_choice'].includes(field.field_type)) {
                // For checkboxes, support comma-separated values
                urlPrefilledValues[field.id!] = paramValue.split(',').map(v => v.trim()).filter(v => v);
              } else if (field.field_type === 'yes_no') {
                urlPrefilledValues[field.id!] = paramValue.toLowerCase() === 'true' || paramValue.toLowerCase() === 'yes' || paramValue === '1';
              } else if (field.field_type === 'number') {
                const numValue = parseFloat(paramValue);
                if (!isNaN(numValue)) {
                  urlPrefilledValues[field.id!] = numValue;
                }
              } else {
                urlPrefilledValues[field.id!] = paramValue;
              }
            }
          });
        }

        // Try to restore saved progress (only if no URL params were used)
        const hasUrlParams = Object.keys(urlPrefilledValues).length > 0;
        if (!hasUrlParams && formData?.id) {
          const storageKey = `form_progress_${formData.id}`;
          try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
              const parsed = JSON.parse(saved);
              // Only restore if saved within last 30 days
              const daysSinceSave = (Date.now() - parsed.timestamp) / (1000 * 60 * 60 * 24);
              if (daysSinceSave < 30) {
                setFormValues(parsed.formValues || {});
                if (parsed.currentQuestionIndex !== undefined) {
                  setCurrentQuestionIndex(parsed.currentQuestionIndex);
                }
              } else {
                // Clear old saved progress
                localStorage.removeItem(storageKey);
              }
            }
          } catch (e) {
            console.warn('Failed to restore progress from localStorage:', e);
          }
        } else if (hasUrlParams) {
          // Use URL pre-filled values
          setFormValues(urlPrefilledValues);
        }
        
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

  const validateField = useCallback((field: FormField, value: any): string | null => {
    const rules = field.validation_rules || {};
    
    // Special validation for component_color_selector
    if (field.field_type === 'component_color_selector') {
      if (field.required) {
        const valueObj = typeof value === 'object' ? value : {};
        const hasPantone = valueObj.pantone_code && valueObj.pantone_code.trim();
        const hasHex = valueObj.hex && valueObj.hex.trim();
        const hasSelectedOption = value && typeof value === 'object' && value.value && !value.is_custom;
        
        if (!hasPantone && !hasHex && !hasSelectedOption) {
          return rules.errorMessage || `${field.label} requires either a Pantone code or hex color`;
        }
      }
      // No hex format validation - allow any input
      return null; // Pass validation for component_color_selector
    }
    
    // Required validation for other field types
    if (field.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
      return rules.errorMessage || `${field.label} is required`;
    }
    
    if (value === undefined || value === null || value === '') {
      return null; // Empty values pass if not required
    }
    
    const valueStr = String(value);
    
    // Min/Max length validation
    if (rules.minLength !== undefined && valueStr.length < rules.minLength) {
      return rules.errorMessage || `${field.label} must be at least ${rules.minLength} characters`;
    }
    if (rules.maxLength !== undefined && valueStr.length > rules.maxLength) {
      return rules.errorMessage || `${field.label} must be no more than ${rules.maxLength} characters`;
    }
    
    // Pattern/Regex validation
    if (rules.pattern) {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(valueStr)) {
          return rules.errorMessage || `${field.label} format is invalid`;
        }
      } catch (e) {
        console.warn('Invalid regex pattern:', rules.pattern);
      }
    }
    
    // Number min/max validation
    if (field.field_type === 'number') {
      const numValue = parseFloat(valueStr);
      if (isNaN(numValue)) {
        return rules.errorMessage || `${field.label} must be a valid number`;
      }
      if (rules.min !== undefined && numValue < rules.min) {
        return rules.errorMessage || `${field.label} must be at least ${rules.min}`;
      }
      if (rules.max !== undefined && numValue > rules.max) {
        return rules.errorMessage || `${field.label} must be no more than ${rules.max}`;
      }
    }
    
    // Email validation
    if (field.field_type === 'email' && valueStr) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(valueStr)) {
        return rules.errorMessage || 'Please enter a valid email address';
      }
    }
    
    // URL validation
    if (field.field_type === 'url' && valueStr) {
      try {
        new URL(valueStr);
      } catch (e) {
        return rules.errorMessage || 'Please enter a valid URL';
      }
    }
    
    return null; // Validation passed
  }, []);

  const handleFieldChange = useCallback((fieldId: string, value: any) => {
    setFormValues((prev) => {
      const updated = { ...prev, [fieldId]: value };
      // Save progress to localStorage
      if (form?.id) {
        const storageKey = `form_progress_${form.id}`;
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            formValues: updated,
            currentQuestionIndex,
            timestamp: Date.now(),
          }));
        } catch (e) {
          console.warn('Failed to save progress to localStorage:', e);
        }
      }
      // Validate field
      const field = form?.fields?.find(f => (f.id || '') === fieldId);
      if (field) {
        const error = validateField(field, value);
        setFieldErrors(prevErrors => {
          if (error) {
            return { ...prevErrors, [fieldId]: error };
          } else {
            const { [fieldId]: _, ...rest } = prevErrors;
            return rest;
          }
        });
      }
      
      return updated;
    });
  }, [form?.id, form?.fields, currentQuestionIndex, validateField]);

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

  // Calculate visible fields and group into pages based on sections
  useEffect(() => {
    if (!form || !form.fields) {
      setVisibleFields([]);
      setPages([]);
      return;
    }

    const visible: FormField[] = [];
    const visibleSections: FormField[] = [];
    
    // First pass: collect all visible fields and sections
    for (const field of form.fields) {
      if (evaluateConditionalLogic(field)) {
        if (field.field_type === 'section') {
          visibleSections.push(field);
        } else {
          visible.push(field);
        }
      }
    }
    
    setVisibleFields(visible);
    
    // Group fields into pages based on sections
    const pagesData: Array<{section?: FormField; fields: FormField[]}> = [];
    let currentPageFields: FormField[] = [];
    let currentSection: FormField | undefined;
    
    for (const field of form.fields) {
      if (!evaluateConditionalLogic(field)) continue;
      
      if (field.field_type === 'section') {
        // Save current page if it has fields
        if (currentPageFields.length > 0) {
          pagesData.push({ section: currentSection, fields: currentPageFields });
        }
        // Start new page
        currentSection = field;
        currentPageFields = [];
      } else {
        // Add field to current page
        currentPageFields.push(field);
      }
    }
    
    // Add final page
    if (currentPageFields.length > 0) {
      pagesData.push({ section: currentSection, fields: currentPageFields });
    }
    
    // If no sections, create a single page with all fields
    if (pagesData.length === 0 && visible.length > 0) {
      pagesData.push({ fields: visible });
    }
    
    setPages(pagesData);
    
    // Reset to first question/page when visible fields change
    if (visible.length > 0 && currentQuestionIndex >= visible.length) {
      setCurrentQuestionIndex(0);
      setCurrentPageIndex(0);
    }
  }, [form, formValues]);
  
  // Update current page index based on current question
  useEffect(() => {
    if (pages.length === 0 || visibleFields.length === 0) return;
    
    // Find which page the current question belongs to
    let fieldCount = 0;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (currentQuestionIndex >= fieldCount && currentQuestionIndex < fieldCount + page.fields.length) {
        if (currentPageIndex !== i) {
          setCurrentPageIndex(i);
        }
        break;
      }
      fieldCount += page.fields.length;
    }
  }, [currentQuestionIndex, pages, visibleFields.length]);

  const handleNext = useCallback(() => {
    setCurrentQuestionIndex(prev => {
      if (prev < visibleFields.length - 1) {
        setDirection('forward');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const newIndex = prev + 1;
        // Save current question index
        if (form?.id) {
          const storageKey = `form_progress_${form.id}`;
          try {
            const existing = localStorage.getItem(storageKey);
            const parsed = existing ? JSON.parse(existing) : { formValues: {} };
            localStorage.setItem(storageKey, JSON.stringify({
              ...parsed,
              currentQuestionIndex: newIndex,
              timestamp: Date.now(),
            }));
          } catch (e) {
            console.warn('Failed to save progress:', e);
          }
        }
        return newIndex;
      }
      return prev;
    });
  }, [visibleFields.length, form?.id]);

  const handlePrevious = useCallback(() => {
    setCurrentQuestionIndex(prev => {
      if (prev > 0) {
        setDirection('backward');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const newIndex = prev - 1;
        // Save current question index
        if (form?.id) {
          const storageKey = `form_progress_${form.id}`;
          try {
            const existing = localStorage.getItem(storageKey);
            const parsed = existing ? JSON.parse(existing) : { formValues: {} };
            localStorage.setItem(storageKey, JSON.stringify({
              ...parsed,
              currentQuestionIndex: newIndex,
              timestamp: Date.now(),
            }));
          } catch (e) {
            console.warn('Failed to save progress:', e);
          }
        }
        return newIndex;
      }
      return prev;
    });
  }, [form?.id]);

  const handleSubmit = useCallback(async () => {
    if (!form) return;

    setSubmitting(true);
    setError(null);

    try {
      // Calculate time spent
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);

      // Check if CAPTCHA is required
      const captchaEnabled = form.settings?.captcha_enabled;
      if (captchaEnabled && !captchaToken) {
        setError('Please complete the CAPTCHA verification');
        setSubmitting(false);
        return;
      }

      // Prepare submission data
      const submissionData: any = {
        form_id: form.id,
        started_at: new Date(startTime).toISOString(),
        time_spent_seconds: timeSpent,
        status: 'completed',
        // Include user's email if authenticated (backend will use this or override with auth token email)
        submitter_email: user?.email || undefined,
        submitter_name: user?.user_metadata?.name || user?.user_metadata?.full_name || undefined,
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
      
      // Add CAPTCHA token if enabled
      if (captchaEnabled && captchaToken) {
        submissionData.captcha_token = captchaToken;
      }

      // Submit form
      await formsAPI.submitForm(form.id, submissionData);
      
      // Clear saved progress after successful submission
      if (form.id) {
        const storageKey = `form_progress_${form.id}`;
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {
          console.warn('Failed to clear saved progress:', e);
        }
      }
      
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
    const error = fieldErrors[fieldId];

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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="off"
              minLength={field.validation_rules?.minLength}
              maxLength={field.validation_rules?.maxLength}
              pattern={field.validation_rules?.pattern}
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
              aria-required={field.required}
              aria-invalid={!!error}
              aria-describedby={error ? `${fieldId}-error` : field.description ? `${fieldId}-description` : undefined}
            />
            {field.description && (
              <p id={`${fieldId}-description`} className="sr-only">{field.description}</p>
            )}
            {error && (
              <p id={`${fieldId}-error`} role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="off"
              minLength={field.validation_rules?.minLength}
              maxLength={field.validation_rules?.maxLength}
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
            />
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>
            )}
          </div>
        );

      case 'email':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="email"
              minLength={field.validation_rules?.minLength}
              maxLength={field.validation_rules?.maxLength}
              pattern={field.validation_rules?.pattern}
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
            />
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="off"
              min={field.validation_rules?.min}
              max={field.validation_rules?.max}
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
            />
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>
            )}
          </div>
        );

      case 'phone':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="tel"
              minLength={field.validation_rules?.minLength}
              maxLength={field.validation_rules?.maxLength}
              pattern={field.validation_rules?.pattern}
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
            />
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>
            )}
          </div>
        );

      case 'url':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="url"
              minLength={field.validation_rules?.minLength}
              maxLength={field.validation_rules?.maxLength}
              pattern={field.validation_rules?.pattern}
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
            />
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="bday"
            />
          </div>
        );

      case 'time':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="off"
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="off"
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
                  autoComplete="off"
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
                  autoComplete="off"
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
            // Clear any previous errors on success
            setError(null);
          } catch (err: any) {
            const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to upload file';
            console.error('File upload error:', errorMessage);
            // Show error but don't block form submission
            // Store error in field value so user knows upload failed
            handleFieldChange(fieldId, {
              upload_error: errorMessage,
              file_name: file.name,
              file_size: file.size,
              file_type: file.type
            });
            // Set a temporary error message that will clear after a few seconds
            setError(`File upload failed: ${errorMessage}. You can still submit the form.`);
            setTimeout(() => setError(null), 5000);
          } finally {
            setUploadingFiles(prev => ({ ...prev, [fieldId]: false }));
          }
        };
        return (
          <div key={fieldId} className="form-group">
            {mediaElement}
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              e.currentTarget.style.borderColor = 'var(--color-primary)';
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
                required={field.required && !value?.file_url && !value?.upload_error}
                disabled={uploading}
              />
              {uploading ? (
                <div>
                  <p style={{ margin: 0, color: 'var(--color-primary)' }}>Uploading...</p>
                </div>
              ) : value?.file_url ? (
                <div>
                  <p style={{ margin: 0, color: 'var(--color-success)', fontWeight: '500' }}>{value.file_name}</p>
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
                      background: 'var(--color-danger-light)',
                      color: 'var(--color-danger)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : value?.upload_error ? (
                <div>
                  <p style={{ margin: 0, color: 'var(--color-danger)', fontWeight: '500' }}>Upload failed: {value.upload_error}</p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    File: {value.file_name} ({(value.file_size / 1024).toFixed(2)} KB)
                  </p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    You can still submit the form, but the file won't be attached.
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
                      background: 'var(--color-danger-light)',
                      color: 'var(--color-danger)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove & Try Again
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Click or drag file here</p>
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              autoComplete="off"
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
                                    name={`${fieldId}-${rowIdx}`}
                                    value={col}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
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
                          : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-purple) 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isProcessing || value?.status === 'succeeded' ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isProcessing ? 'Processing...' : value?.status === 'succeeded' ? 'Payment Complete' : 'Pay Now'}
                    </button>
                    {value?.status === 'succeeded' && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-success)', marginTop: '1rem', fontWeight: '500' }}>
                        Payment successful
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Initializing payment...</p>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Please configure the payment amount in Typeform
              </p>
            )}
          </div>
        );

      case 'component_color_selector':
        // Get current custom color values
        const currentValue = typeof value === 'object' ? value : {};
        const customHex = currentValue.hex || '';
        const customPantone = currentValue.pantone_code || '';
        const customLabel = currentValue.label || '';
        
        return (
          <div key={fieldId} className="form-group component-color-selector" style={{ marginTop: 0, paddingTop: 0 }}>
            {mediaElement && (
              <div style={{ marginBottom: '1rem' }}>
                {mediaElement}
              </div>
            )}
            <label htmlFor={fieldId} style={{ marginBottom: '0.75rem', marginTop: 0, display: 'block' }}>
              {field.label}
              {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem 0' }}>
                {field.description}
              </p>
            )}
            
            {/* CUSTOM COLOR INPUT SECTION */}
            <div style={{
              padding: '1.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
                Enter Custom Color
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {/* Pantone Code - Preferred/First */}
                <div>
                  <label htmlFor={`${fieldId}-custom-pantone`} style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#111827' }}>
                    Pantone Code {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '400', marginLeft: '0.25rem' }}>(Preferred)</span>
                  </label>
                  <input
                    type="text"
                    id={`${fieldId}-custom-pantone`}
                    value={customPantone}
                    onChange={(e) => {
                      handleFieldChange(fieldId, {
                        value: (customPantone || customHex) ? (typeof value === 'object' && value?.value ? value.value : `custom-${Date.now()}`) : `custom-${Date.now()}`,
                        label: customLabel || 'Custom Color',
                        hex: customHex || '',
                        pantone_code: e.target.value,
                        is_custom: true,
                      });
                    }}
                    placeholder="e.g., Pantone 19-4052 TCX"
                    required={field.required}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                    }}
                  />
                </div>
                {/* Hex Color - Optional */}
                <div>
                  <label htmlFor={`${fieldId}-custom-hex`} style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#111827' }}>
                    Hex Color (Optional)
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      id={`${fieldId}-custom-hex`}
                      value={customHex}
                      onChange={(e) => {
                        const hex = e.target.value;
                        handleFieldChange(fieldId, {
                          value: (customPantone || hex) ? (typeof value === 'object' && value?.value ? value.value : `custom-${Date.now()}`) : `custom-${Date.now()}`,
                          label: customLabel || 'Custom Color',
                          hex: hex,
                          pantone_code: customPantone,
                          is_custom: true,
                        });
                      }}
                      placeholder="#000000"
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        border: '2px solid #d1d5db',
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                      }}
                    />
                    <input
                      type="color"
                      value={customHex || '#000000'}
                      onChange={(e) => {
                        handleFieldChange(fieldId, {
                          value: (customPantone || e.target.value) ? (typeof value === 'object' && value?.value ? value.value : `custom-${Date.now()}`) : `custom-${Date.now()}`,
                          label: customLabel || 'Custom Color',
                          hex: e.target.value,
                          pantone_code: customPantone,
                          is_custom: true,
                        });
                      }}
                      style={{ width: '60px', height: '48px', cursor: 'pointer', border: 'none', borderRadius: '8px' }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor={`${fieldId}-custom-label`} style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#111827' }}>
                  Color Name (Optional)
                </label>
                <input
                  type="text"
                  id={`${fieldId}-custom-label`}
                  value={customLabel}
                  onChange={(e) => {
                    handleFieldChange(fieldId, {
                      value: (customPantone || customHex) ? (typeof value === 'object' && value?.value ? value.value : `custom-${Date.now()}`) : `custom-${Date.now()}`,
                      label: e.target.value || 'Custom Color',
                      hex: customHex || '',
                      pantone_code: customPantone,
                      is_custom: true,
                    });
                  }}
                  placeholder="e.g., Classic Blue"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>
            </div>
            
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
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
              autoComplete="off"
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
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>Form Not Available</h2>
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
          <h1 style={{ color: 'var(--color-success)', marginBottom: '1rem' }}>{thankYouMessage}</h1>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>{thankYouDescription}</p>
          {redirectUrl && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              Redirecting in 3 seconds...
            </p>
          )}
          {/* Back to Dashboard button for customers */}
          {role === 'customer' && (
            <button
              onClick={() => navigate('/')}
              className="btn-primary"
              style={{ fontSize: '1rem', padding: '0.75rem 1.5rem', marginTop: '1rem' }}
            >
              Back to Dashboard
            </button>
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
  
  // Multi-page: Get current page info
  const currentPage = pages[currentPageIndex];
  const isLastPage = currentPageIndex === pages.length - 1;
  const isFirstPage = currentPageIndex === 0;
  
  // Check if we're at the last question of current page
  let fieldCount = 0;
  for (let i = 0; i < currentPageIndex; i++) {
    fieldCount += pages[i].fields.length;
  }
  const isLastQuestionInPage = currentQuestionIndex === fieldCount + (currentPage?.fields.length || 0) - 1;
  const isFirstQuestionInPage = currentQuestionIndex === fieldCount;

  // Apply theme
  const theme = form?.theme || {};
  const primaryColor = theme.primaryColor || 'var(--color-primary)';
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

  // Password protection check
  const passwordRequired = form?.settings?.password_required;
  if (passwordRequired && !passwordEntered) {
    const handlePasswordSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!slug || !passwordInput.trim()) return;
      
      setPasswordError(null);
      try {
        const response = await formsAPI.verifyFormPassword(slug, passwordInput);
        if (response.data.success) {
          // Store verification in sessionStorage for this session
          if (form?.id) {
            sessionStorage.setItem(`form_password_verified_${form.id}`, 'true');
          }
          setPasswordEntered(true);
          setPasswordError(null);
        }
      } catch (error: any) {
        setPasswordError(error?.response?.data?.detail || 'Incorrect password. Please try again.');
        setPasswordInput('');
      }
    };

    return (
      <div className="typeform-container" style={containerStyle}>
        <div className="typeform-content">
          <div style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'white' }}>
              {form?.name || 'Protected Form'}
            </h2>
            <p style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '2rem' }}>
              This form is password protected. Please enter the password to continue.
            </p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group">
                <input
                  type="password"
                  id="form-password-input"
                  name="form-password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Enter password"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1rem',
                    borderRadius: '8px',
                    border: passwordError ? '2px solid var(--color-danger)' : '2px solid rgba(255, 255, 255, 0.3)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                  }}
                />
                {passwordError && (
                  <p style={{ color: '#fecaca', fontSize: '0.875rem', marginTop: '0.5rem', textAlign: 'center' }}>
                    {passwordError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="typeform-btn typeform-btn-primary"
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  background: backgroundType === 'gradient' 
                    ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                    : primaryColor,
                }}
              >
                Access Form
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Check if this is a Typeform form and render embed
  if (form?.is_typeform_form && form?.typeform_form_id) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: '#292c2f'
      }}>
        <Widget
          id={form.typeform_form_id}
          style={{ width: '100%', height: '100%', flex: 1 }}
          onSubmit={() => {
            // Handle form completion
            console.log('Typeform submission completed');
            // Optionally redirect or show thank you message
            if (form.thank_you_screen?.redirect_url) {
              window.location.href = form.thank_you_screen.redirect_url;
            }
          }}
        />
      </div>
    );
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

  // Show previous submission view if available
  if (viewMode === 'view' && previousSubmission && !loadingPreviousSubmission) {
    return (
      <div className="typeform-container" style={containerStyle}>
        <div className="typeform-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
          <div style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.95)', 
            borderRadius: '12px', 
            padding: '2rem',
            marginBottom: '2rem',
            border: '2px solid var(--color-success)'
          }}>
            <h2 style={{ marginTop: 0, color: 'var(--color-success)', fontSize: '1.5rem', fontWeight: '600' }}>
              ✓ Form Already Submitted
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              You have already submitted this form. Below are your previous answers.
            </p>
            {previousSubmission.submitted_at && (
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
                Submitted on: {new Date(previousSubmission.submitted_at).toLocaleString()}
              </p>
            )}
          </div>
          
          <div style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.95)', 
            borderRadius: '12px', 
            padding: '2rem'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '600' }}>
              Your Answers
            </h3>
            {form?.fields && form.fields.map((field) => {
              const answer = previousSubmission.answers?.find((a: any) => a.field_id === field.id);
              if (!answer || field.field_type === 'section') return null;
              
              let displayValue = answer.answer_value || 'No answer provided';
              try {
                const parsed = JSON.parse(displayValue);
                if (Array.isArray(parsed)) {
                  displayValue = parsed.join(', ');
                } else if (typeof parsed === 'object') {
                  displayValue = JSON.stringify(parsed);
                } else {
                  displayValue = parsed;
                }
              } catch {
                // Not JSON, use as-is
              }
              
              return (
                <div key={field.id} style={{ 
                  marginBottom: '1.5rem', 
                  paddingBottom: '1.5rem',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '1rem'
                  }}>
                    {field.label}
                    {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                  </label>
                  <div style={{ 
                    padding: '0.75rem', 
                    backgroundColor: '#f9fafb', 
                    borderRadius: '6px',
                    color: '#1f2937',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {displayValue}
                  </div>
                </div>
              );
            })}
            
            {/* Back to Dashboard button for customers */}
            {role === 'customer' && (
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button
                  onClick={() => navigate('/')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
                >
                  Back to Dashboard
                </button>
              </div>
            )}
          </div>
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
          <div className="typeform-progress-text" aria-live="polite" aria-atomic="true">
            {pages.length > 1 ? (
              <>
                Page {currentPageIndex + 1} of {pages.length} • Question {currentQuestionIndex + 1} of {visibleFields.length}
              </>
            ) : (
              <>
                {currentQuestionIndex + 1} of {visibleFields.length}
              </>
            )}
          </div>
        </div>
      )}

      {/* Light Logo Below Progress Bar - Always shown on all forms */}
      <div style={{ 
        position: 'fixed', 
        top: visibleFields.length > 0 ? (logoUrl ? '140px' : '80px') : '1rem', 
        left: '50%', 
        transform: 'translateX(-50%)', 
        zIndex: 100,
        maxHeight: '40px',
        maxWidth: '150px'
      }}>
        <img 
          src={getLogoForDarkBackground()} 
          alt="Company Logo" 
          style={{ 
            maxHeight: '100%', 
            maxWidth: '100%', 
            objectFit: 'contain',
            opacity: 0.9
          }} 
          onError={(e) => {
            // Hide logo if image fails to load
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Question Container with Animation */}
      <div className="typeform-content">
        <AnimatePresence mode="wait">
          {currentField && (() => {
            // Find the section that should be displayed before this question
            const currentFieldIndex = form?.fields?.findIndex(f => f.id === currentField.id) ?? -1;
            let currentSection: FormField | null = null;
            if (form?.fields && currentFieldIndex >= 0) {
              // Look backwards from current field to find the most recent section
              for (let i = currentFieldIndex - 1; i >= 0; i--) {
                const field = form.fields[i];
                if (field.field_type === 'section' && evaluateConditionalLogic(field)) {
                  currentSection = field;
                  break;
                }
                // Stop if we hit a non-visible field
                if (!evaluateConditionalLogic(field)) {
                  break;
                }
              }
            }

            return (
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
                {/* Display section divider if there's one before this question */}
                {currentSection && (
                  <div style={{
                    marginBottom: '2rem',
                    padding: '1.5rem',
                    textAlign: 'center',
                    border: '2px dashed rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  }}>
                    <h2 style={{ 
                      margin: 0, 
                      marginBottom: currentSection.description ? '0.5rem' : 0,
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'white',
                    }}>
                      {currentSection.label}
                    </h2>
                    {currentSection.description && (
                      <p style={{ 
                        margin: 0, 
                        color: 'rgba(255, 255, 255, 0.9)',
                        fontSize: '0.875rem',
                      }}>
                        {currentSection.description}
                      </p>
                    )}
                  </div>
                )}
                {renderField(currentField, currentQuestionIndex)}
              
              {/* Navigation Buttons */}
              <div className="typeform-navigation">
                {(currentQuestionIndex > 0 || (!isFirstPage && isFirstQuestionInPage)) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isFirstQuestionInPage && !isFirstPage) {
                        // Go to previous page
                        setCurrentPageIndex(prev => Math.max(0, prev - 1));
                        // Set to last question of previous page
                        let prevFieldCount = 0;
                        for (let i = 0; i < currentPageIndex - 1; i++) {
                          prevFieldCount += pages[i].fields.length;
                        }
                        setCurrentQuestionIndex(prevFieldCount + pages[currentPageIndex - 1].fields.length - 1);
                        setDirection('backward');
                      } else {
                        handlePrevious();
                      }
                    }}
                    className="typeform-btn typeform-btn-secondary"
                    aria-label={isFirstQuestionInPage && !isFirstPage ? 'Go to previous page' : 'Go to previous question'}
                  >
                    ← {isFirstQuestionInPage && !isFirstPage ? 'Previous Page' : 'Previous'}
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {!isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isLastQuestionInPage && !isLastPage) {
                        // Go to next page
                        setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1));
                        // Set to first question of next page
                        let nextFieldCount = 0;
                        for (let i = 0; i <= currentPageIndex; i++) {
                          nextFieldCount += pages[i].fields.length;
                        }
                        setCurrentQuestionIndex(nextFieldCount);
                        setDirection('forward');
                      } else {
                        handleNext();
                      }
                    }}
                    className="typeform-btn typeform-btn-primary"
                    disabled={currentField.required && !formValues[currentField.id || ''] || !!fieldErrors[currentField.id || '']}
                    style={{
                      background: backgroundType === 'gradient' 
                        ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                        : primaryColor,
                    }}
                    aria-label={isLastQuestionInPage && !isLastPage ? 'Go to next page' : 'Go to next question'}
                  >
                    {isLastQuestionInPage && !isLastPage ? 'Next Page →' : 'Next →'}
                  </button>
                ) : (
                  <>
                    {/* CAPTCHA */}
                    {form.settings?.captcha_enabled && form.settings?.captcha_site_key && (
                      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                        <div ref={captchaRef}></div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="typeform-btn typeform-btn-primary"
                      disabled={submitting || (currentField.required && !formValues[currentField.id || '']) || (form.settings?.captcha_enabled && !captchaToken) || !!fieldErrors[currentField.id || '']}
                      style={{
                        background: backgroundType === 'gradient' 
                          ? `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
                          : primaryColor,
                      }}
                    >
                      {submitting ? 'Submitting...' : (form.thank_you_screen?.submit_button_text || 'Submit')}
                    </button>
                    <span className="sr-only" aria-live="polite" aria-atomic="true">
                      {submitting ? 'Submitting form, please wait' : 'Ready to submit'}
                    </span>
                  </>
                )}
                </div>
              </motion.div>
            );
          })()}
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

