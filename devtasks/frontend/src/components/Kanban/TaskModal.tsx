import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Task, Tag, Comment, Section, TaskAssignee, TaskAttachment, ProjectMember } from '../../types';
import AttachmentDropZone from './AttachmentDropZone';

interface TaskModalProps {
  task: Task;
  projectTags: Tag[];
  projectMembers?: ProjectMember[];
  canEdit?: boolean;
  allSections?: Section[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => Promise<void>;
  onMoveSection?: (task: Task, sectionId: string) => void;
}

export default function TaskModal({ task, projectTags, projectMembers = [], canEdit = true, allSections, onClose, onUpdate, onDelete, onMoveSection }: TaskModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const backendBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/api\/?$/, '');
  const getAttachmentUrl = (url: string) => (url.startsWith('http') ? url : `${backendBaseUrl}${url}`);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [sectionMenuPos, setSectionMenuPos] = useState({ top: 0, left: 0 });
  const sectionBtnRef = useRef<HTMLButtonElement>(null);
  const sectionMenuRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeAdding, setAssigneeAdding] = useState(false);
  const [assigneeError, setAssigneeError] = useState('');
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const assigneeBtnRef = useRef<HTMLButtonElement>(null);

  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentView, setAttachmentView] = useState<'grid' | 'list'>('grid');
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const currentSection = (allSections || []).find((s) => s.id === task.sectionId);

  // Close section dropdown on outside click
  useEffect(() => {
    if (!sectionMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node) &&
          sectionBtnRef.current && !sectionBtnRef.current.contains(e.target as Node)) {
        setSectionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sectionMenuOpen]);

  // Close tag picker on outside click
  useEffect(() => {
    if (!tagPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node) &&
        tagBtnRef.current && !tagBtnRef.current.contains(e.target as Node)
      ) setTagPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagPickerOpen]);

  const handleSectionBtnClick = () => {
    if (!sectionMenuOpen && sectionBtnRef.current) {
      const rect = sectionBtnRef.current.getBoundingClientRect();
      setSectionMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setSectionMenuOpen((o) => !o);
  };

  useEffect(() => {
    api.get(`/tasks/${task.id}/comments`).then((res) => setComments(res.data));
  }, [task.id]);

  useEffect(() => {
    api.get(`/tasks/${task.id}/assignees`).then((res) => setAssignees(res.data));
  }, [task.id]);

  useEffect(() => {
    api.get(`/tasks/${task.id}/attachments`).then((res) => setAttachments(res.data));
  }, [task.id]);

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    setAttachmentUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post(`/tasks/${task.id}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setAttachments((prev) => [...prev, res.data]);
      }
    } catch { /* ignore */ } finally {
      setAttachmentUploading(false);
    }
  };

  const deleteAttachment = async (id: string) => {
    await api.delete(`/tasks/${task.id}/attachments/${id}`);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addAssignee = async (userId: string) => {
    setAssigneeError('');
    setAssigneeAdding(true);
    const member = projectMembers.find((m) => m.userId === userId);
    if (!member) { setAssigneeAdding(false); return; }
    try {
      const res = await api.post(`/tasks/${task.id}/assignees`, {
        email: member.user.email,
        accessType: 'VIEWER',
      });
      const newAssignees = [...assignees, res.data];
      setAssignees(newAssignees);
      onUpdate({ ...task, assignees: newAssignees });
    } catch (err: any) {
      setAssigneeError(err?.response?.data?.error || t('members.inviteError'));
    } finally {
      setAssigneeAdding(false);
    }
  };

  // Close assignee picker on outside click
  useEffect(() => {
    if (!assigneePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node) &&
        assigneeBtnRef.current && !assigneeBtnRef.current.contains(e.target as Node)
      ) setAssigneePickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [assigneePickerOpen]);

  const removeAssignee = async (userId: string) => {
    try {
      await api.delete(`/tasks/${task.id}/assignees/${userId}`);
      const newAssignees = assignees.filter((a) => a.userId !== userId);
      setAssignees(newAssignees);
      onUpdate({ ...task, assignees: newAssignees });
    } catch { /* ignore */ }
  };

  // Close on Escape — lightbox first, then modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, lightbox]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/tasks/${task.id}`, { title, description });
      onUpdate(res.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    const res = await api.patch(`/tasks/${task.id}/archive`);
    onUpdate({ ...task, archived: res.data.archived });
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    const res = await api.post(`/tasks/${task.id}/comments`, { content: commentInput });
    setComments((prev) => [...prev, res.data]);
    setCommentInput('');
  };

  const deleteComment = async (commentId: string) => {
    await api.delete(`/tasks/${task.id}/comments/${commentId}`);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const addTag = async (tagId: string) => {
    await api.post(`/tasks/${task.id}/tags`, { tagId });
    const tag = projectTags.find((t) => t.id === tagId)!;
    onUpdate({ ...task, tags: [...task.tags, { tagId, tag }] });
  };

  const removeTag = async (tagId: string) => {
    await api.delete(`/tasks/${task.id}/tags/${tagId}`);
    onUpdate({ ...task, tags: task.tags.filter((tt) => tt.tagId !== tagId) });
  };

  const assignedTagIds = new Set(task.tags.map((tt) => tt.tagId));
  const availableTags = projectTags.filter((t) => !assignedTagIds.has(t.id));

  return (
    <div
      className="task-drawer-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="task-drawer">
        {/* Header */}
        <div className="task-modal-header">
          {editing ? (
            <input
              className="task-modal-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          ) : (
            <h2 className="task-modal-title" onClick={() => canEdit && setEditing(true)}>
              {task.title}
            </h2>
          )}
          <button className="btn-icon modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tags row */}
        <div className="task-modal-tags">
          {task.tags.map(({ tag }) => (
            <span
              key={tag.id}
              className="tag-badge"
              style={{ backgroundColor: tag.color }}
              onClick={() => canEdit && removeTag(tag.id)}
              title={canEdit ? 'Click to remove' : undefined}
            >
              {tag.name}{canEdit && ' ×'}
            </span>
          ))}
          {canEdit && availableTags.length > 0 && (
            <>
              <button
                ref={tagBtnRef}
                className="tag-add-btn"
                onClick={() => setTagPickerOpen((o) => !o)}
              >+ tag</button>
              {tagPickerOpen && createPortal(
                <div
                  ref={tagPickerRef}
                  className="tag-picker-dropdown"
                  style={(() => {
                    const rect = tagBtnRef.current?.getBoundingClientRect();
                    return rect
                      ? { position: 'fixed' as const, top: rect.bottom + 4, left: rect.left }
                      : { position: 'fixed' as const, top: 0, left: 0 };
                  })()}
                >
                  {availableTags.map((t) => (
                    <button
                      key={t.id}
                      className="tag-picker-item"
                      onClick={() => { addTag(t.id); setTagPickerOpen(false); }}
                    >
                      <span className="tag-picker-dot" style={{ background: t.color }} />
                      {t.name}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </>
          )}
        </div>

        {/* Description */}
        <div className="task-modal-section">
          {editing ? (
            <textarea
              className="task-modal-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('tasks.description')}
              rows={6}
            />
          ) : (
            <div
              className="task-modal-desc markdown-body"
              onClick={() => canEdit && setEditing(true)}
            >
              {description ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
              ) : (
                <span className="desc-placeholder">{t('tasks.description')}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="task-modal-actions">
          {editing ? (
            <>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {t('common.save')}
              </button>
              <button className="btn-secondary" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </button>
            </>
          ) : canEdit ? (
            <>
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                {t('common.edit')}
              </button>
              <button className="btn-secondary" onClick={archive}>
                {task.archived ? t('tasks.unarchive') : t('tasks.archive')}
              </button>
              {allSections && allSections.length > 1 && onMoveSection && (
                <>
                  <button
                    ref={sectionBtnRef}
                    className="btn-secondary task-modal-section-btn"
                    onClick={handleSectionBtnClick}
                  >
                    {currentSection && (
                      <span className="task-modal-section-dot" style={{ background: currentSection.color }} />
                    )}
                    {currentSection?.name ?? t('tasks.moveTo')}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {sectionMenuOpen && createPortal(
                    <div
                      ref={sectionMenuRef}
                      className="task-card-dropdown"
                      style={{ position: 'fixed', top: sectionMenuPos.top, left: sectionMenuPos.left }}
                    >
                      <div className="task-card-dropdown-label">{t('tasks.moveTo')}</div>
                      {allSections.map((sec) => (
                        <button
                          key={sec.id}
                          className={`task-card-dropdown-item ${sec.id === task.sectionId ? 'active' : ''}`}
                          onClick={() => { setSectionMenuOpen(false); if (sec.id !== task.sectionId) onMoveSection(task, sec.id); }}
                        >
                          <span className="task-card-dropdown-dot" style={{ background: sec.color }} />
                          {sec.name}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </>
              )}
              <button className="btn-danger" onClick={() => onDelete(task.id)}>
                {t('common.delete')}
              </button>
            </>
          ) : null}
        </div>

        {/* Assignees */}
        <div className="task-modal-assignees">
          <div className="task-assignees-inline">
            <span className="task-assignees-label">{t('members.title')}</span>
            <div className="task-assignees-chips">
              {assignees.map((a) => (
                <div key={a.userId} className="task-assignee-chip" title={a.user.name}>
                  {a.user.avatar ? (
                    <img src={a.user.avatar} alt={a.user.name} />
                  ) : (
                    <span>{a.user.name.charAt(0).toUpperCase()}</span>
                  )}
                  {canEdit && (
                    <button
                      className="task-assignee-chip-remove"
                      onClick={() => removeAssignee(a.userId)}
                      title={t('members.remove')}
                    >×</button>
                  )}
                </div>
              ))}
              {canEdit && (() => {
                const assignedIds = new Set(assignees.map((a) => a.userId));
                const unassigned = projectMembers.filter((m) => !assignedIds.has(m.userId));
                if (unassigned.length === 0) return null;
                return (
                  <>
                    <button
                      ref={assigneeBtnRef}
                      className="task-assignee-add-chip"
                      disabled={assigneeAdding}
                      onClick={() => setAssigneePickerOpen((o) => !o)}
                      title={t('tasks.assignMember')}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                    {assigneePickerOpen && createPortal(
                      <div ref={assigneePickerRef} className="assignee-picker-dropdown" style={(() => {
                        const rect = assigneeBtnRef.current?.getBoundingClientRect();
                        return rect ? { position: 'fixed' as const, top: rect.bottom + 4, left: rect.left } : { position: 'fixed' as const, top: 0, left: 0 };
                      })()}>
                        {unassigned.map((m) => (
                          <button
                            key={m.userId}
                            className="assignee-picker-item"
                            onClick={() => { addAssignee(m.userId); setAssigneePickerOpen(false); }}
                          >
                            {m.user.avatar ? (
                              <img className="member-avatar" src={m.user.avatar} alt={m.user.name} />
                            ) : (
                              <div className="member-avatar member-avatar-initial">{m.user.name.charAt(0).toUpperCase()}</div>
                            )}
                            <div className="assignee-picker-info">
                              <span className="assignee-picker-name">{m.user.name}</span>
                              <span className="assignee-picker-email">{m.user.email}</span>
                            </div>
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          {assigneeError && <p className="member-error">{assigneeError}</p>}
        </div>

        {/* Attachments */}
        <div className="task-modal-attachments">
          <div className="task-modal-attachments-header">
            <h3 className="task-modal-attachments-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              {t('attachments.title')}
              {attachments.length > 0 && <span className="attachment-count">{attachments.length}</span>}
            </h3>
            {attachments.length > 0 && (
              <div className="attachment-view-toggle">
                <button
                  className={`attachment-view-btn${attachmentView === 'grid' ? ' active' : ''}`}
                  onClick={() => setAttachmentView('grid')}
                  title={t('attachments.viewGrid')}
                >
                  {/* grid icon: 4 squares */}
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
                  {/* list icon: 3 rows */}
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

        {/* Comments */}
        <div className="task-modal-comments">
          <h3>{t('comments.title')}</h3>
          <div className="comments-list">
            {comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-author">
                  {comment.author.avatar && (
                    <img src={comment.author.avatar} alt={comment.author.name} className="avatar-xs" />
                  )}
                  <strong>{comment.author.name}</strong>
                  <span className="comment-date">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="comment-content markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.content}</ReactMarkdown>
                </div>
                {comment.authorId === user?.id && (
                  <button className="comment-delete" onClick={() => deleteComment(comment.id)}>
                    {t('comments.delete')}
                  </button>
                )}
              </div>
            ))}
          </div>

          <form className="comment-form" onSubmit={addComment}>
            <textarea
              placeholder={t('comments.placeholder')}
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              rows={3}
            />
            <button type="submit" className="btn-primary">{t('comments.add')}</button>
          </form>
        </div>
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
    </div>
  );
}
