import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

interface TaskResult {
  id: string;
  title: string;
  status: string;
  section: {
    id: string;
    name: string;
    project: { id: string; name: string; slug: string };
  };
}

interface ProjectResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface SearchResults {
  tasks: TaskResult[];
  projects: ProjectResult[];
}

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ tasks: [], projects: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);

  const allItems: Array<{ type: 'project' | 'task'; item: ProjectResult | TaskResult }> = [
    ...results.projects.map((p) => ({ type: 'project' as const, item: p })),
    ...results.tasks.map((t) => ({ type: 'task' as const, item: t })),
  ];

  // Autofocus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults({ tasks: [], projects: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
        setSelected(0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const navigate_to = useCallback((idx: number) => {
    const entry = allItems[idx];
    if (!entry) return;
    if (entry.type === 'project') {
      navigate(`/projects/${(entry.item as ProjectResult).slug}`);
    } else {
      const task = entry.item as TaskResult;
      navigate(`/projects/${task.section.project.slug}`);
    }
    onClose();
  }, [allItems, navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((prev) => Math.min(prev + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      navigate_to(selected);
    }
  };

  const statusColors: Record<string, string> = {
    TODO: '#9090a0',
    IN_PROGRESS: '#6366f1',
    IN_REVIEW: '#f97316',
    DONE: '#22c55e',
  };

  return (
    <div
      className="modal-overlay search-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="search-modal">
        <div className="search-input-row">
          <span className="search-icon">⌘</span>
          <input
            ref={inputRef}
            className="search-input"
            placeholder={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span className="search-spinner" />}
          <kbd className="search-esc" onClick={onClose}>esc</kbd>
        </div>

        {allItems.length > 0 && (
          <div className="search-results">
            {results.projects.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">Proyectos</div>
                {results.projects.map((project, i) => (
                  <button
                    key={project.id}
                    className={`search-result-item ${selected === i ? 'selected' : ''}`}
                    onClick={() => navigate_to(i)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="search-result-icon">📁</span>
                    <span className="search-result-title">{project.name}</span>
                    {project.description && (
                      <span className="search-result-sub">{project.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {results.tasks.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">Tareas</div>
                {results.tasks.map((task, i) => {
                  const idx = results.projects.length + i;
                  return (
                    <button
                      key={task.id}
                      className={`search-result-item ${selected === idx ? 'selected' : ''}`}
                      onClick={() => navigate_to(idx)}
                      onMouseEnter={() => setSelected(idx)}
                    >
                      <span
                        className="search-result-status-dot"
                        style={{ backgroundColor: statusColors[task.status] || '#9090a0' }}
                      />
                      <span className="search-result-title">{task.title}</span>
                      <span className="search-result-sub">
                        {task.section.project.name} › {task.section.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {query.length >= 2 && !loading && allItems.length === 0 && (
          <div className="search-empty">{t('common.noResults')}</div>
        )}

        <div className="search-footer">
          <span><kbd>↑↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
