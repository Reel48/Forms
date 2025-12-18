import { useState, useEffect } from 'react';
import { quotesAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

function QuoteAnalytics() {
  const { role } = useAuth();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (role === 'admin') {
      loadAnalytics();
    }
  }, [role, startDate, endDate]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await quotesAPI.getAnalytics(startDate || undefined, endDate || undefined);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (role !== 'admin') {
    return <div className="container">Access denied. Admin only.</div>;
  }

  if (loading) {
    return <div className="container">Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className="container">No analytics data available.</div>;
  }

  const currencySymbol = '$'; // Could be made dynamic

  return (
    <div className="container">
      <h1>Quote Analytics</h1>
      
      <div className="card mb-4">
        <h2>Date Range</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label htmlFor="analytics-start-date">Start Date</label>
            <input
              type="date"
              id="analytics-start-date"
              name="analytics-start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="analytics-end-date">End Date</label>
            <input
              type="date"
              id="analytics-end-date"
              name="analytics-end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button onClick={loadAnalytics} className="btn-primary">
            Apply Filters
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#6b7280' }}>Total Quotes</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
            {analytics.total_quotes}
          </div>
        </div>
        
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#6b7280' }}>Total Value</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669' }}>
            {currencySymbol}{parseFloat(analytics.total_value || '0').toFixed(2)}
          </div>
        </div>
        
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#6b7280' }}>Accepted Quotes</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'rgb(59 130 246)' }}>
            {analytics.accepted_quotes}
          </div>
        </div>
        
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#6b7280' }}>Accepted Value</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'rgb(59 130 246)' }}>
            {currencySymbol}{parseFloat(analytics.accepted_value || '0').toFixed(2)}
          </div>
        </div>
        
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#6b7280' }}>Conversion Rate</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
            {analytics.conversion_rate}%
          </div>
        </div>
        
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#6b7280' }}>Average Quote Value</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
            {currencySymbol}{parseFloat(analytics.average_quote_value || '0').toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Status Breakdown</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(analytics.status_counts || {}).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                <span style={{ fontWeight: '600' }}>{count as number}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Payment Status Breakdown</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(analytics.payment_status_counts || {}).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                <span style={{ fontWeight: '600' }}>{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuoteAnalytics;

