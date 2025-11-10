import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formsAPI } from '../api';
import type { Form, FormSubmission, FormField } from '../api';

function FormSubmissions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadFormAndSubmissions(id);
    }
  }, [id]);

  const loadFormAndSubmissions = async (formId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [formResponse, submissionsResponse] = await Promise.all([
        formsAPI.getById(formId),
        formsAPI.getSubmissions(formId),
      ]);
      setForm(formResponse.data);
      setSubmissions(submissionsResponse.data);
    } catch (error: any) {
      console.error('Failed to load form/submissions:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load submissions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeSpent = (seconds?: number) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = form?.fields?.find((f) => f.id === fieldId);
    return field?.label || `Field ${fieldId.substring(0, 8)}...`;
  };

  const getAnswerDisplay = (answer: FormSubmission['answers'][0]): string => {
    if (answer.answer_text) {
      return answer.answer_text;
    }
    if (answer.answer_value) {
      // Handle complex answer values
      if (answer.answer_value.value !== undefined) {
        if (Array.isArray(answer.answer_value.value)) {
          return answer.answer_value.value.join(', ');
        }
        return String(answer.answer_value.value);
      }
      return JSON.stringify(answer.answer_value);
    }
    return '-';
  };

  if (loading && !form) {
    return <div className="container">Loading...</div>;
  }

  if (error && !form) {
    return (
      <div className="container">
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
          <button onClick={() => navigate('/forms')} className="btn-secondary" style={{ marginTop: '1rem' }}>
            Back to Forms
          </button>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="container">
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>Form not found</p>
          <button onClick={() => navigate('/forms')} className="btn-secondary" style={{ marginTop: '1rem' }}>
            Back to Forms
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <div>
          <button onClick={() => navigate(`/forms/${id}`)} className="btn-outline" style={{ marginBottom: '1rem' }}>
            ← Back to Form
          </button>
          <h1>Submissions: {form.name}</h1>
        </div>
      </div>

      {error && (
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>
            {error}
            <button
              onClick={() => id && loadFormAndSubmissions(id)}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Retry
            </button>
          </p>
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ color: '#374151', marginBottom: '1rem' }}>No submissions yet</h2>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              When people submit this form, their responses will appear here.
            </p>
            <Link to={`/forms/${id}`} className="btn-primary">
              View Form
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedSubmission ? '1fr 1fr' : '1fr', gap: '1rem' }}>
          {/* Submissions List */}
          <div className="card">
            <div className="flex-between mb-3">
              <h2 style={{ margin: 0 }}>All Submissions ({submissions.length})</h2>
              {loading && (
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Loading...</span>
              )}
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Submitter</th>
                    <th>Time Spent</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <tr
                      key={submission.id}
                      style={{
                        backgroundColor: selectedSubmission?.id === submission.id ? '#eff6ff' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedSubmission(submission)}
                    >
                      <td>{formatDate(submission.submitted_at)}</td>
                      <td>
                        {submission.submitter_name || submission.submitter_email || 'Anonymous'}
                      </td>
                      <td>{formatTimeSpent(submission.time_spent_seconds)}</td>
                      <td>
                        <span className={`badge ${submission.status === 'completed' ? 'badge-sent' : 'badge-draft'}`}>
                          {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSubmission(submission);
                          }}
                          className="btn-outline"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submission Detail */}
          {selectedSubmission && (
            <div className="card">
              <div className="flex-between mb-3">
                <h2 style={{ margin: 0 }}>Submission Details</h2>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="btn-outline"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Submission Metadata */}
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                    Submission Information
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                        Submitted At
                      </label>
                      <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem' }}>
                        {formatDate(selectedSubmission.submitted_at)}
                      </p>
                    </div>
                    {selectedSubmission.started_at && (
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                          Started At
                        </label>
                        <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem' }}>
                          {formatDate(selectedSubmission.started_at)}
                        </p>
                      </div>
                    )}
                    {selectedSubmission.submitter_name && (
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                          Name
                        </label>
                        <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem' }}>
                          {selectedSubmission.submitter_name}
                        </p>
                      </div>
                    )}
                    {selectedSubmission.submitter_email && (
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                          Email
                        </label>
                        <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem' }}>
                          {selectedSubmission.submitter_email}
                        </p>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                        Time Spent
                      </label>
                      <p style={{ margin: 0, padding: '0.625rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem' }}>
                        {formatTimeSpent(selectedSubmission.time_spent_seconds)}
                      </p>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                        Status
                      </label>
                      <p style={{ margin: 0 }}>
                        <span className={`badge ${selectedSubmission.status === 'completed' ? 'badge-sent' : 'badge-draft'}`}>
                          {selectedSubmission.status.charAt(0).toUpperCase() + selectedSubmission.status.slice(1)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Answers */}
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                    Responses ({selectedSubmission.answers.length})
                  </h3>
                  {selectedSubmission.answers.length === 0 ? (
                    <p className="text-muted" style={{ padding: '1rem', textAlign: 'center' }}>
                      No responses recorded for this submission.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {selectedSubmission.answers.map((answer) => (
                        <div
                          key={answer.id}
                          className="card"
                          style={{ border: '1px solid #e5e7eb', padding: '1rem' }}
                        >
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                            {getFieldLabel(answer.field_id)}
                          </label>
                          <p style={{ margin: 0, padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {getAnswerDisplay(answer)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FormSubmissions;

