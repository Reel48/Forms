import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { filesAPI } from '../api';
import type { FileItem } from '../api';
import { useAuth } from '../contexts/AuthContext';
import './FileView.css';

function FileView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  
  const getBackPath = () => {
    return role === 'admin' ? '/files' : '/';
  };
  
  const getBackLabel = () => {
    return role === 'admin' ? 'Back to Files' : 'Back to Dashboard';
  };
  const [file, setFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      loadFile();
    }
  }, [id]);

  const loadFile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await filesAPI.getById(id!);
      setFile(response.data);

      // Get preview URL
      try {
        const previewResponse = await filesAPI.getPreview(id!);
        setPreviewUrl(previewResponse.data.preview_url);
      } catch (previewError) {
        console.warn('Could not get preview URL:', previewError);
      }
    } catch (error: any) {
      console.error('Failed to load file:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load file.');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDownload = async () => {
    if (!file) return;
    setDownloading(true);
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
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!file) return;
    if (!confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      await filesAPI.delete(file.id);
      navigate(getBackPath());
    } catch (error: any) {
      console.error('Delete error:', error);
      alert(error?.response?.data?.detail || error?.message || 'Failed to delete file. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const canPreview = (fileType: string): boolean => {
    return (
      fileType.startsWith('image/') ||
      fileType === 'application/pdf' ||
      fileType.includes('text/')
    );
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p className="text-center">Loading file...</p>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="container">
        <div className="card error-message">
          <p>{error || 'File not found'}</p>
          <button className="btn-primary" onClick={() => navigate(getBackPath())}>
            {getBackLabel()}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="file-view-header">
        <button className="btn-secondary" onClick={() => navigate(getBackPath())}>
          ← {getBackLabel()}
        </button>
        <div className="file-view-actions">
          <button
            className="btn-primary"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? 'Downloading...' : 'Download'}
          </button>
          {role === 'admin' && (
            <button
              className="btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      <div className="file-view-content">
        <div className="file-view-sidebar">
          <div className="file-info-card">
            <h3>File Information</h3>
            <div className="file-info-item">
              <span className="file-info-label">Name:</span>
              <span className="file-info-value">{file.name}</span>
            </div>
            <div className="file-info-item">
              <span className="file-info-label">Type:</span>
              <span className="file-info-value">{file.file_type}</span>
            </div>
            <div className="file-info-item">
              <span className="file-info-label">Size:</span>
              <span className="file-info-value">{formatFileSize(file.file_size)}</span>
            </div>
            <div className="file-info-item">
              <span className="file-info-label">Uploaded:</span>
              <span className="file-info-value">{formatDate(file.created_at)}</span>
            </div>
            {file.description && (
              <div className="file-info-item">
                <span className="file-info-label">Description:</span>
                <span className="file-info-value">{file.description}</span>
              </div>
            )}
            {file.tags && file.tags.length > 0 && (
              <div className="file-info-item">
                <span className="file-info-label">Tags:</span>
                <div className="file-tags">
                  {file.tags.map((tag, index) => (
                    <span key={index} className="file-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {file.is_reusable && (
              <div className="file-info-item">
                <span className="file-info-badge">Reusable</span>
              </div>
            )}
          </div>
        </div>

        <div className="file-view-main">
          {canPreview(file.file_type) && previewUrl ? (
            <div className="file-preview">
              {file.file_type.startsWith('image/') ? (
                <img src={previewUrl} alt={file.name} className="preview-image" />
              ) : file.file_type === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  title={file.name}
                  className="preview-iframe"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={file.name}
                  className="preview-iframe"
                />
              )}
            </div>
          ) : (
            <div className="file-preview-placeholder">
              <div className="preview-icon" style={{ fontSize: '3rem', fontWeight: '500', color: 'var(--color-text-muted, #6b7280)' }}>File</div>
              <p>Preview not available for this file type</p>
              <p className="preview-hint">Click Download to view the file</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileView;

