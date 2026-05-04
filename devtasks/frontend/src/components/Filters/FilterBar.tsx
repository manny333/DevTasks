import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectMember, Tag, TaskFilters, TaskStatus, DuePreset } from '../../types';
import { DEFAULT_FILTERS } from '../../types';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const DUE_PRESETS: { value: DuePreset; labelKey: string }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'overdue', labelKey: 'overdue' },
  { value: 'today', labelKey: 'today' },
  { value: 'week', labelKey: 'week' },
];

interface FilterBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  projectMembers: ProjectMember[];
  projectTags: Tag[];
}

export default function FilterBar({ filters, onChange, projectMembers, projectTags }: FilterBarProps) {
  const { t } = useTranslation();
  const [openDropdown, setOpenDropdown] = useState<'assignee' | 'tag' | 'due' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  const activeCount =
    filters.statuses.length +
    (filters.assigneeId ? 1 : 0) +
    (filters.tagId ? 1 : 0) +
    (filters.duePreset !== 'all' ? 1 : 0);

  const toggleStatus = (s: TaskStatus) => {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter((x) => x !== s)
      : [...filters.statuses, s];
    onChange({ ...filters, statuses: next });
  };

  const clearAll = () => onChange({ ...DEFAULT_FILTERS });

  const selectedAssignee = projectMembers.find((m) => m.userId === filters.assigneeId);

  return (
    <div className="filter-bar" ref={containerRef}>
      {/* Status chips */}
      <div className="filter-group filter-group-status">
        {STATUSES.map((s) => {
          const active = filters.statuses.includes(s);
          return (
            <button
              key={s}
              className={`filter-chip filter-chip-status${active ? ' active' : ''}`}
              data-status={s}
              onClick={() => toggleStatus(s)}
            >
              {t(`tasks.status.${s}`)}
            </button>
          );
        })}
      </div>

      {/* Assignee dropdown */}
      <div className="filter-group">
        <button
          className={`filter-dropdown-btn${filters.assigneeId ? ' active' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === 'assignee' ? null : 'assignee')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          {selectedAssignee ? selectedAssignee.user.name : t('filters.assignee')}
        </button>
        {openDropdown === 'assignee' && (
          <div className="filter-dropdown">
            {filters.assigneeId && (
              <button
                className="filter-dropdown-item filter-dropdown-clear"
                onClick={() => { onChange({ ...filters, assigneeId: null }); setOpenDropdown(null); }}
              >
                {t('filters.clearFilter')}
              </button>
            )}
            {projectMembers.map((m) => (
              <button
                key={m.userId}
                className={`filter-dropdown-item${filters.assigneeId === m.userId ? ' active' : ''}`}
                onClick={() => { onChange({ ...filters, assigneeId: m.userId }); setOpenDropdown(null); }}
              >
                {m.user.avatar ? (
                  <img src={m.user.avatar} alt="" className="filter-avatar" />
                ) : (
                  <span className="filter-avatar filter-avatar-initial">{m.user.name.charAt(0).toUpperCase()}</span>
                )}
                <span className="filter-dropdown-name">{m.user.name}</span>
              </button>
            ))}
            {projectMembers.length === 0 && (
              <div className="filter-dropdown-empty">{t('filters.noMembers')}</div>
            )}
          </div>
        )}
      </div>

      {/* Tag dropdown */}
      <div className="filter-group">
        <button
          className={`filter-dropdown-btn${filters.tagId ? ' active' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === 'tag' ? null : 'tag')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          {(() => {
            const tag = projectTags.find((t) => t.id === filters.tagId);
            return tag ? tag.name : t('filters.tag');
          })()}
        </button>
        {openDropdown === 'tag' && (
          <div className="filter-dropdown">
            {filters.tagId && (
              <button
                className="filter-dropdown-item filter-dropdown-clear"
                onClick={() => { onChange({ ...filters, tagId: null }); setOpenDropdown(null); }}
              >
                {t('filters.clearFilter')}
              </button>
            )}
            {projectTags.map((tag) => (
              <button
                key={tag.id}
                className={`filter-dropdown-item${filters.tagId === tag.id ? ' active' : ''}`}
                onClick={() => { onChange({ ...filters, tagId: tag.id }); setOpenDropdown(null); }}
              >
                <span className="filter-dropdown-dot" style={{ background: tag.color }} />
                {tag.name}
              </button>
            ))}
            {projectTags.length === 0 && (
              <div className="filter-dropdown-empty">{t('filters.noTags')}</div>
            )}
          </div>
        )}
      </div>

      {/* Due date presets */}
      <div className="filter-group">
        <button
          className={`filter-dropdown-btn${filters.duePreset !== 'all' ? ' active' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === 'due' ? null : 'due')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {t(`filters.due.${filters.duePreset}`)}
        </button>
        {openDropdown === 'due' && (
          <div className="filter-dropdown">
            {DUE_PRESETS.map(({ value, labelKey }) => (
              <button
                key={value}
                className={`filter-dropdown-item${filters.duePreset === value ? ' active' : ''}`}
                onClick={() => { onChange({ ...filters, duePreset: value }); setOpenDropdown(null); }}
              >
                {t(`filters.due.${labelKey}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <button className="filter-clear-btn" onClick={clearAll}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          {t('filters.clear')}
          <span className="filter-clear-count">{activeCount}</span>
        </button>
      )}
    </div>
  );
}

export function getDueDateRange(preset: DuePreset): { from: string | null; to: string | null } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'overdue': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: null, to: yesterday.toISOString().split('T')[0] };
    }
    case 'today':
      return { from: today.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
    case 'week': {
      const endOfWeek = new Date(today);
      const dayOfWeek = today.getDay();
      const daysUntilEnd = 7 - dayOfWeek;
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilEnd);
      return { from: today.toISOString().split('T')[0], to: endOfWeek.toISOString().split('T')[0] };
    }
    default:
      return { from: null, to: null };
  }
}
