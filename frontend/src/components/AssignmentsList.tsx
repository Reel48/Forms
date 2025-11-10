import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import './AssignmentsList.css';

interface Assignment {
  id: string;
  user_id: string;
  assigned_at: string;
  status: string;
  user?: {
    email: string;
  };
}

interface AssignmentsListProps {
  quoteId?: string;
  formId?: string;
  onUnassign?: (assignmentId: string) => void;
}

export const AssignmentsList: React.FC<AssignmentsListProps> = ({
  quoteId,
  formId,
  onUnassign,
}) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();

  useEffect(() => {
    if (quoteId || formId) {
      loadAssignments();
    }
  }, [quoteId, formId]);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const endpoint = quoteId
        ? `/api/quotes/${quoteId}/assignments`
        : `/api/forms/${formId}/assignments`;
      
      const response = await api.get(endpoint);
      setAssignments(response.data || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this assignment?')) {
      return;
    }

    try {
      const endpoint = quoteId
        ? `/api/quotes/${quoteId}/assignments/${assignmentId}`
        : `/api/forms/${formId}/assignments/${assignmentId}`;
      
      await api.delete(endpoint);
      setAssignments(assignments.filter(a => a.id !== assignmentId));
      
      if (onUnassign) {
        onUnassign(assignmentId);
      }
    } catch (error: any) {
      console.error('Failed to unassign:', error);
      alert(error?.response?.data?.detail || error?.message || 'Failed to remove assignment.');
    }
  };

  if (loading) {
    return <div className="assignments-loading">Loading assignments...</div>;
  }

  if (assignments.length === 0) {
    return (
      <div className="assignments-empty">
        No assignments yet. Assign this {quoteId ? 'quote' : 'form'} to customers to get started.
      </div>
    );
  }

  return (
    <div className="assignments-list">
      <h3>Assigned To ({assignments.length})</h3>
      <div className="assignments-items">
        {assignments.map((assignment) => (
          <div key={assignment.id} className="assignment-item">
            <div className="assignment-info">
              <span className="assignment-email">
                {assignment.user?.email || assignment.user_id}
              </span>
              <span className="assignment-status">{assignment.status}</span>
              <span className="assignment-date">
                Assigned {new Date(assignment.assigned_at).toLocaleDateString()}
              </span>
            </div>
            {role === 'admin' && (
              <button
                onClick={() => handleUnassign(assignment.id)}
                className="btn-danger btn-sm"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

