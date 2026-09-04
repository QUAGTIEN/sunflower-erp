import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { SystemFieldOverride, SystemFieldSpec } from '@/features/crm/model/systemFieldConfig';

type NodeProps = { children?: ReactNode; colSpan?: number; title?: string; 'data-system-field'?: string; 'data-system-label'?: string };
type Element = ReactElement<NodeProps>;
function elements(children: ReactNode): Element[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<NodeProps>(child)) return [];
    return child.type === Fragment ? elements(child.props.children).map(nested => cloneElement(nested, { key: `${child.key}/${nested.key}` })) : [child];
  });
}

/** Reorder complete cells, never their content. Checkbox/action columns stay pinned. */
export function configureSystemTable(children: ReactNode, fields: SystemFieldOverride[], defaults: SystemFieldSpec[] = []): ReactNode {
  const sections = elements(children);
  const head = sections.find(child => child.type === 'thead');
  const header = head && elements(head.props.children).find(child => child.type === 'tr');
  if (!header) return children;
  const cells = elements(header.props.children);
  const configured = cells.map((cell, index) => ({ cell, index, field: fields.find(field => field.key === cell.props['data-system-field']) }));
  const ordered = configured.filter(item => item.field?.visible !== false).sort((a, b) => {
    // Unknown columns retain their location at the leading/trailing edge.
    const rank = (item: typeof a) => item.field ? item.field.order : item.index === 0 ? -1 : 1e9 + item.index;
    return rank(a) - rank(b) || a.index - b.index;
  });
  function rows(nodes: ReactNode, isHeader: boolean): ReactNode {
    return elements(nodes).map(row => {
      if (row.type !== 'tr') return row;
      const rowCells = elements(row.props.children);
      if (rowCells.length === 1 && (rowCells[0].props.colSpan || 1) > 1) {
        return cloneElement(row, {}, cloneElement(rowCells[0], { colSpan: ordered.length }));
      }
      // Do not guess for grouped headers or unusual spanning rows.
      if (rowCells.length !== cells.length || rowCells.some(cell => (cell.props.colSpan || 1) > 1)) return row;
      return cloneElement(row, {}, ordered.map(({ index, field }) => cloneElement(rowCells[index], {
        key: rowCells[index].key ?? index,
        ...(isHeader && field ? { title: field.description || field.label } : {})
      }, isHeader && field && field.label !== defaults.find(item => item.key === field.key)?.label ? field.label : rowCells[index].props.children)));
    });
  }
  return sections.map(section => ['thead', 'tbody', 'tfoot'].includes(String(section.type))
    ? cloneElement(section, {}, rows(section.props.children, section.type === 'thead')) : section);
}
