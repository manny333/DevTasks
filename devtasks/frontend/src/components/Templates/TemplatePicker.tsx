import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { TaskTemplate } from '../../types';

interface TemplatePickerProps {
  projectId: string;
  onSelect: (template: TaskTemplate | null) => void;
  onClose: () => void;
}

export default function TemplatePicker({ projectId, onSelect, onClose }: TemplatePickerProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    api.get(`/projects/${projectId}/templates`)
      .then((res) => setTemplates(res.data))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = templates.filter((tpl) =>
    tpl.name.toLowerCase().includes(search.toLowerCase()) ||
    (tpl.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const createTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/templates`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        fields: [],
      });
      setTemplates((prev) => [...prev, res.data]);
      setForm({ name: '', description: '' });
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tpl: TaskTemplate) => {
    setEditingId(tpl.id);
    setForm({ name: tpl.name, description: tpl.description || '' });
    setShowCreate(false);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !form.name.trim()) return;
    setSaving(true);
    try {
      const res = await api.patch(`/templates/${editingId}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
      });
      setTemplates((prev) => prev.map((t) => (t.id === editingId ? res.data : t)));
      setEditingId(null);
      setForm({ name: '', description: '' });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: '', description: '' });
  };

  const deleteTemplate = async (id: string) => {
    await api.delete(`/templates/${id}`);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal template-picker-modal">
        {/* Header */}
        <div className="template-picker-header">
          <div>
            <h2>{t('templates.title')}</h2>
            <p className="template-modal-subtitle">{t('templates.subtitle')}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="loading-screen" style={{ height: 160 }}><div className="spinner" /></div>
        ) : (
          <>
            {/* Search */}
            {templates.length > 0 && (
              <div className="template-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder={t('templates.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="template-search-clear" onClick={() => setSearch('')}>×</button>
                )}
              </div>
            )}

            <div className="templates-list">
              {/* Blank task */}
              <button className="blank-template" onClick={() => onSelect(null)}>
                <div className="blank-template-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="11" x2="12" y2="17"/>
                    <line x1="9" y1="14" x2="15" y2="14"/>
                  </svg>
                </div>
                <div className="template-item-info">
                  <strong>{t('tasks.blankTask')}</strong>
                  <span>{t('templates.blankDesc')}</span>
                </div>
              </button>

              {/* Section label */}
              {filtered.length > 0 && (
                <div className="templates-section-label">
                  <span>{t('templates.saved')}</span>
                  <span className="templates-count">{filtered.length}</span>
                </div>
              )}

              {/* Template items */}
              {filtered.map((tpl) => (
                <div key={tpl.id} className="template-item">
                  {editingId === tpl.id ? (
                    <form className="create-template-form template-inline-edit" onSubmit={saveEdit}>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        autoFocus
                        required
                      />
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={2}
                      />
                      <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={cancelEdit}>
                          {t('common.cancel')}
                        </button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                          {saving ? t('common.loading') : t('common.save')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button className="template-item-btn" onClick={() => onSelect(tpl)}>
                        <span className="template-item-icon">📋</span>
                        <div className="template-item-info">
                          <strong>{tpl.name}</strong>
                          {tpl.description && <span>{tpl.description.slice(0, 80)}</span>}
                        </div>
                      </button>
                      <div className="template-actions">
                        <button className="btn-icon" onClick={() => startEdit(tpl)} title={t('common.edit')}>✏️</button>
                        <button className="btn-icon tag-delete-btn" onClick={() => deleteTemplate(tpl.id)} title={t('common.delete')}>×</button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Empty state */}
              {templates.length === 0 && (
                <div className="templates-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                    <line x1="9" y1="9" x2="15" y2="9"/>
                    <line x1="9" y1="13" x2="12" y2="13"/>
                  </svg>
                  <p>{t('templates.empty')}</p>
                </div>
              )}

              {/* No search results */}
              {templates.length > 0 && filtered.length === 0 && search && (
                <div className="templates-empty">
                  <p>{t('common.noResults')}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create form / button */}
        {!loading && (
          showCreate ? (
            <form className="create-template-form" onSubmit={createTemplate}>
              <input
                type="text"
                placeholder={t('templates.name')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                required
              />
              <textarea
                placeholder={t('templates.description')}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          ) : (
            <button
              className="template-create-btn"
              onClick={() => { setShowCreate(true); setEditingId(null); }}
            >
              <span>+</span> {t('templates.create')}
            </button>
          )
        )}
      </div>
    </div>
  );
}
