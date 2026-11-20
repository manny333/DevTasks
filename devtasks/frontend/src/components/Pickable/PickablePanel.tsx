import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/errors';
import type { PickableResponse, ReadinessState, ReadyConfig, Task } from '../../types';

interface PickablePanelProps {
  projectId: string;
  canManageConfig: boolean;
  onClose: () => void;
  onOpenTask: (task: Task) => void;
}

type Tab = 'pickable' | 'needs' | 'blocked' | 'all';

export default function PickablePanel({ projectId, canManageConfig, onClose, onOpenTask }: PickablePanelProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<PickableResponse | null>(null);
  const [tab, setTab] = useState<Tab>('pickable');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<PickableResponse>(`/projects/${projectId}/pickable`, {
        params: { state: 'ALL', includeAssigned: true, limit: 100 },
      });
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, t('pickable.loadError')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const tasks = useMemo(() => {
    if (!data) return [];
    if (tab === 'pickable') return data.tasks.filter((task) => task.readiness?.pickable);
    if (tab === 'needs') return data.tasks.filter((task) => task.readiness?.state === 'NEEDS_CONTEXT');
    if (tab === 'blocked') return data.tasks.filter((task) => task.readiness?.state === 'BLOCKED');
    return data.tasks;
  }, [data, tab]);

  const claim = async (task: Task) => {
    setClaimingId(task.id);
    setError('');
    try {
      await api.post(`/tasks/${task.id}/claim`);
      const res = await api.get<Task>(`/tasks/${task.id}`);
      onClose();
      onOpenTask(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, t('taskContext.claimError')));
    } finally {
      setClaimingId(null);
    }
  };

  const saveConfig = async (config: ReadyConfig) => {
    const res = await api.patch<ReadyConfig>(`/projects/${projectId}/readiness-config`, {
      requireContext: config.requireContext,
      requireAcceptanceCriteria: config.requireAcceptanceCriteria,
      requireNoBlockers: config.requireNoBlockers,
      requireDocument: config.requireDocument,
    });
    setData((current) => current ? { ...current, config: res.data } : current);
    setShowConfig(false);
    await load();
  };

  const count = (value: number) => (value > 0 ? value : '0');

  return (
    <div className="pickable-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pickable-panel">
        <header className="pickable-header">
          <div>
            <span className="passport-eyebrow">{t('pickable.eyebrow')}</span>
            <h2>{t('pickable.title')}</h2>
            <p>{t('pickable.subtitle')}</p>
          </div>
          <div className="pickable-header-actions">
            {canManageConfig && (
              <button className="btn-secondary" type="button" onClick={() => setShowConfig(true)}>
                {t('pickable.configure')}
              </button>
            )}
            <button className="docs-icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
          </div>
        </header>

        {data && (
          <div className="pickable-summary">
            <span><strong>{count(data.counts.pickable)}</strong> {t('pickable.ready')}</span>
            <span><strong>{count(data.counts.needsContext)}</strong> {t('pickable.needs')}</span>
            <span><strong>{count(data.counts.blocked)}</strong> {t('pickable.blocked')}</span>
          </div>
        )}

        <div className="pickable-tabs">
          {([
            ['pickable', t('pickable.tabReady')],
            ['needs', t('pickable.tabNeeds')],
            ['blocked', t('pickable.tabBlocked')],
            ['all', t('pickable.tabAll')],
          ] as [Tab, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? 'active' : ''}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="docs-error">{error}</div>}

        <div className="pickable-list">
          {loading ? (
            <div className="docs-empty">{t('common.loading')}</div>
          ) : tasks.length === 0 ? (
            <div className="docs-empty">
              <strong>{t('pickable.emptyTitle')}</strong>
              <span>{t('pickable.emptyBody')}</span>
            </div>
          ) : tasks.map((task) => (
            <article key={task.id} className="pickable-row">
              <div className="pickable-row-main">
                <div className="pickable-row-top">
                  <ReadinessBadge state={task.readiness?.state ?? 'NOT_APPLICABLE'} />
                  <span className="pickable-section">{task.section?.name ?? '—'}</span>
                </div>
                <button className="pickable-title" type="button" onClick={() => { onClose(); onOpenTask(task); }}>
                  {task.title}
                </button>
                <div className="pickable-checks">
                  {(task.readiness?.checks ?? []).filter((check) => check.required).map((check) => (
                    <span key={check.code} className={check.passed ? 'passed' : 'missing'}>
                      {check.passed ? '✓' : '✗'} {t(`readiness.check.${check.code}`)}
                    </span>
                  ))}
                  {(task.assignees ?? []).length > 0 && (
                    <span className="pickable-assignee">
                      {(task.assignees ?? []).map((assignee) => assignee.user.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="pickable-row-actions">
                {task.readiness?.pickable ? (
                  <button className="btn-primary" type="button" disabled={claimingId === task.id} onClick={() => void claim(task)}>
                    {claimingId === task.id ? t('common.loading') : t('taskContext.take')}
                  </button>
                ) : (
                  <button className="btn-secondary" type="button" onClick={() => { onClose(); onOpenTask(task); }}>
                    {t('pickable.view')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        {showConfig && data && (
          <ReadinessConfigModal
            initial={data.config}
            onClose={() => setShowConfig(false)}
            onSave={saveConfig}
          />
        )}
      </section>
    </div>
  );
}

function ReadinessBadge({ state }: { state: ReadinessState }) {
  const { t } = useTranslation();
  return (
    <span className={`readiness-badge readiness-badge-${state.toLowerCase()}`}>
      {t(`readiness.state.${state}`)}
    </span>
  );
}

function ReadinessConfigModal({
  initial,
  onClose,
  onSave,
}: {
  initial: ReadyConfig;
  onClose: () => void;
  onSave: (config: ReadyConfig) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(config);
    } catch (err) {
      setError(getApiErrorMessage(err, t('pickable.saveConfigError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="docs-editor-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="docs-editor readiness-config" onSubmit={submit}>
        <header className="docs-editor-header">
          <div>
            <h2>{t('pickable.configTitle')}</h2>
            <p>{t('pickable.configHint')}</p>
          </div>
          <button className="docs-icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </header>

        <div className="readiness-config-list">
          {([
            ['requireContext', t('readiness.check.CONTEXT')],
            ['requireAcceptanceCriteria', t('readiness.check.ACCEPTANCE')],
            ['requireNoBlockers', t('readiness.check.BLOCKERS')],
            ['requireDocument', t('readiness.check.DOCUMENT')],
          ] as [keyof ReadyConfig, string][]).map(([key, label]) => (
            <label key={key} className="readiness-config-row">
              <input
                type="checkbox"
                checked={Boolean(config[key])}
                onChange={(event) => setConfig({ ...config, [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {error && <div className="docs-error">{error}</div>}

        <footer className="docs-editor-footer">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}
