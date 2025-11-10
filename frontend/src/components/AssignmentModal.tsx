import React, { useState, useEffect } from 'react';
import api from '../api';
import './AssignmentModal.css';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (userIds: string[]) => Promise<void>;
  title: string;
  existingAssignments?: Array<{ user_id: string; user?: { email: string } }>;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  title,
  existingAssignments = [],
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      // Pre-select existing assignments
      const existingIds = new Set(existingAssignments.map(a => a.user_id));
      setSelectedUserIds(existingIds);
    }
  }, [isOpen, existingAssignments]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Get all users (admin only endpoint)
      const response = await api.get('/api/auth/users');
      // Filter to only show customers
      setUsers(response.data.filter((u: User) => u.role === 'customer'));
    } catch (error) {
      console.error('Failed to load users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const handleAssign = async () => {
    if (selectedUserIds.size === 0) {
      alert('Please select at least one customer');
      return;
    }

    setAssigning(true);
    try {
      await onAssign(Array.from(selectedUserIds));
      onClose();
    } catch (error: any) {
      console.error('Failed to assign:', error);
      alert(error?.response?.data?.detail || error?.message || 'Failed to assign. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search customers by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          {loading ? (
            <div className="loading">Loading customers...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? 'No customers found matching your search.' : 'No customers available. Users need to register first.'}
            </div>
          ) : (
            <div className="user-list">
              {filteredUsers.map((user) => (
                <label key={user.id} className="user-item">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(user.id)}
                    onChange={() => handleToggleUser(user.id)}
                  />
                  <span className="user-email">{user.email}</span>
                  {existingAssignments.some(a => a.user_id === user.id) && (
                    <span className="assigned-badge">Already Assigned</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary" disabled={assigning}>
            Cancel
          </button>
          <button
            onClick={handleAssign}
            className="btn-primary"
            disabled={assigning || selectedUserIds.size === 0}
          >
            {assigning ? 'Assigning...' : `Assign to ${selectedUserIds.size} customer(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};

