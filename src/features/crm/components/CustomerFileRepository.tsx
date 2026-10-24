import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import type { CustomerRepositoryFolder } from '@/features/crm/model/crmModels';
import { resolveCustomerFileFolderId } from '@/features/crm/model/customerRepository';
import { DOCUMENT_REPOSITORY_FOLDER_IDS } from '@/features/crm/model/customerWorkspace';
import type { ErpDocument } from '@/shared/types';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';

/** Folders and items of the selected customer, already filtered to the active folder. */
export interface CustomerRepositoryView {
  customerRepositoryFolders: CustomerRepositoryFolder[];
  activeRepositoryFolder: CustomerRepositoryFolder | undefined;
  activeRepositoryFiles: ErpDocument[];
  activeRepositoryContracts: ErpDocument[];
  activeRepositoryDocuments: ErpDocument[];
}

/** Folder selection, creation and rename state owned by CrmPage. */
export interface CustomerRepositoryFolderEditor {
  newFolderName: string;
  setNewFolderName: React.Dispatch<React.SetStateAction<string>>;
  renamingFolderId: string;
  setRenamingFolderId: React.Dispatch<React.SetStateAction<string>>;
  folderNameDraft: string;
  setFolderNameDraft: React.Dispatch<React.SetStateAction<string>>;
  setActiveRepositoryFolderId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedFolderForUpload: React.Dispatch<React.SetStateAction<string>>;
}

/** Upload form state owned by CrmPage. */
export interface CustomerRepositoryUpload {
  repositoryUploadOpen: boolean;
  setRepositoryUploadOpen: React.Dispatch<React.SetStateAction<boolean>>;
  repoUploadFileName: string;
  setRepoUploadFileName: React.Dispatch<React.SetStateAction<string>>;
  repoUploadLink: string;
  setRepoUploadLink: React.Dispatch<React.SetStateAction<string>>;
}

/** Repository operations implemented by CrmPage. */
export interface CustomerRepositoryActions {
  handleAddFolder: () => unknown;
  handleRenameRepoFolder: (folderId: string) => unknown;
  handleDeleteRepoFolder: (folderId: string) => unknown;
  handleRepoFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleUploadRepoFile: (event: React.FormEvent) => unknown;
  handleDeleteRepoFile: (fileId: string) => unknown;
  handleDeleteContract: (contractId: string) => unknown;
  setShowAddContractModal: (open: boolean) => void;
  setPreviewImage: (source: string | null) => void;
}

interface CustomerFileRepositoryProps {
  hidden: boolean;
  selectedCustomer: ErpDocument;
  currentUser: ErpDocument;
  users: ErpDocument[];
  repository: CustomerRepositoryView;
  folderEditor: CustomerRepositoryFolderEditor;
  upload: CustomerRepositoryUpload;
  actions: CustomerRepositoryActions;
}

/** Customer document repository tab: folders, files, contracts and documents with upload and preview. */
export const CustomerFileRepository: React.FC<CustomerFileRepositoryProps> = ({
  hidden,
  selectedCustomer,
  currentUser,
  users,
  repository: {
    customerRepositoryFolders,
    activeRepositoryFolder,
    activeRepositoryFiles,
    activeRepositoryContracts,
    activeRepositoryDocuments
  },
  folderEditor: {
    newFolderName,
    setNewFolderName,
    renamingFolderId,
    setRenamingFolderId,
    folderNameDraft,
    setFolderNameDraft,
    setActiveRepositoryFolderId,
    setSelectedFolderForUpload
  },
  upload: {
    repositoryUploadOpen,
    setRepositoryUploadOpen,
    repoUploadFileName,
    setRepoUploadFileName,
    repoUploadLink,
    setRepoUploadLink
  },
  actions: {
    handleAddFolder,
    handleRenameRepoFolder,
    handleDeleteRepoFolder,
    handleRepoFileChange,
    handleUploadRepoFile,
    handleDeleteRepoFile,
    handleDeleteContract,
    setShowAddContractModal,
    setPreviewImage
  }
}) => {
  const { t } = useLanguage();

  return (
    <section className="card customer-file-repository-card" hidden={hidden}>
      <div className="card-header customer-file-repository-header">
        <div>
          <span className="card-title">{t('Kho lưu trữ khách hàng')}</span>
        </div>
        {(currentUser.role === 'admin' || currentUser.role === 'sale') &&
          activeRepositoryFolder?.id === 'contracts' && (
            <button type="button" className="btn btn-outline" onClick={() => setShowAddContractModal(true)}>
              {t('Thêm hợp đồng')}
            </button>
          )}
      </div>

      <div className="customer-drive-layout">
        <aside className="customer-drive-sidebar" aria-label={t('Danh sách thư mục')}>
          {currentUser.role === 'admin' && (
            <div className="customer-drive-new-folder">
              <input
                type="text"
                value={newFolderName}
                onChange={event => setNewFolderName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleAddFolder();
                  }
                }}
                placeholder={t('Tên thư mục mới')}
                aria-label={t('Tên thư mục mới')}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleAddFolder()}
                disabled={!newFolderName.trim()}
              >
                {t('Tạo thư mục')}
              </button>
            </div>
          )}

          <div className="customer-drive-folder-list">
            {customerRepositoryFolders.map(folder => {
              const fileCount = (selectedCustomer.files || []).filter(
                (file: any) =>
                  file.name !== '.placeholder' &&
                  resolveCustomerFileFolderId(file, customerRepositoryFolders) === folder.id
              ).length;
              const contractCount = folder.id === 'contracts' ? (selectedCustomer.contracts || []).length : 0;
              const documentCount = (selectedCustomer.documents || []).filter(
                (documentRecord: any) =>
                  (DOCUMENT_REPOSITORY_FOLDER_IDS[documentRecord.category] || 'other') === folder.id
              ).length;
              const totalCount = fileCount + contractCount + documentCount;
              return (
                <div
                  key={folder.id}
                  className={`customer-drive-folder ${activeRepositoryFolder?.id === folder.id ? 'is-active' : ''}`}
                >
                  {renamingFolderId === folder.id ? (
                    <div className="customer-drive-folder-rename">
                      <input
                        autoFocus
                        value={folderNameDraft}
                        onChange={event => setFolderNameDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void handleRenameRepoFolder(folder.id);
                          if (event.key === 'Escape') setRenamingFolderId('');
                        }}
                        aria-label={t('Tên thư mục')}
                      />
                      <button type="button" onClick={() => void handleRenameRepoFolder(folder.id)}>
                        {t('Lưu')}
                      </button>
                      <button type="button" onClick={() => setRenamingFolderId('')}>
                        {t('Hủy')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="customer-drive-folder-select"
                        onClick={() => {
                          setActiveRepositoryFolderId(folder.id);
                          setSelectedFolderForUpload(folder.id);
                        }}
                      >
                        <span title={folder.name}>{folder.name}</span>
                        <small>{totalCount}</small>
                      </button>
                      {currentUser.role === 'admin' && (
                        <div className="customer-drive-folder-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFolderId(folder.id);
                              setFolderNameDraft(folder.name);
                            }}
                          >
                            {t('Đổi tên')}
                          </button>
                          <button type="button" onClick={() => void handleDeleteRepoFolder(folder.id)}>
                            {t('Xóa')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="customer-drive-content">
          <div className="customer-drive-path">
            <span>{t('Kho lưu trữ khách hàng')}</span>
            <strong>/ {activeRepositoryFolder?.name || t('Chưa chọn thư mục')}</strong>
          </div>

          {(currentUser.role === 'admin' || currentUser.role === 'sale') && activeRepositoryFolder && (
            <details
              className="customer-drive-upload-panel"
              open={repositoryUploadOpen}
              onToggle={event => setRepositoryUploadOpen(event.currentTarget.open)}
            >
              <summary>{t('Thêm tài liệu vào thư mục này')}</summary>
              <form onSubmit={handleUploadRepoFile}>
                <label>
                  <span>{t('Tên tài liệu')} *</span>
                  <input
                    value={repoUploadFileName}
                    onChange={event => setRepoUploadFileName(event.target.value)}
                    required
                    placeholder={t('Ví dụ: Biên bản nghiệm thu tháng 8')}
                  />
                </label>
                <label>
                  <span>{t('Chọn tệp dưới 900 KB')}</span>
                  <input type="file" onChange={handleRepoFileChange} />
                </label>
                <label>
                  <span>{t('Hoặc đường dẫn Drive/OneDrive')}</span>
                  <input
                    type="url"
                    value={repoUploadLink}
                    onChange={event => setRepoUploadLink(event.target.value)}
                    placeholder="https://..."
                  />
                </label>
                <button type="submit" className="btn btn-primary">
                  {t('Lưu tài liệu')}
                </button>
              </form>
            </details>
          )}

          <div className="table-container customer-drive-table">
            <table>
              <thead>
                <tr>
                  <th>{t('Tên tài liệu')}</th>
                  <th>{t('Loại')}</th>
                  <th>{t('Ngày cập nhật')}</th>
                  <th>{t('Người cập nhật')}</th>
                  <th>{t('Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {activeRepositoryContracts.map((contract: any) => (
                  <tr key={`contract-${contract.id}`}>
                    <td>
                      <strong>{contract.contractNo || t('Hợp đồng chưa có số')}</strong>
                      <small>
                        {contract.expiryDate ? `${t('Hạn hiệu lực')}: ${formatDate(contract.expiryDate)}` : ''}
                      </small>
                    </td>
                    <td>{t('Hợp đồng')}</td>
                    <td>{formatDate(contract.signDate || contract.createdAt)}</td>
                    <td>{contract.createdBy || selectedCustomer.createdBy || '—'}</td>
                    <td>
                      <div className="customer-drive-file-actions">
                        {contract.fileUrl && (
                          <a href={contract.fileUrl} download={`HopDong_${contract.contractNo || contract.id}`}>
                            {t('Tải xuống')}
                          </a>
                        )}
                        {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                          <button type="button" onClick={() => void handleDeleteContract(contract.id)}>
                            {t('Xóa')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {activeRepositoryDocuments.map((documentRecord: any) => (
                  <tr key={`document-${documentRecord.id}`}>
                    <td>
                      <strong>{documentRecord.name || t('Tài liệu chưa đặt tên')}</strong>
                    </td>
                    <td>{t('Văn bản')}</td>
                    <td>{formatDate(documentRecord.createdAt)}</td>
                    <td>{documentRecord.createdBy || documentRecord.createdById || '—'}</td>
                    <td>
                      {documentRecord.url ? (
                        <a href={documentRecord.url} target="_blank" rel="noreferrer">
                          {t('Mở tài liệu')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {activeRepositoryFiles.map((file: any) => {
                  const source = file.base64 || file.data || file.url;
                  const isImage = String(source || '').startsWith('data:image/');
                  return (
                    <tr key={file.id}>
                      <td>
                        <strong title={file.name}>{file.name}</strong>
                      </td>
                      <td>{isImage ? t('Hình ảnh') : file.url ? t('Đường dẫn') : t('Tệp tài liệu')}</td>
                      <td>{formatDateTime(file.createdAt, 'vi-VN', '—')}</td>
                      <td>{file.createdBy || users.find(user => user.uid === file.createdById)?.displayName || '—'}</td>
                      <td>
                        <div className="customer-drive-file-actions">
                          {isImage && (
                            <button type="button" onClick={() => setPreviewImage(source)}>
                              {t('Xem')}
                            </button>
                          )}
                          {file.url ? (
                            <a href={file.url} target="_blank" rel="noreferrer">
                              {t('Mở liên kết')}
                            </a>
                          ) : (
                            source && (
                              <a href={source} download={file.name}>
                                {t('Tải xuống')}
                              </a>
                            )
                          )}
                          {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                            <button type="button" onClick={() => void handleDeleteRepoFile(file.id)}>
                              {t('Xóa')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
