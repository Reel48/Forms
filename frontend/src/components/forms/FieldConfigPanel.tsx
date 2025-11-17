import type { FormField, FormCreate } from '../../api';
import { FIELD_TYPES, getFieldTypeDefinition } from '../../lib/fieldRegistry';
import { formsAPI } from '../../api';

interface FieldConfigPanelProps {
  field: FormField;
  fieldIndex: number;
  formData: FormCreate;
  onUpdate: (updates: Partial<FormField>) => void;
  onAddOption: () => void;
  onUpdateOption: (optionIndex: number, updates: { label?: string; value?: string }) => void;
  onRemoveOption: (optionIndex: number) => void;
}

export function FieldConfigPanel({
  field,
  fieldIndex,
  formData,
  onUpdate,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: FieldConfigPanelProps) {
  const fieldDefinition = getFieldTypeDefinition(field.field_type);
  const needsOptions = fieldDefinition?.needsOptions || false;

  const handleSaveToLibrary = async () => {
    const name = prompt('Enter a name for this field template:');
    if (!name || !name.trim()) return;
    try {
      await formsAPI.saveFieldToLibrary({
        name: name.trim(),
        field_type: field.field_type,
        label: field.label,
        description: field.description,
        placeholder: field.placeholder,
        required: field.required,
        validation_rules: field.validation_rules,
        options: field.options,
        conditional_logic: field.conditional_logic,
      });
      alert('Field saved to library!');
    } catch (error: any) {
      console.error('Failed to save field:', error);
      alert(error?.response?.data?.detail || 'Failed to save field to library');
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>
          {field.field_type === 'section' ? 'Edit Section' : 'Edit Field'}
        </h2>
        {field.field_type !== 'section' && field.label && (
          <button
            onClick={handleSaveToLibrary}
            className="btn-outline"
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Save to Library
          </button>
        )}
      </div>

      {field.field_type !== 'section' && (
        <div className="form-group">
          <label htmlFor={`field-type-${fieldIndex}`}>Field Type</label>
          <select
            id={`field-type-${fieldIndex}`}
            name={`field-type-${fieldIndex}`}
            value={field.field_type}
            onChange={(e) => {
              const newType = e.target.value;
              const newDef = getFieldTypeDefinition(newType);
              onUpdate({
                field_type: newType,
                options: newDef?.needsOptions ? [{ label: '', value: '' }] : [],
              });
            }}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group">
        <label htmlFor={`field-label-${fieldIndex}`}>
          {field.field_type === 'section' ? 'Section Title *' : 'Label *'}
        </label>
        <input
          type="text"
          id={`field-label-${fieldIndex}`}
          name={`field-label-${fieldIndex}`}
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={field.field_type === 'section' ? 'Section title' : 'Field label'}
        />
      </div>

      <div className="form-group">
        <label htmlFor={`field-description-${fieldIndex}`}>Description</label>
        <textarea
          id={`field-description-${fieldIndex}`}
          name={`field-description-${fieldIndex}`}
          value={field.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Help text for this field"
          rows={2}
        />
      </div>

      {/* Media Upload */}
      <div className="form-group">
        <label htmlFor={`field-media-url-${fieldIndex}`}>Image/Video URL (optional)</label>
        <input
          type="url"
          id={`field-media-url-${fieldIndex}`}
          name={`field-media-url-${fieldIndex}`}
          value={field.validation_rules?.mediaUrl || ''}
          onChange={(e) =>
            onUpdate({
              validation_rules: {
                ...field.validation_rules,
                mediaUrl: e.target.value,
              },
            })
          }
          placeholder="https://example.com/image.jpg or video.mp4"
        />
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
          Add an image or video to display with this question. Supports JPG, PNG, GIF, MP4, WebM.
        </p>
        {field.validation_rules?.mediaUrl && (
          <div style={{ marginTop: '0.5rem' }}>
            {field.validation_rules.mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img
                src={field.validation_rules.mediaUrl}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', marginTop: '0.5rem' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : field.validation_rules.mediaUrl.match(/\.(mp4|webm|ogg)$/i) ? (
              <video
                src={field.validation_rules.mediaUrl}
                controls
                style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', marginTop: '0.5rem' }}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor={`field-placeholder-${fieldIndex}`}>Placeholder</label>
        <input
          type="text"
          id={`field-placeholder-${fieldIndex}`}
          name={`field-placeholder-${fieldIndex}`}
          value={field.placeholder || ''}
          onChange={(e) => onUpdate({ placeholder: e.target.value })}
          placeholder="Placeholder text"
        />
      </div>

      <div className="form-group">
        <label htmlFor={`field-required-${fieldIndex}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            id={`field-required-${fieldIndex}`}
            name={`field-required-${fieldIndex}`}
            checked={field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
          />
          Required field
        </label>
      </div>

      {/* Advanced Validation Rules */}
      {field.field_type !== 'section' && (
        <div className="card" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
            Advanced Validation
          </h3>

          {/* Text/Email/Textarea: Min/Max Length */}
          {['text', 'textarea', 'email', 'phone', 'url'].includes(field.field_type) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label htmlFor={`field-${fieldIndex}-min-length`}>Min Length</label>
                <input
                  type="number"
                  id={`field-${fieldIndex}-min-length`}
                  name={`field-${fieldIndex}-min-length`}
                  min="0"
                  value={field.validation_rules?.minLength || ''}
                  onChange={(e) =>
                    onUpdate({
                      validation_rules: {
                        ...field.validation_rules,
                        minLength: e.target.value ? parseInt(e.target.value) : undefined,
                      },
                    })
                  }
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`field-${fieldIndex}-max-length`}>Max Length</label>
                <input
                  type="number"
                  id={`field-${fieldIndex}-max-length`}
                  name={`field-${fieldIndex}-max-length`}
                  min="1"
                  value={field.validation_rules?.maxLength || ''}
                  onChange={(e) =>
                    onUpdate({
                      validation_rules: {
                        ...field.validation_rules,
                        maxLength: e.target.value ? parseInt(e.target.value) : undefined,
                      },
                    })
                  }
                  placeholder="Unlimited"
                />
              </div>
            </div>
          )}

          {/* Number: Min/Max Value */}
          {field.field_type === 'number' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label htmlFor={`field-${fieldIndex}-min-value`}>Min Value</label>
                <input
                  type="number"
                  id={`field-${fieldIndex}-min-value`}
                  name={`field-${fieldIndex}-min-value`}
                  value={field.validation_rules?.min || ''}
                  onChange={(e) =>
                    onUpdate({
                      validation_rules: {
                        ...field.validation_rules,
                        min: e.target.value ? parseFloat(e.target.value) : undefined,
                      },
                    })
                  }
                  placeholder="No minimum"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`field-${fieldIndex}-max-value`}>Max Value</label>
                <input
                  type="number"
                  id={`field-${fieldIndex}-max-value`}
                  name={`field-${fieldIndex}-max-value`}
                  value={field.validation_rules?.max || ''}
                  onChange={(e) =>
                    onUpdate({
                      validation_rules: {
                        ...field.validation_rules,
                        max: e.target.value ? parseFloat(e.target.value) : undefined,
                      },
                    })
                  }
                  placeholder="No maximum"
                />
              </div>
            </div>
          )}

          {/* Pattern/Regex Validation */}
          {['text', 'textarea', 'email', 'phone', 'url'].includes(field.field_type) && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor={`field-${fieldIndex}-pattern`}>Pattern (Regex)</label>
              <input
                type="text"
                id={`field-${fieldIndex}-pattern`}
                name={`field-${fieldIndex}-pattern`}
                value={field.validation_rules?.pattern || ''}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      pattern: e.target.value || undefined,
                    },
                  })
                }
                placeholder="e.g., ^[A-Za-z]+$ (letters only)"
                style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Regular expression pattern for validation
              </p>
            </div>
          )}

          {/* Custom Error Messages */}
          <div className="form-group">
            <label htmlFor={`field-${fieldIndex}-error-message`}>Custom Error Message</label>
            <input
              type="text"
              id={`field-${fieldIndex}-error-message`}
              name={`field-${fieldIndex}-error-message`}
              value={field.validation_rules?.errorMessage || ''}
              onChange={(e) =>
                onUpdate({
                  validation_rules: {
                    ...field.validation_rules,
                    errorMessage: e.target.value || undefined,
                  },
                })
              }
              placeholder="Custom error message (optional)"
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Override default validation error message
            </p>
          </div>
        </div>
      )}

      {needsOptions && (
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: '500' }}>Options</span>
            <button
              type="button"
              onClick={onAddOption}
              className="btn-outline"
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
            >
              + Add Option
            </button>
          </div>
          {field.options?.map((option, optIndex) => {
            const optionLabelId = `field-${fieldIndex}-option-${optIndex}-label`;
            const optionValueId = `field-${fieldIndex}-option-${optIndex}-value`;
            return (
              <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <label htmlFor={optionLabelId} style={{ display: 'none' }}>
                  Option {optIndex + 1} Label
                </label>
                <input
                  type="text"
                  id={optionLabelId}
                  name={optionLabelId}
                  value={option.label || ''}
                  onChange={(e) => onUpdateOption(optIndex, { label: e.target.value })}
                  placeholder="Option label"
                  style={{ flex: 1 }}
                />
                <label htmlFor={optionValueId} style={{ display: 'none' }}>
                  Option {optIndex + 1} Value
                </label>
                <input
                  type="text"
                  id={optionValueId}
                  name={optionValueId}
                  value={option.value || ''}
                  onChange={(e) => onUpdateOption(optIndex, { value: e.target.value })}
                  placeholder="Option value"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => onRemoveOption(optIndex)}
                  className="btn-danger"
                  style={{ padding: '0.25rem 0.5rem' }}
                >
                  <FaTimes />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Validation Rules for Rating and Opinion Scale */}
      {(field.field_type === 'rating' || field.field_type === 'opinion_scale') && (
        <div className="form-group">
          <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Scale Range</span>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label
                htmlFor={`field-${fieldIndex}-min`}
                style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}
              >
                Min {field.field_type === 'rating' ? '(Stars)' : '(Number)'}
              </label>
              <input
                type="number"
                id={`field-${fieldIndex}-min`}
                name={`field-${fieldIndex}-min`}
                min="1"
                max={field.field_type === 'rating' ? '10' : '100'}
                value={field.validation_rules?.min || (field.field_type === 'rating' ? 1 : 1)}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      min: parseInt(e.target.value) || 1,
                    },
                  })
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                htmlFor={`field-${fieldIndex}-max`}
                style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}
              >
                Max {field.field_type === 'rating' ? '(Stars)' : '(Number)'}
              </label>
              <input
                type="number"
                id={`field-${fieldIndex}-max`}
                name={`field-${fieldIndex}-max`}
                min="1"
                max={field.field_type === 'rating' ? '10' : '100'}
                value={field.validation_rules?.max || (field.field_type === 'rating' ? 5 : 10)}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      max: parseInt(e.target.value) || (field.field_type === 'rating' ? 5 : 10),
                    },
                  })
                }
              />
            </div>
          </div>
          {field.field_type === 'opinion_scale' && (
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Use the Options section above to set labels for the scale endpoints
            </p>
          )}
        </div>
      )}

      {/* Matrix/Grid Configuration */}
      {field.field_type === 'matrix' && (
        <div className="form-group">
          <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Matrix Configuration</span>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Matrix questions allow users to rate multiple items. Use Options for rows (items to rate) and
            validation_rules.matrixColumns for columns (rating options).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                htmlFor={`field-${fieldIndex}-matrix-columns`}
                style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
              >
                Column Labels (Rating Options)
              </label>
              <input
                type="text"
                id={`field-${fieldIndex}-matrix-columns`}
                name={`field-${fieldIndex}-matrix-columns`}
                placeholder="Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree"
                value={field.validation_rules?.matrixColumns?.join(', ') || ''}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      matrixColumns: e.target.value.split(',').map((s) => s.trim()).filter((s) => s),
                    },
                  })
                }
                style={{ width: '100%', padding: '0.5rem' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Separate column labels with commas
              </p>
            </div>
            <div>
              <label
                htmlFor={`field-${fieldIndex}-matrix-type`}
                style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
              >
                Input Type
              </label>
              <select
                id={`field-${fieldIndex}-matrix-type`}
                value={field.validation_rules?.matrixType || 'radio'}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      matrixType: e.target.value,
                    },
                  })
                }
                style={{ width: '100%', padding: '0.5rem' }}
              >
                <option value="radio">Single Choice (Radio)</option>
                <option value="checkbox">Multiple Choice (Checkbox)</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Use the Options section above to set row labels (items to rate)
          </p>
        </div>
      )}

      {/* Payment Configuration */}
      {field.field_type === 'payment' && (
        <div className="form-group">
          <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Payment Configuration</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                htmlFor={`field-${fieldIndex}-payment-amount`}
                style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
              >
                Amount ($)
              </label>
              <input
                type="number"
                id={`field-${fieldIndex}-payment-amount`}
                name={`field-${fieldIndex}-payment-amount`}
                step="0.01"
                min="0.01"
                value={field.validation_rules?.paymentAmount || ''}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      paymentAmount: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                style={{ width: '100%', padding: '0.5rem' }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label
                htmlFor={`field-${fieldIndex}-payment-currency`}
                style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
              >
                Currency
              </label>
              <select
                id={`field-${fieldIndex}-payment-currency`}
                value={field.validation_rules?.paymentCurrency || 'usd'}
                onChange={(e) =>
                  onUpdate({
                    validation_rules: {
                      ...field.validation_rules,
                      paymentCurrency: e.target.value,
                    },
                  })
                }
                style={{ width: '100%', padding: '0.5rem' }}
              >
                <option value="usd">USD ($)</option>
                <option value="eur">EUR (€)</option>
                <option value="gbp">GBP (£)</option>
                <option value="cad">CAD ($)</option>
                <option value="aud">AUD ($)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Conditional Logic */}
      <div className="form-group">
        <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Conditional Logic</span>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
          Show this field only when certain conditions are met
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label
            htmlFor={`field-conditional-enabled-${fieldIndex}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
          >
            <input
              type="checkbox"
              id={`field-conditional-enabled-${fieldIndex}`}
              name={`field-conditional-enabled-${fieldIndex}`}
              checked={field.conditional_logic?.enabled || false}
              onChange={(e) =>
                onUpdate({
                  conditional_logic: {
                    ...field.conditional_logic,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            Enable conditional logic
          </label>

          {field.conditional_logic?.enabled && (
            <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label
                    htmlFor={`field-conditional-trigger-${fieldIndex}`}
                    style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
                  >
                    Show this field when:
                  </label>
                  <select
                    id={`field-conditional-trigger-${fieldIndex}`}
                    name={`field-conditional-trigger-${fieldIndex}`}
                    value={field.conditional_logic?.trigger_field_id || ''}
                    onChange={(e) =>
                      onUpdate({
                        conditional_logic: {
                          ...field.conditional_logic,
                          trigger_field_id: e.target.value,
                        },
                      })
                    }
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">Select a field...</option>
                    {formData.fields?.map((f, idx) => {
                      if (idx === fieldIndex) return null;
                      return (
                        <option key={f.id || idx} value={f.id || idx.toString()}>
                          {f.label || `Field ${idx + 1}`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {field.conditional_logic?.trigger_field_id && (
                  <>
                    <div>
                      <label
                        htmlFor={`field-conditional-condition-${fieldIndex}`}
                        style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
                      >
                        Condition:
                      </label>
                      <select
                        id={`field-conditional-condition-${fieldIndex}`}
                        name={`field-conditional-condition-${fieldIndex}`}
                        value={field.conditional_logic?.condition || 'equals'}
                        onChange={(e) =>
                          onUpdate({
                            conditional_logic: {
                              ...field.conditional_logic,
                              condition: e.target.value,
                            },
                          })
                        }
                        style={{ width: '100%', padding: '0.5rem' }}
                      >
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                        <option value="contains">Contains</option>
                        <option value="is_empty">Is Empty</option>
                        <option value="is_not_empty">Is Not Empty</option>
                      </select>
                    </div>

                    {field.conditional_logic?.condition &&
                      field.conditional_logic.condition !== 'is_empty' &&
                      field.conditional_logic.condition !== 'is_not_empty' && (
                        <div>
                          <label
                            htmlFor={`field-conditional-value-${fieldIndex}`}
                            style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}
                          >
                            Value:
                          </label>
                          <input
                            type="text"
                            id={`field-conditional-value-${fieldIndex}`}
                            name={`field-conditional-value-${fieldIndex}`}
                            value={field.conditional_logic?.value || ''}
                            onChange={(e) =>
                              onUpdate({
                                conditional_logic: {
                                  ...field.conditional_logic,
                                  value: e.target.value,
                                },
                              })
                            }
                            placeholder="Enter value to match"
                            style={{ width: '100%', padding: '0.5rem' }}
                          />
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

