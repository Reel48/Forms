import type { FormField } from '../api';

export interface FieldTypeDefinition {
  value: string;
  label: string;
  icon?: string;
  category?: 'basic' | 'advanced' | 'special';
  defaultConfig: Partial<FormField>;
  needsOptions?: boolean;
  validationRules?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

export const FIELD_TYPES: FieldTypeDefinition[] = [
  {
    value: 'section',
    label: 'Section Divider',
    category: 'special',
    defaultConfig: {
      field_type: 'section',
      label: 'Section Title',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'text',
    label: 'Short Text',
    category: 'basic',
    defaultConfig: {
      field_type: 'text',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'textarea',
    label: 'Long Text',
    category: 'basic',
    defaultConfig: {
      field_type: 'textarea',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'email',
    label: 'Email',
    category: 'basic',
    defaultConfig: {
      field_type: 'email',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'number',
    label: 'Number',
    category: 'basic',
    defaultConfig: {
      field_type: 'number',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'phone',
    label: 'Phone',
    category: 'basic',
    defaultConfig: {
      field_type: 'phone',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'url',
    label: 'Website/URL',
    category: 'basic',
    defaultConfig: {
      field_type: 'url',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'date',
    label: 'Date',
    category: 'basic',
    defaultConfig: {
      field_type: 'date',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'time',
    label: 'Time',
    category: 'basic',
    defaultConfig: {
      field_type: 'time',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'datetime',
    label: 'Date & Time',
    category: 'basic',
    defaultConfig: {
      field_type: 'datetime',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'date_range',
    label: 'Date Range',
    category: 'advanced',
    defaultConfig: {
      field_type: 'date_range',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'dropdown',
    label: 'Dropdown',
    category: 'advanced',
    needsOptions: true,
    defaultConfig: {
      field_type: 'dropdown',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [{ label: '', value: '' }],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'multiple_choice',
    label: 'Multiple Choice',
    category: 'advanced',
    needsOptions: true,
    defaultConfig: {
      field_type: 'multiple_choice',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [{ label: '', value: '' }],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'checkbox',
    label: 'Checkboxes',
    category: 'advanced',
    needsOptions: true,
    defaultConfig: {
      field_type: 'checkbox',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [{ label: '', value: '' }],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'yes_no',
    label: 'Yes/No',
    category: 'advanced',
    defaultConfig: {
      field_type: 'yes_no',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'rating',
    label: 'Rating (Stars)',
    category: 'advanced',
    defaultConfig: {
      field_type: 'rating',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: { min: 1, max: 5 },
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'opinion_scale',
    label: 'Opinion Scale',
    category: 'advanced',
    needsOptions: true,
    defaultConfig: {
      field_type: 'opinion_scale',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: { min: 1, max: 10 },
      options: [{ label: 'Low', value: 'low' }, { label: 'High', value: 'high' }],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'matrix',
    label: 'Matrix/Grid',
    category: 'advanced',
    needsOptions: true,
    defaultConfig: {
      field_type: 'matrix',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [{ label: '', value: '' }],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'ranking',
    label: 'Ranking',
    category: 'advanced',
    needsOptions: true,
    defaultConfig: {
      field_type: 'ranking',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [{ label: '', value: '' }],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'payment',
    label: 'Payment',
    category: 'special',
    defaultConfig: {
      field_type: 'payment',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
  {
    value: 'file_upload',
    label: 'File Upload',
    category: 'special',
    defaultConfig: {
      field_type: 'file_upload',
      label: '',
      description: '',
      placeholder: '',
      required: false,
      validation_rules: {},
      options: [],
      order_index: 0,
      conditional_logic: {},
    },
  },
];

export const FIELD_TYPE_MAP = new Map<string, FieldTypeDefinition>(
  FIELD_TYPES.map(type => [type.value, type])
);

export function getFieldTypeDefinition(fieldType: string): FieldTypeDefinition | undefined {
  return FIELD_TYPE_MAP.get(fieldType);
}

export function createField(fieldType: string, orderIndex: number): FormField {
  const definition = getFieldTypeDefinition(fieldType);
  if (!definition) {
    throw new Error(`Unknown field type: ${fieldType}`);
  }

  const field: FormField = {
    ...definition.defaultConfig,
    label: fieldType === 'section' ? 'Section Title' : '',
    order_index: orderIndex,
  } as FormField;

  return field;
}

export function getFieldTypeLabel(fieldType: string): string {
  return getFieldTypeDefinition(fieldType)?.label || fieldType;
}

export const FIELD_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map(type => [type.value, type.label])
);

