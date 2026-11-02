import React from 'react';

interface EditRequestCompareDialogProps {
  originalData: unknown;
  updatedData: unknown;
  onClose: () => void;
  onReject: () => void;
  onApprove: () => void;
}

const panelStyle = (borderColor: string, backgroundColor: string): React.CSSProperties => ({
  padding: '12px',
  border: `1px solid ${borderColor}`,
  borderRadius: '4px',
  backgroundColor
});

const headingStyle = (color: string, borderColor: string): React.CSSProperties => ({
  color,
  borderBottom: `1px solid ${borderColor}`,
  paddingBottom: '6px',
  marginBottom: '10px'
});

const jsonStyle: React.CSSProperties = { fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' };

/** Side-by-side view of a customer edit request so an admin can approve or reject it. */
export const EditRequestCompareDialog: React.FC<EditRequestCompareDialogProps> = ({
  originalData,
  updatedData,
  onClose,
  onReject,
  onApprove
}) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', width: '100%' }}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: '16px' }}>SO SÁNH THAY ĐỔI CHI TIẾT</span>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={panelStyle('#fed7d7', '#fff5f5')}>
              <h4 style={headingStyle('#c53030', '#feb2b2')}>DỮ LIỆU CŨ</h4>
              <pre style={jsonStyle}>{JSON.stringify(originalData, null, 2)}</pre>
            </div>
            <div style={panelStyle('#c6f6d5', '#f0fff4')}>
              <h4 style={headingStyle('#22543d', '#9ae6b4')}>ĐỀ XUẤT MỚI</h4>
              <pre style={jsonStyle}>{JSON.stringify(updatedData, null, 2)}</pre>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="btn btn-danger" onClick={onReject}>
            Từ Chối
          </button>
          <button type="button" className="btn btn-success" onClick={onApprove}>
            Duyệt & Áp Dụng
          </button>
        </div>
      </div>
    </div>
  );
};
