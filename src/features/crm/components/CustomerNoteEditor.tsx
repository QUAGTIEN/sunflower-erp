import React, { useEffect, useRef } from 'react';
import { sanitizeCustomerNoteHtml } from '@/features/crm/model/customerNote';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2
} from 'lucide-react';

interface CustomerNoteEditorProps {
  value: string;
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}

export function CustomerNoteEditor({ value, disabled = false, placeholder, onChange }: CustomerNoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor !== document.activeElement && editor.innerHTML !== value) editor.innerHTML = value;
  }, [value]);

  const runCommand = (command: string, argument?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChange(sanitizeCustomerNoteHtml(editorRef.current?.innerHTML || ''));
  };

  const addLink = () => {
    const url = window.prompt('Nhập đường dẫn bắt đầu bằng http:// hoặc https://');
    if (url && /^https?:\/\//i.test(url.trim())) runCommand('createLink', url.trim());
  };

  return (
    <div className={`customer-rich-note ${disabled ? 'is-disabled' : ''}`}>
      {!disabled && (
        <div
          className="customer-rich-note__toolbar"
          aria-label="Công cụ định dạng ghi chú"
          onMouseDown={event => event.preventDefault()}
        >
          <button type="button" title="Đậm" aria-label="Đậm" onClick={() => runCommand('bold')}>
            <Bold size={15} />
          </button>
          <button type="button" title="Nghiêng" aria-label="Nghiêng" onClick={() => runCommand('italic')}>
            <Italic size={15} />
          </button>
          <button type="button" title="Gạch chân" aria-label="Gạch chân" onClick={() => runCommand('underline')}>
            <Underline size={15} />
          </button>
          <span className="customer-rich-note__toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            title="Danh sách chấm"
            aria-label="Danh sách chấm"
            onClick={() => runCommand('insertUnorderedList')}
          >
            <List size={15} />
          </button>
          <button
            type="button"
            title="Danh sách số"
            aria-label="Danh sách số"
            onClick={() => runCommand('insertOrderedList')}
          >
            <ListOrdered size={15} />
          </button>
          <span className="customer-rich-note__toolbar-divider" aria-hidden="true" />
          <button type="button" title="Căn trái" aria-label="Căn trái" onClick={() => runCommand('justifyLeft')}>
            <AlignLeft size={15} />
          </button>
          <button type="button" title="Căn giữa" aria-label="Căn giữa" onClick={() => runCommand('justifyCenter')}>
            <AlignCenter size={15} />
          </button>
          <button type="button" title="Căn phải" aria-label="Căn phải" onClick={() => runCommand('justifyRight')}>
            <AlignRight size={15} />
          </button>
          <span className="customer-rich-note__toolbar-divider" aria-hidden="true" />
          <button type="button" title="Thêm liên kết" aria-label="Thêm liên kết" onClick={addLink}>
            <Link2 size={15} />
          </button>
          <button type="button" title="Hoàn tác" aria-label="Hoàn tác" onClick={() => runCommand('undo')}>
            <Undo2 size={15} />
          </button>
          <button type="button" title="Làm lại" aria-label="Làm lại" onClick={() => runCommand('redo')}>
            <Redo2 size={15} />
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        className="customer-rich-note__surface"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung ghi chú khách hàng"
        data-placeholder={placeholder}
        onInput={event => onChange(sanitizeCustomerNoteHtml(event.currentTarget.innerHTML))}
        onPaste={event => {
          event.preventDefault();
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
        }}
      />
    </div>
  );
}
