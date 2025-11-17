import React, { useState, useEffect } from 'react';
import { foldersAPI, type Folder } from '../api';
import './FolderAssignmentModal.css';

interface FolderAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (folderId: string) => Promise<void>;
  itemType: 'file' | 'form' | 'esignature';
  itemName: string;
}

const FolderAssignmentModal: React.FC<FolderAssignmentModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  itemType: _itemType, // Prefixed with _ to indicate intentionally unused
  itemName,
}) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const response = await foldersAPI.getAll();
      setFolders(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedFolderId) return;

    try {
      setAssigning(true);
      setError(null);
      await onAssign(selectedFolderId);
      onClose();
      setSelectedFolderId('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign to folder');
    } finally {
      setAssigning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Use Template in Folder</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          <p className="item-name-display">Template: <strong>{itemName}</strong></p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            This template will be available in the selected folder. The template remains in your library and can be used in multiple folders.
          </p>

          {error && <div className="error-message">{error}</div>}

          {loading ? (
            <div className="loading">Loading folders...</div>
          ) : (
            <div className="folder-select">
              <label htmlFor="folder-select">Select Folder:</label>
              <select
                id="folder-select"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="folder-select-input"
              >
                <option value="">-- Select a folder --</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name} {folder.status !== 'active' ? `(${folder.status})` : ''}
                  </option>
                ))}
              </select>
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
            disabled={!selectedFolderId || assigning}
          >
            {assigning ? 'Adding...' : 'Add to Folder'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolderAssignmentModal;

