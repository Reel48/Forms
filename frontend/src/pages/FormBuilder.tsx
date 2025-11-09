import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formsAPI } from '../api';
import type { FormField, FormCreate } from '../api';

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'Website/URL' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'rating', label: 'Rating (Stars)' },
  { value: 'opinion_scale', label: 'Opinion Scale' },
];

function FormBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  
  const [formData, setFormData] = useState<FormCreate>({
    name: '',
    description: '',
    status: 'draft',
    fields: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (isEditMode && id) {
      loadForm(id);
    }
  }, [isEditMode, id]);

  const loadForm = async (formId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await formsAPI.getById(formId);
      const form = response.data;
      setFormData({
        name: form.name,
        description: form.description || '',
        status: form.status,
        fields: form.form_fields || [],
      });
    } catch (error: any) {
      console.error('Failed to load form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addField = (fieldType: string) => {
    const validationRules = fieldType === 'rating' 
      ? { min: 1, max: 5 }
      : fieldType === 'opinion_scale'
      ? { min: 1, max: 10 }
      : {};
    
    const newField: FormField = {
      field_type: fieldType,
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: validationRules,
      options: fieldType === 'dropdown' || fieldType === 'multiple_choice' || fieldType === 'checkbox' 
        ? [{ label: '', value: '' }] 
        : fieldType === 'rating'
        ? []
        : fieldType === 'opinion_scale'
        ? [{ label: 'Low', value: 'low' }, { label: 'High', value: 'high' }]
        : [],
      order_index: formData.fields?.length || 0,
      conditional_logic: {},
    };
    
    setFormData({
      ...formData,
      fields: [...(formData.fields || []), newField],
    });
    setSelectedFieldIndex((formData.fields?.length || 0));
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const updatedFields = [...(formData.fields || [])];
    updatedFields[index] = { ...updatedFields[index], ...updates };
    setFormData({ ...formData, fields: updatedFields });
  };

  const removeField = (index: number) => {
    if (!window.confirm('Are you sure you want to remove this field?')) {
      return;
    }
    const updatedFields = formData.fields?.filter((_, i) => i !== index) || [];
    // Reorder remaining fields
    updatedFields.forEach((field, i) => {
      field.order_index = i;
    });
    setFormData({ ...formData, fields: updatedFields });
    if (selectedFieldIndex === index) {
      setSelectedFieldIndex(null);
    } else if (selectedFieldIndex !== null && selectedFieldIndex > index) {
      setSelectedFieldIndex(selectedFieldIndex - 1);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = formData.fields?.findIndex((_, i) => i.toString() === active.id) ?? -1;
      const newIndex = formData.fields?.findIndex((_, i) => i.toString() === over.id) ?? -1;
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const fields = arrayMove(formData.fields || [], oldIndex, newIndex);
        // Update order_index for all fields
        fields.forEach((field, index) => {
          field.order_index = index;
        });
        setFormData({ ...formData, fields });
        setSelectedFieldIndex(newIndex);
      }
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const fields = [...(formData.fields || [])];
    if (direction === 'up' && index > 0) {
      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
      fields[index - 1].order_index = index - 1;
      fields[index].order_index = index;
    } else if (direction === 'down' && index < fields.length - 1) {
      [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
      fields[index].order_index = index;
      fields[index + 1].order_index = index + 1;
    }
    setFormData({ ...formData, fields });
    setSelectedFieldIndex(index + (direction === 'down' ? 1 : -1));
  };

  const addOption = (fieldIndex: number) => {
    const field = formData.fields?.[fieldIndex];
    if (field) {
      const options = [...(field.options || [])];
      options.push({ label: '', value: '' });
      updateField(fieldIndex, { options });
    }
  };

  const updateOption = (fieldIndex: number, optionIndex: number, updates: { label?: string; value?: string }) => {
    const field = formData.fields?.[fieldIndex];
    if (field) {
      const options = [...(field.options || [])];
      options[optionIndex] = { ...options[optionIndex], ...updates };
      updateField(fieldIndex, { options });
    }
  };

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const field = formData.fields?.[fieldIndex];
    if (field) {
      const options = field.options?.filter((_, i) => i !== optionIndex) || [];
      updateField(fieldIndex, { options });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Form name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && id) {
        // Update form
        await formsAPI.update(id, {
          name: formData.name,
          description: formData.description,
          status: formData.status,
        });
        
        // Sync fields - get current form to see existing fields
        const currentForm = await formsAPI.getById(id);
        const existingFields = currentForm.data.form_fields || [];
        const currentFields = formData.fields || [];
        
        // Delete fields that are no longer in the form
        for (const existingField of existingFields) {
          if (!currentFields.find(f => f.id === existingField.id)) {
            if (existingField.id) {
              await formsAPI.deleteField(id, existingField.id);
            }
          }
        }
        
        // Create or update fields
        for (let i = 0; i < currentFields.length; i++) {
          const field = currentFields[i];
          field.order_index = i;
          
          if (field.id) {
            // Update existing field
            await formsAPI.updateField(id, field.id, field);
          } else {
            // Create new field
            await formsAPI.createField(id, field);
          }
        }
        
        navigate('/forms');
      } else {
        // Create new form with fields
        await formsAPI.create(formData);
        navigate('/forms');
      }
    } catch (error: any) {
      console.error('Failed to save form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to save form. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  const selectedField = selectedFieldIndex !== null ? formData.fields?.[selectedFieldIndex] : null;
  const needsOptions = selectedField && ['dropdown', 'multiple_choice', 'checkbox', 'opinion_scale'].includes(selectedField.field_type);

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>{isEditMode ? 'Edit Form' : 'Create New Form'}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className={previewMode ? 'btn-primary' : 'btn-outline'}
          >
            {previewMode ? 'Exit Preview' : 'Preview'}
          </button>
          <button onClick={() => navigate('/forms')} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || !formData.name.trim()}>
            {saving ? 'Saving...' : 'Save Form'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', padding: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
        </div>
      )}

      {previewMode ? (
        <FormPreview form={formData} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        {/* Left Sidebar - Form Info & Field Types */}
        <div>
          {/* Form Basic Info */}
          <div className="card mb-4">
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Form Details</h2>
            <div className="form-group">
              <label htmlFor="form-name">Form Name *</label>
              <input
                id="form-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter form name"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="form-description">Description</label>
              <textarea
                id="form-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter form description"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label htmlFor="form-status">Status</label>
              <select
                id="form-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Field Types */}
          <div className="card">
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Add Field</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {FIELD_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => addField(type.value)}
                  className="btn-outline"
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content - Fields List */}
        <div>
          <div className="card mb-4">
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>
              Fields ({formData.fields?.length || 0})
            </h2>
            
            {formData.fields && formData.fields.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                <p>No fields yet. Add a field from the sidebar to get started.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={formData.fields?.map((_, i) => i.toString()) || []}
                  strategy={verticalListSortingStrategy}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {formData.fields?.map((field, index) => (
                      <SortableFieldItem
                        key={index}
                        id={index.toString()}
                        field={field}
                        index={index}
                        isSelected={selectedFieldIndex === index}
                        onSelect={() => setSelectedFieldIndex(index)}
                        onMove={moveField}
                        onRemove={removeField}
                        fieldTypes={FIELD_TYPES}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Field Editor */}
          {selectedField && (
            <div className="card">
              <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Edit Field</h2>
              
              <div className="form-group">
                <label>Field Type</label>
                <select
                  value={selectedField.field_type}
                  onChange={(e) => updateField(selectedFieldIndex!, { field_type: e.target.value, options: e.target.value === 'dropdown' || e.target.value === 'multiple_choice' || e.target.value === 'checkbox' ? [{ label: '', value: '' }] : [] })}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Label *</label>
                <input
                  type="text"
                  value={selectedField.label}
                  onChange={(e) => updateField(selectedFieldIndex!, { label: e.target.value })}
                  placeholder="Field label"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={selectedField.description || ''}
                  onChange={(e) => updateField(selectedFieldIndex!, { description: e.target.value })}
                  placeholder="Help text for this field"
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Placeholder</label>
                <input
                  type="text"
                  value={selectedField.placeholder || ''}
                  onChange={(e) => updateField(selectedFieldIndex!, { placeholder: e.target.value })}
                  placeholder="Placeholder text"
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedField.required}
                    onChange={(e) => updateField(selectedFieldIndex!, { required: e.target.checked })}
                  />
                  Required field
                </label>
              </div>

              {needsOptions && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label>Options</label>
                    <button
                      type="button"
                      onClick={() => addOption(selectedFieldIndex!)}
                      className="btn-outline"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                    >
                      + Add Option
                    </button>
                  </div>
                  {selectedField.options?.map((option, optIndex) => (
                    <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={option.label || ''}
                        onChange={(e) => updateOption(selectedFieldIndex!, optIndex, { label: e.target.value })}
                        placeholder="Option label"
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        value={option.value || ''}
                        onChange={(e) => updateOption(selectedFieldIndex!, optIndex, { value: e.target.value })}
                        placeholder="Option value"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(selectedFieldIndex!, optIndex)}
                        className="btn-danger"
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Validation Rules for Rating and Opinion Scale */}
              {(selectedField.field_type === 'rating' || selectedField.field_type === 'opinion_scale') && (
                <div className="form-group">
                  <label>Scale Range</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        Min {selectedField.field_type === 'rating' ? '(Stars)' : '(Number)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedField.field_type === 'rating' ? '10' : '100'}
                        value={selectedField.validation_rules?.min || (selectedField.field_type === 'rating' ? 1 : 1)}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            min: parseInt(e.target.value) || 1,
                          },
                        })}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        Max {selectedField.field_type === 'rating' ? '(Stars)' : '(Number)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedField.field_type === 'rating' ? '10' : '100'}
                        value={selectedField.validation_rules?.max || (selectedField.field_type === 'rating' ? 5 : 10)}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            max: parseInt(e.target.value) || (selectedField.field_type === 'rating' ? 5 : 10),
                          },
                        })}
                      />
                    </div>
                  </div>
                  {selectedField.field_type === 'opinion_scale' && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      Use the Options section above to set labels for the scale endpoints
                    </p>
                  )}
                </div>
              )}

              {/* Conditional Logic */}
              <div className="form-group">
                <label>Conditional Logic</label>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Show this field only when certain conditions are met
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedField.conditional_logic?.enabled || false}
                      onChange={(e) => updateField(selectedFieldIndex!, {
                        conditional_logic: {
                          ...selectedField.conditional_logic,
                          enabled: e.target.checked,
                        },
                      })}
                    />
                    Enable conditional logic
                  </label>
                  
                  {selectedField.conditional_logic?.enabled && (
                    <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                            Show this field when:
                          </label>
                          <select
                            value={selectedField.conditional_logic?.trigger_field_id || ''}
                            onChange={(e) => updateField(selectedFieldIndex!, {
                              conditional_logic: {
                                ...selectedField.conditional_logic,
                                trigger_field_id: e.target.value,
                              },
                            })}
                            style={{ width: '100%', padding: '0.5rem' }}
                          >
                            <option value="">Select a field...</option>
                            {formData.fields?.map((f, idx) => {
                              if (idx === selectedFieldIndex) return null;
                              return (
                                <option key={f.id || idx} value={f.id || idx.toString()}>
                                  {f.label || `Field ${idx + 1}`}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        
                        {selectedField.conditional_logic?.trigger_field_id && (
                          <>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                                Condition:
                              </label>
                              <select
                                value={selectedField.conditional_logic?.condition || 'equals'}
                                onChange={(e) => updateField(selectedFieldIndex!, {
                                  conditional_logic: {
                                    ...selectedField.conditional_logic,
                                    condition: e.target.value,
                                  },
                                })}
                                style={{ width: '100%', padding: '0.5rem' }}
                              >
                                <option value="equals">Equals</option>
                                <option value="not_equals">Not Equals</option>
                                <option value="contains">Contains</option>
                                <option value="is_empty">Is Empty</option>
                                <option value="is_not_empty">Is Not Empty</option>
                              </select>
                            </div>
                            
                            {selectedField.conditional_logic?.condition && 
                             selectedField.conditional_logic.condition !== 'is_empty' && 
                             selectedField.conditional_logic.condition !== 'is_not_empty' && (
                              <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                                  Value:
                                </label>
                                <input
                                  type="text"
                                  value={selectedField.conditional_logic?.value || ''}
                                  onChange={(e) => updateField(selectedFieldIndex!, {
                                    conditional_logic: {
                                      ...selectedField.conditional_logic,
                                      value: e.target.value,
                                    },
                                  })}
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
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// Form Preview Component
interface FormPreviewProps {
  form: FormCreate;
}

function FormPreview({ form }: FormPreviewProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormValues({ ...formValues, [fieldId]: value });
  };

  const evaluateConditionalLogic = (field: FormField): boolean => {
    if (!field.conditional_logic || !field.conditional_logic.enabled) {
      return true;
    }

    const triggerFieldId = field.conditional_logic.trigger_field_id;
    if (!triggerFieldId) {
      return true;
    }

    const triggerValue = formValues[triggerFieldId];
    const condition = field.conditional_logic.condition || 'equals';
    const expectedValue = field.conditional_logic.value;

    switch (condition) {
      case 'equals':
        return triggerValue === expectedValue || triggerValue === expectedValue?.toString();
      case 'not_equals':
        return triggerValue !== expectedValue && triggerValue !== expectedValue?.toString();
      case 'contains':
        const triggerStr = String(triggerValue || '');
        const expectedStr = String(expectedValue || '');
        return triggerStr.toLowerCase().includes(expectedStr.toLowerCase());
      case 'is_empty':
        return !triggerValue || triggerValue === '' || (Array.isArray(triggerValue) && triggerValue.length === 0);
      case 'is_not_empty':
        return triggerValue !== undefined && triggerValue !== null && triggerValue !== '' && !(Array.isArray(triggerValue) && triggerValue.length === 0);
      default:
        return true;
    }
  };

  const renderField = (field: FormField, index: number) => {
    const fieldId = field.id || `field-${index}`;
    const value = formValues[fieldId] || '';

    // Check conditional logic
    if (!evaluateConditionalLogic(field)) {
      return null;
    }

    switch (field.field_type) {
      case 'text':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <textarea
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
            />
          </div>
        );

      case 'email':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="email"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'number':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'phone':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="tel"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'url':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="url"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder || 'https://example.com'}
              required={field.required}
            />
          </div>
        );

      case 'date':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="date"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'time':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="time"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            />
          </div>
        );

      case 'rating':
        const maxRating = field.validation_rules?.max || 5;
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleFieldChange(fieldId, star)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '2rem',
                    cursor: 'pointer',
                    color: star <= (value || 0) ? '#fbbf24' : '#d1d5db',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  title={`${star} star${star > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
              {value && (
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  ({value} / {maxRating})
                </span>
              )}
            </div>
            {field.required && !value && (
              <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0.25rem 0 0 0' }}>
                Please select a rating
              </p>
            )}
          </div>
        );

      case 'opinion_scale':
        const scaleMin = field.validation_rules?.min || 1;
        const scaleMax = field.validation_rules?.max || 10;
        const scaleLabels = field.options || [];
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                {scaleLabels[0] && (
                  <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '100px', textAlign: 'left' }}>
                    {scaleLabels[0].label || scaleLabels[0].value}
                  </span>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flex: 1, justifyContent: 'center' }}>
                  {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i).map((num) => (
                    <label
                      key={num}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={fieldId}
                        value={num}
                        checked={value === num.toString()}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        required={field.required}
                        style={{ margin: 0 }}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{num}</span>
                    </label>
                  ))}
                </div>
                {scaleLabels[1] && (
                  <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '100px', textAlign: 'right' }}>
                    {scaleLabels[1].label || scaleLabels[1].value}
                  </span>
                )}
              </div>
            </div>
          </div>
        );

      case 'dropdown':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <select
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
            >
              <option value="">Select an option...</option>
              {field.options?.map((option: any, optIndex: number) => (
                <option key={optIndex} value={option.value || option.label}>
                  {option.label || option.value}
                </option>
              ))}
            </select>
          </div>
        );

      case 'multiple_choice':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {field.options?.map((option: any, optIndex: number) => (
                <label key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    name={fieldId}
                    value={option.value || option.label}
                    checked={value === (option.value || option.label)}
                    onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                    required={field.required}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {field.options?.map((option: any, optIndex: number) => (
                <label key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    value={option.value || option.label}
                    checked={(formValues[fieldId] || []).includes(option.value || option.label)}
                    onChange={(e) => {
                      const currentValues = formValues[fieldId] || [];
                      const newValues = e.target.checked
                        ? [...currentValues, option.value || option.label]
                        : currentValues.filter((v: any) => v !== (option.value || option.label));
                      handleFieldChange(fieldId, newValues);
                    }}
                  />
                  <span>{option.label || option.value}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'yes_no':
        return (
          <div key={fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name={fieldId}
                  value="yes"
                  checked={value === 'yes'}
                  onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                  required={field.required}
                />
                <span>Yes</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name={fieldId}
                  value="no"
                  checked={value === 'no'}
                  onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                  required={field.required}
                />
                <span>No</span>
              </label>
            </div>
          </div>
        );

      default:
        return (
          <div key={fieldId} className="form-group">
            <label>{field.label}</label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        );
    }
  };

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '2px solid #e5e7eb' }}>
        <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{form.name || 'Form Preview'}</h1>
        {form.description && (
          <p style={{ color: '#6b7280', margin: 0 }}>{form.description}</p>
        )}
      </div>

      <form onSubmit={(e) => {
        e.preventDefault();
        alert('Form preview - submission disabled');
      }}>
        {form.fields && form.fields.length > 0 ? (
          form.fields.map((field, index) => renderField(field, index))
        ) : (
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
            No fields in this form yet.
          </p>
        )}

        {form.fields && form.fields.length > 0 && (
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled>
              Submit (Preview Mode)
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

// Sortable Field Item Component
interface SortableFieldItemProps {
  id: string;
  field: FormField;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onRemove: (index: number) => void;
  fieldTypes: Array<{ value: string; label: string }>;
}

function SortableFieldItem({
  id,
  field,
  index,
  isSelected,
  onSelect,
  onMove,
  onRemove,
  fieldTypes,
}: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
    cursor: 'pointer',
    backgroundColor: isDragging ? '#f3f4f6' : 'white',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="card"
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              color: '#6b7280',
              fontSize: '1.25rem',
            }}
            title="Drag to reorder"
          >
            ⋮⋮
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="badge badge-draft" style={{ fontSize: '0.75rem' }}>
                {fieldTypes.find(t => t.value === field.field_type)?.label || field.field_type}
              </span>
              {field.required && (
                <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>*</span>
              )}
            </div>
            <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>
              {field.label || 'Untitled Field'}
            </h3>
            {field.description && (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                {field.description}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'up');
            }}
            disabled={index === 0}
            className="btn-outline"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'down');
            }}
            disabled={false}
            className="btn-outline"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            className="btn-danger"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Delete field"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export default FormBuilder;
