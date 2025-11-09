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

// Add request interceptor to log all API requests
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url, 'to', config.baseURL);
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
};

// Company Settings API
export const companySettingsAPI = {
  get: () => api.get<CompanySettings>('/api/company-settings'),
  update: (settings: Partial<CompanySettings>) => api.put<CompanySettings>('/api/company-settings', settings),
};

export default api;

