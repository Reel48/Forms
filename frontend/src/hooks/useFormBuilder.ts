import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formsAPI } from '../api';
import type { FormCreate, FormField } from '../api';
import { createField } from '../lib/fieldRegistry';
import { arrayMove } from '@dnd-kit/sortable';

interface UseFormBuilderOptions {
  formId?: string;
  initialData?: Partial<FormCreate>;
}

export function useFormBuilder({ formId, initialData }: UseFormBuilderOptions = {}) {
  const navigate = useNavigate();
  const isEditMode = Boolean(formId);

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
      backgroundType: 'gradient',
      backgroundColor: '#667eea',
    },
    ...initialData,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isEditMode && formId) {
      loadForm(formId);
    }
  }, [isEditMode, formId]);

  const loadForm = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await formsAPI.getById(id);
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
        settings: form.settings || {},
        welcome_screen: form.welcome_screen || {},
        thank_you_screen: form.thank_you_screen || {},
      });
    } catch (error: any) {
      console.error('Failed to load form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const addField = useCallback((fieldType: string) => {
    const newField = createField(fieldType, formData.fields?.length || 0);
    setFormData({
      ...formData,
      fields: [...(formData.fields || []), newField],
    });
    setSelectedFieldIndex((formData.fields?.length || 0));
  }, [formData]);

  const updateField = useCallback((index: number, updates: Partial<FormField>) => {
    const updatedFields = [...(formData.fields || [])];
    updatedFields[index] = { ...updatedFields[index], ...updates };
    setFormData({ ...formData, fields: updatedFields });
  }, [formData]);

  const removeField = useCallback((index: number) => {
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
  }, [formData, selectedFieldIndex]);

  const moveField = useCallback((index: number, direction: 'up' | 'down') => {
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
  }, [formData]);

  const handleDragEnd = useCallback((oldIndex: number, newIndex: number) => {
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const fields = arrayMove(formData.fields || [], oldIndex, newIndex);
      // Update order_index for all fields
      fields.forEach((field, index) => {
        field.order_index = index;
      });
      setFormData({ ...formData, fields });
      setSelectedFieldIndex(newIndex);
    }
  }, [formData]);

  const addOption = useCallback((fieldIndex: number) => {
    const field = formData.fields?.[fieldIndex];
    if (field) {
      const options = [...(field.options || [])];
      options.push({ label: '', value: '' });
      updateField(fieldIndex, { options });
    }
  }, [formData.fields, updateField]);

  const updateOption = useCallback((fieldIndex: number, optionIndex: number, updates: { label?: string; value?: string }) => {
    const field = formData.fields?.[fieldIndex];
    if (field) {
      const options = [...(field.options || [])];
      options[optionIndex] = { ...options[optionIndex], ...updates };
      updateField(fieldIndex, { options });
    }
  }, [formData.fields, updateField]);

  const removeOption = useCallback((fieldIndex: number, optionIndex: number) => {
    const field = formData.fields?.[fieldIndex];
    if (field) {
      const options = field.options?.filter((_, i) => i !== optionIndex) || [];
      updateField(fieldIndex, { options });
    }
  }, [formData.fields, updateField]);

  const saveForm = useCallback(async () => {
    if (!formData.name.trim()) {
      setError('Form name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && formId) {
        // Update form
        await formsAPI.update(formId, {
          name: formData.name,
          description: formData.description,
          status: formData.status,
          theme: formData.theme,
          settings: formData.settings,
          welcome_screen: formData.welcome_screen,
          thank_you_screen: formData.thank_you_screen,
        });

        // Sync fields - get current form to see existing fields
        const currentForm = await formsAPI.getById(formId);
        const existingFields = currentForm.data.fields || [];
        const currentFields = formData.fields || [];

        // Delete fields that are no longer in the form
        for (const existingField of existingFields) {
          if (!currentFields.find((f) => f.id === existingField.id)) {
            if (existingField.id) {
              await formsAPI.deleteField(formId, existingField.id);
            }
          }
        }

        // Create or update fields
        for (let i = 0; i < currentFields.length; i++) {
          const field = currentFields[i];
          field.order_index = i;

          if (field.id) {
            // Update existing field
            await formsAPI.updateField(formId, field.id, field);
          } else {
            // Create new field
            await formsAPI.createField(formId, field);
          }
        }

        navigate('/forms');
      } else {
        // Create new form with fields
        const payload: FormCreate = {
          name: formData.name,
          description: formData.description,
          status: formData.status,
          fields: formData.fields || [],
          theme: formData.theme,
          settings: formData.settings,
          welcome_screen: formData.welcome_screen,
          thank_you_screen: formData.thank_you_screen,
        };

        await formsAPI.create(payload);
        navigate('/forms');
      }
    } catch (error: any) {
      console.error('Failed to save form:', error);
      setError(error?.response?.data?.detail || error?.message || 'Failed to save form. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [formData, isEditMode, formId, navigate]);

  return {
    formData,
    setFormData,
    loading,
    saving,
    error,
    setError,
    selectedFieldIndex,
    setSelectedFieldIndex,
    addField,
    updateField,
    removeField,
    moveField,
    handleDragEnd,
    addOption,
    updateOption,
    removeOption,
    saveForm,
    isEditMode,
  };
}

