import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { filesAPI } from '../api';
import type { FileItem } from '../api';
import { useAuth } from '../contexts/AuthContext';
import FileUpload from '../components/FileUpload';
import FileCard from '../components/FileCard';
import './FilesList.css';

function FilesList() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUpload, setShowUpload] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { folder_id?: string; quote_id?: string; form_id?: string; is_reusable?: boolean } = {};
      const response = await filesAPI.getAll(filters);
      setFiles(response.data || []);
    } catch (error: any) {
      console.error('Failed to load files:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load files. Please try again.');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUploadSuccess = (file: FileItem) => {
    setFiles((prev) => [file, ...prev]);
    setShowUpload(false);
  };

  const handleUploadError = (errorMessage: string) => {
    alert(errorMessage);
  };

  const handleDelete = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleView = (file: FileItem) => {
    navigate(`/files/${file.id}`);
  };

  const formatFileType = (fileType: string): string => {
    if (fileType.startsWith('image/')) return 'Image';
    if (fileType === 'application/pdf') return 'PDF';
    if (fileType.includes('word') || fileType.includes('document')) return 'Document';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'Spreadsheet';
    if (fileType.includes('zip') || fileType.includes('archive')) return 'Archive';
    return 'Other';
  };

  const filteredFiles = files.filter((file) => {
    const matchesSearch = !searchQuery || 
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = !typeFilter || formatFileType(file.file_type) === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const uniqueFileTypes = Array.from(new Set(files.map((f) => formatFileType(f.file_type))));

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p className="text-center">Loading files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="files-header">
        <h1>Files</h1>
        {role === 'admin' && (
          <button className="btn-primary" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? 'Cancel Upload' : '+ Upload Files'}
          </button>
        )}
      </div>

      {error && (
        <div className="card error-message">
          <p>{error}</p>
        </div>
      )}

      {role === 'admin' && showUpload && (
        <div className="card">
          <h2>Upload Files</h2>
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
            multiple={true}
          />
        </div>
      )}

      <div className="files-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Types</option>
          {uniqueFileTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            ⬜
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            ☰
          </button>
        </div>
      </div>

      {filteredFiles.length === 0 ? (
        <div className="card">
          <p className="text-center">
            {files.length === 0
              ? 'No files yet. Upload your first file to get started!'
              : 'No files match your search criteria.'}
          </p>
        </div>
      ) : (
        <div className={`files-container ${viewMode}`}>
          {filteredFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onDelete={handleDelete}
              onView={handleView}
              showActions={role === 'admin'}
              showFolderAssignment={role === 'admin'}
            />
          ))}
        </div>
      )}

      {filteredFiles.length > 0 && (
        <div className="files-stats">
          <p>
            Showing {filteredFiles.length} of {files.length} file{files.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

export default FilesList;

