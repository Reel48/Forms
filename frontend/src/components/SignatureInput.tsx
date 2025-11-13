import React, { useState, useEffect } from 'react';
import './SignatureInput.css';

interface SignatureInputProps {
  onSignatureChange: (signatureData: string) => void;
  placeholder?: string;
  fontFamily?: string;
  fontSize?: number;
}

const SignatureInput: React.FC<SignatureInputProps> = ({
  onSignatureChange,
  placeholder = 'Type your name here',
  fontFamily = 'Dancing Script, cursive',
  fontSize = 24,
}) => {
  const [signature, setSignature] = useState('');

  useEffect(() => {
    if (signature) {
      // Encode signature text as base64
      const encoded = btoa(unescape(encodeURIComponent(signature)));
      onSignatureChange(encoded);
    } else {
      onSignatureChange('');
    }
  }, [signature, onSignatureChange]);

  return (
    <div className="signature-input-container">
      <input
        type="text"
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        placeholder={placeholder}
        className="signature-input"
        style={{
          fontFamily,
          fontSize: `${fontSize}px`,
        }}
      />
      {signature && (
        <div className="signature-preview">
          <p className="signature-preview-label">Preview:</p>
          <div
            className="signature-preview-text"
            style={{
              fontFamily,
              fontSize: `${fontSize}px`,
            }}
          >
            {signature}
          </div>
        </div>
      )}
    </div>
  );
};

export default SignatureInput;

