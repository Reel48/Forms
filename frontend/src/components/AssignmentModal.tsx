import React, { useState, useEffect } from 'react';
import api from '../api';
import './AssignmentModal.css';

interface User {
  id: string;
  email: string;
  role: string;
  type?: 'user' | 'client';  // 'user' = has auth account, 'client' = client without user
  name?: string;
  client_id?: string;
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
  const [creatingUsers, setCreatingUsers] = useState<Set<string>>(new Set()); // Track clients being converted to users

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
      // Get all users and clients (admin only endpoint)
      const response = await api.get('/api/auth/users');
      // Filter to only show customers (both users and clients)
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

  const createUserForClient = async (clientId: string): Promise<string> => {
    // Create user for client
    setCreatingUsers(prev => new Set(prev).add(clientId));
    try {
      const response = await api.post('/api/auth/users/create-for-client', {
        client_id: clientId
      });
      
      const newUserId = response.data.user_id;
      
      // Reload users to get the newly created user
      await loadUsers();
      
      // Update selection to use the new user_id instead of client_id
      setSelectedUserIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(`client_${clientId}`);
        newSet.add(newUserId);
        return newSet;
      });
      
      // Return the new user_id
      return newUserId;
    } catch (error: any) {
      console.error('Failed to create user for client:', error);
      throw error;
    } finally {
      setCreatingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(clientId);
        return newSet;
      });
    }
  };

  const handleAssign = async () => {
    if (selectedUserIds.size === 0) {
      alert('Please select at least one customer');
      return;
    }

    setAssigning(true);
    try {
      // Convert client IDs to user IDs if needed
      const userIdsToAssign: string[] = [];
      
      for (const selectedId of selectedUserIds) {
        const selectedUser = users.find(u => u.id === selectedId);
        
        if (selectedUser?.type === 'client' && selectedUser.client_id) {
          // This is a client without a user - create user first
          try {
            const userId = await createUserForClient(selectedUser.client_id);
            userIdsToAssign.push(userId);
          } catch (error: any) {
            alert(`Failed to create user for ${selectedUser.email}: ${error?.response?.data?.detail || error?.message}`);
            setAssigning(false);
            return;
          }
        } else {
          // Regular user ID
          userIdsToAssign.push(selectedId);
        }
      }
      
      await onAssign(userIdsToAssign);
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
              {filteredUsers.map((user) => {
                const isClient = user.type === 'client';
                const isCreating = user.client_id && creatingUsers.has(user.client_id);
                const isAssigned = existingAssignments.some(a => a.user_id === user.id);
                
                return (
                  <label key={user.id} className={`user-item ${isClient ? 'client-item' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={() => handleToggleUser(user.id)}
                      disabled={isCreating}
                    />
                    <div style={{ flex: 1 }}>
                      <span className="user-email">
                        {user.email}
                        {user.name && user.name !== user.email && (
                          <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>({user.name})</span>
                        )}
                      </span>
                      {isClient && (
                        <span style={{ 
                          display: 'block', 
                          fontSize: '0.75rem', 
                          color: '#eab308',
                          marginTop: '0.25rem'
                        }}>
                          ⚠️ Client - will create user account when assigned
                        </span>
                      )}
                    </div>
                    {isCreating && (
                      <span className="creating-badge">Creating account...</span>
                    )}
                    {isAssigned && !isCreating && (
                      <span className="assigned-badge">Already Assigned</span>
                    )}
                  </label>
                );
              })}
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

