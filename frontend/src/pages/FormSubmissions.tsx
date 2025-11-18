import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaTimes } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { formsAPI } from '../api';
import type { Form, FormSubmission } from '../api';

function FormSubmissions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Array<{id: string; note_text: string; user_id?: string; created_at: string; updated_at: string}>>([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [tags, setTags] = useState<Array<{id: string; tag_name: string; color: string; created_at: string}>>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#667eea');
  const [, setLoadingTags] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{tag_name: string; color: string}>>([]);

  useEffect(() => {
    if (id) {
      loadFormAndSubmissions(id);
    }
  }, [id]);

  useEffect(() => {
    if (id && selectedSubmission) {
      loadNotes();
      loadTags();
      loadAvailableTags();
    } else {
      setNotes([]);
      setTags([]);
    }
  }, [id, selectedSubmission?.id]);

  useEffect(() => {
    if (id) {
      loadAvailableTags();
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

  const handleUpdateReviewStatus = async (submissionId: string, newStatus: string) => {
    if (!id) return;
    try {
      const response = await formsAPI.updateSubmissionReviewStatus(id, submissionId, newStatus);
      setSubmissions(prev => prev.map(s => s.id === submissionId ? response.data : s));
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(response.data);
      }
    } catch (error: any) {
      console.error('Failed to update review status:', error);
      alert(error?.response?.data?.detail || 'Failed to update review status');
    }
  };

  const loadNotes = async () => {
    if (!id || !selectedSubmission) return;
    setLoadingNotes(true);
    try {
      const response = await formsAPI.getSubmissionNotes(id, selectedSubmission.id);
      setNotes(response.data);
    } catch (error: any) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!id || !selectedSubmission || !newNote.trim()) return;
    try {
      const response = await formsAPI.createSubmissionNote(id, selectedSubmission.id, newNote.trim());
      setNotes(prev => [response.data, ...prev]);
      setNewNote('');
    } catch (error: any) {
      console.error('Failed to add note:', error);
      alert(error?.response?.data?.detail || 'Failed to add note');
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!id || !selectedSubmission || !editingNoteText.trim()) return;
    try {
      const response = await formsAPI.updateSubmissionNote(id, selectedSubmission.id, noteId, editingNoteText.trim());
      setNotes(prev => prev.map(n => n.id === noteId ? response.data : n));
      setEditingNoteId(null);
      setEditingNoteText('');
    } catch (error: any) {
      console.error('Failed to update note:', error);
      alert(error?.response?.data?.detail || 'Failed to update note');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!id || !selectedSubmission) return;
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      await formsAPI.deleteSubmissionNote(id, selectedSubmission.id, noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (error: any) {
      console.error('Failed to delete note:', error);
      alert(error?.response?.data?.detail || 'Failed to delete note');
    }
  };

  const loadTags = async () => {
    if (!id || !selectedSubmission) return;
    setLoadingTags(true);
    try {
      const response = await formsAPI.getSubmissionTags(id, selectedSubmission.id);
      setTags(response.data);
    } catch (error: any) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoadingTags(false);
    }
  };

  const loadAvailableTags = async () => {
    if (!id) return;
    try {
      const response = await formsAPI.getAllSubmissionTags(id);
      setAvailableTags(response.data);
    } catch (error: any) {
      console.error('Failed to load available tags:', error);
    }
  };

  const handleAddTag = async () => {
    if (!id || !selectedSubmission || !newTagName.trim()) return;
    try {
      const response = await formsAPI.addSubmissionTag(id, selectedSubmission.id, {
        tag_name: newTagName.trim(),
        color: newTagColor,
      });
      setTags(prev => [...prev, { ...response.data, created_at: new Date().toISOString() }]);
      setNewTagName('');
      setNewTagColor('#667eea');
      loadAvailableTags();
    } catch (error: any) {
      console.error('Failed to add tag:', error);
      alert(error?.response?.data?.detail || 'Failed to add tag');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!id || !selectedSubmission) return;
    try {
      await formsAPI.deleteSubmissionTag(id, selectedSubmission.id, tagId);
      setTags(prev => prev.filter(t => t.id !== tagId));
      loadAvailableTags();
    } catch (error: any) {
      console.error('Failed to delete tag:', error);
      alert(error?.response?.data?.detail || 'Failed to delete tag');
    }
  };

  const handleQuickAddTag = async (tagName: string, color: string) => {
    if (!id || !selectedSubmission) return;
    try {
      const response = await formsAPI.addSubmissionTag(id, selectedSubmission.id, {
        tag_name: tagName,
        color: color,
      });
      setTags(prev => [...prev, { ...response.data, created_at: new Date().toISOString() }]);
      loadAvailableTags();
    } catch (error: any) {
      // Tag might already exist, that's okay
      if (error?.response?.status !== 400) {
        console.error('Failed to add tag:', error);
      }
    }
  };

  const exportToCSV = () => {
    if (!form || submissions.length === 0) {
      alert('No submissions to export');
      return;
    }

    // Create CSV header
    const headers = [
      'Submission ID',
      'Submitted At',
      'Started At',
      'Submitter Name',
      'Submitter Email',
      'Time Spent (seconds)',
      'Status',
      'Review Status',
      ...(form.fields || []).map(field => field.label || `Field ${field.id?.substring(0, 8)}`)
    ];

    // Create CSV rows
    const rows = submissions.map(submission => {
      const row = [
        submission.id,
        submission.submitted_at,
        submission.started_at || '',
        submission.submitter_name || '',
        submission.submitter_email || '',
        submission.time_spent_seconds?.toString() || '',
        submission.status,
        submission.review_status || 'new',
      ];

      // Add answers for each field
      (form.fields || []).forEach(field => {
        const answer = submission.answers.find(a => a.field_id === field.id);
        const answerText = answer ? getAnswerDisplay(answer) : '';
        // Escape CSV special characters
        const escaped = answerText.replace(/"/g, '""');
        row.push(`"${escaped}"`);
      });

      return row.join(',');
    });

    // Combine header and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${form.name.replace(/[^a-z0-9]/gi, '_')}_submissions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    if (!form || submissions.length === 0) {
      alert('No submissions to export');
      return;
    }

    // Create worksheet data
    const headers = [
      'Submission ID',
      'Submitted At',
      'Started At',
      'Submitter Name',
      'Submitter Email',
      'Time Spent (seconds)',
      'Status',
      'Review Status',
      ...(form.fields || []).map(field => field.label || `Field ${field.id?.substring(0, 8)}`)
    ];

    const rows = submissions.map(submission => {
      const row = [
        submission.id,
        submission.submitted_at,
        submission.started_at || '',
        submission.submitter_name || '',
        submission.submitter_email || '',
        submission.time_spent_seconds || '',
        submission.status,
        submission.review_status || 'new',
      ];

      // Add answers for each field
      (form.fields || []).forEach(field => {
        const answer = submission.answers.find(a => a.field_id === field.id);
        const answerText = answer ? getAnswerDisplay(answer) : '';
        row.push(answerText);
      });

      return row;
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths
    const colWidths = headers.map((_, index) => {
      if (index < 8) {
        // Metadata columns
        return { wch: 20 };
      }
      // Field columns - wider for content
      return { wch: 30 };
    });
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions');

    // Generate Excel file and download
    const fileName = `${form.name.replace(/[^a-z0-9]/gi, '_')}_submissions_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportToPDF = async () => {
    if (!form || !id || submissions.length === 0) {
      alert('No submissions to export');
      return;
    }

    try {
      // Import api helper
      const api = (await import('../api')).default;
      
      const response = await api.get(`/api/forms/${id}/submissions/export-pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${form.name.replace(/[^a-z0-9]/gi, '_')}_submissions_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Failed to export PDF:', error);
      alert(error?.response?.data?.detail || error?.message || 'Failed to export PDF. Please try again.');
    }
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
        {submissions.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={exportToCSV} className="btn-outline">
              Export CSV
            </button>
            <button onClick={exportToExcel} className="btn-outline">
              Export Excel
            </button>
            <button onClick={exportToPDF} className="btn-primary">
              Export PDF
            </button>
          </div>
        )}
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
                    <th>Review Status</th>
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
                        <span 
                          className={`badge ${
                            submission.review_status === 'reviewed' ? 'badge-sent' : 
                            submission.review_status === 'archived' ? 'badge-draft' : 
                            'badge-info'
                          }`}
                          style={{ 
                            backgroundColor: submission.review_status === 'new' ? 'var(--color-primary)' : undefined,
                            color: submission.review_status === 'new' ? 'white' : undefined
                          }}
                        >
                          {(submission.review_status || 'new').charAt(0).toUpperCase() + (submission.review_status || 'new').slice(1)}
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
                    <div>
                      <label htmlFor="submission-review-status" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                        Review Status
                      </label>
                      <select
                        id="submission-review-status"
                        name="submission-review-status"
                        value={selectedSubmission.review_status || 'new'}
                        onChange={(e) => {
                          if (id) {
                            handleUpdateReviewStatus(selectedSubmission.id, e.target.value);
                          }
                        }}
                        style={{
                          padding: '0.625rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          width: '100%',
                          backgroundColor: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="archived">Archived</option>
                      </select>
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

                {/* Submission Notes */}
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                    Notes & Comments ({notes.length})
                  </h3>
                  
                  {/* Add Note */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="submission-new-note" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                      Add Note
                    </label>
                    <textarea
                      id="submission-new-note"
                      name="submission-new-note"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note or comment..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                      }}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!newNote.trim()}
                      className="btn-primary"
                      style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      Add Note
                    </button>
                  </div>

                  {/* Notes List */}
                  {loadingNotes ? (
                    <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading notes...</p>
                  ) : notes.length === 0 ? (
                    <p className="text-muted" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
                      No notes yet. Add a note to track comments or observations about this submission.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="card"
                          style={{ border: '1px solid #e5e7eb', padding: '1rem', backgroundColor: '#f9fafb' }}
                        >
                          {editingNoteId === note.id ? (
                            <div>
                              <label htmlFor={`edit-note-${note.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                                Edit Note
                              </label>
                              <textarea
                                id={`edit-note-${note.id}`}
                                name={`edit-note-${note.id}`}
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                rows={3}
                                style={{
                                  width: '100%',
                                  padding: '0.625rem',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '0.875rem',
                                  fontFamily: 'inherit',
                                  resize: 'vertical',
                                  marginBottom: '0.5rem',
                                }}
                              />
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  onClick={() => handleUpdateNote(note.id)}
                                  disabled={!editingNoteText.trim()}
                                  className="btn-primary"
                                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteText('');
                                  }}
                                  className="btn-outline"
                                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p style={{ margin: 0, marginBottom: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {note.note_text}
                              </p>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                  {formatDate(note.created_at)}
                                  {note.updated_at !== note.created_at && ' (edited)'}
                                </span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditingNoteText(note.note_text);
                                    }}
                                    className="btn-outline"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="btn-danger"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submission Tags */}
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                    Tags ({tags.length})
                  </h3>
                  
                  {/* Current Tags */}
                  {tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                      {tags.map((tag) => (
                        <span
                          key={tag.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.75rem',
                            backgroundColor: tag.color + '20',
                            color: tag.color,
                            border: `1px solid ${tag.color}40`,
                            borderRadius: '16px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                          }}
                        >
                          {tag.tag_name}
                          <button
                            onClick={() => handleDeleteTag(tag.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: tag.color,
                              cursor: 'pointer',
                              padding: 0,
                              marginLeft: '0.25rem',
                              fontSize: '1rem',
                              lineHeight: 1,
                            }}
                            title="Remove tag"
                          >
                            <FaTimes />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quick Add from Available Tags */}
                  {availableTags.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#6b7280' }}>
                        Quick Add:
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {availableTags
                          .filter(tag => !tags.some(t => t.tag_name === tag.tag_name))
                          .map((tag) => (
                            <button
                              key={tag.tag_name}
                              onClick={() => handleQuickAddTag(tag.tag_name, tag.color)}
                              style={{
                                padding: '0.25rem 0.75rem',
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                                border: `1px solid ${tag.color}40`,
                                borderRadius: '16px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              + {tag.tag_name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Add New Tag */}
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label htmlFor="submission-tag-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Tag Name
                        </label>
                        <input
                          type="text"
                          id="submission-tag-name"
                          name="submission-tag-name"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          placeholder="e.g., Urgent, Follow-up"
                          maxLength={50}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && newTagName.trim()) {
                              handleAddTag();
                            }
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label htmlFor="submission-tag-color" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Color
                        </label>
                        <input
                          type="color"
                          id="submission-tag-color"
                          name="submission-tag-color"
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          style={{ width: '50px', height: '38px', cursor: 'pointer' }}
                        />
                      </div>
                      <button
                        onClick={handleAddTag}
                        disabled={!newTagName.trim()}
                        className="btn-primary"
                        style={{ padding: '0.5rem 1rem' }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
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

