import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import type { CustomerContractDraft } from '@/features/crm/model/customerWorkspace';

// Contracts are stored inline as Data URLs, so they must stay well below Firestore's 1 MB document limit.
const MAX_CONTRACT_FILE_BYTES = 900_000;

interface CustomerContractDialogProps {
  draft: CustomerContractDraft;
  onDraftChange: (patch: Partial<CustomerContractDraft>) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}

export const CustomerContractDialog: React.FC<CustomerContractDialogProps> = ({
  draft,
  onDraftChange,
  onSubmit,
  onClose
}) => {
  const { t } = useLanguage();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CONTRACT_FILE_BYTES) {
      alert(
        t(
          'Tệp lớn hơn 900 KB. Vui lòng lưu hợp đồng trên Drive/OneDrive và thêm dưới dạng đường dẫn trong kho tài liệu.'
        )
      );
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = loadEvent => {
      onDraftChange({ fileUrl: loadEvent.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('THÊM HỢP ĐỒNG KHÁCH HÀNG MỚI')}</span>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            {t('Đóng')}
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>{t('Số Hợp Đồng / Ký Hiệu')} *</label>
              <input
                type="text"
                value={draft.contractNo}
                onChange={event => onDraftChange({ contractNo: event.target.value })}
                required
                placeholder="VD: HĐ-2026-001/SF"
              />
            </div>
            <div
              className="form-grid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}
            >
              <div className="form-group">
                <label>{t('Ngày Ký Kết')}</label>
                <input
                  type="date"
                  value={draft.signDate}
                  onChange={event => onDraftChange({ signDate: event.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('Hạn Hiệu Lực')}</label>
                <input
                  type="date"
                  value={draft.expiryDate}
                  onChange={event => onDraftChange({ expiryDate: event.target.value })}
                  required
                />
              </div>
            </div>
            <div
              className="form-grid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}
            >
              <div className="form-group">
                <label>{t('Giá Trị Hợp Đồng (đ)')}</label>
                <input
                  type="number"
                  min="0"
                  value={draft.value}
                  onChange={event => onDraftChange({ value: Number(event.target.value) })}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('Tải File Bản Cứng Hợp Đồng (.pdf, .jpg)')}</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleFileChange}
                  style={{ fontSize: '12px' }}
                  required
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              {t('Hủy')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('Lưu Hợp Đồng')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
