import React from 'react';
import { Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface POImagePreviewDialogProps {
  setPreviewImage: React.Dispatch<React.SetStateAction<string | null>>;
  previewImage: string;
}

/** Full-screen preview of a PO item image with download. */
export const POImagePreviewDialog: React.FC<POImagePreviewDialogProps> = ({ setPreviewImage, previewImage }) => {
  const { t } = useLanguage();
  return (
    <div
      className="modal-overlay"
      onClick={() => setPreviewImage(null)}
      style={{ zIndex: 1300, background: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '90%',
          maxHeight: '90%',
          padding: '12px',
          position: 'relative',
          background: 'transparent',
          boxShadow: 'none'
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          style={{
            position: 'absolute',
            top: '-15px',
            right: '-15px',
            backgroundColor: 'white',
            color: 'black',
            border: 'none',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
          }}
          onClick={() => setPreviewImage(null)}
        >
          ×
        </button>
        <img
          src={previewImage}
          alt="Layout Zoom"
          style={{
            maxWidth: '100%',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: '4px',
            border: '2px solid white'
          }}
        />
        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <a
            href={previewImage}
            download={`Layout_${Date.now()}.jpg`}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
          >
            <Download size={14} />
            <span>{t('Tải Ảnh Về')}</span>
          </a>
        </div>
      </div>
    </div>
  );
};
