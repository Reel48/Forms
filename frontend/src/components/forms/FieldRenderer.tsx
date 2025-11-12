import type { FormField } from '../../api';

interface FieldRendererProps {
  field: FormField;
  fieldId: string;
  value: any;
  error?: string;
  onChange: (fieldId: string, value: any) => void;
  onBlur?: (fieldId: string) => void;
  disabled?: boolean;
  showMedia?: boolean;
}

export function FieldRenderer({
  field,
  fieldId,
  value,
  error,
  onChange,
  onBlur,
  disabled = false,
  showMedia = true,
}: FieldRendererProps) {
  const handleChange = (newValue: any) => {
    onChange(fieldId, newValue);
  };

  const renderMedia = () => {
    if (!showMedia || !field.validation_rules?.mediaUrl) return null;

    const mediaUrl = field.validation_rules.mediaUrl;
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl);
    const isVideo = /\.(mp4|webm|ogg)$/i.test(mediaUrl);

    if (isImage) {
      return (
        <div style={{ marginBottom: '1rem' }}>
          <img
            src={mediaUrl}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '300px',
              borderRadius: '8px',
              display: 'block',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div style={{ marginBottom: '1rem' }}>
          <video
            src={mediaUrl}
            controls
            style={{
              maxWidth: '100%',
              maxHeight: '300px',
              borderRadius: '8px',
              display: 'block',
            }}
          />
        </div>
      );
    }

    return null;
  };

  const commonProps = {
    id: fieldId,
    name: fieldId,
    required: field.required,
    disabled,
    'aria-required': field.required,
    'aria-invalid': !!error,
    'aria-describedby': error
      ? `${fieldId}-error`
      : field.description
      ? `${fieldId}-description`
      : undefined,
  };

  const labelElement = (
    <label htmlFor={fieldId}>
      {field.label}
      {field.required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
  );

  const descriptionElement = field.description ? (
    <p
      id={field.description ? `${fieldId}-description` : undefined}
      style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}
    >
      {field.description}
    </p>
  ) : null;

  const errorElement = error ? (
    <p
      id={`${fieldId}-error`}
      role="alert"
      style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}
    >
      {error}
    </p>
  ) : null;

  const inputStyle = {
    borderColor: error ? '#ef4444' : undefined,
    width: '100%',
  };

  switch (field.field_type) {
    case 'text':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder}
            autoComplete="off"
            minLength={field.validation_rules?.minLength}
            maxLength={field.validation_rules?.maxLength}
            pattern={field.validation_rules?.pattern}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'textarea':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <textarea
            {...commonProps}
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder}
            rows={4}
            autoComplete="off"
            minLength={field.validation_rules?.minLength}
            maxLength={field.validation_rules?.maxLength}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'email':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="email"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder}
            autoComplete="email"
            minLength={field.validation_rules?.minLength}
            maxLength={field.validation_rules?.maxLength}
            pattern={field.validation_rules?.pattern}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'number':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="number"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder}
            autoComplete="off"
            min={field.validation_rules?.min}
            max={field.validation_rules?.max}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'phone':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="tel"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder}
            autoComplete="tel"
            minLength={field.validation_rules?.minLength}
            maxLength={field.validation_rules?.maxLength}
            pattern={field.validation_rules?.pattern}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'url':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="url"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder || 'https://example.com'}
            autoComplete="url"
            minLength={field.validation_rules?.minLength}
            maxLength={field.validation_rules?.maxLength}
            pattern={field.validation_rules?.pattern}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'date':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="date"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            autoComplete="bday"
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'time':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="time"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            autoComplete="off"
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'datetime':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="datetime-local"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            autoComplete="off"
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'date_range':
      const startDateId = `${fieldId}-start`;
      const endDateId = `${fieldId}-end`;
      const rangeValue = value || {};
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor={startDateId} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#6b7280' }}>
                Start Date
              </label>
              <input
                id={startDateId}
                type="date"
                value={rangeValue.startDate || ''}
                onChange={(e) => handleChange({ ...rangeValue, startDate: e.target.value })}
                onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                required={field.required}
                disabled={disabled}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={endDateId} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#6b7280' }}>
                End Date
              </label>
              <input
                id={endDateId}
                type="date"
                value={rangeValue.endDate || ''}
                onChange={(e) => handleChange({ ...rangeValue, endDate: e.target.value })}
                onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                required={field.required}
                disabled={disabled}
                style={inputStyle}
              />
            </div>
          </div>
          {errorElement}
        </div>
      );

    case 'dropdown':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <select
            {...commonProps}
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            style={inputStyle}
          >
            <option value="">{field.placeholder || 'Select an option'}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option.value || option.label}>
                {option.label || option.value}
              </option>
            ))}
          </select>
          {errorElement}
        </div>
      );

    case 'multiple_choice':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {field.options?.map((option, idx) => {
              const optionId = `${fieldId}-option-${idx}`;
              const optionValue = option.value || option.label;
              return (
                <label
                  key={idx}
                  htmlFor={optionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    backgroundColor: value === optionValue ? '#f3f4f6' : 'transparent',
                  }}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={fieldId}
                    value={optionValue}
                    checked={value === optionValue}
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                    required={field.required}
                    disabled={disabled}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              );
            })}
          </div>
          {errorElement}
        </div>
      );

    case 'checkbox':
      const checkboxValue = Array.isArray(value) ? value : [];
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {field.options?.map((option, idx) => {
              const optionId = `${fieldId}-option-${idx}`;
              const optionValue = option.value || option.label;
              const isChecked = checkboxValue.includes(optionValue);
              return (
                <label
                  key={idx}
                  htmlFor={optionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    backgroundColor: isChecked ? '#f3f4f6' : 'transparent',
                  }}
                >
                  <input
                    id={optionId}
                    type="checkbox"
                    value={optionValue}
                    checked={isChecked}
                    onChange={(e) => {
                      const newValue = e.target.checked
                        ? [...checkboxValue, optionValue]
                        : checkboxValue.filter((v) => v !== optionValue);
                      handleChange(newValue);
                    }}
                    onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                    disabled={disabled}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              );
            })}
          </div>
          {errorElement}
        </div>
      );

    case 'yes_no':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #e5e7eb',
                backgroundColor: value === 'yes' ? '#667eea' : 'transparent',
                color: value === 'yes' ? 'white' : 'inherit',
              }}
            >
              <input
                type="radio"
                name={fieldId}
                value="yes"
                checked={value === 'yes'}
                onChange={(e) => handleChange(e.target.value)}
                onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                required={field.required}
                disabled={disabled}
                style={{ display: 'none' }}
              />
              Yes
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #e5e7eb',
                backgroundColor: value === 'no' ? '#667eea' : 'transparent',
                color: value === 'no' ? 'white' : 'inherit',
              }}
            >
              <input
                type="radio"
                name={fieldId}
                value="no"
                checked={value === 'no'}
                onChange={(e) => handleChange(e.target.value)}
                onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                required={field.required}
                disabled={disabled}
                style={{ display: 'none' }}
              />
              No
            </label>
          </div>
          {errorElement}
        </div>
      );

    case 'rating':
      const ratingMax = field.validation_rules?.max || 5;
      const ratingValue = value ? parseInt(value) : 0;
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {Array.from({ length: ratingMax }, (_, i) => i + 1).map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => !disabled && handleChange(star.toString())}
                onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                disabled={disabled}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '2rem',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: star <= ratingValue ? '#fbbf24' : '#d1d5db',
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label={`${star} star${star !== 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
            {ratingValue > 0 && (
              <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                {ratingValue} / {ratingMax}
              </span>
            )}
          </div>
          {errorElement}
        </div>
      );

    case 'opinion_scale':
      const scaleMin = field.validation_rules?.min || 1;
      const scaleMax = field.validation_rules?.max || 10;
      const scaleValue = value ? parseInt(value) : null;
      const lowLabel = field.options?.[0]?.label || 'Low';
      const highLabel = field.options?.[1]?.label || 'High';
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
              <span>{lowLabel}</span>
              <span>{highLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => !disabled && handleChange(num.toString())}
                  onBlur={onBlur ? () => onBlur(fieldId) : undefined}
                  disabled={disabled}
                  style={{
                    minWidth: '40px',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: scaleValue === num ? '#667eea' : 'white',
                    color: scaleValue === num ? 'white' : 'inherit',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: scaleValue === num ? '600' : 'normal',
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
            {scaleValue !== null && (
              <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                Selected: {scaleValue}
              </div>
            )}
          </div>
          {errorElement}
        </div>
      );

    case 'section':
      return (
        <div style={{ margin: '2rem 0', padding: '1.5rem 0', borderTop: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>{field.label}</h2>
          {field.description && (
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>{field.description}</p>
          )}
        </div>
      );

    case 'file_upload':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleChange(file);
              }
            }}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );

    case 'payment':
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
              Payment integration will be handled here
            </p>
          </div>
          {errorElement}
        </div>
      );

    case 'matrix':
    case 'ranking':
      // These are more complex and would need custom implementations
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
              {field.field_type === 'matrix' ? 'Matrix/Grid' : 'Ranking'} field type - custom implementation needed
            </p>
          </div>
          {errorElement}
        </div>
      );

    default:
      return (
        <div className="form-group">
          {showMedia && renderMedia()}
          {labelElement}
          {descriptionElement}
          <input
            {...commonProps}
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur ? () => onBlur(fieldId) : undefined}
            placeholder={field.placeholder}
            style={inputStyle}
          />
          {errorElement}
        </div>
      );
  }
}

