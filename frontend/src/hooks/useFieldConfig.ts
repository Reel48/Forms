import { useMemo } from 'react';
import type { FormField } from '../api';
import { getFieldTypeDefinition } from '../lib/fieldRegistry';

export function useFieldConfig(field: FormField) {
  const fieldDefinition = useMemo(() => getFieldTypeDefinition(field.field_type), [field.field_type]);
  
  const needsOptions = useMemo(() => fieldDefinition?.needsOptions || false, [fieldDefinition]);
  
  const validationConfig = useMemo(() => {
    if (!field.validation_rules) return null;
    
    const rules = field.validation_rules;
    const config: Record<string, any> = {};
    
    if (rules.minLength !== undefined) config.minLength = rules.minLength;
    if (rules.maxLength !== undefined) config.maxLength = rules.maxLength;
    if (rules.min !== undefined) config.min = rules.min;
    if (rules.max !== undefined) config.max = rules.max;
    if (rules.pattern) config.pattern = rules.pattern;
    if (rules.errorMessage) config.errorMessage = rules.errorMessage;
    
    return Object.keys(config).length > 0 ? config : null;
  }, [field.validation_rules]);
  
  const hasConditionalLogic = useMemo(() => {
    return field.conditional_logic?.enabled || false;
  }, [field.conditional_logic]);
  
  return {
    fieldDefinition,
    needsOptions,
    validationConfig,
    hasConditionalLogic,
  };
}

