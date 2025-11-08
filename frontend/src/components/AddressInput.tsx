import { useState, useRef, useEffect } from 'react';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';

const libraries: ("places")[] = ["places"];

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
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const autocompleteRef = useRef<HTMLInputElement>(null);
  
  const mode = externalMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;

  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
    id: 'google-maps-script',
  });

  useEffect(() => {
    if (!apiKey) {
      console.error('Google Places API key not found. Address autocomplete will not work.');
      console.error('Make sure VITE_GOOGLE_PLACES_API_KEY is set in environment variables.');
    } else {
      console.log('Google Places API key found:', apiKey.substring(0, 10) + '...');
    }
  }, [apiKey]);

  useEffect(() => {
    if (loadError) {
      console.error('Google Maps load error:', loadError);
    }
    if (isLoaded) {
      console.log('Google Maps script loaded successfully');
    }
  }, [isLoaded, loadError]);

  const onLoad = (autocomplete: google.maps.places.Autocomplete) => {
    console.log('Autocomplete loaded successfully');
    setAutocomplete(autocomplete);
  };

  const onPlaceChanged = () => {
    if (!autocomplete) {
      console.warn('Autocomplete not initialized');
      return;
    }

    const place = autocomplete.getPlace();
    console.log('Place selected:', place);
    
    if (!place.address_components) {
      console.warn('Place has no address_components:', place);
      return;
    }

    // Parse address components from Google Places
    let line1 = '';
    let line2 = '';
    let city = '';
    let state = '';
    let postalCode = '';
    let country = 'US';

    // Build address components
    const streetNumber = place.address_components.find(c => c.types.includes('street_number'))?.long_name || '';
    const streetName = place.address_components.find(c => c.types.includes('route'))?.long_name || '';
    line1 = [streetNumber, streetName].filter(Boolean).join(' ').trim() || place.name || '';

    // Get subpremise (apartment, suite, etc.) for line2
    const subpremise = place.address_components.find(c => c.types.includes('subpremise'))?.long_name;
    if (subpremise) {
      line2 = subpremise;
    }

    // Get city
    city = place.address_components.find(c => 
      c.types.includes('locality') || c.types.includes('sublocality')
    )?.long_name || '';

    // Get state
    state = place.address_components.find(c => 
      c.types.includes('administrative_area_level_1')
    )?.short_name || place.address_components.find(c => 
      c.types.includes('administrative_area_level_1')
    )?.long_name || '';

    // Get postal code
    postalCode = place.address_components.find(c => 
      c.types.includes('postal_code')
    )?.long_name || '';

    // Get country
    const countryComponent = place.address_components.find(c => 
      c.types.includes('country')
    );
    country = countryComponent?.short_name || 'US';

    // Build full address string for compatibility
    const addressParts = [
      line1,
      line2 ? `, ${line2}` : '',
      city ? `, ${city}` : '',
      state ? `, ${state}` : '',
      postalCode ? ` ${postalCode}` : ''
    ].filter(Boolean);
    const fullAddress = addressParts.join('') || place.formatted_address || '';

    // Update both structured and text address
    onChange({
      address: fullAddress,
      address_line1: line1,
      address_line2: line2 || undefined,
      address_city: city || undefined,
      address_state: state || undefined,
      address_postal_code: postalCode || undefined,
      address_country: country,
    });
  };

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

  if (!apiKey) {
    return (
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#991b1b' }}>
        <strong>Google Places API key not configured</strong>
        <br />
        <small>Please set VITE_GOOGLE_PLACES_API_KEY in your environment variables. Address autocomplete will not work, but you can still enter addresses manually.</small>
      </div>
    );
  }

  if (loadError) {
    const isApiNotActivated = loadError.message?.includes('ApiNotActivatedMapError') || 
                              loadError.message?.includes('ApiNotActivated');
    
    return (
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#991b1b' }}>
        <strong>Error loading Google Maps:</strong> {loadError.message}
        <br />
        <small>
          {isApiNotActivated ? (
            <>
              <strong>⚠️ Maps JavaScript API not enabled!</strong>
              <br />
              <br />
              To fix this:
              <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                <li>Go to <a href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>Google Cloud Console → Maps JavaScript API</a></li>
                <li>Click <strong>"Enable"</strong> button</li>
                <li>Wait a few seconds for it to activate</li>
                <li>Refresh this page</li>
              </ol>
              <strong>Note:</strong> You need BOTH "Places API" AND "Maps JavaScript API" enabled.
            </>
          ) : (
            <>
              This could be due to:
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                <li>Maps JavaScript API not enabled (most common)</li>
                <li>Invalid API key</li>
                <li>Places API not enabled</li>
                <li>API key restrictions blocking this domain</li>
                <li>Billing not enabled in Google Cloud Console</li>
              </ul>
              Check browser console for more details.
            </>
          )}
          <br />
          <br />
          You can still enter addresses manually below.
        </small>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={mode === 'structured'}
            onChange={(e) => setMode(e.target.checked ? 'structured' : 'simple')}
            style={{ marginRight: '0.5rem' }}
          />
          Use structured address {isLoaded && mode === 'structured' && '(with autocomplete)'}
        </label>
      </div>

      {mode === 'simple' ? (
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Address
          </label>
          <textarea
            value={value.address || ''}
            onChange={handleSimpleAddressChange}
            placeholder="Enter full address..."
            style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '80px' }}
          />
        </div>
      ) : (
        <div>
          {isLoaded ? (
            <>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Address (Start typing to search)
              </label>
              <Autocomplete
                onLoad={onLoad}
                onPlaceChanged={onPlaceChanged}
                options={{
                  types: ['address'],
                  componentRestrictions: { country: ['us', 'ca'] }, // Optional: restrict to US/Canada
                }}
              >
                <input
                  ref={autocompleteRef}
                  type="text"
                  placeholder="Type address to search..."
                  style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '1rem' }}
                />
              </Autocomplete>
            </>
          ) : (
            <div style={{ padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '6px', marginBottom: '1rem' }}>
              Loading Google Maps...
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Street Address *
              </label>
              <input
                type="text"
                value={value.address_line1 || ''}
                onChange={(e) => handleStructuredFieldChange('address_line1', e.target.value)}
                placeholder="123 Main St"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Address Line 2
              </label>
              <input
                type="text"
                value={value.address_line2 || ''}
                onChange={(e) => handleStructuredFieldChange('address_line2', e.target.value)}
                placeholder="Apt 4B, Suite 100"
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                City *
              </label>
              <input
                type="text"
                value={value.address_city || ''}
                onChange={(e) => handleStructuredFieldChange('address_city', e.target.value)}
                placeholder="New York"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                State/Province *
              </label>
              <input
                type="text"
                value={value.address_state || ''}
                onChange={(e) => handleStructuredFieldChange('address_state', e.target.value)}
                placeholder="NY"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                ZIP/Postal Code *
              </label>
              <input
                type="text"
                value={value.address_postal_code || ''}
                onChange={(e) => handleStructuredFieldChange('address_postal_code', e.target.value)}
                placeholder="10001"
                required={mode === 'structured'}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Country
              </label>
              <select
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

