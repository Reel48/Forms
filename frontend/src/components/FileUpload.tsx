import { useState, useRef, useCallback } from 'react';
import { filesAPI } from '../api';
import type { File as FileType } from '../api';
import './FileUpload.css';

interface FileUploadProps {
  onUploadSuccess?: (file: FileType) => void;
  onUploadError?: (error: string) => void;
  folderId?: string;
  quoteId?: string;
  formId?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
}

function FileUpload({
  onUploadSuccess,
  onUploadError,
  folderId,
  quoteId,
  formId,
  multiple = false,
  maxSize = 10 * 1024 * 1024, // 10MB default
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const validateFile = (file: globalThis.File): string | null => {
    if (file.size > maxSize) {
      return `File size exceeds ${formatFileSize(maxSize)} limit`;
    }
    return null;
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: globalThis.File[] = [];
    const errors: string[] = [];

    // Validate all files first
    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(file);
      }
    });

    if (errors.length > 0) {
      onUploadError?.(errors.join('\n'));
      if (validFiles.length === 0) return;
    }

    setUploading(true);

    try {
      const uploadPromises = validFiles.map(async (file) => {
        try {
          setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));
          
          const response = await filesAPI.upload(file, {
            folder_id: folderId,
            quote_id: quoteId,
            form_id: formId,
          });

          setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
          onUploadSuccess?.(response.data);
          return response.data;
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || error.message || 'Upload failed';
          onUploadError?.(`${file.name}: ${errorMessage}`);
          throw error;
        } finally {
          setTimeout(() => {
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[file.name];
              return newProgress;
            });
          }, 1000);
        }
      });

      await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      handleFileUpload(files);
    },
    [folderId, quoteId, formId]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-upload-container">
      <div
        className={`file-upload-zone ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <div className="file-upload-content">
          {uploading ? (
            <>
              <div className="upload-icon">⏳</div>
              <p>Uploading files...</p>
            </>
          ) : (
            <>
              <div className="upload-icon">📁</div>
              <p className="upload-text">
                <strong>Drag & drop files here</strong>
                <br />
                or click to browse
              </p>
              <p className="upload-hint">
                Maximum file size: {formatFileSize(maxSize)}
              </p>
            </>
          )}
        </div>
      </div>
      {Object.keys(uploadProgress).length > 0 && (
        <div className="upload-progress-list">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="upload-progress-item">
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="upload-progress-text">{fileName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUpload;

