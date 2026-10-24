import React from 'react';
import { getCustomerInsightGroupsForModule, type CustomerInsightModule } from '../model/customerInsightCatalog';

interface CustomerInsightEditorProps {
  module: CustomerInsightModule;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}

export const CustomerInsightEditor: React.FC<CustomerInsightEditorProps> = ({
  module,
  values,
  onChange,
  disabled = false
}) => {
  const groups = getCustomerInsightGroupsForModule(module);
  const toggle = (itemId: string, checked: boolean) =>
    onChange(checked ? Array.from(new Set([...values, itemId])) : values.filter(value => value !== itemId));

  return (
    <div className="customer-insight-editor">
      {groups.map(group => {
        const selectedCount = group.items.filter(entry => values.includes(entry.id)).length;
        return (
          <details key={group.id} className="customer-insight-group" open={selectedCount > 0}>
            <summary>
              <span>{group.label}</span>
              <strong>
                {selectedCount}/{group.items.length}
              </strong>
            </summary>
            <div className="customer-insight-options">
              {group.items.map(entry => (
                <label key={entry.id}>
                  <input
                    type="checkbox"
                    checked={values.includes(entry.id)}
                    disabled={disabled}
                    onChange={event => toggle(entry.id, event.target.checked)}
                  />
                  <span>{entry.label}</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
};
