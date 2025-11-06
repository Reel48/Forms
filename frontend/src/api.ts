import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Client {
  id: string;
  name: string;
  email?: string;
  company?: string;
  phone?: string;
  address?: string;
  notes?: string;
  created_at: string;
  stripe_customer_id?: string;
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

// Quotes API
export const quotesAPI = {
  getAll: () => api.get<Quote[]>('/api/quotes'),
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

export default api;

