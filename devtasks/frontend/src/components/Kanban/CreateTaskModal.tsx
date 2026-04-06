import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { Tag, Task, TaskStatus, TaskPriority } from '../../types';

interface CreateTaskModalProps {
  sectionId: string;
  projectTags: Tag[];
  defaultStatus: TaskStatus;
  defaultTitle?: string;
  defaultDescription?: string;
  onClose: () => void;
  onCreate: (task: Task) => void;
}

export default function CreateTaskModal({
  sectionId,
  projectTags,
  defaultStatus,
  defaultTitle = '',
  defaultDescription = '',
  onClose,
  onCreate,
}: CreateTaskModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { titleRef.current?.focus(); return; }
    setSaving(true);
    try {
      const res = await api.post(`/sections/${sectionId}/tasks`, {
        title: title.trim(),
        status: defaultStatus,
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || null,
      });
      const task: Task = res.data;
      // Attach selected tags
      for (const tagId of selectedTagIds) {
        await api.post(`/tasks/${task.id}/tags`, { tagId });
        const tag = projectTags.find((tg) => tg.id === tagId)!;
        task.tags = [...(task.tags || []), { tagId, tag }];
      }
      onCreate(task);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal create-task-modal">
        {/* Header */}
        <div className="create-task-header">
          <div className="create-task-header-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span className="create-task-header-title">{t('tasks.create')}</span>
          <button className="btn-icon modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit} className="create-task-form">
          {/* Title — big and prominent */}
          <input
            ref={titleRef}
            className="create-task-title-input"
            type="text"
            placeholder={t('tasks.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Description */}
          <textarea
            className="create-task-desc-input"
            placeholder={t('tasks.description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />

          <div className="create-task-field create-task-field-grid">
            <div>
              <span className="create-task-field-label">{t('tasks.priority.title')}</span>
              <select
                className="create-task-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="LOW">{t('tasks.priority.low')}</option>
                <option value="MEDIUM">{t('tasks.priority.medium')}</option>
                <option value="HIGH">{t('tasks.priority.high')}</option>
                <option value="URGENT">{t('tasks.priority.urgent')}</option>
              </select>
            </div>
            <div>
              <span className="create-task-field-label">{t('tasks.dueDate')}</span>
              <input
                className="create-task-date-input"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          {projectTags.length > 0 && (
            <div className="create-task-field">
              <span className="create-task-field-label">{t('tags.title')}</span>
              <div className="create-task-tags-row">
                {projectTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`ct-tag-pill${selectedTagIds.has(tag.id) ? ' selected' : ''}`}
                    style={{ '--tag': tag.color } as React.CSSProperties}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span className="ct-tag-dot" />
                    {tag.name}
                    {selectedTagIds.has(tag.id) && <span className="ct-tag-remove">×</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="create-task-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
              {saving ? t('common.loading') : t('tasks.createAction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
