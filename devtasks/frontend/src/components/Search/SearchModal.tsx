import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

interface TaskResult {
  id: string;
  title: string;
  status: string;
  context?: string | null;
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

interface DocumentResult {
  id: string;
  title: string;
  slug: string;
  category: string;
  project: { name: string; slug: string };
}

interface CommentResult {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string } | null;
  task: {
    id: string;
    title: string;
    section: { project: { name: string; slug: string } };
  };
}

interface PersonResult {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  project: { name: string; slug: string } | null;
}

interface SearchResults {
  tasks: TaskResult[];
  projects: ProjectResult[];
  documents: DocumentResult[];
  comments: CommentResult[];
  people: PersonResult[];
}

type Item =
  | { kind: 'project'; value: ProjectResult }
  | { kind: 'task'; value: TaskResult }
  | { kind: 'document'; value: DocumentResult }
  | { kind: 'comment'; value: CommentResult }
  | { kind: 'person'; value: PersonResult };

const EMPTY_RESULTS: SearchResults = {
  tasks: [],
  projects: [],
  documents: [],
  comments: [],
  people: [],
};

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);

  const items = useMemo<Item[]>(() => [
    ...results.projects.map((value) => ({ kind: 'project' as const, value })),
    ...results.tasks.map((value) => ({ kind: 'task' as const, value })),
    ...results.documents.map((value) => ({ kind: 'document' as const, value })),
    ...results.comments.map((value) => ({ kind: 'comment' as const, value })),
    ...results.people.map((value) => ({ kind: 'person' as const, value })),
  ], [results]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (query.length < 2) {
      setResults(EMPTY_RESULTS);
      setSelected(0);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`);
        setResults({ ...EMPTY_RESULTS, ...res.data });
        setSelected(0);
      } catch {
        setResults(EMPTY_RESULTS);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const openItem = useCallback((item: Item) => {
    if (item.kind === 'project') {
      navigate(`/projects/${item.value.slug}`);
    } else if (item.kind === 'task') {
      navigate(`/projects/${item.value.section.project.slug}?task=${item.value.id}`);
    } else if (item.kind === 'document') {
      navigate(`/projects/${item.value.project.slug}?view=docs&doc=${item.value.id}`);
    } else if (item.kind === 'comment') {
      navigate(`/projects/${item.value.task.section.project.slug}?task=${item.value.task.id}`);
    } else if (item.value.project) {
      navigate(`/projects/${item.value.project.slug}`);
    } else {
      navigate('/projects');
    }
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selected]) openItem(items[selected]);
    }
  };

  const statusColors: Record<string, string> = {
    TODO: '#9090a0',
    IN_PROGRESS: '#6366f1',
    IN_REVIEW: '#f97316',
    DONE: '#22c55e',
  };

  const group = (
    title: string,
    values: Item[],
    start: number,
    render: (item: Item, index: number) => React.ReactNode
  ) => {
    if (values.length === 0) return null;
    return (
      <div className="search-group">
        <div className="search-group-title">{title}</div>
        {values.map((item, index) => render(item, start + index))}
      </div>
    );
  };

  const taskStart = results.projects.length;
  const documentStart = taskStart + results.tasks.length;
  const commentStart = documentStart + results.documents.length;
  const peopleStart = commentStart + results.comments.length;

  return (
    <div
      className="modal-overlay search-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="search-modal search-modal-universal">
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

        {items.length > 0 && (
          <div className="search-results">
            {group(t('search.projects'), results.projects.map((value) => ({ kind: 'project' as const, value })), 0, (item, index) => {
              if (item.kind !== 'project') return null;
              return (
                <button
                  key={item.value.id}
                  className={`search-result-item ${selected === index ? 'selected' : ''}`}
                  onClick={() => openItem(item)}
                  onMouseEnter={() => setSelected(index)}
                >
                  <span className="search-result-icon">📁</span>
                  <span className="search-result-main">
                    <span className="search-result-title">{item.value.name}</span>
                    {item.value.description && <span className="search-result-sub">{item.value.description}</span>}
                  </span>
                  <span className="search-result-kind">{t('search.kind.project')}</span>
                </button>
              );
            })}

            {group(t('search.tasks'), results.tasks.map((value) => ({ kind: 'task' as const, value })), taskStart, (item, index) => {
              if (item.kind !== 'task') return null;
              return (
                <button
                  key={item.value.id}
                  className={`search-result-item ${selected === index ? 'selected' : ''}`}
                  onClick={() => openItem(item)}
                  onMouseEnter={() => setSelected(index)}
                >
                  <span
                    className="search-result-status-dot"
                    style={{ backgroundColor: statusColors[item.value.status] || '#9090a0' }}
                  />
                  <span className="search-result-main">
                    <span className="search-result-title">{item.value.title}</span>
                    <span className="search-result-sub">
                      {item.value.section.project.name} › {item.value.section.name}
                    </span>
                  </span>
                  <span className="search-result-kind">{t('search.kind.task')}</span>
                </button>
              );
            })}

            {group(t('search.documents'), results.documents.map((value) => ({ kind: 'document' as const, value })), documentStart, (item, index) => {
              if (item.kind !== 'document') return null;
              return (
                <button
                  key={item.value.id}
                  className={`search-result-item ${selected === index ? 'selected' : ''}`}
                  onClick={() => openItem(item)}
                  onMouseEnter={() => setSelected(index)}
                >
                  <span className="search-result-icon">📄</span>
                  <span className="search-result-main">
                    <span className="search-result-title">{item.value.title}</span>
                    <span className="search-result-sub">
                      {item.value.project.name} · {item.value.category}
                    </span>
                  </span>
                  <span className="search-result-kind">{t('search.kind.document')}</span>
                </button>
              );
            })}

            {group(t('search.comments'), results.comments.map((value) => ({ kind: 'comment' as const, value })), commentStart, (item, index) => {
              if (item.kind !== 'comment') return null;
              return (
                <button
                  key={item.value.id}
                  className={`search-result-item ${selected === index ? 'selected' : ''}`}
                  onClick={() => openItem(item)}
                  onMouseEnter={() => setSelected(index)}
                >
                  <span className="search-result-icon">💬</span>
                  <span className="search-result-main">
                    <span className="search-result-title">{item.value.task.title}</span>
                    <span className="search-result-sub">
                      {item.value.author?.name ?? '—'} · {item.value.content.slice(0, 110)}
                    </span>
                  </span>
                  <span className="search-result-kind">{t('search.kind.comment')}</span>
                </button>
              );
            })}

            {group(t('search.people'), results.people.map((value) => ({ kind: 'person' as const, value })), peopleStart, (item, index) => {
              if (item.kind !== 'person') return null;
              return (
                <button
                  key={item.value.id}
                  className={`search-result-item ${selected === index ? 'selected' : ''}`}
                  onClick={() => openItem(item)}
                  onMouseEnter={() => setSelected(index)}
                >
                  <span className="search-result-icon">👤</span>
                  <span className="search-result-main">
                    <span className="search-result-title">{item.value.name}</span>
                    <span className="search-result-sub">
                      {item.value.email}{item.value.project ? ` · ${item.value.project.name}` : ''}
                    </span>
                  </span>
                  <span className="search-result-kind">{t('search.kind.person')}</span>
                </button>
              );
            })}
          </div>
        )}

        {query.length >= 2 && !loading && items.length === 0 && (
          <div className="search-empty">{t('common.noResults')}</div>
        )}

        <div className="search-footer">
          <span><kbd>↑↓</kbd> {t('search.navigate')}</span>
          <span><kbd>↵</kbd> {t('search.open')}</span>
          <span><kbd>esc</kbd> {t('search.close')}</span>
        </div>
      </div>
    </div>
  );
}
