import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/errors';
import { useAuth } from '../../context/AuthContext';
import type { ProjectDocumentSummary, Readiness, Task } from '../../types';

interface TaskContextProps {
  task: Task;
  projectId: string;
  canEdit: boolean;
  onUpdate: (task: Task) => void;
}

type ContextForm = {
  context: string;
  acceptanceCriteria: string;
  outOfScope: string;
  technicalNotes: string;
  repoUrl: string;
  branch: string;
  prUrl: string;
};

function formFrom(task: Task): ContextForm {
  return {
    context: task.context ?? '',
    acceptanceCriteria: task.acceptanceCriteria ?? '',
    outOfScope: task.outOfScope ?? '',
    technicalNotes: task.technicalNotes ?? '',
    repoUrl: task.repoUrl ?? '',
    branch: task.branch ?? '',
    prUrl: task.prUrl ?? '',
  };
}

function safeUrl(value?: string | null): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

export default function TaskContext({ task, projectId, canEdit, onUpdate }: TaskContextProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContextForm>(() => formFrom(task));
  const [documents, setDocuments] = useState<ProjectDocumentSummary[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>(
    () => (task.documents ?? []).map((link) => link.document.id)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (editing) return;
    setForm(formFrom(task));
    setSelectedDocs((task.documents ?? []).map((link) => link.document.id));
  }, [task, editing]);

  const isMine = (task.assignees ?? []).some((assignee) => assignee.userId === user?.id);
  const hasContext = Boolean(
    task.context
    || task.acceptanceCriteria
    || task.outOfScope
    || task.technicalNotes
    || task.branch
    || task.prUrl
    || (task.documents ?? []).length
  );

  const openEditor = async () => {
    setError('');
    setForm(formFrom(task));
    setSelectedDocs((task.documents ?? []).map((link) => link.document.id));
    setEditing(true);
    try {
      const res = await api.get<ProjectDocumentSummary[]>(`/projects/${projectId}/documents`, {
        params: { limit: 100 },
      });
      setDocuments(res.data);
    } catch {
      setDocuments([]);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        context: form.context.trim() || null,
        acceptanceCriteria: form.acceptanceCriteria.trim() || null,
        outOfScope: form.outOfScope.trim() || null,
        technicalNotes: form.technicalNotes.trim() || null,
        repoUrl: form.repoUrl.trim() || null,
        branch: form.branch.trim() || null,
        prUrl: form.prUrl.trim() || null,
      };
      await api.patch(`/tasks/${task.id}`, payload);

      const current = new Set((task.documents ?? []).map((link) => link.document.id));
      const next = new Set(selectedDocs);
      for (const documentId of next) {
        if (!current.has(documentId)) {
          await api.post(`/tasks/${task.id}/documents`, { documentId });
        }
      }
      for (const documentId of current) {
        if (!next.has(documentId)) {
          await api.delete(`/tasks/${task.id}/documents/${documentId}`);
        }
      }

      const refreshed = await api.get<Task>(`/tasks/${task.id}`);
      onUpdate(refreshed.data);
      setEditing(false);
    } catch (err) {
      setError(getApiErrorMessage(err, t('taskContext.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const claim = async () => {
    setClaiming(true);
    setError('');
    try {
      await api.post(`/tasks/${task.id}/claim`);
      const refreshed = await api.get<Task>(`/tasks/${task.id}`);
      onUpdate(refreshed.data);
      await openBrief();
    } catch (err) {
      setError(getApiErrorMessage(err, t('taskContext.claimError')));
    } finally {
      setClaiming(false);
    }
  };

  const openBrief = async () => {
    setBriefOpen(true);
    setBriefLoading(true);
    setError('');
    try {
      const res = await api.get<{ brief: string }>(`/tasks/${task.id}/context`);
      setBrief(res.data.brief);
    } catch (err) {
      setError(getApiErrorMessage(err, t('taskContext.briefError')));
    } finally {
      setBriefLoading(false);
    }
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the brief remains selectable.
    }
  };

  return (
    <div className="task-context">
      <div className="task-context-head">
        <div>
          <h3>{t('taskContext.title')}</h3>
          <p>{t('taskContext.subtitle')}</p>
        </div>
        <div className="task-context-actions">
          {canEdit && (
            <button className="btn-secondary" type="button" onClick={() => void openEditor()}>
              {hasContext ? t('taskContext.edit') : t('taskContext.complete')}
            </button>
          )}
          {canEdit && !isMine && (
            <button className="btn-secondary" type="button" disabled={claiming} onClick={() => void claim()}>
              {claiming ? t('common.loading') : t('taskContext.take')}
            </button>
          )}
          <button className="btn-primary" type="button" onClick={() => void openBrief()}>
            {t('taskContext.brief')}
          </button>
        </div>
      </div>

      {error && <div className="docs-error">{error}</div>}

      {task.readiness && task.readiness.state !== 'NOT_APPLICABLE' && (
        <ReadinessSummary readiness={task.readiness} />
      )}

      {!hasContext && (
        <p className="task-context-empty">{t('taskContext.empty')}</p>
      )}

      {hasContext && (
        <div className="task-context-grid">
          {task.context && (
            <ContextBlock title={t('taskContext.why')} value={task.context} />
          )}
          {task.acceptanceCriteria && (
            <ContextBlock title={t('taskContext.acceptance')} value={task.acceptanceCriteria} />
          )}
          {task.outOfScope && (
            <ContextBlock title={t('taskContext.outOfScope')} value={task.outOfScope} />
          )}
          {task.technicalNotes && (
            <ContextBlock title={t('taskContext.notes')} value={task.technicalNotes} />
          )}
          {(task.repoUrl || task.branch || task.prUrl) && (
            <div className="task-context-block">
              <h4>{t('taskContext.links')}</h4>
              <div className="task-context-links">
                {safeUrl(task.repoUrl) && <a href={safeUrl(task.repoUrl)} target="_blank" rel="noreferrer">{t('taskContext.repo')}</a>}
                {task.branch && <code>{task.branch}</code>}
                {safeUrl(task.prUrl) && <a href={safeUrl(task.prUrl)} target="_blank" rel="noreferrer">{t('taskContext.pr')}</a>}
              </div>
            </div>
          )}
          {(task.documents ?? []).length > 0 && (
            <div className="task-context-block">
              <h4>{t('taskContext.documents')}</h4>
              <div className="task-context-docs">
                {(task.documents ?? []).map((link) => (
                  <span key={link.document.id} className="task-context-doc">
                    <span className="docs-category">{link.document.category}</span>
                    {link.document.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="docs-editor-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditing(false);
        }}>
          <form className="docs-editor task-context-editor" onSubmit={save}>
            <header className="docs-editor-header">
              <div>
                <h2>{t('taskContext.editTitle')}</h2>
                <p>{t('taskContext.editHint')}</p>
              </div>
              <button className="docs-icon-btn" type="button" onClick={() => setEditing(false)} aria-label={t('common.close')}>×</button>
            </header>

            <div className="passport-editor-grid">
              <label className="passport-field passport-field-wide">
                <span>{t('taskContext.why')}</span>
                <textarea rows={3} value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} />
              </label>
              <label className="passport-field">
                <span>{t('taskContext.acceptance')}</span>
                <textarea rows={5} value={form.acceptanceCriteria} onChange={(event) => setForm({ ...form, acceptanceCriteria: event.target.value })} placeholder="- [ ] ..." />
              </label>
              <label className="passport-field">
                <span>{t('taskContext.outOfScope')}</span>
                <textarea rows={5} value={form.outOfScope} onChange={(event) => setForm({ ...form, outOfScope: event.target.value })} />
              </label>
              <label className="passport-field passport-field-wide">
                <span>{t('taskContext.notes')}</span>
                <textarea rows={4} value={form.technicalNotes} onChange={(event) => setForm({ ...form, technicalNotes: event.target.value })} />
              </label>
              <label className="passport-field">
                <span>{t('taskContext.repoUrl')}</span>
                <input value={form.repoUrl} onChange={(event) => setForm({ ...form, repoUrl: event.target.value })} placeholder="https://github.com/..." />
              </label>
              <label className="passport-field">
                <span>{t('taskContext.branch')}</span>
                <input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} placeholder="feat/..." />
              </label>
              <label className="passport-field passport-field-wide">
                <span>{t('taskContext.prUrl')}</span>
                <input value={form.prUrl} onChange={(event) => setForm({ ...form, prUrl: event.target.value })} placeholder="https://github.com/.../pull/..." />
              </label>
              <label className="passport-field passport-field-wide">
                <span>{t('taskContext.documents')}</span>
                <select
                  multiple
                  className="task-context-doc-select"
                  value={selectedDocs}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                    setSelectedDocs(values);
                  }}
                >
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>{document.title} ({document.category})</option>
                  ))}
                </select>
              </label>
            </div>

            {error && <div className="docs-error">{error}</div>}

            <footer className="docs-editor-footer">
              <button className="btn-secondary" type="button" onClick={() => setEditing(false)} disabled={saving}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? t('common.loading') : t('common.save')}
              </button>
            </footer>
          </form>
        </div>
      )}

      {briefOpen && (
        <div className="docs-editor-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBriefOpen(false);
        }}>
          <div className="docs-editor pickup-brief">
            <header className="docs-editor-header">
              <div>
                <h2>{t('taskContext.briefTitle')}</h2>
                <p>{t('taskContext.briefHint')}</p>
              </div>
              <button className="docs-icon-btn" type="button" onClick={() => setBriefOpen(false)} aria-label={t('common.close')}>×</button>
            </header>
            {briefLoading ? (
              <div className="docs-empty">{t('common.loading')}</div>
            ) : (
              <div className="pickup-brief-content markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief}</ReactMarkdown>
              </div>
            )}
            <footer className="docs-editor-footer">
              <button className="btn-secondary" type="button" onClick={() => void copyBrief()} disabled={!brief}>
                {copied ? t('overview.copied') : t('overview.copy')}
              </button>
              <button className="btn-primary" type="button" onClick={() => setBriefOpen(false)}>
                {t('common.close')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="task-context-block">
      <h4>{title}</h4>
      <div className="task-context-markdown markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
    </div>
  );
}

function ReadinessSummary({ readiness }: { readiness: Readiness }) {
  const { t } = useTranslation();
  return (
    <div className={`task-readiness task-readiness-${readiness.state.toLowerCase()}`}>
      <div className="task-readiness-head">
        <span className="task-readiness-state">{t(`readiness.state.${readiness.state}`)}</span>
        {readiness.pickable && <span className="task-readiness-pickable">{t('readiness.pickable')}</span>}
      </div>
      <div className="task-readiness-checks">
        {readiness.checks.map((check) => (
          <span
            key={check.code}
            className={`task-readiness-check ${check.passed ? 'passed' : 'missing'} ${check.required ? 'required' : 'optional'}`}
          >
            {check.passed ? '✓' : '✗'} {t(`readiness.check.${check.code}`)}
          </span>
        ))}
      </div>
      {readiness.blockedBy.length > 0 && (
        <p className="task-readiness-blocked">{t('readiness.blockedBy', { names: readiness.blockedBy.join(', ') })}</p>
      )}
    </div>
  );
}
