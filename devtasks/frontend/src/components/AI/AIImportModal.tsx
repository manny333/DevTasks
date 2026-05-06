import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import AIImportPreview from './AIImportPreview';

interface Props {
  projectId?: string;
  onClose: () => void;
  onImported?: () => void;
}

interface Provider {
  id: string;
  label: string;
  model: string;
}

interface PreviewSection {
  tempId: string;
  name: string;
  description?: string;
  action: 'create' | 'reuse';
  existingSectionId?: string;
  color?: string;
  tasks: any[];
  selected: boolean;
}

export default function AIImportModal({ projectId, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [markdown, setMarkdown] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('deepseek');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ sections: PreviewSection[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ sections: number; tasks: number; tags: number; assignees: number } | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('kanvy_ai_key') || '');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    api.get('/ai/providers').then(res => {
      setProviders(res.data);
      if (res.data.length > 0) setSelectedProvider(res.data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const generate = async () => {
    if (!markdown.trim()) return;
    setError('');
    setGenerating(true);
    try {
      const res = await api.post('/ai/preview', {
        markdown: markdown.trim(),
        projectId: projectId || undefined,
        provider: selectedProvider,
        ...(apiKey ? { apiKey } : {}),
      });
      setPreview(res.data);
      setStep('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('ai.errorGenerate'));
    } finally {
      setGenerating(false);
    }
  };

  const applyImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError('');
    try {
      let targetProjectId = projectId;

      if (!targetProjectId) {
        const selectedSections = preview.sections.filter(s => s.selected);
        const projectName = selectedSections[0]?.name || 'Imported Project';
        const createRes = await api.post('/projects', { name: projectName, template: 'blank' });
        targetProjectId = createRes.data.id;
      }

      const res = await api.post('/ai/apply', { projectId: targetProjectId, preview });
      setImportResult(res.data.created);
      onImported?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('ai.errorApply'));
    } finally {
      setImporting(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMarkdown(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMarkdown(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal ai-modal">
        <div className="modal-header">
          <div className="ai-modal-header-left">
            <span className="ai-modal-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </span>
            <span className="ai-modal-title">{t('ai.title')}</span>
          </div>
          <button className="btn-icon modal-close" onClick={onClose}>×</button>
        </div>

        {importResult ? (
          <div className="ai-result">
            <div className="ai-result-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3>{t('ai.importSuccess')}</h3>
            <div className="ai-result-stats">
              {importResult.sections > 0 && <span>{importResult.sections} {t('ai.sectionsCreated')}</span>}
              <span>{importResult.tasks} {t('ai.tasksCreated')}</span>
              {importResult.tags > 0 && <span>{importResult.tags} {t('ai.tagsCreated')}</span>}
              {importResult.assignees > 0 && <span>{importResult.assignees} {t('ai.assigneesCreated')}</span>}
            </div>
            <button className="btn-primary" onClick={onClose}>{t('common.close')}</button>
          </div>
        ) : step === 'input' ? (
          <div className="ai-input">
            <div className="ai-input-top">
              {providers.length > 0 && (
                <select className="ai-provider-select" value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.label} ({p.model})</option>)}
                </select>
              )}
              {providers.length === 0 && <span className="ai-no-provider">{t('ai.noProviders')}</span>}
              <div className="ai-key-wrap">
                <input
                  className="ai-key-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder={t('ai.apiKeyPlaceholder')}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); localStorage.setItem('kanvy_ai_key', e.target.value); }}
                />
                <button type="button" className="ai-key-toggle" onClick={() => setShowKey(!showKey)} title={showKey ? 'Hide' : 'Show'}>
                  {showKey ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <div
              className="ai-textarea-wrap"
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
            >
              <textarea
                className="ai-textarea"
                placeholder={t('ai.placeholder')}
                value={markdown}
                onChange={e => setMarkdown(e.target.value)}
                rows={18}
              />
              {!markdown && (
                <div className="ai-drop-hint">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="12"/><line x1="15" y1="15" x2="12" y2="12"/>
                  </svg>
                  <span>{t('ai.dropHint')}</span>
                  <label className="ai-file-label">
                    {t('ai.browse')}
                    <input type="file" accept=".md,.txt,.markdown" onChange={handleFilePick} hidden />
                  </label>
                </div>
              )}
            </div>

            {error && <p className="ai-error">{error}</p>}

            <div className="ai-input-actions">
              <button className="btn-primary" onClick={generate} disabled={!markdown.trim() || generating}>
                {generating ? (
                  <><span className="ai-spinner" />{t('ai.generating')}</>
                ) : t('ai.generate')}
              </button>
            </div>
          </div>
        ) : (
          <div className="ai-preview-wrap">
            {preview && (
              <AIImportPreview preview={preview} onChange={(sections) => setPreview({ sections })} />
            )}
            {error && <p className="ai-error">{error}</p>}
            <div className="ai-preview-actions">
              <button className="btn-secondary" onClick={() => { setStep('input'); setError(''); }}>
                {t('common.back')}
              </button>
              <button className="btn-primary" onClick={applyImport} disabled={importing}>
                {importing ? t('ai.importing') : t('ai.import')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
