import { useState, useEffect } from 'react';
import { clientsAPI } from '../api';
import type { Client } from '../api';
import AddressInput from '../components/AddressInput';

function ClientsList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    address: '',
    notes: '',
    // Structured address fields
    address_line1: '',
    address_line2: '',
    address_city: '',
    address_state: '',
    address_postal_code: '',
    address_country: 'US',
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const response = await clientsAPI.getAll();
      setClients(response.data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting client form with data:', formData);
    console.log('API URL being used:', import.meta.env.VITE_API_URL || 'http://localhost:8000 (default)');
    try {
      // Prepare data for API - remove empty string values for optional fields
      const apiData: any = { ...formData };
      Object.keys(apiData).forEach(key => {
        if (apiData[key] === '') {
          apiData[key] = undefined;
        }
      });

      if (editingClient) {
        await clientsAPI.update(editingClient.id, apiData);
      } else {
        console.log('Creating new client...');
        await clientsAPI.create(apiData);
        console.log('Client created successfully!');
      }
      setFormData({
        name: '',
        email: '',
        company: '',
        phone: '',
        address: '',
        notes: '',
        // Structured address fields
        address_line1: '',
        address_line2: '',
        address_city: '',
        address_state: '',
        address_postal_code: '',
        address_country: 'US',
      });
      setShowForm(false);
      setEditingClient(null);
      loadClients();
    } catch (error: any) {
      console.error('Failed to save client:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response,
        request: error?.request,
        config: error?.config
      });
      
      let errorMessage = 'Failed to save client. Please try again.';
      
      if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
        errorMessage = `Network Error: Cannot connect to backend API. Please check:\n\n1. Backend is running\n2. API URL is correct: ${import.meta.env.VITE_API_URL || 'http://localhost:8000'}\n3. CORS is configured properly\n\nCheck browser console for details.`;
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email || '',
      company: client.company || '',
      phone: client.phone || '',
      address: client.address || '',
      notes: client.notes || '',
      // Structured address fields
      address_line1: client.address_line1 || '',
      address_line2: client.address_line2 || '',
      address_city: client.address_city || '',
      address_state: client.address_state || '',
      address_postal_code: client.address_postal_code || '',
      address_country: client.address_country || 'US',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client?')) return;
    
    try {
      await clientsAPI.delete(id);
      loadClients();
    } catch (error) {
      console.error('Failed to delete client:', error);
      alert('Failed to delete client. Please try again.');
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>Clients</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : 'Add New Client'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <h2>{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Company</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <AddressInput
                value={formData}
                onChange={(addressData) => setFormData({ ...formData, ...addressData })}
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary">
                {editingClient ? 'Update Client' : 'Create Client'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingClient(null);
                  setFormData({
                    name: '',
                    email: '',
                    company: '',
                    phone: '',
                    address: '',
                    notes: '',
                  });
                }}
                className="btn-outline"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="card">
          <p className="text-center text-muted">No clients yet. Add your first client!</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>{client.company || '-'}</td>
                  <td>{client.email || '-'}</td>
                  <td>{client.phone || '-'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(client)}
                        className="btn-outline"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="btn-danger"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Delete
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
  );
}

export default ClientsList;

