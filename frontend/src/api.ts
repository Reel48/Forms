import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Log the API URL being used (helpful for debugging)
console.log('API URL configured:', API_URL);
console.log('VITE_API_URL env var:', import.meta.env.VITE_API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token if available
api.interceptors.request.use(
  (config) => {
    // Token will be added by AuthContext when user is logged in
    // This ensures token is included in all requests
    // Log Authorization header for debugging (first 20 chars only)
    if (config.headers?.Authorization) {
      const authHeader = config.headers.Authorization as string;
      console.log('Request Authorization header:', authHeader.substring(0, 30) + '...');
    } else {
      console.log('Request has no Authorization header');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      // Don't redirect if we're already on login/register or if it's a public route
      const publicRoutes = ['/login', '/register', '/public'];
      const isPublicRoute = publicRoutes.some(route => window.location.pathname.startsWith(route));
      
      // Only redirect if not on a public route and not already on login/register
      if (!isPublicRoute && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        // Try to refresh session first before redirecting
        try {
          const { supabase } = await import('./lib/supabase');
          const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !session) {
            // Refresh failed, redirect to login
            window.location.href = '/login';
          } else {
            // Session refreshed, update auth header and retry the request
            api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
            // Don't redirect, let the component handle the retry
          }
        } catch (refreshErr) {
          // Refresh failed, redirect to login
          console.log('Session refresh failed, redirecting to login');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Add request interceptor to log all API requests
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url, 'to', config.baseURL);
    if (config.data && config.url?.includes('/forms') && config.method?.toUpperCase() === 'POST') {
      console.log('Form creation payload:', JSON.stringify(config.data, null, 2));
      if (config.data.fields) {
        console.log(`Fields in payload: ${config.data.fields.length} fields`);
        console.log('Fields details:', config.data.fields.map((f: any) => ({ type: f.field_type, label: f.label })));
      } else {
        console.log('WARNING: No fields property in form creation payload!');
      }
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor to log API responses
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.config?.url, error.message);
    return Promise.reject(error);
  }
);

export interface Client {
  id: string;
  name: string;
  email?: string;
  company?: string;
  phone?: string;
  address?: string;  // Keep for backward compatibility
  notes?: string;
  profile_picture_url?: string;
  created_at: string;
  stripe_customer_id?: string;
  user_id?: string;
  registration_source?: string;  // 'admin_created' or 'self_registered'
  // Structured address fields
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
}

export interface LineItem {
  id?: string;
  quote_id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_percent?: string;
  tax_rate?: string;
  line_total?: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  title: string;
  client_id?: string;
  notes?: string;
  terms?: string;
  expiration_date?: string;
  tax_rate: string;
  currency: string;
  status: string;
  priority?: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  created_at: string;
  updated_at: string;
  line_items: LineItem[];
  clients?: Client;
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  payment_status?: string;
  reminder_date?: string;
  folder_id?: string;
}

export interface QuoteCreate {
  title: string;
  client_id?: string;
  notes?: string;
  terms?: string;
  expiration_date?: string;
  tax_rate: string;
  currency?: string;
  status?: string;
  priority?: string;
  line_items: LineItem[];
  create_folder?: boolean;
  assign_folder_to_user_id?: string;
}

export interface CompanySettings {
  id: string;
  company_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  tax_id?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteFilters {
  search?: string;
  status?: string;
  payment_status?: string;
  client_id?: string;
  created_from?: string;
  created_to?: string;
  expiration_from?: string;
  expiration_to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface FormField {
  id?: string;
  form_id?: string;
  field_type: string; // text, email, number, dropdown, multiple_choice, checkbox, etc.
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  validation_rules?: Record<string, any>;
  options?: Array<Record<string, any>>; // For dropdown, multiple choice, etc.
  order_index: number;
  conditional_logic?: Record<string, any>;
  created_at?: string;
}

export interface Form {
  id: string;
  name: string;
  description?: string;
  status: string; // draft, published, archived
  priority?: string;
  is_template?: boolean; // True for reusable templates, False for project-specific instances
  public_url_slug?: string;
  theme?: Record<string, any>;
  settings?: Record<string, any>;
  welcome_screen?: Record<string, any>;
  thank_you_screen?: Record<string, any>;
  created_at: string;
  updated_at: string;
  fields?: FormField[]; // Backend returns 'fields', not 'form_fields'
}

export interface FormCreate {
  name: string;
  description?: string;
  status?: string;
  public_url_slug?: string;
  theme?: Record<string, any>;
  settings?: Record<string, any>;
  welcome_screen?: Record<string, any>;
  thank_you_screen?: Record<string, any>;
  fields?: FormField[];
}

export interface FormUpdate {
  name?: string;
  description?: string;
  status?: string;
  priority?: string;
  theme?: Record<string, any>;
  settings?: Record<string, any>;
  welcome_screen?: Record<string, any>;
  thank_you_screen?: Record<string, any>;
}

export interface FormSubmissionAnswer {
  id: string;
  submission_id: string;
  field_id: string;
  answer_text?: string;
  answer_value?: Record<string, any>;
  created_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  submitter_email?: string;
  submitter_name?: string;
  ip_address?: string;
  user_agent?: string;
  started_at?: string;
  submitted_at: string;
  time_spent_seconds?: number;
  status: string; // completed, abandoned
  review_status?: string; // new, reviewed, archived
  answers: FormSubmissionAnswer[];
}

export interface FileItem {
  id: string;
  name: string;
  original_filename: string;
  file_type: string; // MIME type
  file_size: number; // Size in bytes
  storage_path: string;
  storage_url?: string;
  folder_id?: string;
  quote_id?: string;
  form_id?: string;
  esignature_document_id?: string;
  description?: string;
  tags?: string[];
  is_reusable: boolean;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FileUpdate {
  name?: string;
  description?: string;
  tags?: string[];
  is_reusable?: boolean;
  folder_id?: string;
  quote_id?: string;
  form_id?: string;
}

export interface FileFolderAssignment {
  id: string;
  file_id: string;
  folder_id: string;
  assigned_at: string;
  assigned_by?: string;
}

// Quotes API
export const quotesAPI = {
  getAll: (filters?: QuoteFilters) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.payment_status) params.append('payment_status', filters.payment_status);
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.created_from) params.append('created_from', filters.created_from);
    if (filters?.created_to) params.append('created_to', filters.created_to);
    if (filters?.expiration_from) params.append('expiration_from', filters.expiration_from);
    if (filters?.expiration_to) params.append('expiration_to', filters.expiration_to);
    if (filters?.sort_by) params.append('sort_by', filters.sort_by);
    if (filters?.sort_order) params.append('sort_order', filters.sort_order);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    const queryString = params.toString();
    return api.get<Quote[]>(`/api/quotes${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: string) => api.get<Quote>(`/api/quotes/${id}`),
  create: (quote: QuoteCreate) => api.post<Quote>('/api/quotes', quote),
  update: (id: string, quote: Partial<QuoteCreate>) => api.put<Quote>(`/api/quotes/${id}`, quote),
  delete: (id: string) => api.delete(`/api/quotes/${id}`),
  generatePDF: (id: string) => api.get(`/api/pdf/quote/${id}`, { responseType: 'blob' }),
  accept: (id: string) => api.put<Quote>(`/api/quotes/${id}/accept`),
  bulkDelete: (quoteIds: string[]) => api.post<{ message: string; deleted_count: number }>('/api/quotes/bulk/delete', { quote_ids: quoteIds }),
  bulkUpdateStatus: (quoteIds: string[], status: string) => api.post<{ message: string; updated_count: number }>('/api/quotes/bulk/update-status', { quote_ids: quoteIds, status }),
  bulkAssign: (quoteIds: string[], folderIds: string[]) => api.post<{ message: string; assigned_count: number }>('/api/quotes/bulk/assign', { quote_ids: quoteIds, folder_ids: folderIds }),
  sendEmail: (quoteId: string, toEmail: string, customMessage?: string, includePdf?: boolean) => api.post<{ message: string; sent: boolean }>(`/api/quotes/${quoteId}/send-email`, { to_email: toEmail, custom_message: customMessage, include_pdf: includePdf }),
  createShareLink: (quoteId: string, expiresAt?: string, maxViews?: number) => api.post<{ share_token: string; share_url: string }>(`/api/quotes/${quoteId}/share-link`, { expires_at: expiresAt, max_views: maxViews }),
  getShareLink: (quoteId: string) => api.get<{ share_token: string; share_url: string }>(`/api/quotes/${quoteId}/share-link`),
  getActivities: (quoteId: string) => api.get<any[]>(`/api/quotes/${quoteId}/activities`),
  createComment: (quoteId: string, comment: string, isInternal?: boolean) => api.post<any>(`/api/quotes/${quoteId}/comments`, { comment, is_internal: isInternal ?? true }),
  getComments: (quoteId: string) => api.get<any[]>(`/api/quotes/${quoteId}/comments`),
  getVersions: (quoteId: string) => api.get<any[]>(`/api/quotes/${quoteId}/versions`),
  setReminder: (quoteId: string, reminderDate: string) => api.post<{ message: string }>(`/api/quotes/${quoteId}/reminder`, { reminder_date: reminderDate }),
  deleteReminder: (quoteId: string) => api.delete<{ message: string }>(`/api/quotes/${quoteId}/reminder`),
  // Auto-save
  autoSaveQuote: (quoteId: string, draftData: any) => api.post<{ message: string }>(`/api/quotes/${quoteId}/auto-save`, { draft_data: draftData }),
  getAutoSavedDraft: (quoteId: string) => api.get<{ draft_data: any; last_auto_saved_at: string }>(`/api/quotes/${quoteId}/auto-save`),
  // Client history
  getClientHistory: (clientId: string) => api.get<Quote[]>(`/api/quotes/client/${clientId}/history`),
  // Analytics
  getAnalytics: (startDate?: string, endDate?: string) => api.get<any>(`/api/quotes/analytics/summary${startDate || endDate ? `?${startDate ? `start_date=${startDate}` : ''}${startDate && endDate ? '&' : ''}${endDate ? `end_date=${endDate}` : ''}` : ''}`),
};

// Stripe API
export const stripeAPI = {
  createInvoice: (quoteId: string) => api.post<{ invoice_id: string; invoice_url: string; invoice_pdf: string; status: string }>(`/api/stripe/quotes/${quoteId}/create-invoice`),
  getInvoice: (invoiceId: string) => api.get<{ id: string; status: string; amount_due: number; amount_paid: number; hosted_invoice_url: string; invoice_pdf: string; paid: boolean }>(`/api/stripe/invoices/${invoiceId}`),
};

// Clients API
export const clientsAPI = {
  getAll: () => api.get<Client[]>('/api/clients'),
  getById: (id: string) => api.get<Client>(`/api/clients/${id}`),
  create: (client: Omit<Client, 'id' | 'created_at'>) => api.post<Client>('/api/clients', client),
  update: (id: string, client: Partial<Client>) => api.put<Client>(`/api/clients/${id}`, client),
  delete: (id: string) => api.delete(`/api/clients/${id}`),
  getMyProfile: () => api.get<Client>('/api/clients/profile/me'),
  updateMyProfile: (client: Partial<Client>) => api.put<Client>('/api/clients/profile/me', client),
  uploadProfilePicture: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<Client>('/api/clients/profile/me/picture', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

// Company Settings API
export const companySettingsAPI = {
  get: () => api.get<CompanySettings>('/api/company-settings'),
  update: (settings: Partial<CompanySettings>) => api.put<CompanySettings>('/api/company-settings', settings),
};

// Forms API
export const formsAPI = {
  getAll: (filters?: { status?: string; search?: string; folder_id?: string; templates_only?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.folder_id) params.append('folder_id', filters.folder_id);
    if (filters?.templates_only !== undefined) params.append('templates_only', filters.templates_only.toString());
    const queryString = params.toString();
    return api.get<Form[]>(`/api/forms${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: string) => api.get<Form>(`/api/forms/${id}`),
  getBySlug: (slug: string) => api.get<Form>(`/api/forms/public/${slug}`),
  create: (form: FormCreate) => api.post<Form>('/api/forms', form),
  update: (id: string, form: Partial<FormUpdate>) => api.put<Form>(`/api/forms/${id}`, form),
  delete: (id: string) => api.delete(`/api/forms/${id}`),
  duplicate: async (id: string) => {
    // Get the original form
    const original = await formsAPI.getById(id);
    const form = original.data;
    
    // Create a new form with duplicated data
    const duplicatedForm: FormCreate = {
      name: `${form.name} (Copy)`,
      description: form.description || '',
      status: 'draft', // Always duplicate as draft
      fields: (form.fields || []).map((field: any, index: number) => {
        // Filter out fields that shouldn't be included when creating a new form
        const { id, form_id, created_at, updated_at, ...fieldData } = field;
        return {
          field_type: fieldData.field_type || 'text',
          label: fieldData.label || '',
          description: fieldData.description || undefined,
          placeholder: fieldData.placeholder || undefined,
          required: Boolean(fieldData.required),
          validation_rules: fieldData.validation_rules || {},
          options: Array.isArray(fieldData.options) ? fieldData.options : [],
          order_index: typeof fieldData.order_index === 'number' ? fieldData.order_index : index,
          conditional_logic: fieldData.conditional_logic || {},
        };
      }),
      theme: form.theme || {},
      settings: form.settings || {},
      welcome_screen: form.welcome_screen || {},
      thank_you_screen: form.thank_you_screen || {},
    };
    
    return formsAPI.create(duplicatedForm);
  },
  // Field management
  createField: (formId: string, field: FormField) => api.post<FormField>(`/api/forms/${formId}/fields`, field),
  updateField: (formId: string, fieldId: string, field: Partial<FormField>) => api.put<FormField>(`/api/forms/${formId}/fields/${fieldId}`, field),
  deleteField: (formId: string, fieldId: string) => api.delete(`/api/forms/${formId}/fields/${fieldId}`),
  reorderFields: (formId: string, fieldOrders: Array<{ field_id: string; order_index: number }>) => api.put(`/api/forms/${formId}/fields/reorder`, fieldOrders),
  // Form submission
  submitForm: (formId: string, submission: any) => api.post(`/api/forms/${formId}/submit`, submission),
  getSubmissions: (formId: string) => api.get<FormSubmission[]>(`/api/forms/${formId}/submissions`),
  getSubmission: (formId: string, submissionId: string) => api.get<FormSubmission>(`/api/forms/${formId}/submissions/${submissionId}`),
  getMySubmission: (formId: string) => api.get<FormSubmission>(`/api/forms/${formId}/my-submission`),
  updateSubmissionReviewStatus: (formId: string, submissionId: string, reviewStatus: string) => 
    api.patch<FormSubmission>(`/api/forms/${formId}/submissions/${submissionId}/review-status`, { review_status: reviewStatus }),
  // Short URLs
  createShortUrl: (formId: string) => api.post<{short_code: string; short_url: string; full_url: string}>(`/api/forms/${formId}/short-url`, {}),
  getShortUrls: (formId: string) => api.get<Array<{id: string; short_code: string; click_count: number; created_at: string}>>(`/api/forms/${formId}/short-urls`),
  // Submission Notes
  getSubmissionNotes: (formId: string, submissionId: string) => api.get<Array<{id: string; note_text: string; user_id?: string; created_at: string; updated_at: string}>>(`/api/forms/${formId}/submissions/${submissionId}/notes`),
  createSubmissionNote: (formId: string, submissionId: string, noteText: string) => api.post<{id: string; note_text: string; user_id?: string; created_at: string; updated_at: string}>(`/api/forms/${formId}/submissions/${submissionId}/notes`, { note_text: noteText }),
  updateSubmissionNote: (formId: string, submissionId: string, noteId: string, noteText: string) => api.put<{id: string; note_text: string; user_id?: string; created_at: string; updated_at: string}>(`/api/forms/${formId}/submissions/${submissionId}/notes/${noteId}`, { note_text: noteText }),
  deleteSubmissionNote: (formId: string, submissionId: string, noteId: string) => api.delete(`/api/forms/${formId}/submissions/${submissionId}/notes/${noteId}`),
  // Webhooks
  getWebhooks: (formId: string) => api.get<Array<{id: string; url: string; events: string[]; is_active: boolean; created_at: string}>>(`/api/forms/${formId}/webhooks`),
  createWebhook: (formId: string, webhook: {url: string; secret?: string; events: string[]; is_active?: boolean}) => api.post<{id: string; url: string; events: string[]; is_active: boolean}>(`/api/forms/${formId}/webhooks`, webhook),
  updateWebhook: (formId: string, webhookId: string, webhook: {url?: string; secret?: string; events?: string[]; is_active?: boolean}) => api.put<{id: string; url: string; events: string[]; is_active: boolean}>(`/api/forms/${formId}/webhooks/${webhookId}`, webhook),
  deleteWebhook: (formId: string, webhookId: string) => api.delete(`/api/forms/${formId}/webhooks/${webhookId}`),
  getWebhookDeliveries: (formId: string, webhookId: string, limit?: number) => api.get<Array<{id: string; event_type: string; response_status?: number; error_message?: string; delivered_at?: string; created_at: string}>>(`/api/forms/${formId}/webhooks/${webhookId}/deliveries${limit ? `?limit=${limit}` : ''}`),
  // Email Templates
  getEmailTemplates: (templateType?: string) => api.get<Array<{id: string; name: string; template_type: string; subject: string; html_body: string; text_body?: string; is_default: boolean; created_at: string}>>(`/api/forms/email-templates${templateType ? `?template_type=${templateType}` : ''}`),
  getEmailTemplate: (templateId: string) => api.get<{id: string; name: string; template_type: string; subject: string; html_body: string; text_body?: string; is_default: boolean; variables: Record<string, string>}>(`/api/forms/email-templates/${templateId}`),
  createEmailTemplate: (template: {name: string; template_type: string; subject: string; html_body: string; text_body?: string; is_default?: boolean; variables?: Record<string, string>}) => api.post<{id: string}>(`/api/forms/email-templates`, template),
  updateEmailTemplate: (templateId: string, template: {name?: string; subject?: string; html_body?: string; text_body?: string; is_default?: boolean; variables?: Record<string, string>}) => api.put<{id: string}>(`/api/forms/email-templates/${templateId}`, template),
  deleteEmailTemplate: (templateId: string) => api.delete(`/api/forms/email-templates/${templateId}`),
  getTemplateVariables: (templateType: string) => api.get<{template_type: string; variables: Record<string, string>}>(`/api/forms/email-templates/types/${templateType}/variables`),
  // Submission Tags
  getSubmissionTags: (formId: string, submissionId: string) => api.get<Array<{id: string; tag_name: string; color: string; created_at: string}>>(`/api/forms/${formId}/submissions/${submissionId}/tags`),
  addSubmissionTag: (formId: string, submissionId: string, tag: {tag_name: string; color?: string}) => api.post<{id: string; tag_name: string; color: string}>(`/api/forms/${formId}/submissions/${submissionId}/tags`, tag),
  deleteSubmissionTag: (formId: string, submissionId: string, tagId: string) => api.delete(`/api/forms/${formId}/submissions/${submissionId}/tags/${tagId}`),
  getAllSubmissionTags: (formId: string) => api.get<Array<{tag_name: string; color: string}>>(`/api/forms/${formId}/submissions/tags/all`),
  // Password Protection
  verifyFormPassword: (slug: string, password: string) => api.post<{success: boolean; message: string}>(`/api/forms/public/${slug}/verify-password`, { password }),
  // Field Library
  getFieldLibrary: (fieldType?: string) => api.get<Array<{id: string; name: string; field_type: string; label: string; description?: string; placeholder?: string; required: boolean; validation_rules: Record<string, any>; options: Array<any>}>>(`/api/forms/field-library${fieldType ? `?field_type=${fieldType}` : ''}`),
  saveFieldToLibrary: (field: {name: string; field_type: string; label: string; description?: string; placeholder?: string; required?: boolean; validation_rules?: Record<string, any>; options?: Array<any>; conditional_logic?: Record<string, any>}) => api.post<{id: string}>(`/api/forms/field-library`, field),
  deleteFieldFromLibrary: (fieldId: string) => api.delete(`/api/forms/field-library/${fieldId}`),
  // Form Versioning
  getFormVersions: (formId: string) => api.get<Array<{id: string; version_number: number; notes?: string; created_at: string}>>(`/api/forms/${formId}/versions`),
  createFormVersion: (formId: string, notes?: string) => api.post<{id: string; version_number: number}>(`/api/forms/${formId}/versions`, { notes: notes || '' }),
  restoreFormVersion: (formId: string, versionId: string) => api.post<{success: boolean; message: string}>(`/api/forms/${formId}/versions/${versionId}/restore`, {}),
  // File upload
  uploadFile: (formId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{file_url: string; file_name: string; file_size: number; file_type: string; storage_path: string}>(`/api/forms/${formId}/upload-file`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  // Payment intent
  createPaymentIntent: (formId: string, amount: number, currency?: string, metadata?: Record<string, any>) => api.post<{client_secret: string; payment_intent_id: string}>(`/api/forms/${formId}/create-payment-intent`, { amount, currency: currency || 'usd', metadata }),
};

// Files API
export const filesAPI = {
  getAll: (filters?: { folder_id?: string; quote_id?: string; form_id?: string; is_reusable?: boolean; templates_only?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.folder_id) params.append('folder_id', filters.folder_id);
    if (filters?.quote_id) params.append('quote_id', filters.quote_id);
    if (filters?.form_id) params.append('form_id', filters.form_id);
    if (filters?.is_reusable !== undefined) params.append('is_reusable', filters.is_reusable.toString());
    if (filters?.templates_only !== undefined) params.append('templates_only', filters.templates_only.toString());
    const queryString = params.toString();
    return api.get<FileItem[]>(`/api/files${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: string) => api.get<FileItem>(`/api/files/${id}`),
  upload: (file: globalThis.File, options?: { folder_id?: string; quote_id?: string; form_id?: string; description?: string; is_reusable?: boolean }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.folder_id) formData.append('folder_id', options.folder_id);
    if (options?.quote_id) formData.append('quote_id', options.quote_id);
    if (options?.form_id) formData.append('form_id', options.form_id);
    if (options?.description) formData.append('description', options.description);
    if (options?.is_reusable !== undefined) formData.append('is_reusable', options.is_reusable.toString());
    return api.post<FileItem>('/api/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  update: (id: string, fileUpdate: FileUpdate) => api.put<FileItem>(`/api/files/${id}`, fileUpdate),
  delete: (id: string) => api.delete<{ message: string }>(`/api/files/${id}`),
  download: (id: string) => api.get(`/api/files/${id}/download`, { responseType: 'blob' }),
  getPreview: (id: string) => api.get<{ preview_url: string }>(`/api/files/${id}/preview`),
  assignToFolder: (fileId: string, folderId: string) => api.post<FileFolderAssignment>(`/api/files/${fileId}/assign-to-folder`, { folder_id: folderId }),
  removeFromFolder: (fileId: string, folderId: string) => api.delete<{ message: string }>(`/api/files/${fileId}/assign-to-folder/${folderId}`),
  getFolders: (fileId: string) => api.get<FileFolderAssignment[]>(`/api/files/${fileId}/folders`),
};

// E-Signature Types
export interface ESignatureDocument {
  id: string;
  name: string;
  description?: string;
  file_id: string;
  document_type: string; // terms_of_service, contract, agreement, custom
  signature_mode: string; // simple, advanced
  require_signature: boolean;
  signature_fields?: Record<string, any>; // JSONB for advanced mode
  is_template?: boolean; // True for reusable templates, False for project-specific instances
  folder_id?: string;
  quote_id?: string;
  expires_at?: string;
  status: string; // pending, signed, declined, expired
  signed_by?: string;
  signed_at?: string;
  signed_ip_address?: string;
  signature_method?: string; // draw, type, upload
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ESignatureDocumentCreate {
  name: string;
  description?: string;
  file_id: string;
  document_type?: string;
  signature_mode?: string;
  require_signature?: boolean;
  signature_fields?: Record<string, any>;
  folder_id?: string;
  quote_id?: string;
  expires_at?: string;
}

export interface ESignatureDocumentUpdate {
  name?: string;
  description?: string;
  document_type?: string;
  signature_mode?: string;
  require_signature?: boolean;
  signature_fields?: Record<string, any>;
  folder_id?: string;
  quote_id?: string;
  status?: string;
  expires_at?: string;
}

export interface ESignatureSignature {
  id: string;
  document_id: string;
  folder_id?: string;
  user_id: string;
  signature_data: string; // Base64 encoded signature image or text
  signature_type: string; // draw, type, upload
  signature_position?: Record<string, any>; // Position on document (x, y, page)
  field_id?: string; // For advanced mode
  ip_address?: string;
  user_agent?: string;
  signed_at: string;
  signed_file_id?: string;
  signed_file_url?: string;
}

export interface ESignatureSignatureCreate {
  document_id: string;
  folder_id?: string;
  signature_data: string;
  signature_type: string;
  signature_position?: Record<string, any>;
  field_id?: string;
  ip_address?: string;
  user_agent?: string;
}

// E-Signature API
export const esignatureAPI = {
  // Documents
  getAllDocuments: (filters?: { folder_id?: string; quote_id?: string; status?: string; signature_mode?: string; templates_only?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.folder_id) params.append('folder_id', filters.folder_id);
    if (filters?.quote_id) params.append('quote_id', filters.quote_id);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.signature_mode) params.append('signature_mode', filters.signature_mode);
    if (filters?.templates_only !== undefined) params.append('templates_only', filters.templates_only.toString());
    const queryString = params.toString();
    return api.get<ESignatureDocument[]>(`/api/esignature/documents${queryString ? `?${queryString}` : ''}`);
  },
  getDocument: (id: string) => api.get<ESignatureDocument>(`/api/esignature/documents/${id}`),
  createDocument: (document: ESignatureDocumentCreate) => api.post<ESignatureDocument>('/api/esignature/documents', document),
  updateDocument: (id: string, document: ESignatureDocumentUpdate) => api.put<ESignatureDocument>(`/api/esignature/documents/${id}`, document),
  deleteDocument: (id: string) => api.delete<{ message: string }>(`/api/esignature/documents/${id}`),
  getDocumentPreview: (id: string) => api.get<{ preview_url: string }>(`/api/esignature/documents/${id}/preview`),
  // Signatures
  signDocument: (id: string, signature: ESignatureSignatureCreate) => api.post<ESignatureSignature>(`/api/esignature/documents/${id}/sign`, signature),
  getDocumentSignatures: (id: string) => api.get<ESignatureSignature[]>(`/api/esignature/documents/${id}/signatures`),
  getSignedPdf: (id: string) => api.get(`/api/esignature/documents/${id}/signed-pdf`),
};

// Folder Types
export interface Folder {
  id: string;
  name: string;
  description?: string;
  quote_id?: string;
  client_id?: string;
  status: string; // active, completed, archived, cancelled
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FolderCreate {
  name: string;
  description?: string;
  quote_id?: string;
  client_id?: string;
  status?: string;
  assign_to_user_id?: string;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
  quote_id?: string;
  client_id?: string;
  status?: string;
}

export interface FolderAssignment {
  id: string;
  folder_id: string;
  user_id: string;
  role: string; // viewer, editor
  assigned_at: string;
  assigned_by?: string;
}

export interface FolderAssignmentCreate {
  folder_id: string;
  user_id: string;
  role?: string;
}

export interface FormFolderAssignment {
  id: string;
  form_id: string;
  folder_id: string;
  assigned_at: string;
  assigned_by?: string;
}

export interface FolderContent {
  folder: Folder;
  quote?: any;
  files: any[];
  forms: any[];
  esignatures: any[];
}

// Folders API
export const foldersAPI = {
  getAll: (filters?: { client_id?: string; quote_id?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.quote_id) params.append('quote_id', filters.quote_id);
    if (filters?.status) params.append('status', filters.status);
    const queryString = params.toString();
    return api.get<Folder[]>(`/api/folders${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: string) => api.get<Folder>(`/api/folders/${id}`),
  create: (folder: FolderCreate) => api.post<Folder>('/api/folders', folder),
  update: (id: string, folder: FolderUpdate) => api.put<Folder>(`/api/folders/${id}`, folder),
  delete: (id: string) => api.delete<{ message: string }>(`/api/folders/${id}`),
  assignToUser: (id: string, assignment: FolderAssignmentCreate) => api.post<FolderAssignment>(`/api/folders/${id}/assign`, assignment),
  removeAssignment: (id: string, userId: string) => api.delete<{ message: string }>(`/api/folders/${id}/assign/${userId}`),
  getAssignments: (id: string) => api.get<FolderAssignment[]>(`/api/folders/${id}/assignments`),
  assignForm: (id: string, formId: string) => api.post<FormFolderAssignment>(`/api/folders/${id}/forms/${formId}`),
  removeForm: (id: string, formId: string) => api.delete<{ message: string }>(`/api/folders/${id}/forms/${formId}`),
  assignFile: (id: string, fileId: string) => api.post<any>(`/api/folders/${id}/files/${fileId}`),
  removeFile: (id: string, fileId: string) => api.delete<{ message: string }>(`/api/folders/${id}/files/${fileId}`),
  assignESignature: (id: string, documentId: string) => api.post<any>(`/api/folders/${id}/esignature/${documentId}`),
  removeESignature: (id: string, documentId: string) => api.delete<{ message: string }>(`/api/folders/${id}/esignature/${documentId}`),
  getContent: (id: string) => api.get<FolderContent>(`/api/folders/${id}/content`),
};

// Auth API
// Chat Types
export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
  message_type: string; // text, file, image
  file_url?: string;
  file_name?: string;
  file_size?: number;
  read_at?: string;
  created_at: string;
}

export interface ChatMessageCreate {
  conversation_id?: string;
  message: string;
  message_type?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
}

export interface ChatConversation {
  id: string;
  customer_id: string;
  status: string; // active, resolved, archived
  last_message_at?: string;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  last_message?: ChatMessage;
  customer_email?: string;
  customer_name?: string;
}

export const chatAPI = {
  getConversations: () => api.get<ChatConversation[]>('/api/chat/conversations'),
  getMessages: (conversationId: string, limit?: number, beforeId?: string) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (beforeId) params.append('before_id', beforeId);
    const queryString = params.toString();
    return api.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages${queryString ? `?${queryString}` : ''}`);
  },
  sendMessage: (message: ChatMessageCreate) => api.post<ChatMessage>('/api/chat/messages', message),
  markMessageRead: (messageId: string) => api.post<{ message: string }>(`/api/chat/messages/${messageId}/read`),
  markAllRead: (conversationId: string) => api.post<{ message: string }>(`/api/chat/conversations/${conversationId}/read-all`),
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ file_url: string; file_name: string; file_size: number; message_type: string }>('/api/chat/messages/upload-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const authAPI = {
  requestPasswordReset: (email: string) => api.post<{ message: string }>('/api/auth/password-reset/request', { email }),
  confirmPasswordReset: (token: string, newPassword: string) => api.post<{ message: string }>('/api/auth/password-reset/confirm', { token, new_password: newPassword }),
  verifyEmail: (token: string) => api.post<{ message: string }>('/api/auth/verify-email', { token }),
  resendVerification: (email: string) => api.post<{ message: string }>('/api/auth/resend-verification', { email }),
  getLoginActivity: (limit?: number) => api.get<{ activities: any[]; total: number }>('/api/auth/login-activity', { params: { limit } }),
  getSessions: () => api.get<{ sessions: any[]; total: number }>('/api/auth/sessions'),
  revokeSession: (sessionId: string) => api.delete<{ message: string }>(`/api/auth/sessions/${sessionId}`),
  logoutAll: () => api.post<{ message: string; sessions_revoked: number }>('/api/auth/logout-all'),
};

export default api;

