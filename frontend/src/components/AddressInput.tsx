import { useState } from 'react';

interface AddressData {
  address?: string;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
}

interface AddressInputProps {
  value: AddressData;
  onChange: (address: AddressData) => void;
  mode?: 'simple' | 'structured';
  onModeChange?: (mode: 'simple' | 'structured') => void;
}

function AddressInput({ value, onChange, mode: externalMode, onModeChange }: AddressInputProps) {
  const [internalMode, setInternalMode] = useState<'simple' | 'structured'>('simple');
  
  const mode = externalMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;

  const handleSimpleAddressChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({
      ...value,
      address: e.target.value,
    });
  };

  const handleStructuredFieldChange = (field: keyof AddressData, newValue: string) => {
    const updated = {
      ...value,
      [field]: newValue || undefined,
    };
    
    // Also update the text address when structured fields change
    if (field.startsWith('address_')) {
      const parts = [
        updated.address_line1,
        updated.address_line2 ? `, ${updated.address_line2}` : '',
        updated.address_city ? `, ${updated.address_city}` : '',
        updated.address_state ? `, ${updated.address_state}` : '',
        updated.address_postal_code ? ` ${updated.address_postal_code}` : ''
      ].filter(Boolean);
      updated.address = parts.join('') || value.address;
    }
    
    onChange(updated);
  };


  return (
    <div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label htmlFor="address-structured-mode" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            id="address-structured-mode"
            name="address-structured-mode"
            checked={mode === 'structured'}
            onChange={(e) => setMode(e.target.checked ? 'structured' : 'simple')}
          />
          Use structured address
        </label>
      </div>

      {mode === 'simple' ? (
        <div>
          <label htmlFor="address-simple" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Address
          </label>
          <textarea
            id="address-simple"
            name="address-simple"
            value={value.address || ''}
            onChange={handleSimpleAddressChange}
            placeholder="Enter full address..."
            style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '80px' }}
          />
        </div>
      ) : (
        <div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor="address-line1" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Street Address *
              </label>
              <input
                type="text"
                id="address-line1"
                name="address-line1"
                value={value.address_line1 || ''}
                onChange={(e) => handleStructuredFieldChange('address_line1', e.target.value)}
                placeholder="123 Main St"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="address-line2" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Address Line 2
              </label>
              <input
                type="text"
                id="address-line2"
                name="address-line2"
                value={value.address_line2 || ''}
                onChange={(e) => handleStructuredFieldChange('address_line2', e.target.value)}
                placeholder="Apt 4B, Suite 100"
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="address-city" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                City *
              </label>
              <input
                type="text"
                id="address-city"
                name="address-city"
                value={value.address_city || ''}
                onChange={(e) => handleStructuredFieldChange('address_city', e.target.value)}
                placeholder="New York"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="address-state" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                State/Province *
              </label>
              <input
                type="text"
                id="address-state"
                name="address-state"
                value={value.address_state || ''}
                onChange={(e) => handleStructuredFieldChange('address_state', e.target.value)}
                placeholder="NY"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="address-postal-code" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                ZIP/Postal Code *
              </label>
              <input
                type="text"
                id="address-postal-code"
                name="address-postal-code"
                value={value.address_postal_code || ''}
                onChange={(e) => handleStructuredFieldChange('address_postal_code', e.target.value)}
                placeholder="10001"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="address-country" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Country
              </label>
              <select
                id="address-country"
                name="address-country"
                value={value.address_country || 'US'}
                onChange={(e) => handleStructuredFieldChange('address_country', e.target.value)}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="MX">Mexico</option>
                {/* Add more countries as needed */}
              </select>
            </div>
          </div>

          {value.address && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Full address: {value.address}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AddressInput;

