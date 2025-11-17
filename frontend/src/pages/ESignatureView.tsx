import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { esignatureAPI, filesAPI, foldersAPI, type ESignatureDocument, type ESignatureDocumentCreate, type FileItem, type Folder } from '../api';
import SignatureCanvas from '../components/SignatureCanvas';
import SignatureInput from '../components/SignatureInput';
import './ESignatureView.css';

const ESignatureView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<ESignatureDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<'draw' | 'type' | 'upload'>('draw');
  const [signatureData, setSignatureData] = useState<string>('');
  const [uploadedSignature, setUploadedSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  
  // For creating new document
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [formData, setFormData] = useState<ESignatureDocumentCreate>({
    name: '',
    description: '',
    file_id: '',
    signature_mode: 'simple',
    require_signature: true,
  });
  const [saving, setSaving] = useState(false);

  const isNewDocument = id === 'new';

  useEffect(() => {
    if (isNewDocument) {
      loadFilesAndFolders();
      setLoading(false);
    } else if (id) {
      fetchDocument();
    }
  }, [id, isNewDocument]);

  const loadFilesAndFolders = async () => {
    try {
      const [filesResponse, foldersResponse] = await Promise.all([
        filesAPI.getAll(),
        foldersAPI.getAll(),
      ]);
      setFiles(filesResponse.data || []);
      setFolders(foldersResponse.data || []);
    } catch (err: any) {
      console.error('Failed to load files/folders:', err);
    }
  };

  const fetchDocument = async () => {
    if (!id) return;

      try {
        setLoading(true);
        const docResponse = await esignatureAPI.getDocument(id);
        setDocument(docResponse.data);

        // Get preview URL
        const previewResponse = await esignatureAPI.getDocumentPreview(id);
        setPreviewUrl(previewResponse.data.preview_url);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedSignature(result);
      setSignatureData(result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.file_id) {
      setError('Document name and file are required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const documentData: ESignatureDocumentCreate = {
        name: formData.name.trim(),
        description: formData.description || undefined,
        file_id: formData.file_id,
        signature_mode: formData.signature_mode || 'simple',
        require_signature: formData.require_signature !== false,
        folder_id: formData.folder_id || undefined,
        expires_at: formData.expires_at || undefined,
      };
      const response = await esignatureAPI.createDocument(documentData);
      navigate(`/esignature/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create document');
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async () => {
    if (!document || !id) return;

    if (!signatureData) {
      setError('Please provide a signature');
      return;
    }

    try {
      setSigning(true);
      setError(null);

      await esignatureAPI.signDocument(id, {
        document_id: id,
        signature_data: signatureData,
        signature_type: signatureMethod === 'upload' ? 'upload' : signatureMethod,
        folder_id: document.folder_id,
      });

      // Refresh document to show signed status
      const docResponse = await esignatureAPI.getDocument(id);
      setDocument(docResponse.data);

      // Show success message
      alert('Document signed successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  if (isNewDocument) {
    return (
      <div className="esignature-view-container">
        <div className="esignature-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <button onClick={() => navigate('/esignature')} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
              ← Back
            </button>
            <h1 style={{ margin: 0 }}>Create New E-Signature Document</h1>
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleCreateDocument} className="esignature-form">
          <div className="form-group">
            <label htmlFor="name">Document Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Enter document name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter document description (optional)"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="file_id">File *</label>
            <select
              id="file_id"
              name="file_id"
              value={formData.file_id}
              onChange={(e) => setFormData({ ...formData, file_id: e.target.value })}
              required
            >
              <option value="">Select a file</option>
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name} ({file.file_type})
                </option>
              ))}
            </select>
            {files.length === 0 && (
              <p className="form-help-text">No files available. Please upload a file first.</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="signature_mode">Signature Mode</label>
            <select
              id="signature_mode"
              name="signature_mode"
              value={formData.signature_mode || 'simple'}
              onChange={(e) => setFormData({ ...formData, signature_mode: e.target.value as 'simple' | 'advanced' })}
            >
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="folder_id">Folder (Optional)</label>
            <select
              id="folder_id"
              name="folder_id"
              value={formData.folder_id || ''}
              onChange={(e) => setFormData({ ...formData, folder_id: e.target.value || undefined })}
            >
              <option value="">None</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="expires_at">Expiration Date (Optional)</label>
            <input
              type="datetime-local"
              id="expires_at"
              name="expires_at"
              value={formData.expires_at || ''}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value || undefined })}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/esignature')}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !formData.name.trim() || !formData.file_id}
            >
              {saving ? 'Creating...' : 'Create Document'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="esignature-view-container">
        <div className="loading">Loading document...</div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="esignature-view-container">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/esignature')} className="btn-secondary">
          Back to Documents
        </button>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="esignature-view-container">
        <div className="error">Document not found</div>
        <button onClick={() => navigate('/esignature')} className="btn-secondary">
          Back to Documents
        </button>
      </div>
    );
  }

  const isSigned = document.status === 'signed';
  const isExpired = !!(document.expires_at && new Date(document.expires_at) < new Date());

  return (
    <div className="esignature-view-container">
      <div className="esignature-header">
        <h1>{document.name}</h1>
        {document.description && <p className="document-description">{document.description}</p>}
        <div className="document-status">
          <span className={`status-badge status-${document.status}`}>
            {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
          </span>
          {document.signed_at && (
            <span className="signed-date">
              Signed on {new Date(document.signed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {isExpired && (
        <div className="error-banner">
          This document has expired and can no longer be signed.
        </div>
      )}

      {isSigned ? (
        <div className="signed-document-view">
          <div className="success-message">
            <h2>Document Signed</h2>
            <p>This document has been successfully signed.</p>
            <div className="signed-actions">
              <button
                onClick={async () => {
                  try {
                    const { supabase } = await import('../lib/supabase');
                    const { data: { session } } = await supabase.auth.getSession();
                    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                    
                    // Use full API URL to avoid React Router interference
                    // The backend returns a redirect to the signed URL
                    const url = `${API_URL}/api/esignature/documents/${id}/signed-pdf`;
                    const headers: HeadersInit = {};
                    if (session?.access_token) {
                      headers['Authorization'] = `Bearer ${session.access_token}`;
                    }
                    
                    // Fetch with redirect following - this will get the final signed URL
                    const response = await fetch(url, { 
                      headers,
                      redirect: 'follow' // Follow redirects automatically
                    });
                    
                    if (!response.ok) {
                      throw new Error('Failed to get signed PDF');
                    }
                    
                    // Get the final URL after redirect
                    const finalUrl = response.url;
                    
                    // Open the signed PDF URL in a new window
                    window.open(finalUrl, '_blank');
                  } catch (err) {
                    console.error('Failed to download signed PDF:', err);
                    alert('Failed to download signed PDF. Please try again.');
                  }
                }}
                className="btn-primary"
              >
                Download Signed PDF
              </button>
              <button onClick={() => navigate('/esignature')} className="btn-secondary">
                Back to Documents
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="signature-interface">
          <div className="pdf-preview-section">
            <h2>Document Preview</h2>
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="pdf-preview"
                title="Document Preview"
              />
            ) : (
              <div className="pdf-loading">Loading PDF preview...</div>
            )}
          </div>

          <div className="signature-section">
            <h2>Sign Document</h2>
            <p className="signature-instructions">
              Please review the document above and provide your signature below.
            </p>

            <div className="signature-method-selector">
              <button
                type="button"
                className={`method-btn ${signatureMethod === 'draw' ? 'active' : ''}`}
                onClick={() => {
                  setSignatureMethod('draw');
                  setSignatureData('');
                  setUploadedSignature(null);
                }}
              >
                Draw Signature
              </button>
              <button
                type="button"
                className={`method-btn ${signatureMethod === 'type' ? 'active' : ''}`}
                onClick={() => {
                  setSignatureMethod('type');
                  setSignatureData('');
                  setUploadedSignature(null);
                }}
              >
                Type Signature
              </button>
              <button
                type="button"
                className={`method-btn ${signatureMethod === 'upload' ? 'active' : ''}`}
                onClick={() => {
                  setSignatureMethod('upload');
                  setSignatureData('');
                  setUploadedSignature(null);
                }}
              >
                Upload Signature
              </button>
            </div>

            <div className="signature-input-area">
              {signatureMethod === 'draw' && (
                <SignatureCanvas
                  onSignatureChange={setSignatureData}
                  width={500}
                  height={200}
                />
              )}

              {signatureMethod === 'type' && (
                <SignatureInput
                  onSignatureChange={setSignatureData}
                  placeholder="Type your full name"
                />
              )}

              {signatureMethod === 'upload' && (
                <div className="signature-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="signature-file-input"
                    id="signature-upload"
                  />
                  <label htmlFor="signature-upload" className="signature-upload-label">
                    Choose Signature Image
                  </label>
                  {uploadedSignature && (
                    <div className="uploaded-signature-preview">
                      <img src={uploadedSignature} alt="Uploaded signature" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="signature-actions">
              <button
                onClick={handleSign}
                disabled={!signatureData || signing || isExpired}
                className="btn-primary btn-sign"
              >
                {signing ? 'Signing...' : 'Sign Document'}
              </button>
              <button
                onClick={() => navigate('/esignature')}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ESignatureView;

