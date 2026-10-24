import React, { Children, Fragment, cloneElement, isValidElement, type ReactNode } from 'react';
import type { EntityFieldTable } from '@/features/crm/model/entityFieldConfig';
import { SYSTEM_FIELD_CATALOG } from '@/features/crm/model/systemFieldConfig';
import { configureSystemTable } from './systemFieldLayout';
import { SystemFieldContext } from './systemFieldContext';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';

type NodeProps = { children?: ReactNode; title?: string; 'data-system-label'?: string };

export function ConfiguredSystemTable({
  table,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { table: EntityFieldTable }) {
  const { fields } = useSystemFieldConfiguration(table);
  return <table {...props}>{configureSystemTable(children, fields, SYSTEM_FIELD_CATALOG[table])}</table>;
}

/** Opt-in labels only: form controls, validation, values and permissions are untouched. */
export function SystemFieldSurface({
  table,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { table: EntityFieldTable }) {
  const { fields } = useSystemFieldConfiguration(table);
  function visit(nodes: ReactNode): ReactNode {
    return Children.map(nodes, node => {
      if (!isValidElement<NodeProps>(node)) return node;
      const key = node.props['data-system-label'];
      const field = fields.find(item => item.key === key);
      const spec = SYSTEM_FIELD_CATALOG[table].find(item => item.key === key);
      const childFieldKey = Children.toArray(node.props.children).find(
        child => isValidElement<NodeProps>(child) && child.props['data-system-label']
      );
      const nestedKey = isValidElement<NodeProps>(childFieldKey) ? childFieldKey.props['data-system-label'] : undefined;
      if (nestedKey && fields.find(item => item.key === nestedKey)?.removed) return null;
      if (field?.removed) return null;
      if (field && spec) {
        const original = Children.toArray(node.props.children)
          .filter(item => typeof item === 'string')
          .join('');
        return cloneElement(
          node,
          { title: field.description || undefined },
          field.label !== spec.label ? `${field.label}${original.includes('*') ? ' *' : ''}` : node.props.children
        );
      }
      // Native nodes and fragments only; do not traverse another component's contract.
      return typeof node.type === 'string' || node.type === Fragment
        ? cloneElement(node, {}, visit(node.props.children))
        : node;
    });
  }
  return (
    <SystemFieldContext.Provider value={fields}>
      <div {...props}>{visit(children)}</div>
    </SystemFieldContext.Provider>
  );
}
