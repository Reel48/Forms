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
  answers: FormSubmissionAnswer[];
}

// Quotes API
export const quotesAPI = {
  getAll: (filters?: QuoteFilters) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.payment_status) params.append('payment_status', filters.payment_status);
    const queryString = params.toString();
    return api.get<Quote[]>(`/api/quotes${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: string) => api.get<Quote>(`/api/quotes/${id}`),
  create: (quote: QuoteCreate) => api.post<Quote>('/api/quotes', quote),
  update: (id: string, quote: Partial<QuoteCreate>) => api.put<Quote>(`/api/quotes/${id}`, quote),
  delete: (id: string) => api.delete(`/api/quotes/${id}`),
  generatePDF: (id: string) => api.get(`/api/pdf/quote/${id}`, { responseType: 'blob' }),
  accept: (id: string) => api.put<Quote>(`/api/quotes/${id}/accept`),
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
};

// Company Settings API
export const companySettingsAPI = {
  get: () => api.get<CompanySettings>('/api/company-settings'),
  update: (settings: Partial<CompanySettings>) => api.put<CompanySettings>('/api/company-settings', settings),
};

// Forms API
export const formsAPI = {
  getAll: (filters?: { status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    const queryString = params.toString();
    return api.get<Form[]>(`/api/forms${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: string) => api.get<Form>(`/api/forms/${id}`),
  getBySlug: (slug: string) => api.get<Form>(`/api/forms/public/${slug}`),
  create: (form: FormCreate) => api.post<Form>('/api/forms', form),
  update: (id: string, form: Partial<FormUpdate>) => api.put<Form>(`/api/forms/${id}`, form),
  delete: (id: string) => api.delete(`/api/forms/${id}`),
  // Field management
  createField: (formId: string, field: FormField) => api.post<FormField>(`/api/forms/${formId}/fields`, field),
  updateField: (formId: string, fieldId: string, field: Partial<FormField>) => api.put<FormField>(`/api/forms/${formId}/fields/${fieldId}`, field),
  deleteField: (formId: string, fieldId: string) => api.delete(`/api/forms/${formId}/fields/${fieldId}`),
  reorderFields: (formId: string, fieldOrders: Array<{ field_id: string; order_index: number }>) => api.put(`/api/forms/${formId}/fields/reorder`, fieldOrders),
  // Form submission
  submitForm: (formId: string, submission: any) => api.post(`/api/forms/${formId}/submit`, submission),
  getSubmissions: (formId: string) => api.get<FormSubmission[]>(`/api/forms/${formId}/submissions`),
  getSubmission: (formId: string, submissionId: string) => api.get<FormSubmission>(`/api/forms/${formId}/submissions/${submissionId}`),
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

// Auth API
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

