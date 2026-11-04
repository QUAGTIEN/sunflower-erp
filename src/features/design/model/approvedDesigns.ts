import type { DesignPOItem, DesignRecord, DesignVersion } from './designWorkflow';

export interface ApprovedDesignOrder {
  id: string;
  poCode?: string;
  customerId?: string;
  customerName?: string;
  items?: DesignPOItem[];
}

export interface ApprovedTemplate {
  design: DesignRecord;
  po: ApprovedDesignOrder;
  item: DesignPOItem;
  version: DesignVersion;
  customerKey: string;
  customerLabel: string;
}

/** Some old lines stored a size built from missing numbers ("undefinedxundefined"); it means no size at all. */
export const cleanSpecText = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.includes('undefined') ? '' : text;
};

export const templateApprovedAt = ({ version, design }: Pick<ApprovedTemplate, 'version' | 'design'>) =>
  version.feedbackAt || design.updatedAt || version.createdAt || '';

/** Designers see the customer's reference code instead of the customer's name. */
export const buildApprovedTemplates = (
  designs: DesignRecord[],
  orders: ApprovedDesignOrder[],
  role?: string
): ApprovedTemplate[] =>
  designs
    .filter(design => design.status === 'approved' && ((design.versions?.length || 0) > 0 || !!design.fileUrl))
    .map(design => {
      const po = orders.find(candidate => candidate.id === design.poId);
      const version =
        design.versions?.[design.versions.length - 1] ||
        (design.fileUrl
          ? {
              versionNumber: design.currentVersion || 1,
              previewImage: design.fileUrl,
              aiLink: design.aiLink,
              corelLink: design.corelLink,
              comment: design.notes,
              createdAt: design.updatedAt
            }
          : undefined);
      if (!po || !version) return null;
      const item =
        po.items?.find(candidate => design.itemId && candidate.itemId === design.itemId) ||
        po.items?.[design.itemIndex || 0] ||
        po.items?.[0] ||
        {};
      const isDesigner = role === 'designer';
      return {
        design,
        po,
        item,
        version,
        customerKey: isDesigner
          ? design.customerReferenceCode || po.poCode || po.id
          : po.customerId || po.customerName || po.id,
        customerLabel: isDesigner
          ? design.customerReferenceCode || po.poCode || 'Chưa có mã khách hàng'
          : po.customerName || 'Chưa xác định khách hàng'
      };
    })
    .filter((template): template is ApprovedTemplate => template !== null)
    .sort(
      (first, second) =>
        new Date(templateApprovedAt(second) || 0).getTime() - new Date(templateApprovedAt(first) || 0).getTime()
    );

export const filterApprovedTemplates = (templates: ApprovedTemplate[], search: string, customerKeys: string[]) => {
  const query = search.trim().toLocaleLowerCase('vi');
  return templates.filter(({ customerLabel, customerKey, po, item }) => {
    if (customerKeys.length > 0 && !customerKeys.includes(customerKey)) return false;
    return [customerLabel, po.poCode, item.productCode, item.productName, item.size, item.material]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('vi')
      .includes(query);
  });
};
