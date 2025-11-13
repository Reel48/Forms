import { useState } from 'react';
import { filesAPI, foldersAPI } from '../api';
import type { FileItem } from '../api';
import FolderAssignmentModal from './FolderAssignmentModal';
import './FileCard.css';

interface FileCardProps {
  file: FileItem;
  onDelete?: (fileId: string) => void;
  onView?: (file: FileItem) => void;
  showActions?: boolean;
  showFolderAssignment?: boolean;
}

function FileCard({ file, onDelete, onView, showActions = true, showFolderAssignment = false }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileTypeLabel = (fileType: string): string => {
    if (fileType.startsWith('image/')) return 'Image';
    if (fileType === 'application/pdf') return 'PDF';
    if (fileType.includes('word') || fileType.includes('document')) return 'Document';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'Spreadsheet';
    if (fileType.includes('zip') || fileType.includes('archive')) return 'Archive';
    return 'File';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    setDeleting(true);
    try {
      await filesAPI.delete(file.id);
      onDelete?.(file.id);
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete file. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    onView?.(file);
  };

  const handleAssignToFolder = async (folderId: string) => {
    await foldersAPI.assignFile(folderId, file.id);
  };

  return (
    <div className="file-card" onClick={() => onView?.(file)}>
      <div className="file-card-icon" style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-muted, #6b7280)' }}>{getFileTypeLabel(file.file_type)}</div>
      <div className="file-card-content">
        <div className="file-card-name" title={file.name}>
          {file.name}
        </div>
        <div className="file-card-meta">
          <span className="file-card-size">{formatFileSize(file.file_size)}</span>
          <span className="file-card-separator">•</span>
          <span className="file-card-date">{formatDate(file.created_at)}</span>
        </div>
        {file.description && (
          <div className="file-card-description" title={file.description}>
            {file.description}
          </div>
        )}
        {file.tags && file.tags.length > 0 && (
          <div className="file-card-tags">
            {file.tags.map((tag, index) => (
              <span key={index} className="file-card-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {showActions && (
        <div className="file-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="file-card-action-btn"
            onClick={handleView}
            title="View"
          >
            View
          </button>
          <button
            className="file-card-action-btn"
            onClick={handleDownload}
            disabled={downloading}
            title="Download"
          >
            {downloading ? 'Downloading...' : 'Download'}
          </button>
          {showFolderAssignment && (
            <button
              className="file-card-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowFolderModal(true);
              }}
              title="Assign to Folder"
            >
              Assign
            </button>
          )}
          <button
            className="file-card-action-btn file-card-action-danger"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      )}

      {showFolderAssignment && (
        <FolderAssignmentModal
          isOpen={showFolderModal}
          onClose={() => setShowFolderModal(false)}
          onAssign={handleAssignToFolder}
          itemType="file"
          itemName={file.name}
        />
      )}
    </div>
  );
}

export default FileCard;

