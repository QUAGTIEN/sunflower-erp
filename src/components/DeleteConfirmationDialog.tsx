import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { cancelDeleteConfirmations, getDeleteConfirmationSnapshot, resolveDeleteConfirmation, subscribeToDeleteConfirmation } from '@/shared/feedback/deleteConfirmation';
import './DeleteConfirmationDialog.css';

export function DeleteConfirmationDialog() {
  const request = useSyncExternalStore(subscribeToDeleteConfirmation, getDeleteConfirmationSnapshot, () => null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { t } = useLanguage();

  useEffect(() => () => cancelDeleteConfirmations(), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!request || !dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (!getDeleteConfirmationSnapshot() && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      });
    };
  }, [request]);

  if (!request) return null;
  const close = () => resolveDeleteConfirmation(request.id, false);
  return createPortal(
    <dialog ref={dialogRef} className="delete-confirmation" aria-labelledby="delete-confirmation-title" aria-describedby="delete-confirmation-message"
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="delete-confirmation__body">
        <span className="delete-confirmation__icon" aria-hidden="true"><Trash2 size={24} /></span>
        <button type="button" className="delete-confirmation__close" onClick={close} aria-label={t('Đóng')}><X size={18} aria-hidden="true" /></button>
        <h2 id="delete-confirmation-title">{t(request.title)}</h2>
        <p id="delete-confirmation-message">{t(request.message)}</p>
      </div>
      <footer>
        <button ref={cancelRef} type="button" className="btn btn-outline" onClick={close}>{t('Hủy')}</button>
        <button type="button" className="btn delete-confirmation__submit" onClick={() => resolveDeleteConfirmation(request.id, true)}>{t(request.confirmLabel)}</button>
      </footer>
    </dialog>, document.body
  );
}
