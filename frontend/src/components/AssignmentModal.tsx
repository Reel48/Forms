import React, { useState, useEffect } from 'react';
import api from '../api';
import './AssignmentModal.css';

interface Folder {
  id: string;
  name: string;
  description?: string;
  client_id?: string;
  status?: string;
}

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (folderIds: string[]) => Promise<void>;
  title: string;
  existingAssignments?: Array<{ folder_id: string; folder?: { name: string } }>;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  title,
  existingAssignments = [],
}) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Always reload folders when modal opens to ensure we have the latest list
      loadFolders();
      // Pre-select existing assignments
      const existingIds = new Set(existingAssignments.map(a => a.folder_id));
      setSelectedFolderIds(existingIds);
    } else {
      // Clear state when modal closes
      setFolders([]);
      setSelectedFolderIds(new Set());
      setSearchTerm('');
    }
  }, [isOpen, existingAssignments]);

  const loadFolders = async () => {
    setLoading(true);
    try {
      // Get all folders (admin only endpoint)
      const response = await api.get('/api/folders');
      console.log('Loaded folders from API:', response.data.length, 'total folders');
      
      setFolders(response.data || []);
    } catch (error) {
      console.error('Failed to load folders:', error);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFolder = (folderId: string) => {
    const newSelection = new Set(selectedFolderIds);
    if (newSelection.has(folderId)) {
      newSelection.delete(folderId);
    } else {
      newSelection.add(folderId);
    }
    setSelectedFolderIds(newSelection);
  };

  const handleAssign = async () => {
    if (selectedFolderIds.size === 0) {
      alert('Please select at least one folder');
      return;
    }

    setAssigning(true);
    try {
      const folderIdsToAssign = Array.from(selectedFolderIds);
      await onAssign(folderIdsToAssign);
      onClose();
    } catch (error: any) {
      console.error('Failed to assign:', error);
      alert(error?.response?.data?.detail || error?.message || 'Failed to assign. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (folder.description && folder.description.toLowerCase().includes(searchTerm.toLowerCase()))
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
              placeholder="Search folders by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          {loading ? (
            <div className="loading">Loading folders...</div>
          ) : filteredFolders.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? 'No folders found matching your search.' : 'No folders available. Create a folder first.'}
            </div>
          ) : (
            <div className="user-list">
              {filteredFolders.map((folder) => {
                const isAssigned = existingAssignments.some(a => a.folder_id === folder.id);
                
                return (
                  <label key={folder.id} className="user-item">
                    <input
                      type="checkbox"
                      checked={selectedFolderIds.has(folder.id)}
                      onChange={() => handleToggleFolder(folder.id)}
                    />
                    <div style={{ flex: 1 }}>
                      <span className="user-email">
                        {folder.name}
                      </span>
                      {folder.description && (
                        <span style={{ 
                          display: 'block', 
                          fontSize: '0.75rem', 
                          color: '#6b7280',
                          marginTop: '0.25rem'
                        }}>
                          {folder.description}
                        </span>
                      )}
                      {folder.status && folder.status !== 'active' && (
                        <span style={{ 
                          display: 'block', 
                          fontSize: '0.75rem', 
                          color: '#eab308',
                          marginTop: '0.25rem'
                        }}>
                          Status: {folder.status}
                        </span>
                      )}
                    </div>
                    {isAssigned && (
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
            disabled={assigning || selectedFolderIds.size === 0}
          >
            {assigning ? 'Assigning...' : `Assign to ${selectedFolderIds.size} folder(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};
