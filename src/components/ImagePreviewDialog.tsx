import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ImagePreviewDialogProps {
  /** Image URL or Data URL to show. */
  src: string;
  onClose: () => void;
  /** Prefix for the downloaded file name. */
  downloadPrefix?: string;
}

/** Full-size image preview with a download action. Clicking the backdrop closes it. */
export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({ src, onClose, downloadPrefix = 'Preview' }) => {
  const { t } = useLanguage();
  // Captured once so the file name stays stable across re-renders.
  const [openedAt] = useState(() => Date.now());

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-content"
        style={{ maxWidth: '90%', maxHeight: '90%', padding: '10px', position: 'relative' }}
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-sm btn-outline btn-symbol-sm"
          style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}
          onClick={onClose}
          aria-label={t('Đóng')}
          title={t('Đóng')}
        >
          <X size={20} />
        </button>
        <img
          src={src}
          alt="Preview Zoom"
          style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block', margin: '0 auto' }}
        />
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <a
            href={src}
            download={`${downloadPrefix}_${openedAt}.jpg`}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
          >
            <Download size={14} />
            <span>{t('Tải Ảnh Về')}</span>
          </a>
        </div>
      </div>
    </div>
  );
};
