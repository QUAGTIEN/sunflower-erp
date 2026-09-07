import React from 'react';
import type { HeaderInteractionProps } from '@/hooks/useReorderableTableColumns';

interface ReorderableTableCellsProps {
  order: string[];
  children: React.ReactNode;
  getHeaderProps?: (columnId: string, label: string, currentClassName?: string) => HeaderInteractionProps;
  labels?: Record<string, string>;
}

const collectKeyedElements = (node: React.ReactNode, result: Map<string, React.ReactElement>) => {
  if (Array.isArray(node)) {
    node.forEach(child => collectKeyedElements(child, result));
    return;
  }
  if (!React.isValidElement(node) || node.key === null) return;
  result.set(String(node.key), node);
};

export const ReorderableTableCells: React.FC<ReorderableTableCellsProps> = ({
  order,
  children,
  getHeaderProps,
  labels = {}
}) => {
  const cells = new Map<string, React.ReactElement>();
  collectKeyedElements(children, cells);
  return (
    <>
      {order.map(columnId => {
        const cell = cells.get(columnId);
        if (!cell) return null;
        if (!getHeaderProps || cell.type !== 'th') return cell;
        const props = cell.props as { className?: string; children?: React.ReactNode };
        const label = labels[columnId] || (typeof props.children === 'string' ? props.children : columnId);
        return React.cloneElement(cell, getHeaderProps(columnId, label, props.className));
      })}
    </>
  );
};
