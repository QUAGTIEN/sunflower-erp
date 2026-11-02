import React from 'react';
import { Folder, X, FileText } from 'lucide-react';
import type { CustomerRecord } from '@/features/crm/model/crmModels';

interface POFileRepositoryDialogProps {
  currentCustomer: CustomerRecord | undefined;
  setShowRepoModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPdfFile: React.Dispatch<React.SetStateAction<string>>;
  setExcelFile: React.Dispatch<React.SetStateAction<string>>;
  setAiFile: React.Dispatch<React.SetStateAction<string>>;
  setCorelFile: React.Dispatch<React.SetStateAction<string>>;
  setContractFile: React.Dispatch<React.SetStateAction<string>>;
  setQuoteFile: React.Dispatch<React.SetStateAction<string>>;
}

/** Dialog that attaches files from the customer repository to a PO item. */
export const POFileRepositoryDialog: React.FC<POFileRepositoryDialogProps> = ({
  currentCustomer,
  setShowRepoModal,
  setPdfFile,
  setExcelFile,
  setAiFile,
  setCorelFile,
  setContractFile,
  setQuoteFile
}) => {
  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
        <div className="modal-header">
          <span
            style={{
              fontWeight: 700,
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Folder size={18} />
            <span>KHO LƯU TRỮ TỆP KHÁCH HÀNG: {currentCustomer?.companyName || ''}</span>
          </span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowRepoModal(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {(() => {
            if (!currentCustomer || !currentCustomer.files || currentCustomer.files.length === 0) {
              return (
                <p className="text-center text-muted" style={{ padding: '20px' }}>
                  Kho lưu trữ của khách hàng này hiện tại chưa có tệp tin nào.
                </p>
              );
            }

            // Group files by folder
            const folderGroups = currentCustomer.files.reduce((acc: any, file: any) => {
              const folderName = file.folder || 'Chưa phân mục';
              if (!acc[folderName]) acc[folderName] = [];
              acc[folderName].push(file);
              return acc;
            }, {});

            return (
              <div>
                <p style={{ fontSize: '12.5px', marginBottom: '12px', color: 'var(--color-text-muted)' }}>
                  Chọn một tệp từ kho lưu trữ để đính kèm vào phần tương ứng:
                </p>

                {Object.entries(folderGroups).map(([folderName, folderFiles]: any) => (
                  <div key={folderName} style={{ marginBottom: '16px' }}>
                    <h5
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        paddingBottom: '4px',
                        marginBottom: '8px',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px'
                      }}
                    >
                      <Folder size={14} />
                      <span>{folderName}</span>
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {folderFiles.map((file: any, fIdx: number) => (
                        <div
                          key={fIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            backgroundColor: 'var(--color-bg-light)',
                            border: '1px solid var(--color-border-light)',
                            borderRadius: '4px'
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 500,
                              fontSize: '13px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '280px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            title={file.name}
                          >
                            <FileText size={14} />
                            <span>{file.name}</span>
                          </span>
                          <div>
                            <select
                              onChange={e => {
                                const target = e.target.value;
                                if (!target) return;

                                if (target === 'pdf') setPdfFile(file.base64);
                                if (target === 'excel') setExcelFile(file.base64);
                                if (target === 'ai') setAiFile(file.base64);
                                if (target === 'corel') setCorelFile(file.base64);
                                if (target === 'contract') setContractFile(file.base64);
                                if (target === 'quote') setQuoteFile(file.base64);

                                alert(`Đã đính kèm tệp "${file.name}" vào trường ${target.toUpperCase()}`);
                                e.target.value = ''; // reset
                              }}
                              style={{ padding: '2px 6px', fontSize: '11.5px', width: '150px' }}
                            >
                              <option value="">-- Đính kèm vào --</option>
                              <option value="pdf">PDF Đơn Hàng</option>
                              <option value="excel">Bản Báo Giá Excel</option>
                              <option value="ai">File Thiết kế AI</option>
                              <option value="corel">File Thiết kế Corel</option>
                              <option value="contract">File Hợp Đồng</option>
                              <option value="quote">Bản Báo Giá PDF</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={() => setShowRepoModal(false)}>
            Hoàn thành
          </button>
        </div>
      </div>
    </div>
  );
};
