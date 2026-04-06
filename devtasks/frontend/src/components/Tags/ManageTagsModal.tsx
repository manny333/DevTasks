import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { Tag } from '../../types';

interface ManageTagsModalProps {
  projectId: string;
  tags: Tag[];
  onClose: () => void;
  onTagsChange: (tags: Tag[]) => void;
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

export default function ManageTagsModal({ projectId, tags, onClose, onTagsChange }: ManageTagsModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [localTags, setLocalTags] = useState<Tag[]>(tags);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const createTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/tags`, { name: name.trim(), color });
      const updated = [...localTags, res.data];
      setLocalTags(updated);
      onTagsChange(updated);
      setName('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error creating tag');
    } finally {
      setSaving(false);
    }
  };

  const deleteTag = async (tagId: string) => {
    try {
      await api.delete(`/tags/${tagId}`);
      const updated = localTags.filter((t) => t.id !== tagId);
      setLocalTags(updated);
      onTagsChange(updated);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal manage-tags-modal">
        <div className="manage-tags-header">
          <h2>{t('tags.title')}</h2>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        {/* Existing tags */}
        <div className="tags-list">
          {localTags.length === 0 && (
            <p className="empty-state" style={{ padding: '12px 0', fontSize: 13 }}>
              No hay etiquetas aún
            </p>
          )}
          {localTags.map((tag) => (
            <div key={tag.id} className="tag-list-item">
              <span className="tag-color-dot" style={{ backgroundColor: tag.color }} />
              <span className="tag-list-name">{tag.name}</span>
              <button
                className="btn-icon tag-delete-btn"
                onClick={() => deleteTag(tag.id)}
                title={t('common.delete')}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Create new tag */}
        <form className="create-tag-form" onSubmit={createTag}>
          <div className="create-tag-row">
            <input
              type="text"
              placeholder={t('tags.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={32}
            />
          </div>
          <div className="color-picker-row">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${color === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
              {saving ? t('common.loading') : t('tags.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
