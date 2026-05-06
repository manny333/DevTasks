import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

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
      setSuccess(t('settings.keySaved'));
    } catch (err: any) {
      setError(err?.response?.data?.error || t('settings.errorSave'));
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
      setSuccess(t('settings.keyDeleted'));
    } catch (err: any) {
      setError(err?.response?.data?.error || t('settings.errorDelete'));
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

          <div className="settings-providers">
            {PROVIDERS.map(prov => {
              const saved = savedKeys.find(k => k.provider === prov.id);
              const isSaving = saving[prov.id];

              return (
                <div key={prov.id} className="settings-provider-card">
                  <div className="settings-provider-header">
                    <span className="settings-provider-icon">{prov.icon}</span>
                    <div className="settings-provider-info">
                      <strong>{prov.label}</strong>
                      <span>{prov.desc}</span>
                    </div>
                    {saved && (
                      <span className="settings-badge-saved">{t('settings.saved')}</span>
                    )}
                  </div>
                  <div className="settings-provider-form">
                    <input
                      className="settings-key-input"
                      type={showKeys[prov.id] ? 'text' : 'password'}
                      placeholder={saved ? t('settings.enterNewKey') : t('settings.pasteKey')}
                      value={formKeys[prov.id] || ''}
                      onChange={e => setFormKeys(prev => ({ ...prev, [prov.id]: e.target.value }))}
                    />
                    <button type="button" className="settings-key-toggle" onClick={() => toggleShow(prov.id)}>
                      {showKeys[prov.id] ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                    <button className="btn-primary btn-sm" disabled={!formKeys[prov.id] || isSaving} onClick={() => saveKey(prov.id)}>
                      {isSaving ? '...' : t('common.save')}
                    </button>
                    {saved && (
                      <button className="btn-secondary btn-sm" onClick={() => deleteKey(prov.id)} title={t('settings.deleteKey')}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
