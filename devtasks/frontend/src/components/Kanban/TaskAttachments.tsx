import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { TaskAttachment } from '../../types';
import AttachmentDropZone from './AttachmentDropZone';

interface TaskAttachmentsProps {
  taskId: string;
  canEdit: boolean;
}

export default function TaskAttachments({ taskId, canEdit }: TaskAttachmentsProps) {
  const { t } = useTranslation();
  const backendBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/api\/?$/, '');
  const getAttachmentUrl = (url: string) => (url.startsWith('http') ? url : `${backendBaseUrl}${url}`);

  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentView, setAttachmentView] = useState<'grid' | 'list'>('grid');
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(true);

  useEffect(() => {
    api.get(`/tasks/${taskId}/attachments`).then((res) => setAttachments(res.data));
  }, [taskId]);

  // Close the lightbox on Escape without letting the event reach the task modal.
  // Capture phase runs before TaskModal's window keydown listener, so the modal stays open.
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setLightbox(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [lightbox]);

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    setAttachmentUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post(`/tasks/${taskId}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setAttachments((prev) => [...prev, res.data]);
      }
    } catch { /* ignore */ } finally {
      setAttachmentUploading(false);
    }
  };

  const deleteAttachment = async (id: string) => {
    await api.delete(`/tasks/${taskId}/attachments/${id}`);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Attachments */}
      <div className="task-modal-section-collapse">
        <div className="task-modal-section-collapse-header" onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}>
          <h3 className="task-modal-attachments-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            {t('attachments.title')}
            {attachments.length > 0 && <span className="attachment-count">{attachments.length}</span>}
          </h3>
          <svg className={`task-modal-section-collapse-arrow${attachmentsExpanded ? ' open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
        {attachmentsExpanded && (
          <div className="task-modal-section-collapse-body">
            <div className="task-modal-attachments-header" style={{ paddingTop: 0 }}>
              {attachments.length > 0 && (
                <div className="attachment-view-toggle">
                  <button
                    className={`attachment-view-btn${attachmentView === 'grid' ? ' active' : ''}`}
                    onClick={() => setAttachmentView('grid')}
                    title={t('attachments.viewGrid')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="3" y="3" width="8" height="8" rx="1"/>
                      <rect x="13" y="3" width="8" height="8" rx="1"/>
                      <rect x="3" y="13" width="8" height="8" rx="1"/>
                      <rect x="13" y="13" width="8" height="8" rx="1"/>
                    </svg>
                  </button>
                  <button
                    className={`attachment-view-btn${attachmentView === 'list' ? ' active' : ''}`}
                    onClick={() => setAttachmentView('list')}
                    title={t('attachments.viewList')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="3" y1="6" x2="21" y2="6"/>
                      <line x1="3" y1="12" x2="21" y2="12"/>
                      <line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {attachments.length > 0 && (
              attachmentView === 'grid' ? (
                <div className="attachment-grid">
                  {attachments.map((a) => {
                    const isImage = a.mimeType.startsWith('image/');
                    const fullUrl = getAttachmentUrl(a.url);
                    return (
                      <div key={a.id} className="attachment-grid-cell">
                        {isImage ? (
                          <button
                            className="attachment-grid-thumb-btn"
                            onClick={() => setLightbox({ url: fullUrl, name: a.filename })}
                            title={a.filename}
                          >
                            <img className="attachment-grid-img" src={fullUrl} alt={a.filename} loading="lazy" />
                          </button>
                        ) : (
                          <a
                            className="attachment-grid-pdf"
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={a.filename}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="9" y1="13" x2="15" y2="13"/>
                              <line x1="9" y1="17" x2="13" y2="17"/>
                            </svg>
                            <span className="attachment-grid-pdf-name">{a.filename}</span>
                          </a>
                        )}
                        {canEdit && (
                          <button
                            className="attachment-grid-delete"
                            title={t('attachments.delete')}
                            onClick={() => deleteAttachment(a.id)}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="attachment-list">
                  {attachments.map((a) => {
                    const isImage = a.mimeType.startsWith('image/');
                    const fullUrl = getAttachmentUrl(a.url);
                    return (
                      <div key={a.id} className="attachment-item">
                        {isImage ? (
                          <button
                            className="attachment-thumb-btn"
                            onClick={() => setLightbox({ url: fullUrl, name: a.filename })}
                            title={a.filename}
                          >
                            <img className="attachment-thumb" src={fullUrl} alt={a.filename} loading="lazy" />
                          </button>
                        ) : (
                          <a
                            className="attachment-pdf-icon"
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={a.filename}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                          </a>
                        )}
                        <div className="attachment-meta">
                          {isImage ? (
                            <button
                              className="attachment-name attachment-name-btn"
                              onClick={() => setLightbox({ url: fullUrl, name: a.filename })}
                            >{a.filename}</button>
                          ) : (
                            <a className="attachment-name" href={fullUrl} target="_blank" rel="noopener noreferrer">
                              {a.filename}
                            </a>
                          )}
                          <span className="attachment-size">{formatBytes(a.size)}</span>
                        </div>
                        {canEdit && (
                          <button
                            className="btn-icon attachment-delete"
                            title={t('attachments.delete')}
                            onClick={() => deleteAttachment(a.id)}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {canEdit && (
              <AttachmentDropZone
                onFiles={handleFiles}
                uploading={attachmentUploading}
              />
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && createPortal(
        <div
          className="attachment-lightbox-overlay"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
        >
          <button className="attachment-lightbox-close" onClick={() => setLightbox(null)}>×</button>
          <img
            className="attachment-lightbox-img"
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="attachment-lightbox-name">{lightbox.name}</span>
        </div>,
        document.body
      )}
    </>
  );
}
