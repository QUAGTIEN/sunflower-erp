import React from 'react';
import {
  canEditEntityField,
  formatEntityCustomFieldValue,
  type EntityCustomFieldValue,
  type EntityCustomFieldValues,
  type EntityFieldDefinition,
  type EntityFieldRole
} from '@/features/crm/model/entityFieldConfig';
import './EntityCustomFields.css';

interface EntityCustomFieldControlProps {
  definition: EntityFieldDefinition;
  value: EntityCustomFieldValue | undefined;
  disabled?: boolean;
  onChange: (value: EntityCustomFieldValue) => void;
}

export const EntityCustomFieldControl: React.FC<EntityCustomFieldControlProps> = ({ definition, value, disabled, onChange }) => {
  const activeOptions = definition.options.filter(option => option.active);
  const common = { disabled, required: definition.required };

  if (definition.type === 'textarea') {
    return <textarea {...common} rows={3} value={String(value ?? '')} onChange={event => onChange(event.target.value)} />;
  }
  if (definition.type === 'single_select') {
    return <select {...common} value={String(value ?? '')} onChange={event => onChange(event.target.value)}><option value="">Chưa chọn</option>{activeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
  }
  if (definition.type === 'multi_select') {
    const selectedValues = Array.isArray(value) ? value.map(String) : [];
    return <div className="entity-custom-field__checks">{activeOptions.map(option => <label key={option.id}><input type="checkbox" disabled={disabled} checked={selectedValues.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selectedValues, option.id] : selectedValues.filter(item => item !== option.id))} /><span>{option.label}</span></label>)}</div>;
  }
  if (definition.type === 'boolean') {
    return <select {...common} value={value === true ? 'true' : value === false ? 'false' : ''} onChange={event => onChange(event.target.value === '' ? null : event.target.value === 'true')}><option value="">Chưa chọn</option><option value="true">Có</option><option value="false">Không</option></select>;
  }

  const inputType = definition.type === 'date' ? 'date'
    : definition.type === 'datetime' ? 'datetime-local'
      : ['integer', 'decimal', 'currency', 'percent'].includes(definition.type) ? 'number'
        : definition.type === 'email' ? 'email'
          : definition.type === 'url' ? 'url'
            : definition.type === 'phone' ? 'tel' : 'text';
  const step = definition.type === 'integer' ? '1' : ['decimal', 'currency', 'percent'].includes(definition.type) ? 'any' : undefined;
  return <input {...common} type={inputType} step={step} value={value === null || value === undefined ? '' : String(value)} onChange={event => onChange(inputType === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)} />;
};

export const EntityCustomFieldsSection: React.FC<{
  definitions: EntityFieldDefinition[];
  values: EntityCustomFieldValues;
  role: EntityFieldRole;
  onChange: (values: EntityCustomFieldValues) => void;
  title?: string;
}> = ({ definitions, values, role, onChange, title = 'Thông tin tùy chỉnh' }) => {
  const visibleDefinitions = definitions.filter(definition => definition.active);
  if (visibleDefinitions.length === 0) return null;
  return (
    <section className="entity-custom-fields">
      <header><h3>{title}</h3><p>Các trường do Admin cấu hình riêng cho bảng này.</p></header>
      <div className="entity-custom-fields__grid">
        {visibleDefinitions.map(definition => <label className={definition.type === 'textarea' || definition.type === 'multi_select' ? 'is-wide' : ''} key={definition.id}>
          <span>{definition.name}{definition.required ? ' *' : ''}</span>
          <EntityCustomFieldControl definition={definition} value={values[definition.id]} disabled={!canEditEntityField(definition, role)} onChange={nextValue => onChange({ ...values, [definition.id]: nextValue })} />
          {definition.description && <small>{definition.description}</small>}
        </label>)}
      </div>
    </section>
  );
};

export const EntityCustomFieldsReadOnly: React.FC<{
  definitions: EntityFieldDefinition[];
  values?: EntityCustomFieldValues;
}> = ({ definitions, values = {} }) => {
  const visibleDefinitions = definitions.filter(definition => definition.active || values[definition.id] !== undefined);
  if (visibleDefinitions.length === 0) return null;
  return <section className="entity-custom-fields entity-custom-fields--readonly"><header><h3>Thông tin tùy chỉnh</h3></header><dl>{visibleDefinitions.map(definition => <div key={definition.id}><dt>{definition.name}</dt><dd>{formatEntityCustomFieldValue(definition, values[definition.id])}</dd></div>)}</dl></section>;
};
