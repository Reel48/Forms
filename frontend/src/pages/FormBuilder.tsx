import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DragEndEvent } from '@dnd-kit/core';
import { useFormBuilder } from '../hooks/useFormBuilder';
import { FieldList } from '../components/forms/FieldList';
import { FieldConfigPanel } from '../components/forms/FieldConfigPanel';
import { FormSettingsPanel } from '../components/forms/FormSettingsPanel';
import { FieldRenderer } from '../components/forms/FieldRenderer';
import { FIELD_TYPES } from '../lib/fieldRegistry';
import type { FormField } from '../api';

const FORM_TEMPLATES = [
  {
    name: 'Contact Form',
    description: 'Basic contact form with name, email, and message',
    fields: [
      { field_type: 'text', label: 'Name', required: true, placeholder: 'Enter your name', order_index: 0 },
      { field_type: 'email', label: 'Email', required: true, placeholder: 'Enter your email', order_index: 1 },
      { field_type: 'phone', label: 'Phone', required: false, placeholder: 'Enter your phone number', order_index: 2 },
      { field_type: 'textarea', label: 'Message', required: true, placeholder: 'Enter your message', order_index: 3 },
    ],
  },
  {
    name: 'Customer Feedback',
    description: 'Collect customer feedback with rating and comments',
    fields: [
      { field_type: 'text', label: 'Your Name', required: true, placeholder: 'Enter your name', order_index: 0 },
      { field_type: 'email', label: 'Email', required: true, placeholder: 'Enter your email', order_index: 1 },
      { field_type: 'rating', label: 'Overall Rating', required: true, validation_rules: { min: 1, max: 5 }, order_index: 2 },
      { field_type: 'textarea', label: 'Comments', required: false, placeholder: 'Tell us about your experience', order_index: 3 },
    ],
  },
  {
    name: 'Event Registration',
    description: 'Register for events with contact and preferences',
    fields: [
      { field_type: 'text', label: 'Full Name', required: true, placeholder: 'Enter your full name', order_index: 0 },
      { field_type: 'email', label: 'Email', required: true, placeholder: 'Enter your email', order_index: 1 },
      { field_type: 'phone', label: 'Phone', required: true, placeholder: 'Enter your phone number', order_index: 2 },
      { field_type: 'date', label: 'Event Date', required: true, order_index: 3 },
      { field_type: 'multiple_choice', label: 'Dietary Restrictions', required: false, options: [{ label: 'None', value: 'none' }, { label: 'Vegetarian', value: 'vegetarian' }, { label: 'Vegan', value: 'vegan' }, { label: 'Gluten-Free', value: 'gluten-free' }], order_index: 4 },
    ],
  },
  {
    name: 'Survey Form',
    description: 'General survey with multiple question types',
    fields: [
      { field_type: 'text', label: 'Name', required: true, placeholder: 'Enter your name', order_index: 0 },
      { field_type: 'multiple_choice', label: 'How did you hear about us?', required: true, options: [{ label: 'Social Media', value: 'social' }, { label: 'Search Engine', value: 'search' }, { label: 'Friend/Colleague', value: 'friend' }, { label: 'Other', value: 'other' }], order_index: 1 },
      { field_type: 'opinion_scale', label: 'How likely are you to recommend us?', required: true, validation_rules: { min: 1, max: 10 }, options: [{ label: 'Not Likely', value: 'low' }, { label: 'Very Likely', value: 'high' }], order_index: 2 },
      { field_type: 'textarea', label: 'Additional Comments', required: false, placeholder: 'Any other feedback?', order_index: 3 },
    ],
  },
  {
    name: 'Job Application',
    description: 'Job application form with resume upload',
    fields: [
      { field_type: 'text', label: 'Full Name', required: true, placeholder: 'Enter your full name', order_index: 0 },
      { field_type: 'email', label: 'Email', required: true, placeholder: 'Enter your email', order_index: 1 },
      { field_type: 'phone', label: 'Phone', required: true, placeholder: 'Enter your phone number', order_index: 2 },
      { field_type: 'url', label: 'LinkedIn Profile', required: false, placeholder: 'https://linkedin.com/in/yourprofile', order_index: 3 },
      { field_type: 'file_upload', label: 'Resume', required: true, order_index: 4 },
      { field_type: 'textarea', label: 'Cover Letter', required: false, placeholder: 'Tell us why you\'re interested', order_index: 5 },
    ],
  },
];

function FormBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [previewMode, setPreviewMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(!id);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const {
    formData,
    setFormData,
    loading,
    saving,
    error,
    selectedFieldIndex,
    setSelectedFieldIndex,
    addField,
    updateField,
    removeField,
    moveField,
    handleDragEnd: onDragEnd,
    addOption,
    updateOption,
    removeOption,
    saveForm,
  } = useFormBuilder({ formId: id });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const applyTemplate = (template: typeof FORM_TEMPLATES[0]) => {
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      fields: template.fields.map((field, index) => ({
        ...field,
        description: '',
        validation_rules: (field as any).validation_rules || {},
        options: (field as any).options || [],
        conditional_logic: {},
        order_index: index,
      })),
    });
    setShowTemplates(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = formData.fields?.findIndex((_, i) => i.toString() === active.id) ?? -1;
      const newIndex = formData.fields?.findIndex((_, i) => i.toString() === over.id) ?? -1;
      if (oldIndex !== -1 && newIndex !== -1) {
        onDragEnd(oldIndex, newIndex);
      }
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  const selectedField = selectedFieldIndex !== null ? formData.fields?.[selectedFieldIndex] : null;

  // Form Preview Component
  const FormPreview = () => {
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

    return (
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '2px solid #e5e7eb' }}>
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{formData.name || 'Form Preview'}</h1>
          {formData.description && (
            <p style={{ color: '#6b7280', margin: 0 }}>{formData.description}</p>
          )}
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          alert('Form preview - submission disabled');
        }}>
          {formData.fields && formData.fields.length > 0 ? (
            formData.fields.map((field, index) => {
              const fieldId = (field.id && field.id.trim()) ? field.id : `field-${index}`;
              const value = formValues[fieldId] || '';

              if (!evaluateConditionalLogic(field)) {
                return null;
              }

              return (
                <FieldRenderer
                  key={fieldId}
                  field={field}
                  fieldId={fieldId}
                  value={value}
                  onChange={handleFieldChange}
                  showMedia={true}
                />
              );
            })
          ) : (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
              No fields in this form yet.
            </p>
          )}

          {formData.fields && formData.fields.length > 0 && (
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" disabled>
                Submit (Preview Mode)
              </button>
            </div>
          )}
        </form>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>{id ? 'Edit Form' : 'Create New Form'}</h1>
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
          <button onClick={saveForm} className="btn-primary" disabled={saving || !formData.name.trim()}>
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
        <FormPreview />
      ) : showTemplates && !id ? (
        <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ marginTop: 0 }}>Choose a Template</h2>
            <p className="text-muted">Start with a pre-built template or create from scratch</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {FORM_TEMPLATES.map((template, index) => (
              <div
                key={index}
                className="card"
                style={{
                  border: '2px solid #e5e7eb',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={() => applyTemplate(template)}
              >
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.125rem' }}>{template.name}</h3>
                <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>{template.description}</p>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {template.fields.length} {template.fields.length === 1 ? 'field' : 'fields'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setShowTemplates(false)}
              className="btn-outline"
              style={{ padding: '0.75rem 2rem' }}
            >
              Start from Scratch
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr',
          gap: '2rem'
        }}>
          {/* Left Sidebar - Form Info & Field Types */}
          <div>
            <FormSettingsPanel formData={formData} onUpdate={(updates) => setFormData((prev) => ({ ...prev, ...updates }))} />

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

              <FieldList
                fields={formData.fields || []}
                selectedIndex={selectedFieldIndex}
                onSelect={setSelectedFieldIndex}
                onMove={moveField}
                onRemove={removeField}
                onDragEnd={handleDragEnd}
              />
            </div>

            {/* Field Editor */}
            {selectedField && (
              <FieldConfigPanel
                field={selectedField}
                fieldIndex={selectedFieldIndex!}
                formData={formData}
                onUpdate={(updates) => updateField(selectedFieldIndex!, updates)}
                onAddOption={() => addOption(selectedFieldIndex!)}
                onUpdateOption={(optionIndex, updates) => updateOption(selectedFieldIndex!, optionIndex, updates)}
                onRemoveOption={(optionIndex) => removeOption(selectedFieldIndex!, optionIndex)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FormBuilder;

