import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { quotesAPI, Quote } from '../api';

function QuotesList() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      const response = await quotesAPI.getAll();
      setQuotes(response.data);
    } catch (error) {
      console.error('Failed to load quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotes = quotes.filter(
    (quote) =>
      quote.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (quote.clients && quote.clients.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>Quotes</h1>
        <Link to="/quotes/new" className="btn-primary">
          Create New Quote
        </Link>
      </div>

      <div className="card mb-4">
        <input
          type="text"
          placeholder="Search quotes by title, number, or client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '0.75rem' }}
        />
      </div>

      {filteredQuotes.length === 0 ? (
        <div className="card">
          <p className="text-center text-muted">
            {searchTerm ? 'No quotes found matching your search.' : 'No quotes yet. Create your first quote!'}
          </p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Quote Number</th>
                <th>Title</th>
                <th>Client</th>
                <th>Total</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((quote) => (
                <tr key={quote.id}>
                  <td>{quote.quote_number}</td>
                  <td>
                    <Link to={`/quotes/${quote.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                      {quote.title}
                    </Link>
                  </td>
                  <td>{quote.clients?.name || '-'}</td>
                  <td className="text-right">${parseFloat(quote.total).toFixed(2)}</td>
                  <td>
                    <span className={`badge badge-${quote.status}`}>{quote.status}</span>
                  </td>
                  <td>{formatDate(quote.created_at)}</td>
                  <td>
                    <Link to={`/quotes/${quote.id}`} className="btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                      View
                    </Link>
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

export default QuotesList;

