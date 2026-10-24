import React from 'react';
import { FileText } from 'lucide-react';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useLanguage } from '@/context/LanguageContext';
import type { CustomerRepositoryFolder } from '@/features/crm/model/crmModels';
import { canManageCustomerProducts } from '@/features/crm/model/customerProductCatalog';
import type { CustomerHistoryTab, RepositoryPreviewItem } from '@/features/crm/model/customerWorkspace';
import type { ErpDocument } from '@/shared/types';
import { formatDate } from '@/shared/utils/dateFormatting';

interface CustomerOverviewPreviewsProps {
  selectedCustomer: ErpDocument;
  currentUser: ErpDocument;
  products: ErpDocument[];
  repositoryFolders: CustomerRepositoryFolder[];
  previewItems: RepositoryPreviewItem[];
  visiblePreviewItems: RepositoryPreviewItem[];
  previewFolder: string;
  onPreviewFolderChange: (value: string) => void;
  onTabChange: (tab: CustomerHistoryTab) => void;
  onShowProductEditor: (open: boolean) => void;
  onActiveFolderChange: (value: string) => void;
  onUploadFolderChange: (value: string) => void;
  onUploadOpenChange: (open: boolean) => void;
}

/** Overview tab previews of the customer product catalog and document repository, with shortcuts to the full tabs. */
export const CustomerOverviewPreviews: React.FC<CustomerOverviewPreviewsProps> = ({
  selectedCustomer,
  currentUser,
  products: selectedCustomerProducts,
  repositoryFolders: customerRepositoryFolders,
  previewItems: repositoryPreviewItems,
  visiblePreviewItems: visibleRepositoryPreview,
  previewFolder: repositoryPreviewFolder,
  onPreviewFolderChange: setRepositoryPreviewFolder,
  onTabChange: setCustomerHistoryTab,
  onShowProductEditor: setShowProductEditor,
  onActiveFolderChange: setActiveRepositoryFolderId,
  onUploadFolderChange: setSelectedFolderForUpload,
  onUploadOpenChange: setRepositoryUploadOpen
}) => {
  const { t } = useLanguage();

  return (
    <>
      <section className="card customer-catalog-preview">
        <div className="customer-detail-card-heading">
          <h2>{t('Sản phẩm của khách hàng')}</h2>
          {canManageCustomerProducts(currentUser, selectedCustomer) && (
            <button type="button" className="btn btn-primary" onClick={() => setShowProductEditor(true)}>
              {t('Tạo mã sản phẩm')}
            </button>
          )}
        </div>
        <div className="customer-catalog-preview__table" role="table" aria-label={t('Sản phẩm của khách hàng')}>
          <div className="customer-catalog-preview__row customer-catalog-preview__head" role="row">
            <span role="columnheader">{t('Mã sản phẩm')}</span>
            <span role="columnheader">{t('Tên sản phẩm')}</span>
          </div>
          {selectedCustomerProducts.slice(0, 4).map(product => (
            <div key={product.key} className="customer-catalog-preview__row" role="row">
              <span role="cell" title={product.productCode}>
                {product.productCode || '—'}
              </span>
              <span role="cell" title={product.productName}>
                {product.productName || '—'}
              </span>
            </div>
          ))}
        </div>
        {selectedCustomerProducts.length === 0 && <p className="customer-detail-empty">{t('Chưa có mã sản phẩm.')}</p>}
        <button
          type="button"
          className="customer-detail-text-button customer-detail-card-link"
          aria-label={t('Xem chi tiết toàn bộ sản phẩm của khách hàng')}
          onClick={() => setCustomerHistoryTab('products')}
        >
          {t('Xem chi tiết')} ({selectedCustomerProducts.length})
        </button>
      </section>
      <section className="card customer-repository-preview">
        <div className="customer-detail-card-heading">
          <h2>{t('Kho lưu trữ khách hàng')}</h2>
          {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setRepositoryUploadOpen(true);
                setCustomerHistoryTab('files');
              }}
            >
              {t('Thêm tệp')}
            </button>
          )}
        </div>
        <div className="content-tabs customer-repository-preview__tabs" aria-label={t('Thư mục tài liệu')}>
          <button
            type="button"
            className={!repositoryPreviewFolder ? 'is-active' : ''}
            aria-pressed={!repositoryPreviewFolder}
            onClick={() => setRepositoryPreviewFolder('')}
          >
            {t('Tất cả')}
          </button>
          {customerRepositoryFolders.map(folder => (
            <button
              key={folder.id}
              type="button"
              className={repositoryPreviewFolder === folder.id ? 'is-active' : ''}
              aria-pressed={repositoryPreviewFolder === folder.id}
              onClick={() => setRepositoryPreviewFolder(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>
        <div className="customer-repository-preview__files">
          {visibleRepositoryPreview.slice(0, 4).map(file => (
            <div key={file.id} className="customer-repository-preview__file">
              <FileText size={24} aria-hidden="true" />
              <div>
                {file.source ? (
                  <a
                    href={file.source}
                    target="_blank"
                    rel="noreferrer"
                    download={file.source.startsWith('data:') ? file.name : undefined}
                    title={file.name}
                  >
                    {file.name}
                  </a>
                ) : (
                  <strong title={file.name}>{file.name}</strong>
                )}
                <small>
                  {customerRepositoryFolders.find(folder => folder.id === file.folderId)?.name || t('Tài liệu')} ·{' '}
                  {formatDate(file.date)}
                </small>
              </div>
              <RowActionMenu
                actions={[
                  {
                    label: t('Quản lý tài liệu'),
                    onSelect: () => {
                      setActiveRepositoryFolderId(file.folderId);
                      setSelectedFolderForUpload(file.folderId);
                      setCustomerHistoryTab('files');
                    }
                  }
                ]}
              />
            </div>
          ))}
          {visibleRepositoryPreview.length === 0 && <p className="customer-detail-empty">{t('Chưa có tài liệu.')}</p>}
        </div>
        <button
          type="button"
          className="customer-detail-text-button customer-detail-card-link"
          onClick={() => setCustomerHistoryTab('files')}
        >
          {t('Xem tất cả tệp')} ({repositoryPreviewItems.length})
        </button>
      </section>
    </>
  );
};
