import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, Info, X, CircleAlert } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { dismissToast, getToastSnapshot, subscribeToToast } from '@/shared/feedback/mutationFeedback';
import './MutationToast.css';

export function MutationToast() {
  const toast = useSyncExternalStore(subscribeToToast, getToastSnapshot, () => null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!toast) return;
    const dismissFromBlankSpace = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (
        event.target.closest(
          'button, a, input, select, textarea, label, [role="button"], [role="menu"], [contenteditable="true"]'
        )
      )
        return;
      dismissToast();
    };
    const dismissFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissToast();
    };
    document.addEventListener('pointerdown', dismissFromBlankSpace, true);
    document.addEventListener('keydown', dismissFromKeyboard);
    return () => {
      document.removeEventListener('pointerdown', dismissFromBlankSpace, true);
      document.removeEventListener('keydown', dismissFromKeyboard);
    };
  }, [toast]);

  return createPortal(
    <div className="mutation-toast-region" role="status" aria-live="polite" aria-atomic="true">
      {toast && (
        <div key={toast.id} className={`mutation-toast mutation-toast--${toast.tone}`}>
          <span className="mutation-toast__icon" aria-hidden="true">
            {toast.tone === 'info' ? (
              <Info size={20} />
            ) : toast.tone === 'error' ? (
              <CircleAlert size={20} />
            ) : (
              <Check size={20} />
            )}
          </span>
          <div className="mutation-toast__content">
            <strong>{t(toast.text)}</strong>
            <p>{t(toast.detail)}</p>
          </div>
          <button
            type="button"
            className="mutation-toast__close"
            onClick={dismissToast}
            aria-label={t('Đóng thông báo')}
            title={t('Đóng thông báo')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
