import React, { useEffect, useRef } from 'react';
import { sanitizeCustomerNoteHtml } from '@/features/crm/model/customerNote';

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
        <div className="customer-rich-note__toolbar" aria-label="Công cụ định dạng ghi chú" onMouseDown={event => event.preventDefault()}>
          <button type="button" onClick={() => runCommand('bold')}><strong>Đậm</strong></button>
          <button type="button" onClick={() => runCommand('italic')}><em>Nghiêng</em></button>
          <button type="button" onClick={() => runCommand('underline')}><u>Gạch chân</u></button>
          <button type="button" onClick={() => runCommand('insertUnorderedList')}>Danh sách chấm</button>
          <button type="button" onClick={() => runCommand('insertOrderedList')}>Danh sách số</button>
          <button type="button" onClick={() => runCommand('justifyLeft')}>Căn trái</button>
          <button type="button" onClick={() => runCommand('justifyCenter')}>Căn giữa</button>
          <button type="button" onClick={addLink}>Liên kết</button>
          <button type="button" onClick={() => runCommand('undo')}>Hoàn tác</button>
          <button type="button" onClick={() => runCommand('redo')}>Làm lại</button>
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
