import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/errors';
import type {
  DocumentCategory,
  ProjectDocument,
  ProjectDocumentSummary,
} from '../../types';

const CATEGORIES: DocumentCategory[] = [
  'SPEC',
  'REQUIREMENTS',
  'ARCHITECTURE',
  'DECISION',
  'GUIDE',
  'RUNBOOK',
  'OTHER',
];

interface ProjectDocsProps {
  projectId: string;
  canEdit: boolean;
  canArchive: boolean;
  initialDocumentId?: string;
}

interface EditorState {
  document: ProjectDocument | null;
  mode: 'create' | 'edit';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function ProjectDocs({ projectId, canEdit, canArchive, initialDocumentId }: ProjectDocsProps) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<ProjectDocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectDocument | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'' | DocumentCategory>('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialDocumentId) setSelectedId(initialDocumentId);
  }, [initialDocumentId]);

  const categoryLabel = (value: DocumentCategory) => t(`docs.categories.${value}`);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      api
        .get<ProjectDocumentSummary[]>(`/projects/${projectId}/documents`, {
          params: {
            ...(query.trim() ? { q: query.trim() } : {}),
            ...(category ? { category } : {}),
            ...(includeArchived ? { includeArchived: true } : {}),
          },
        })
        .then((res) => {
          if (cancelled) return;
          setDocuments(res.data);
          setSelectedId((current) => {
            if (current && res.data.some((doc) => doc.id === current)) return current;
            return res.data[0]?.id ?? null;
          });
        })
        .catch((err) => {
          if (!cancelled) setError(getApiErrorMessage(err, t('docs.loadError')));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, query, category, includeArchived, reloadToken, t]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api
      .get<ProjectDocument>(`/projects/${projectId}/documents/${selectedId}`)
      .then((res) => {
        if (!cancelled) setSelected(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, t('docs.loadError')));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedId, reloadToken, t]);

  const refresh = (nextId?: string) => {
    if (nextId) setSelectedId(nextId);
    setReloadToken((value) => value + 1);
  };

  const openCreate = () => {
    setEditorError('');
    setEditor({ mode: 'create', document: null });
  };

  const openEdit = () => {
    if (!selected) return;
    setEditorError('');
    setEditor({ mode: 'edit', document: selected });
  };

  const saveDocument = async (input: {
    title: string;
    category: DocumentCategory;
    content: string;
    isPinned: boolean;
    changeNote?: string;
  }) => {
    if (!editor) return;
    setSaving(true);
    setEditorError('');
    try {
      const res = editor.mode === 'edit' && editor.document
        ? await api.patch<ProjectDocument>(
          `/projects/${projectId}/documents/${editor.document.id}`,
          input
        )
        : await api.post<ProjectDocument>(`/projects/${projectId}/documents`, input);
      setEditor(null);
      refresh(res.data.id);
    } catch (err) {
      setEditorError(getApiErrorMessage(err, t('docs.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (document: ProjectDocumentSummary) => {
    setError('');
    try {
      const res = await api.patch<ProjectDocument>(
        `/projects/${projectId}/documents/${document.id}`,
        { isPinned: !document.isPinned }
      );
      if (selected?.id === document.id) setSelected(res.data);
      refresh(document.id);
    } catch (err) {
      setError(getApiErrorMessage(err, t('docs.saveError')));
    }
  };

  const toggleArchive = async (document: ProjectDocumentSummary) => {
    if (!canArchive) return;
    setError('');
    try {
      await api.post(`/projects/${projectId}/documents/${document.id}/archive`, {
        archived: !document.isArchived,
      });
      if (!document.isArchived && selectedId === document.id) setSelectedId(null);
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, t('docs.saveError')));
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMessage('');
    setError('');
    const form = new FormData();
    Array.from(files).forEach((file) => form.append('files', file));
    if (category) form.append('category', category);
    try {
      const res = await api.post<{
        created: ProjectDocument[];
        skipped: { filename: string; documentId: string }[];
        imported: number;
      }>(`/projects/${projectId}/documents/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const created = res.data.created ?? [];
      const skipped = res.data.skipped ?? [];
      if (created[0]) {
        setSelectedId(created[0].id);
      }
      setUploadMessage(
        skipped.length > 0
          ? t('docs.uploadSkipped', { created: created.length, skipped: skipped.length })
          : t('docs.uploadDone', { count: created.length })
      );
      refresh(created[0]?.id);
    } catch (err) {
      setError(getApiErrorMessage(err, t('docs.uploadError')));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const pinnedCount = useMemo(
    () => documents.filter((document) => document.isPinned && !document.isArchived).length,
    [documents]
  );

  return (
    <div className="project-docs">
      <header className="docs-header">
        <div>
          <h2>{t('docs.title')}</h2>
          <p>{t('docs.subtitle')}</p>
        </div>
        <div className="docs-header-actions">
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                multiple
                hidden
                onChange={(event) => void uploadFiles(event.target.files)}
              />
              <button
                className="btn-secondary"
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? t('docs.uploading') : t('docs.upload')}
              </button>
              <button className="btn-primary" type="button" onClick={openCreate}>
                {t('docs.new')}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="docs-toolbar">
        <input
          className="docs-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('docs.searchPlaceholder')}
        />
        <select
          className="docs-filter"
          value={category}
          onChange={(event) => setCategory(event.target.value as '' | DocumentCategory)}
        >
          <option value="">{t('docs.allCategories')}</option>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>{categoryLabel(value)}</option>
          ))}
        </select>
        <label className="docs-archived-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          {t('docs.includeArchived')}
        </label>
        <span className="docs-count">
          {t('docs.count', { count: documents.length, pinned: pinnedCount })}
        </span>
      </div>

      {uploadMessage && <div className="docs-notice">{uploadMessage}</div>}
      {error && <div className="docs-error">{error}</div>}

      <div className="docs-layout">
        <aside className="docs-list" aria-label={t('docs.title')}>
          {loading ? (
            <div className="docs-empty">{t('common.loading')}</div>
          ) : documents.length === 0 ? (
            <div className="docs-empty">
              <strong>{t('docs.emptyTitle')}</strong>
              <span>{t('docs.emptyBody')}</span>
            </div>
          ) : (
            documents.map((document) => (
              <button
                key={document.id}
                type="button"
                className={`docs-list-item ${selectedId === document.id ? 'active' : ''} ${document.isArchived ? 'archived' : ''}`}
                onClick={() => setSelectedId(document.id)}
              >
                <div className="docs-list-topline">
                  <span className="docs-category">{categoryLabel(document.category)}</span>
                  {document.isPinned && <span className="docs-pin" title={t('docs.pinned')}>★</span>}
                  {document.isArchived && <span className="docs-archived-badge">{t('docs.archived')}</span>}
                </div>
                <strong className="docs-list-title">{document.title}</strong>
                <span className="docs-list-excerpt">{document.excerpt}</span>
                <span className="docs-list-meta">
                  {document.author?.name ?? '—'} · {formatDate(document.updatedAt)} · {formatSize(document.size)}
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="docs-preview">
          {!selectedId ? (
            <div className="docs-preview-empty">
              <div className="docs-preview-empty-icon">#</div>
              <h3>{t('docs.selectTitle')}</h3>
              <p>{t('docs.selectBody')}</p>
            </div>
          ) : detailLoading && !selected ? (
            <div className="docs-empty">{t('common.loading')}</div>
          ) : selected ? (
            <>
              <div className="docs-preview-header">
                <div>
                  <div className="docs-preview-eyebrow">
                    <span className="docs-category">{categoryLabel(selected.category)}</span>
                    {selected.isPinned && <span className="docs-pin">{t('docs.pinned')}</span>}
                  </div>
                  <h2>{selected.title}</h2>
                  <p className="docs-preview-meta">
                    {selected.author?.name ?? '—'} · {formatDate(selected.updatedAt)} · {formatSize(selected.size)}
                  </p>
                </div>
                <div className="docs-preview-actions">
                  {canEdit && (
                    <button className="btn-secondary" type="button" onClick={openEdit}>
                      {t('common.edit')}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      className="docs-icon-btn"
                      type="button"
                      title={selected.isPinned ? t('docs.unpin') : t('docs.pin')}
                      onClick={() => void togglePin(selected)}
                    >
                      {selected.isPinned ? '★' : '☆'}
                    </button>
                  )}
                  {canArchive && (
                    <button
                      className="docs-icon-btn"
                      type="button"
                      title={selected.isArchived ? t('docs.restore') : t('docs.archive')}
                      onClick={() => void toggleArchive(selected)}
                    >
                      {selected.isArchived ? '↺' : '⌫'}
                    </button>
                  )}
                </div>
              </div>
              <div className="docs-markdown markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown>
              </div>
            </>
          ) : null}
        </section>
      </div>

      {editor && (
        <DocumentEditor
          key={editor.document?.id ?? 'new'}
          initial={editor.document}
          saving={saving}
          error={editorError}
          onClose={() => setEditor(null)}
          onSave={saveDocument}
        />
      )}
    </div>
  );
}

function DocumentEditor({
  initial,
  saving,
  error,
  onClose,
  onSave,
}: {
  initial: ProjectDocument | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: {
    title: string;
    category: DocumentCategory;
    content: string;
    isPinned: boolean;
    changeNote?: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<DocumentCategory>(initial?.category ?? 'OTHER');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isPinned, setIsPinned] = useState(initial?.isPinned ?? false);
  const [changeNote, setChangeNote] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    void onSave({
      title: title.trim(),
      category,
      content,
      isPinned,
      ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
    });
  };

  return (
    <div className="docs-editor-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="docs-editor" onSubmit={submit}>
        <header className="docs-editor-header">
          <div>
            <h2>{initial ? t('docs.editTitle') : t('docs.createTitle')}</h2>
            <p>{t('docs.editorHint')}</p>
          </div>
          <button className="docs-icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </header>

        <div className="docs-editor-fields">
          <label>
            <span>{t('docs.documentTitle')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label>
            <span>{t('docs.category')}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{t(`docs.categories.${value}`)}</option>
              ))}
            </select>
          </label>
          <label className="docs-pin-toggle">
            <input type="checkbox" checked={isPinned} onChange={(event) => setIsPinned(event.target.checked)} />
            {t('docs.pinHelp')}
          </label>
        </div>

        <div className="docs-editor-tabs">
          <button type="button" className={tab === 'write' ? 'active' : ''} onClick={() => setTab('write')}>
            {t('docs.write')}
          </button>
          <button type="button" className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>
            {t('docs.preview')}
          </button>
        </div>

        {tab === 'write' ? (
          <textarea
            className="docs-editor-textarea"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t('docs.contentPlaceholder')}
            required
          />
        ) : (
          <div className="docs-editor-preview docs-markdown markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || t('docs.previewEmpty')}</ReactMarkdown>
          </div>
        )}

        {initial && (
          <label className="docs-change-note">
            <span>{t('docs.changeNote')}</span>
            <input
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              maxLength={500}
              placeholder={t('docs.changeNotePlaceholder')}
            />
          </label>
        )}

        {error && <div className="docs-error">{error}</div>}

        <footer className="docs-editor-footer">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" type="submit" disabled={saving || !title.trim() || !content.trim()}>
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}
