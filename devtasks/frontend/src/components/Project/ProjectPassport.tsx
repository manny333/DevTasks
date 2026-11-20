import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/errors';
import type { Project, ProjectProfile } from '../../types';

interface ProjectPassportProps {
  project: Project;
  canEdit: boolean;
}

type ProfileField = Exclude<keyof ProjectProfile, 'projectId' | 'updatedBy' | 'updatedAt'>;

const EMPTY_PROFILE = (projectId: string): ProjectProfile => ({
  projectId,
  purpose: null,
  repoUrl: null,
  defaultBranch: null,
  stack: null,
  setupCommands: null,
  runCommands: null,
  testCommands: null,
  deployUrl: null,
  stagingUrl: null,
  owners: null,
  onCall: null,
  startHere: null,
  updatedBy: null,
  updatedAt: null,
});

function externalUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  return null;
}

export default function ProjectPassport({ project, canEdit }: ProjectPassportProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProjectProfile>(() => EMPTY_PROFILE(project.id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ProjectProfile>(`/projects/${project.id}/profile`)
      .then((res) => {
        if (!cancelled) setProfile({ ...EMPTY_PROFILE(project.id), ...res.data });
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, t('overview.loadError')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, t]);

  const hasProfile = useMemo(
    () => Object.entries(profile).some(([key, value]) => (
      !['projectId', 'updatedBy', 'updatedAt'].includes(key)
      && typeof value === 'string'
      && value.trim().length > 0
    )),
    [profile]
  );

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be unavailable; the command is still selectable.
    }
  };

  const save = async (fields: Partial<Record<ProfileField, string | null>>) => {
    setSaving(true);
    setEditorError('');
    try {
      const res = await api.patch<ProjectProfile>(`/projects/${project.id}/profile`, fields);
      setProfile({ ...EMPTY_PROFILE(project.id), ...res.data });
      setEditing(false);
    } catch (err) {
      setEditorError(getApiErrorMessage(err, t('overview.saveError')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="passport-loading"><div className="spinner" /></div>;

  const title = profile.purpose || project.description || t('overview.emptyPurpose');
  const branch = profile.defaultBranch || '—';
  const updatedLabel = profile.updatedAt
    ? t('overview.lastUpdated', {
      date: new Date(profile.updatedAt).toLocaleDateString(),
      name: profile.updatedBy?.name ?? '—',
    })
    : null;

  return (
    <div className="passport">
      <header className="passport-hero">
        <div className="passport-hero-content">
          <span className="passport-eyebrow">{t('overview.eyebrow')}</span>
          <h1>{project.name}</h1>
          <p>{title}</p>
          <div className="passport-chips">
            <span className="passport-chip">`{project.slug}`</span>
            {profile.defaultBranch && <span className="passport-chip">{t('overview.branch')}: {profile.defaultBranch}</span>}
            {updatedLabel && <span className="passport-updated">{updatedLabel}</span>}
          </div>
        </div>
        {canEdit && (
          <button className="btn-secondary passport-edit-btn" type="button" onClick={() => setEditing(true)}>
            {hasProfile ? t('overview.edit') : t('overview.complete')}
          </button>
        )}
      </header>

      {error && <div className="docs-error">{error}</div>}

      <div className="passport-grid">
        <section className="passport-card">
          <h2>{t('overview.repo')}</h2>
          {profile.repoUrl ? (
            <a className="passport-link" href={externalUrl(profile.repoUrl) ?? undefined} target="_blank" rel="noreferrer">
              {profile.repoUrl}
            </a>
          ) : (
            <span className="passport-muted">{t('overview.notSet')}</span>
          )}
          <dl className="passport-facts">
            <div><dt>{t('overview.branch')}</dt><dd>{branch}</dd></div>
            <div>
              <dt>{t('overview.deploy')}</dt>
              <dd>
                {externalUrl(profile.deployUrl)
                  ? <a href={externalUrl(profile.deployUrl)!} target="_blank" rel="noreferrer">{profile.deployUrl}</a>
                  : profile.deployUrl || t('overview.notSet')}
              </dd>
            </div>
            <div>
              <dt>{t('overview.staging')}</dt>
              <dd>
                {externalUrl(profile.stagingUrl)
                  ? <a href={externalUrl(profile.stagingUrl)!} target="_blank" rel="noreferrer">{profile.stagingUrl}</a>
                  : profile.stagingUrl || t('overview.notSet')}
              </dd>
            </div>
          </dl>
        </section>

        <section className="passport-card">
          <h2>{t('overview.stack')}</h2>
          {profile.stack
            ? <p className="passport-prose">{profile.stack}</p>
            : <span className="passport-muted">{t('overview.notSet')}</span>}
        </section>

        <section className="passport-card passport-card-wide">
          <h2>{t('overview.commands')}</h2>
          <CommandBlock
            label={t('overview.setup')}
            value={profile.setupCommands}
            id="setup"
            copied={copied}
            onCopy={copy}
            copyLabel={t('overview.copy')}
            copiedLabel={t('overview.copied')}
            emptyLabel={t('overview.notSet')}
          />
          <CommandBlock
            label={t('overview.run')}
            value={profile.runCommands}
            id="run"
            copied={copied}
            onCopy={copy}
            copyLabel={t('overview.copy')}
            copiedLabel={t('overview.copied')}
            emptyLabel={t('overview.notSet')}
          />
          <CommandBlock
            label={t('overview.test')}
            value={profile.testCommands}
            id="test"
            copied={copied}
            onCopy={copy}
            copyLabel={t('overview.copy')}
            copiedLabel={t('overview.copied')}
            emptyLabel={t('overview.notSet')}
          />
        </section>

        <section className="passport-card">
          <h2>{t('overview.team')}</h2>
          <dl className="passport-facts">
            <div><dt>{t('overview.owners')}</dt><dd>{profile.owners || t('overview.notSet')}</dd></div>
            <div><dt>{t('overview.onCall')}</dt><dd>{profile.onCall || t('overview.notSet')}</dd></div>
          </dl>
        </section>

        <section className="passport-card passport-card-wide">
          <h2>{t('overview.startHere')}</h2>
          {profile.startHere ? (
            <div className="passport-markdown markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.startHere}</ReactMarkdown>
            </div>
          ) : (
            <span className="passport-muted">{t('overview.emptyHint')}</span>
          )}
        </section>
      </div>

      {!hasProfile && canEdit && (
        <div className="passport-empty-callout">
          <p>{t('overview.empty')}</p>
          <button className="btn-primary" type="button" onClick={() => setEditing(true)}>
            {t('overview.complete')}
          </button>
        </div>
      )}

      {editing && (
        <PassportEditor
          initial={profile}
          saving={saving}
          error={editorError}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </div>
  );
}

function CommandBlock({
  label,
  value,
  id,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  id: string;
  copied: string | null;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="passport-command">
      <div className="passport-command-head">
        <span>{label}</span>
        {value && (
          <button type="button" className="passport-copy" onClick={() => void onCopy(id, value)}>
            {copied === id ? copiedLabel : copyLabel}
          </button>
        )}
      </div>
      {value ? <pre>{value}</pre> : <span className="passport-muted">{emptyLabel}</span>}
    </div>
  );
}

function PassportEditor({
  initial,
  saving,
  error,
  onClose,
  onSave,
}: {
  initial: ProjectProfile;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (fields: Partial<Record<ProfileField, string | null>>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => ({
    purpose: initial.purpose ?? '',
    repoUrl: initial.repoUrl ?? '',
    defaultBranch: initial.defaultBranch ?? '',
    stack: initial.stack ?? '',
    setupCommands: initial.setupCommands ?? '',
    runCommands: initial.runCommands ?? '',
    testCommands: initial.testCommands ?? '',
    deployUrl: initial.deployUrl ?? '',
    stagingUrl: initial.stagingUrl ?? '',
    owners: initial.owners ?? '',
    onCall: initial.onCall ?? '',
    startHere: initial.startHere ?? '',
  }));

  const set = (field: ProfileField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const fields: Partial<Record<ProfileField, string | null>> = {};
    (Object.keys(form) as ProfileField[]).forEach((field) => {
      const value = form[field].trim();
      fields[field] = value.length > 0 ? value : null;
    });
    void onSave(fields);
  };

  return (
    <div className="docs-editor-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="docs-editor passport-editor" onSubmit={submit}>
        <header className="docs-editor-header">
          <div>
            <h2>{t('overview.editTitle')}</h2>
            <p>{t('overview.editHint')}</p>
          </div>
          <button className="docs-icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </header>

        <div className="passport-editor-grid">
          <label className="passport-field passport-field-wide">
            <span>{t('overview.purpose')}</span>
            <textarea rows={3} value={form.purpose} onChange={(event) => set('purpose', event.target.value)} />
          </label>
          <label className="passport-field">
            <span>{t('overview.repoUrl')}</span>
            <input value={form.repoUrl} onChange={(event) => set('repoUrl', event.target.value)} placeholder="https://github.com/..." />
          </label>
          <label className="passport-field">
            <span>{t('overview.branch')}</span>
            <input value={form.defaultBranch} onChange={(event) => set('defaultBranch', event.target.value)} placeholder="main" />
          </label>
          <label className="passport-field passport-field-wide">
            <span>{t('overview.stack')}</span>
            <textarea rows={3} value={form.stack} onChange={(event) => set('stack', event.target.value)} />
          </label>
          <label className="passport-field">
            <span>{t('overview.setup')}</span>
            <textarea rows={4} value={form.setupCommands} onChange={(event) => set('setupCommands', event.target.value)} />
          </label>
          <label className="passport-field">
            <span>{t('overview.run')}</span>
            <textarea rows={4} value={form.runCommands} onChange={(event) => set('runCommands', event.target.value)} />
          </label>
          <label className="passport-field">
            <span>{t('overview.test')}</span>
            <textarea rows={4} value={form.testCommands} onChange={(event) => set('testCommands', event.target.value)} />
          </label>
          <label className="passport-field">
            <span>{t('overview.deploy')}</span>
            <input value={form.deployUrl} onChange={(event) => set('deployUrl', event.target.value)} placeholder="https://..." />
          </label>
          <label className="passport-field">
            <span>{t('overview.staging')}</span>
            <input value={form.stagingUrl} onChange={(event) => set('stagingUrl', event.target.value)} placeholder="https://..." />
          </label>
          <label className="passport-field">
            <span>{t('overview.owners')}</span>
            <input value={form.owners} onChange={(event) => set('owners', event.target.value)} />
          </label>
          <label className="passport-field">
            <span>{t('overview.onCall')}</span>
            <input value={form.onCall} onChange={(event) => set('onCall', event.target.value)} />
          </label>
          <label className="passport-field passport-field-wide">
            <span>{t('overview.startHere')}</span>
            <textarea rows={6} value={form.startHere} onChange={(event) => set('startHere', event.target.value)} />
          </label>
        </div>

        {error && <div className="docs-error">{error}</div>}

        <footer className="docs-editor-footer">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}
