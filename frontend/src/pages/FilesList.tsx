import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { filesAPI, foldersAPI } from '../api';
import type { FileItem } from '../api';
import { useAuth } from '../contexts/AuthContext';
import FileUpload from '../components/FileUpload';
import FolderAssignmentModal from '../components/FolderAssignmentModal';
import './FilesList.css';

function FilesList() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showUpload, setShowUpload] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renamingFileName, setRenamingFileName] = useState<string>('');

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { folder_id?: string; quote_id?: string; form_id?: string; is_reusable?: boolean; templates_only?: boolean } = {
        templates_only: true  // Show only reusable files in template library
      };
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

  const handleRename = async (fileId: string, newName: string) => {
    if (!newName.trim()) {
      alert('File name cannot be empty');
      return;
    }

    try {
      await filesAPI.update(fileId, { name: newName.trim() });
      setFiles((prev) =>
        prev.map((file) => (file.id === fileId ? { ...file, name: newName.trim() } : file))
      );
      setRenamingFileId(null);
      setRenamingFileName('');
    } catch (error: any) {
      console.error('Rename error:', error);
      alert(error?.response?.data?.detail || 'Failed to rename file. Please try again.');
    }
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

  return (
    <div className="container">
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading files...</p>
        </div>
      )}

      {!loading && (
        <>
      <div className="files-header">
        <div>
          <h1>File Templates</h1>
          <p className="page-subtitle">Reusable files for your projects</p>
        </div>
        {role === 'admin' && (
          <button className="btn-primary" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? 'Cancel Upload' : '+ Upload Template'}
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
            id="files-search"
            name="files-search"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          id="files-type-filter"
          name="files-type-filter"
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
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Description</th>
                <th>Created</th>
                {role === 'admin' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((file) => (
                <tr key={file.id} style={{ cursor: 'pointer' }} onClick={() => !renamingFileId && handleView(file)}>
                  <td className="mobile-name-column">
                    {renamingFileId === file.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renamingFileName}
                          onChange={(e) => setRenamingFileName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRename(file.id, renamingFileName);
                            } else if (e.key === 'Escape') {
                              setRenamingFileId(null);
                              setRenamingFileName('');
                            }
                          }}
                          onBlur={() => {
                            if (renamingFileName.trim() && renamingFileName !== file.name) {
                              handleRename(file.id, renamingFileName);
                            } else {
                              setRenamingFileId(null);
                              setRenamingFileName('');
                            }
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: '0.25rem 0.5rem',
                            border: '1px solid rgb(16 185 129)',
                            borderRadius: '4px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            color: 'rgb(16 185 129)'
                          }}
                        />
                      </div>
                    ) : (
                      <strong
                        style={{
                          color: 'rgb(16 185 129)',
                          cursor: 'pointer'
                        }}
                        onDoubleClick={(e) => {
                          if (role === 'admin') {
                            e.stopPropagation();
                            setRenamingFileId(file.id);
                            setRenamingFileName(file.name);
                          }
                        }}
                        title={role === 'admin' ? 'Double-click to rename' : undefined}
                      >
                        {file.name}
                      </strong>
                    )}
                  </td>
                  <td>
                    <span className="text-muted">{formatFileType(file.file_type)}</span>
                  </td>
                  <td>
                    <span className="text-muted">
                      {file.file_size < 1024
                        ? `${file.file_size} B`
                        : file.file_size < 1024 * 1024
                        ? `${(file.file_size / 1024).toFixed(1)} KB`
                        : `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {file.description || '-'}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {new Date(file.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </td>
                  {role === 'admin' && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn-outline btn-sm"
                          onClick={() => handleView(file)}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          View
                        </button>
                        <button
                          className="btn-outline btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingFileId(file.id);
                            setRenamingFileName(file.name);
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          title="Rename file"
                        >
                          Rename
                        </button>
                        <button
                          className="btn-outline btn-sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await filesAPI.download(file.id);
                              const blob = new Blob([response.data]);
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = file.original_filename;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Download error:', error);
                              alert('Failed to download file. Please try again.');
                            }
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Download
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
                              return;
                            }
                            try {
                              await filesAPI.delete(file.id);
                              handleDelete(file.id);
                            } catch (error) {
                              console.error('Delete error:', error);
                              alert('Failed to delete file. Please try again.');
                            }
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredFiles.length > 0 && (
        <div className="files-stats">
          <p>
            Showing {filteredFiles.length} of {files.length} file{files.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {selectedFile && (
        <FolderAssignmentModal
          isOpen={folderModalOpen}
          onClose={() => {
            setFolderModalOpen(false);
            setSelectedFile(null);
          }}
          onAssign={async (folderId: string) => {
            await foldersAPI.assignFile(folderId, selectedFile.id);
            setFolderModalOpen(false);
            setSelectedFile(null);
          }}
          itemType="file"
          itemName={selectedFile.name}
        />
      )}
        </>
      )}
    </div>
  );
}

export default FilesList;

