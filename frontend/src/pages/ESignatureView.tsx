import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { esignatureAPI, type ESignatureDocument } from '../api';
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

  useEffect(() => {
    if (!id) return;

    const fetchDocument = async () => {
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

    fetchDocument();
  }, [id]);

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
            <h2>✓ Document Signed</h2>
            <p>This document has been successfully signed.</p>
            <div className="signed-actions">
              <button
                onClick={() => {
                  window.open(`/api/esignature/documents/${id}/signed-pdf`, '_blank');
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

