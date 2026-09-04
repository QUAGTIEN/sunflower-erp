import type { CustomerFileRecord, CustomerRecord, CustomerRepositoryFolder } from './crmModels';

export const DEFAULT_CUSTOMER_REPOSITORY_FOLDERS: CustomerRepositoryFolder[] = [
  { id: 'contracts', name: 'Hợp đồng', parentId: null, order: 10, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' },
  { id: 'appendices', name: 'Phụ lục hợp đồng', parentId: null, order: 20, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' },
  { id: 'minutes', name: 'Biên bản', parentId: null, order: 30, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' },
  { id: 'quotations', name: 'Báo giá', parentId: null, order: 40, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' },
  { id: 'legal', name: 'Hồ sơ pháp lý', parentId: null, order: 50, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' },
  { id: 'technical', name: 'Tài liệu kỹ thuật', parentId: null, order: 60, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' },
  { id: 'other', name: 'Tài liệu khác', parentId: null, order: 70, active: true, createdAt: '', createdById: '', updatedAt: '', updatedById: '' }
];

const slugifyFolderId = (name: string) => {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'folder';
};

export const createCustomerFolderId = (name: string, existingIds: string[]) => {
  const base = slugifyFolderId(name);
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export const getCustomerRepositoryFolders = (
  customer: Pick<CustomerRecord, 'fileFolders' | 'files'> | { fileFolders?: unknown; files?: unknown }
) => {
  const savedFolders = Array.isArray(customer.fileFolders) ? customer.fileFolders : [];
  const baseFolders = savedFolders.length > 0
    ? savedFolders
    : DEFAULT_CUSTOMER_REPOSITORY_FOLDERS.map(folder => ({ ...folder }));
  const folders = [...baseFolders];
  const knownNames = new Set(folders.map(folder => folder.name.trim().toLocaleLowerCase('vi-VN')));
  const knownIds = folders.map(folder => folder.id);

  (Array.isArray(customer.files) ? customer.files : []).forEach((file: CustomerFileRecord) => {
    const legacyName = String(file.folder || '').trim();
    if (!legacyName || knownNames.has(legacyName.toLocaleLowerCase('vi-VN'))) return;
    const id = createCustomerFolderId(legacyName, knownIds);
    knownIds.push(id);
    knownNames.add(legacyName.toLocaleLowerCase('vi-VN'));
    folders.push({
      id,
      name: legacyName,
      parentId: null,
      order: folders.length * 10 + 10,
      active: true,
      createdAt: '',
      createdById: '',
      updatedAt: '',
      updatedById: ''
    });
  });

  return folders.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'vi'));
};

export const resolveCustomerFileFolderId = (
  file: Pick<CustomerFileRecord, 'folderId' | 'folder'> | { folderId?: unknown; folder?: unknown },
  folders: CustomerRepositoryFolder[]
) => {
  const folderId = String(file.folderId || '');
  if (folderId && folders.some(folder => folder.id === folderId)) return folderId;
  const legacyName = String(file.folder || '').trim().toLocaleLowerCase('vi-VN');
  return folders.find(folder => folder.name.trim().toLocaleLowerCase('vi-VN') === legacyName)?.id || 'other';
};
