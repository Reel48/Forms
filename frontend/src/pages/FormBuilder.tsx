import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formsAPI } from '../api';
import type { FormField, FormCreate } from '../api';

const FIELD_TYPES = [
  { value: 'section', label: 'Section Divider' },
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'Website/URL' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'date_range', label: 'Date Range' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'rating', label: 'Rating (Stars)' },
  { value: 'opinion_scale', label: 'Opinion Scale' },
  { value: 'matrix', label: 'Matrix/Grid' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'payment', label: 'Payment' },
  { value: 'file_upload', label: 'File Upload' },
];

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
  const isEditMode = Boolean(id);
  
  const [formData, setFormData] = useState<FormCreate>({
    name: '',
    description: '',
    status: 'draft',
    fields: [],
    theme: {
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      fontFamily: 'Inter, system-ui, sans-serif',
      logoUrl: '',
      backgroundType: 'gradient', // 'gradient' or 'solid'
      backgroundColor: '#667eea',
    },
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(!isEditMode);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        fields: form.fields || [],
        theme: form.theme || {
          primaryColor: '#667eea',
          secondaryColor: '#764ba2',
          fontFamily: 'Inter, system-ui, sans-serif',
          logoUrl: '',
          backgroundType: 'gradient',
          backgroundColor: '#667eea',
        },
      });
    } catch (error: any) {
      console.error('Failed to load form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

  const addField = (fieldType: string) => {
    const validationRules = fieldType === 'rating' 
      ? { min: 1, max: 5 }
      : fieldType === 'opinion_scale'
      ? { min: 1, max: 10 }
      : {};
    
    const newField: FormField = {
      field_type: fieldType,
      label: fieldType === 'section' ? 'Section Title' : '',
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
          theme: formData.theme,
        });
        
        // Sync fields - get current form to see existing fields
        const currentForm = await formsAPI.getById(id);
        const existingFields = currentForm.data.fields || [];
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
        console.log('Creating form with data:', formData);
        console.log('Fields to save:', formData.fields);
        console.log('Fields count:', formData.fields?.length || 0);
        
        // Ensure fields array is included
        const payload: FormCreate = {
          name: formData.name,
          description: formData.description,
          status: formData.status,
          fields: formData.fields || [],
          theme: formData.theme,
        };
        
        console.log('Payload being sent:', payload);
        console.log('Payload fields count:', payload.fields?.length || 0);
        
        const response = await formsAPI.create(payload);
        console.log('Form created, response:', response.data);
        console.log('Response fields count:', response.data.fields?.length || 0);
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
      ) : showTemplates && !isEditMode ? (
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

            {/* Form Scheduling */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Schedule Publishing</h3>
              
              <div className="form-group">
                <label htmlFor="publish-date-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="publish-date-checkbox"
                    name="publish-date-checkbox"
                    checked={!!formData.settings?.publish_date}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.publish_date = new Date().toISOString().split('T')[0];
                      } else {
                        delete settings.publish_date;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Schedule Publish Date
                </label>
                {formData.settings?.publish_date && (
                  <input
                    id="publish-date"
                    type="datetime-local"
                    value={formData.settings.publish_date ? new Date(formData.settings.publish_date).toISOString().slice(0, 16) : ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      settings.publish_date = e.target.value ? new Date(e.target.value).toISOString() : null;
                      setFormData({ ...formData, settings });
                    }}
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Form will automatically become published at this date/time
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="unpublish-date-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="unpublish-date-checkbox"
                    name="unpublish-date-checkbox"
                    checked={!!formData.settings?.unpublish_date}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.unpublish_date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      } else {
                        delete settings.unpublish_date;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Schedule Unpublish Date
                </label>
                {formData.settings?.unpublish_date && (
                  <input
                    id="unpublish-date"
                    type="datetime-local"
                    value={formData.settings.unpublish_date ? new Date(formData.settings.unpublish_date).toISOString().slice(0, 16) : ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      settings.unpublish_date = e.target.value ? new Date(e.target.value).toISOString() : null;
                      setFormData({ ...formData, settings });
                    }}
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Form will automatically be archived at this date/time
                </p>
              </div>

              {/* Form Expiration */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="expiration-date-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="expiration-date-checkbox"
                    name="expiration-date-checkbox"
                    checked={!!formData.settings?.expiration_date}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.expiration_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      } else {
                        delete settings.expiration_date;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Form Expiration Date
                </label>
                {formData.settings?.expiration_date && (
                  <input
                    id="expiration-date"
                    type="date"
                    value={formData.settings.expiration_date ? new Date(formData.settings.expiration_date).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      settings.expiration_date = e.target.value ? new Date(e.target.value).toISOString() : null;
                      setFormData({ ...formData, settings });
                    }}
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Form will stop accepting submissions after this date
                </p>
              </div>

              {/* Response Limits */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="max-submissions-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="max-submissions-checkbox"
                    name="max-submissions-checkbox"
                    checked={!!formData.settings?.max_submissions}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.max_submissions = 100;
                      } else {
                        delete settings.max_submissions;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Maximum Submissions
                </label>
                {formData.settings?.max_submissions !== undefined && (
                  <input
                    id="max-submissions"
                    type="number"
                    min="1"
                    value={formData.settings.max_submissions || ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      const value = parseInt(e.target.value);
                      if (value > 0) {
                        settings.max_submissions = value;
                      } else {
                        delete settings.max_submissions;
                      }
                      setFormData({ ...formData, settings });
                    }}
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Stop accepting submissions after reaching this limit
                </p>
              </div>

              {/* Password Protection */}
              <div className="form-group">
                <label htmlFor="form-password-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="form-password-checkbox"
                    name="form-password-checkbox"
                    checked={!!formData.settings?.password}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.password = '';
                      } else {
                        delete settings.password;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Password Protection
                </label>
                {formData.settings?.password !== undefined && (
                  <input
                    id="form-password"
                    type="password"
                    value={formData.settings.password || ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      settings.password = e.target.value;
                      setFormData({ ...formData, settings });
                    }}
                    placeholder="Enter password to protect this form"
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Require a password to access this form
                </p>
              </div>

              {/* CAPTCHA Protection */}
              <div className="form-group">
                <label htmlFor="form-captcha" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="form-captcha"
                    checked={!!formData.settings?.captcha_enabled}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.captcha_enabled = true;
                        settings.captcha_site_key = '';
                      } else {
                        delete settings.captcha_enabled;
                        delete settings.captcha_site_key;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  CAPTCHA Protection
                </label>
                {formData.settings?.captcha_enabled && (
                  <input
                    type="text"
                    value={formData.settings.captcha_site_key || ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      settings.captcha_site_key = e.target.value;
                      setFormData({ ...formData, settings });
                    }}
                    placeholder="reCAPTCHA Site Key (from Google)"
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Require CAPTCHA verification before submission. Get your keys from <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer">Google reCAPTCHA</a>
                </p>
              </div>

              {/* Rate Limiting */}
              <div className="form-group">
                <label htmlFor="rate-limit" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="rate-limit"
                    checked={formData.settings?.rate_limit_per_hour !== undefined}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.rate_limit_per_hour = 10;
                      } else {
                        delete settings.rate_limit_per_hour;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Rate Limiting (per IP)
                </label>
                {formData.settings?.rate_limit_per_hour !== undefined && (
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.settings.rate_limit_per_hour || 10}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      const value = parseInt(e.target.value);
                      if (value > 0) {
                        settings.rate_limit_per_hour = value;
                      } else {
                        delete settings.rate_limit_per_hour;
                      }
                      setFormData({ ...formData, settings });
                    }}
                    style={{ marginTop: '0.5rem', width: '150px' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Maximum submissions per IP address per hour (default: 10)
                </p>
              </div>

              {/* Slack/Teams Notifications */}
              <div className="form-group">
                <label htmlFor="slack-webhook" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="slack-webhook"
                    checked={!!formData.settings?.slack_webhook_url}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      if (e.target.checked) {
                        settings.slack_webhook_url = '';
                      } else {
                        delete settings.slack_webhook_url;
                      }
                      setFormData({ ...formData, settings });
                    }}
                  />
                  Slack/Teams Notifications
                </label>
                {formData.settings?.slack_webhook_url !== undefined && (
                  <input
                    type="url"
                    value={formData.settings.slack_webhook_url || ''}
                    onChange={(e) => {
                      const settings = formData.settings || {};
                      settings.slack_webhook_url = e.target.value;
                      setFormData({ ...formData, settings });
                    }}
                    placeholder="https://hooks.slack.com/services/..."
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Get notified in Slack/Teams when forms are submitted. <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer">Get webhook URL</a>
                </p>
              </div>
            </div>
          </div>

          {/* Theme Customization */}
          <div className="card mb-4">
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Theme & Branding</h2>
            
            <div className="form-group">
              <label htmlFor="theme-primary-color">Primary Color</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  id="theme-primary-color"
                  value={formData.theme?.primaryColor || '#667eea'}
                  onChange={(e) => setFormData({
                    ...formData,
                    theme: { ...formData.theme, primaryColor: e.target.value },
                  })}
                  style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={formData.theme?.primaryColor || '#667eea'}
                  onChange={(e) => setFormData({
                    ...formData,
                    theme: { ...formData.theme, primaryColor: e.target.value },
                  })}
                  placeholder="#667eea"
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="theme-secondary-color">Secondary Color</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  id="theme-secondary-color"
                  value={formData.theme?.secondaryColor || '#764ba2'}
                  onChange={(e) => setFormData({
                    ...formData,
                    theme: { ...formData.theme, secondaryColor: e.target.value },
                  })}
                  style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={formData.theme?.secondaryColor || '#764ba2'}
                  onChange={(e) => setFormData({
                    ...formData,
                    theme: { ...formData.theme, secondaryColor: e.target.value },
                  })}
                  placeholder="#764ba2"
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="theme-background-type">Background Type</label>
              <select
                id="theme-background-type"
                value={formData.theme?.backgroundType || 'gradient'}
                onChange={(e) => setFormData({
                  ...formData,
                  theme: { ...formData.theme, backgroundType: e.target.value },
                })}
              >
                <option value="gradient">Gradient</option>
                <option value="solid">Solid Color</option>
              </select>
            </div>

            {formData.theme?.backgroundType === 'solid' && (
              <div className="form-group">
                <label htmlFor="theme-background-color">Background Color</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    id="theme-background-color"
                    value={formData.theme?.backgroundColor || '#667eea'}
                    onChange={(e) => setFormData({
                      ...formData,
                      theme: { ...formData.theme, backgroundColor: e.target.value },
                    })}
                    style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={formData.theme?.backgroundColor || '#667eea'}
                    onChange={(e) => setFormData({
                      ...formData,
                      theme: { ...formData.theme, backgroundColor: e.target.value },
                    })}
                    placeholder="#667eea"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="theme-font-family">Font Family</label>
              <select
                id="theme-font-family"
                value={formData.theme?.fontFamily || 'Inter, system-ui, sans-serif'}
                onChange={(e) => setFormData({
                  ...formData,
                  theme: { ...formData.theme, fontFamily: e.target.value },
                })}
              >
                <option value="Inter, system-ui, sans-serif">Inter</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Open Sans', sans-serif">Open Sans</option>
                <option value="'Lato', sans-serif">Lato</option>
                <option value="'Montserrat', sans-serif">Montserrat</option>
                <option value="'Poppins', sans-serif">Poppins</option>
                <option value="'Playfair Display', serif">Playfair Display</option>
                <option value="'Merriweather', serif">Merriweather</option>
                <option value="system-ui, sans-serif">System Default</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="theme-logo-url">Logo URL (optional)</label>
              <input
                type="url"
                id="theme-logo-url"
                value={formData.theme?.logoUrl || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  theme: { ...formData.theme, logoUrl: e.target.value },
                })}
                placeholder="https://example.com/logo.png"
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Enter a URL to your logo image. It will appear at the top of your form.
              </p>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ marginTop: 0, marginBottom: 0 }}>
                  {selectedField.field_type === 'section' ? 'Edit Section' : 'Edit Field'}
                </h2>
                {selectedField.field_type !== 'section' && selectedField.label && (
                  <button
                    onClick={async () => {
                      const name = prompt('Enter a name for this field template:');
                      if (!name || !name.trim()) return;
                      try {
                        await formsAPI.saveFieldToLibrary({
                          name: name.trim(),
                          field_type: selectedField.field_type,
                          label: selectedField.label,
                          description: selectedField.description,
                          placeholder: selectedField.placeholder,
                          required: selectedField.required,
                          validation_rules: selectedField.validation_rules,
                          options: selectedField.options,
                          conditional_logic: selectedField.conditional_logic,
                        });
                        alert('Field saved to library!');
                      } catch (error: any) {
                        console.error('Failed to save field:', error);
                        alert(error?.response?.data?.detail || 'Failed to save field to library');
                      }
                    }}
                    className="btn-outline"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    Save to Library
                  </button>
                )}
              </div>
              
              {selectedField.field_type !== 'section' && (
                <div className="form-group">
                  <label htmlFor={`field-type-${selectedFieldIndex}`}>Field Type</label>
                  <select
                    id={`field-type-${selectedFieldIndex}`}
                    name={`field-type-${selectedFieldIndex}`}
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
              )}

              <div className="form-group">
                <label htmlFor={`field-label-${selectedFieldIndex}`}>
                  {selectedField.field_type === 'section' ? 'Section Title *' : 'Label *'}
                </label>
                <input
                  type="text"
                  id={`field-label-${selectedFieldIndex}`}
                  name={`field-label-${selectedFieldIndex}`}
                  value={selectedField.label}
                  onChange={(e) => updateField(selectedFieldIndex!, { label: e.target.value })}
                  placeholder={selectedField.field_type === 'section' ? 'Section title' : 'Field label'}
                />
              </div>

              <div className="form-group">
                <label htmlFor={`field-description-${selectedFieldIndex}`}>Description</label>
                <textarea
                  id={`field-description-${selectedFieldIndex}`}
                  name={`field-description-${selectedFieldIndex}`}
                  value={selectedField.description || ''}
                  onChange={(e) => updateField(selectedFieldIndex!, { description: e.target.value })}
                  placeholder="Help text for this field"
                  rows={2}
                />
              </div>

              {/* Media Upload */}
              <div className="form-group">
                <label htmlFor={`field-media-url-${selectedFieldIndex}`}>Image/Video URL (optional)</label>
                <input
                  type="url"
                  id={`field-media-url-${selectedFieldIndex}`}
                  name={`field-media-url-${selectedFieldIndex}`}
                  value={selectedField.validation_rules?.mediaUrl || ''}
                  onChange={(e) => updateField(selectedFieldIndex!, {
                    validation_rules: {
                      ...selectedField.validation_rules,
                      mediaUrl: e.target.value,
                    },
                  })}
                  placeholder="https://example.com/image.jpg or video.mp4"
                />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Add an image or video to display with this question. Supports JPG, PNG, GIF, MP4, WebM.
                </p>
                {selectedField.validation_rules?.mediaUrl && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {selectedField.validation_rules.mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <img 
                        src={selectedField.validation_rules.mediaUrl} 
                        alt="Preview" 
                        style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', marginTop: '0.5rem' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : selectedField.validation_rules.mediaUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                      <video 
                        src={selectedField.validation_rules.mediaUrl} 
                        controls 
                        style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', marginTop: '0.5rem' }}
                      />
                    ) : null}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor={`field-placeholder-${selectedFieldIndex}`}>Placeholder</label>
                <input
                  type="text"
                  id={`field-placeholder-${selectedFieldIndex}`}
                  name={`field-placeholder-${selectedFieldIndex}`}
                  value={selectedField.placeholder || ''}
                  onChange={(e) => updateField(selectedFieldIndex!, { placeholder: e.target.value })}
                  placeholder="Placeholder text"
                />
              </div>

              <div className="form-group">
                <label htmlFor={`field-required-${selectedFieldIndex}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id={`field-required-${selectedFieldIndex}`}
                    name={`field-required-${selectedFieldIndex}`}
                    checked={selectedField.required}
                    onChange={(e) => updateField(selectedFieldIndex!, { required: e.target.checked })}
                  />
                  Required field
                </label>
              </div>

              {/* Advanced Validation Rules */}
              {selectedField.field_type !== 'section' && (
                <div className="card" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                    Advanced Validation
                  </h3>
                  
                  {/* Text/Email/Textarea: Min/Max Length */}
                  {['text', 'textarea', 'email', 'phone', 'url'].includes(selectedField.field_type) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label>Min Length</label>
                        <input
                          type="number"
                          min="0"
                          value={selectedField.validation_rules?.minLength || ''}
                          onChange={(e) => updateField(selectedFieldIndex!, {
                            validation_rules: {
                              ...selectedField.validation_rules,
                              minLength: e.target.value ? parseInt(e.target.value) : undefined,
                            },
                          })}
                          placeholder="0"
                        />
                      </div>
                      <div className="form-group">
                        <label>Max Length</label>
                        <input
                          type="number"
                          min="1"
                          value={selectedField.validation_rules?.maxLength || ''}
                          onChange={(e) => updateField(selectedFieldIndex!, {
                            validation_rules: {
                              ...selectedField.validation_rules,
                              maxLength: e.target.value ? parseInt(e.target.value) : undefined,
                            },
                          })}
                          placeholder="Unlimited"
                        />
                      </div>
                    </div>
                  )}

                  {/* Number: Min/Max Value */}
                  {selectedField.field_type === 'number' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label>Min Value</label>
                        <input
                          type="number"
                          value={selectedField.validation_rules?.min || ''}
                          onChange={(e) => updateField(selectedFieldIndex!, {
                            validation_rules: {
                              ...selectedField.validation_rules,
                              min: e.target.value ? parseFloat(e.target.value) : undefined,
                            },
                          })}
                          placeholder="No minimum"
                        />
                      </div>
                      <div className="form-group">
                        <label>Max Value</label>
                        <input
                          type="number"
                          value={selectedField.validation_rules?.max || ''}
                          onChange={(e) => updateField(selectedFieldIndex!, {
                            validation_rules: {
                              ...selectedField.validation_rules,
                              max: e.target.value ? parseFloat(e.target.value) : undefined,
                            },
                          })}
                          placeholder="No maximum"
                        />
                      </div>
                    </div>
                  )}

                  {/* Pattern/Regex Validation */}
                  {['text', 'textarea', 'email', 'phone', 'url'].includes(selectedField.field_type) && (
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label>Pattern (Regex)</label>
                      <input
                        type="text"
                        value={selectedField.validation_rules?.pattern || ''}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            pattern: e.target.value || undefined,
                          },
                        })}
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
                    <label>Custom Error Message</label>
                    <input
                      type="text"
                      value={selectedField.validation_rules?.errorMessage || ''}
                      onChange={(e) => updateField(selectedFieldIndex!, {
                        validation_rules: {
                          ...selectedField.validation_rules,
                          errorMessage: e.target.value || undefined,
                        },
                      })}
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
                      onClick={() => addOption(selectedFieldIndex!)}
                      className="btn-outline"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                    >
                      + Add Option
                    </button>
                  </div>
                  {selectedField.options?.map((option, optIndex) => {
                    const optionLabelId = `field-${selectedFieldIndex}-option-${optIndex}-label`;
                    const optionValueId = `field-${selectedFieldIndex}-option-${optIndex}-value`;
                    return (
                      <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <label htmlFor={optionLabelId} style={{ display: 'none' }}>Option {optIndex + 1} Label</label>
                        <input
                          type="text"
                          id={optionLabelId}
                          name={optionLabelId}
                          value={option.label || ''}
                          onChange={(e) => updateOption(selectedFieldIndex!, optIndex, { label: e.target.value })}
                          placeholder="Option label"
                          style={{ flex: 1 }}
                        />
                        <label htmlFor={optionValueId} style={{ display: 'none' }}>Option {optIndex + 1} Value</label>
                        <input
                          type="text"
                          id={optionValueId}
                          name={optionValueId}
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
                    );
                  })}
                </div>
              )}

              {/* Validation Rules for Rating and Opinion Scale */}
              {(selectedField.field_type === 'rating' || selectedField.field_type === 'opinion_scale') && (
                <div className="form-group">
                  <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Scale Range</span>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label htmlFor={`field-${selectedFieldIndex}-min`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        Min {selectedField.field_type === 'rating' ? '(Stars)' : '(Number)'}
                      </label>
                      <input
                        type="number"
                        id={`field-${selectedFieldIndex}-min`}
                        name={`field-${selectedFieldIndex}-min`}
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
                      <label htmlFor={`field-${selectedFieldIndex}-max`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        Max {selectedField.field_type === 'rating' ? '(Stars)' : '(Number)'}
                      </label>
                      <input
                        type="number"
                        id={`field-${selectedFieldIndex}-max`}
                        name={`field-${selectedFieldIndex}-max`}
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

              {/* Matrix/Grid Configuration */}
              {selectedField.field_type === 'matrix' && (
                <div className="form-group">
                  <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Matrix Configuration</span>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Matrix questions allow users to rate multiple items. Use Options for rows (items to rate) and validation_rules.matrixColumns for columns (rating options).
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label htmlFor={`field-${selectedFieldIndex}-matrix-columns`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Column Labels (Rating Options)
                      </label>
                      <input
                        type="text"
                        id={`field-${selectedFieldIndex}-matrix-columns`}
                        placeholder="Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree"
                        value={selectedField.validation_rules?.matrixColumns?.join(', ') || ''}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            matrixColumns: e.target.value.split(',').map(s => s.trim()).filter(s => s),
                          },
                        })}
                        style={{ width: '100%', padding: '0.5rem' }}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Separate column labels with commas
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`field-${selectedFieldIndex}-matrix-type`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Input Type
                      </label>
                      <select
                        id={`field-${selectedFieldIndex}-matrix-type`}
                        value={selectedField.validation_rules?.matrixType || 'radio'}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            matrixType: e.target.value,
                          },
                        })}
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
              {selectedField.field_type === 'payment' && (
                <div className="form-group">
                  <span style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>Payment Configuration</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label htmlFor={`field-${selectedFieldIndex}-payment-amount`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Amount ($)
                      </label>
                      <input
                        type="number"
                        id={`field-${selectedFieldIndex}-payment-amount`}
                        step="0.01"
                        min="0.01"
                        value={selectedField.validation_rules?.paymentAmount || ''}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            paymentAmount: parseFloat(e.target.value) || 0,
                          },
                        })}
                        style={{ width: '100%', padding: '0.5rem' }}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label htmlFor={`field-${selectedFieldIndex}-payment-currency`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Currency
                      </label>
                      <select
                        id={`field-${selectedFieldIndex}-payment-currency`}
                        value={selectedField.validation_rules?.paymentCurrency || 'usd'}
                        onChange={(e) => updateField(selectedFieldIndex!, {
                          validation_rules: {
                            ...selectedField.validation_rules,
                            paymentCurrency: e.target.value,
                          },
                        })}
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
                  <label htmlFor={`field-conditional-enabled-${selectedFieldIndex}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      id={`field-conditional-enabled-${selectedFieldIndex}`}
                      name={`field-conditional-enabled-${selectedFieldIndex}`}
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
                          <label htmlFor={`field-conditional-trigger-${selectedFieldIndex}`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                            Show this field when:
                          </label>
                          <select
                            id={`field-conditional-trigger-${selectedFieldIndex}`}
                            name={`field-conditional-trigger-${selectedFieldIndex}`}
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
                              <label htmlFor={`field-conditional-condition-${selectedFieldIndex}`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                                Condition:
                              </label>
                              <select
                                id={`field-conditional-condition-${selectedFieldIndex}`}
                                name={`field-conditional-condition-${selectedFieldIndex}`}
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
                                <label htmlFor={`field-conditional-value-${selectedFieldIndex}`} style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                                  Value:
                                </label>
                                <input
                                  type="text"
                                  id={`field-conditional-value-${selectedFieldIndex}`}
                                  name={`field-conditional-value-${selectedFieldIndex}`}
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
    const fieldId = (field.id && field.id.trim()) ? field.id : `field-${index}`;
    const value = formValues[fieldId] || '';

    // Check conditional logic
    if (!evaluateConditionalLogic(field)) {
      return null;
    }

    switch (field.field_type) {
      case 'text':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="off"
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <textarea
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
              autoComplete="off"
            />
          </div>
        );

      case 'email':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="email"
            />
          </div>
        );

      case 'number':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="off"
            />
          </div>
        );

      case 'phone':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="tel"
            />
          </div>
        );

      case 'url':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              placeholder={field.placeholder || 'https://example.com'}
              required={field.required}
              autoComplete="url"
            />
          </div>
        );

      case 'date':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
              autoComplete="bday"
            />
          </div>
        );

      case 'time':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
              autoComplete="off"
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
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
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
              autoComplete="off"
            />
          </div>
        );

      case 'rating':
        const maxRating = field.validation_rules?.max || 5;
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div id={fieldId} role="group" aria-label={field.label}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
                  <button
                    key={star}
                    type="button"
                    name={fieldId}
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
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
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
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div id={fieldId} role="group" aria-label={field.label}>
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
                        htmlFor={`${fieldId}-${num}`}
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
                          id={`${fieldId}-${num}`}
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
          </div>
        );

      case 'dropdown':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <select
              id={fieldId}
              name={fieldId}
              value={value}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              required={field.required}
              autoComplete="off"
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
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="radiogroup" aria-label={field.label}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {field.options?.map((option: any, optIndex: number) => {
                  const optionValue = option.value || option.label;
                  const optionId = `${fieldId}-${optIndex}`;
                  return (
                    <label key={optIndex} htmlFor={optionId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        id={optionId}
                        name={fieldId}
                        value={optionValue}
                        checked={value === optionValue}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        required={field.required}
                      />
                      <span>{option.label || option.value}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={`${fieldId}-0`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="group" aria-label={field.label}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {field.options?.map((option: any, optIndex: number) => {
                  const optionValue = option.value || option.label;
                  const optionId = `${fieldId}-${optIndex}`;
                  return (
                    <label key={optIndex} htmlFor={optionId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id={optionId}
                        name={fieldId}
                        value={optionValue}
                        checked={(formValues[fieldId] || []).includes(optionValue)}
                        onChange={(e) => {
                          const currentValues = formValues[fieldId] || [];
                          const newValues = e.target.checked
                            ? [...currentValues, optionValue]
                            : currentValues.filter((v: any) => v !== optionValue);
                          handleFieldChange(fieldId, newValues);
                        }}
                      />
                      <span>{option.label || option.value}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'yes_no':
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={`${fieldId}-yes`}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.description && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                {field.description}
              </p>
            )}
            <div role="radiogroup" aria-label={field.label}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label htmlFor={`${fieldId}-yes`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    id={`${fieldId}-yes`}
                    name={fieldId}
                    value="yes"
                    checked={value === 'yes'}
                    onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                    required={field.required}
                  />
                  <span>Yes</span>
                </label>
                <label htmlFor={`${fieldId}-no`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    id={`${fieldId}-no`}
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
          </div>
        );

      default:
        return (
          <div key={fieldId} className="form-group">
            <label htmlFor={fieldId}>{field.label}</label>
            <input
              type="text"
              id={fieldId}
              name={fieldId}
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

  // Special rendering for section dividers
  if (field.field_type === 'section') {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          border: isSelected ? '2px solid #2563eb' : '2px dashed #d1d5db',
          backgroundColor: isDragging ? '#f3f4f6' : '#f9fafb',
          padding: '1.5rem',
          margin: '1rem 0',
          textAlign: 'center',
        }}
        className="card"
        onClick={onSelect}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
              {field.label || 'Section Divider'}
            </h3>
            {field.description && (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                {field.description}
              </p>
            )}
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
              title="Delete section"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

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
