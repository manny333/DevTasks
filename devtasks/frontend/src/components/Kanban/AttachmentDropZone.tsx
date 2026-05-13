import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

interface AttachmentDropZoneProps {
  onFiles: (files: File[]) => void;
  uploading: boolean;
  disabled?: boolean;
}

export default function AttachmentDropZone({ onFiles, uploading, disabled }: AttachmentDropZoneProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0); // tracks nested dragenter/dragleave correctly

  const filterFiles = (files: File[]) => files.filter((f) => ALLOWED_TYPES.includes(f.type));

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    if (disabled || uploading) return;
    const files = filterFiles(Array.from(e.dataTransfer.files));
    if (files.length) onFiles(files);
  }, [disabled, uploading, onFiles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = filterFiles(Array.from(e.target.files ?? []));
    if (files.length) onFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Global paste: only when user isn't typing in a text field
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (disabled || uploading) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const items = Array.from(e.clipboardData?.items ?? []);
      const files = items
        .filter((item) => item.kind === 'file' && ALLOWED_TYPES.includes(item.type))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);

      if (files.length) {
        e.preventDefault();
        onFiles(files);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [disabled, uploading, onFiles]);

  return (
    <div
      className={`attachment-dropzone${dragging ? ' attachment-dropzone--over' : ''}${uploading ? ' attachment-dropzone--uploading' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !disabled && !uploading && fileInputRef.current?.click()}
      aria-label={t('attachments.dropzone')}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      <svg className="attachment-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>

      <span className="attachment-dropzone-label">
        {uploading
          ? t('attachments.uploading')
          : dragging
          ? t('attachments.dropHere')
          : t('attachments.dropzoneHint')}
      </span>
      {!uploading && !dragging && (
        <span className="attachment-dropzone-sub">{t('attachments.pasteHint')}</span>
      )}
    </div>
  );
}
