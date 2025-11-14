import React, { useState } from 'react';
import { foldersAPI, filesAPI, formsAPI, esignatureAPI } from '../api';
import './FolderContentManager.css';

interface FolderContentManagerProps {
  folderId: string;
  onContentAdded?: () => void;
  onContentRemoved?: () => void;
}

const FolderContentManager: React.FC<FolderContentManagerProps> = ({
  folderId,
  onContentAdded,
  onContentRemoved,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'forms' | 'esignatures'>('files');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [assignedItems, setAssignedItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    loadData();
  }, [activeTab, folderId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load folder content to see what's already assigned
      const contentResponse = await foldersAPI.getContent(folderId);
      const content = contentResponse.data;

      // Load all available templates (templates can be assigned to multiple folders)
      let allItems: any[] = [];
      let assigned: any[] = [];

      if (activeTab === 'files') {
        const filesResponse = await filesAPI.getAll({ templates_only: true });
        allItems = filesResponse.data || [];
        assigned = content.files || [];
      } else if (activeTab === 'forms') {
        const formsResponse = await formsAPI.getAll({ templates_only: true });
        allItems = formsResponse.data || [];
        assigned = content.forms || [];
      } else if (activeTab === 'esignatures') {
        const esigResponse = await esignatureAPI.getAllDocuments({ templates_only: true });
        allItems = esigResponse.data || [];
        assigned = content.esignatures || [];
      }

      // Show ALL templates in available list (templates can be in multiple folders)
      // Don't filter out already assigned items - user should see all templates
      setAvailableItems(allItems);
      setAssignedItems(assigned);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (itemId: string) => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'files') {
        await foldersAPI.assignFile(folderId, itemId);
      } else if (activeTab === 'forms') {
        await foldersAPI.assignForm(folderId, itemId);
      } else if (activeTab === 'esignatures') {
        await foldersAPI.assignESignature(folderId, itemId);
      }

      await loadData();
      if (onContentAdded) onContentAdded();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign item');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'files') {
        await foldersAPI.removeFile(folderId, itemId);
      } else if (activeTab === 'forms') {
        await foldersAPI.removeForm(folderId, itemId);
      } else if (activeTab === 'esignatures') {
        await foldersAPI.removeESignature(folderId, itemId);
      }

      await loadData();
      if (onContentRemoved) onContentRemoved();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove item');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedItems.size === 0) return;

    try {
      setLoading(true);
      setError(null);

      const promises = Array.from(selectedItems).map((itemId) => {
        if (activeTab === 'files') {
          return foldersAPI.assignFile(folderId, itemId);
        } else if (activeTab === 'forms') {
          return foldersAPI.assignForm(folderId, itemId);
        } else if (activeTab === 'esignatures') {
          return foldersAPI.assignESignature(folderId, itemId);
        }
        return Promise.resolve();
      });

      await Promise.all(promises);
      setSelectedItems(new Set());
      await loadData();
      if (onContentAdded) onContentAdded();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign items');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRemove = async () => {
    if (selectedItems.size === 0) return;

    try {
      setLoading(true);
      setError(null);

      const promises = Array.from(selectedItems).map((itemId) => {
        if (activeTab === 'files') {
          return foldersAPI.removeFile(folderId, itemId);
        } else if (activeTab === 'forms') {
          return foldersAPI.removeForm(folderId, itemId);
        } else if (activeTab === 'esignatures') {
          return foldersAPI.removeESignature(folderId, itemId);
        }
        return Promise.resolve();
      });

      await Promise.all(promises);
      setSelectedItems(new Set());
      await loadData();
      if (onContentRemoved) onContentRemoved();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove items');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    const allIds = new Set(filteredAvailable.map((item: any) => item.id));
    setSelectedItems(allIds);
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const filteredAvailable = availableItems.filter((item: any) => {
    const name = item.name || item.title || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredAssigned = assignedItems.filter((item: any) => {
    const name = item.name || item.title || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="folder-content-manager">
      <div className="manager-header">
        <h3>Manage Folder Content</h3>
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Files
          </button>
          <button
            className={`tab-btn ${activeTab === 'forms' ? 'active' : ''}`}
            onClick={() => setActiveTab('forms')}
          >
            Forms
          </button>
          <button
            className={`tab-btn ${activeTab === 'esignatures' ? 'active' : ''}`}
            onClick={() => setActiveTab('esignatures')}
          >
            E-Signatures
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="search-box">
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="bulk-actions">
          {filteredAvailable.length > 0 && (
            <>
              <button onClick={selectAll} className="btn-select-all">
                Select All Available
              </button>
              {selectedItems.size > 0 && (
                <>
                  <button onClick={deselectAll} className="btn-deselect">
                    Deselect All
                  </button>
                  {Array.from(selectedItems).some(id => filteredAvailable.some(item => item.id === id)) && (
                    <button onClick={handleBulkAssign} className="btn-bulk-add" disabled={loading}>
                      Add Selected ({Array.from(selectedItems).filter(id => filteredAvailable.some(item => item.id === id)).length})
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {filteredAssigned.length > 0 && selectedItems.size > 0 && (
            Array.from(selectedItems).some(id => filteredAssigned.some(item => item.id === id)) && (
              <button onClick={handleBulkRemove} className="btn-bulk-remove" disabled={loading}>
                Remove Selected ({Array.from(selectedItems).filter(id => filteredAssigned.some(item => item.id === id)).length})
              </button>
            )
          )}
        </div>
      </div>

      <div className="content-grid">
        {/* Available Items */}
        <div className="content-section">
          <h4>Available {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h4>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : filteredAvailable.length === 0 ? (
            <div className="empty-state">No available items</div>
          ) : (
            <div className="items-list">
              {filteredAvailable.map((item: any) => (
                <div key={item.id} className="content-item">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    className="item-checkbox"
                  />
                  <div className="item-info">
                    <span className="item-name">{item.name || item.title}</span>
                    {item.description && (
                      <span className="item-description">{item.description}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleAssign(item.id)}
                    className="btn-add"
                    disabled={loading}
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assigned Items */}
        <div className="content-section">
          <h4>Assigned to Folder ({assignedItems.length})</h4>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : filteredAssigned.length === 0 ? (
            <div className="empty-state">No items assigned</div>
          ) : (
            <div className="items-list">
              {filteredAssigned.map((item: any) => (
                <div key={item.id} className="content-item assigned">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    className="item-checkbox"
                  />
                  <div className="item-info">
                    <span className="item-name">{item.name || item.title}</span>
                    {item.description && (
                      <span className="item-description">{item.description}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="btn-remove"
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FolderContentManager;

