import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/errors';

interface ApiKeyEntry {
  id?: string;
  provider: string;
  label?: string | null;
  isActive: boolean;
  createdAt?: string;
}

const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', icon: '🔮', desc: 'DeepSeek V4 Pro / Flash' },
  { id: 'openai', label: 'OpenAI', icon: '🧠', desc: 'GPT-4o / GPT-4 Turbo' },
  { id: 'anthropic', label: 'Claude (Anthropic)', icon: '🎭', desc: 'Claude 3.5 Sonnet / Opus' },
  { id: 'gemini', label: 'Gemini (Google)', icon: '💎', desc: 'Gemini 2.0 Flash / Pro' },
];

export default function Settings() {
  const { t } = useTranslation();
  const [savedKeys, setSavedKeys] = useState<ApiKeyEntry[]>([]);
  const [formKeys, setFormKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Work config
  const [hoursPerDay, setHoursPerDay] = useState(() => Number(localStorage.getItem('kanvy_hours')) || 8);
  const [workDays, setWorkDays] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('kanvy_workdays');
    return saved ? new Set(JSON.parse(saved)) : new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  });

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleWorkDay = (d: string) => {
    setWorkDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      localStorage.setItem('kanvy_workdays', JSON.stringify([...next]));
      return next;
    });
  };

  const saveHours = (h: number) => {
    const val = Math.max(1, Math.min(16, h));
    setHoursPerDay(val);
    localStorage.setItem('kanvy_hours', String(val));
  };

  useEffect(() => {
    api.get('/user/ai-keys').then(res => {
      setSavedKeys(res.data);
      const keys: Record<string, string> = {};
      for (const entry of res.data) {
        keys[entry.provider] = '';
      }
      setFormKeys(keys);
    }).catch(() => {});
  }, []);

  const saveKey = async (provider: string) => {
    const key = formKeys[provider];
    if (!key) return;
    setSaving(prev => ({ ...prev, [provider]: true }));
    setError('');
    setSuccess('');
    try {
      await api.put('/user/ai-keys', { provider, apiKey: key });
      setSavedKeys(prev => {
        const filtered = prev.filter(k => k.provider !== provider);
        return [...filtered, { provider, isActive: true }];
      });
      setFormKeys(prev => ({ ...prev, [provider]: '' }));
      setEditingProvider(null);
      setSuccess(t('settings.keySaved'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('settings.errorSave')));
    } finally {
      setSaving(prev => ({ ...prev, [provider]: false }));
    }
  };

  const deleteKey = async (provider: string) => {
    setError('');
    setSuccess('');
    try {
      await api.delete(`/user/ai-keys/${provider}`);
      setSavedKeys(prev => prev.filter(k => k.provider !== provider));
      if (editingProvider === provider) setEditingProvider(null);
      setSuccess(t('settings.keyDeleted'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('settings.errorDelete')));
    }
  };

  const toggleShow = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1 className="settings-title">{t('settings.title')}</h1>

        <section className="settings-section">
          <h2 className="settings-section-title">{t('settings.workConfig')}</h2>
          <p className="settings-section-desc">{t('settings.workConfigDesc')}</p>

          <div className="settings-work-config">
            <div className="settings-work-field">
              <label className="ai-meta-label">{t('settings.hoursPerDay')}</label>
              <div className="settings-hours-input">
                <button className="btn-secondary btn-sm" onClick={() => saveHours(hoursPerDay - 1)}>−</button>
                <span className="settings-hours-value">{hoursPerDay}h</span>
                <button className="btn-secondary btn-sm" onClick={() => saveHours(hoursPerDay + 1)}>+</button>
              </div>
            </div>
            <div className="settings-work-field">
              <label className="ai-meta-label">{t('settings.workDays')}</label>
              <div className="settings-days-row">
                {DAYS.map(d => (
                  <button
                    key={d}
                    className={`settings-day-chip ${workDays.has(d) ? 'active' : ''}`}
                    onClick={() => toggleWorkDay(d)}
                  >
                    {t(`calendar.days.${d}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">{t('settings.aiKeys')}</h2>
          <p className="settings-section-desc">{t('settings.aiKeysDesc')}</p>

          {error && <p className="settings-error">{error}</p>}
          {success && <p className="settings-success">{success}</p>}

          <div className="api-keys-panel">
            {PROVIDERS.map(prov => {
              const saved = savedKeys.find(k => k.provider === prov.id);
              const isSaving = saving[prov.id];
              const isEditing = editingProvider === prov.id;

              return (
                <div key={prov.id} className={`api-key-row${isEditing ? ' is-editing' : ''}`}>
                  <div className="api-key-main">
                    <span className="api-key-icon" aria-hidden="true">{prov.icon}</span>
                    <div className="api-key-copy">
                      <span className="api-key-name">{prov.label}</span>
                      <span className="api-key-model">{prov.desc}</span>
                    </div>
                    <span className={`api-key-status${saved ? ' is-saved' : ''}`}>
                      {saved ? t('settings.configured') : t('settings.notConfigured')}
                    </span>
                    <div className="api-key-actions">
                      <button
                        type="button"
                        className="api-key-action"
                        onClick={() => {
                          setError('');
                          setSuccess('');
                          setEditingProvider(isEditing ? null : prov.id);
                        }}
                      >
                        {isEditing ? t('common.cancel') : saved ? t('settings.updateKey') : t('settings.addKey')}
                      </button>
                      {saved && (
                        <button
                          type="button"
                          className="api-key-delete"
                          onClick={() => deleteKey(prov.id)}
                          title={t('settings.deleteKey')}
                          aria-label={t('settings.deleteKey')}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="api-key-editor">
                      <input
                        className="api-key-input"
                        type={showKeys[prov.id] ? 'text' : 'password'}
                        placeholder={saved ? t('settings.enterNewKey') : t('settings.pasteKey')}
                        value={formKeys[prov.id] || ''}
                        onChange={e => setFormKeys(prev => ({ ...prev, [prov.id]: e.target.value }))}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="api-key-visibility"
                        onClick={() => toggleShow(prov.id)}
                        aria-label={showKeys[prov.id] ? t('settings.hideKey') : t('settings.showKey')}
                      >
                        {showKeys[prov.id] ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                      <button className="btn-primary btn-sm" disabled={!formKeys[prov.id] || isSaving} onClick={() => saveKey(prov.id)}>
                        {isSaving ? '...' : t('common.save')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="api-key-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {t('settings.encryptedHint')}
          </p>
        </section>
      </div>
    </div>
  );
}
