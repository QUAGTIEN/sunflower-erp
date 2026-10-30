import { useEffect, useRef, useState } from 'react';
import './PrintPreviewDialog.css';

interface Props {
  /** Heading of the preview, e.g. "Xem phiếu in — LSX-2610-0001". */
  title: string;
  /** Accessible name of the sheet inside the frame. */
  frameTitle: string;
  /** Complete HTML document of the sheet, with its own print CSS. */
  html: string;
  onClose: () => void;
}

/**
 * Full-screen preview of a printable sheet. Export opens the browser print dialog once the sheet and its fonts are
 * ready, where the user picks "Save as PDF"; no PDF library is needed and Vietnamese text keeps the screen fonts.
 */
export function PrintPreviewDialog({ title, frameTitle, html, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  const print = () => {
    frame.current?.contentWindow?.focus();
    frame.current?.contentWindow?.print();
  };

  return (
    <dialog
      ref={dialog}
      className="erp-print-dialog"
      aria-labelledby="erp-print-dialog-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="erp-print-dialog__header">
        <h2 id="erp-print-dialog-title">{title}</h2>
        <div>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={print}>
            In / lưu PDF
          </button>
        </div>
      </header>
      <iframe
        ref={frame}
        title={frameTitle}
        sandbox="allow-same-origin allow-modals"
        srcDoc={html}
        onLoad={event => {
          const fonts = event.currentTarget.contentDocument?.fonts;
          const markReady = () => {
            setReady(true);
            print();
          };
          if (fonts) void fonts.ready.then(markReady);
          else markReady();
        }}
      />
    </dialog>
  );
}
