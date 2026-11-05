import { useTranslation } from 'react-i18next';
import type { ProjectMember, Section, Tag, TaskFilters, TaskStatus } from '../../types';
import FilterBar from '../Filters/FilterBar';

const COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

type SortBy = 'recent' | 'oldest' | 'position';

interface BoardHeaderProps {
  section: Section;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  projectMembers?: ProjectMember[];
  projectTags: Tag[];
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
  isMobileView: boolean;
  mobileStatusTab: TaskStatus;
  onMobileStatusChange: (status: TaskStatus) => void;
  taskCounts: Record<TaskStatus, number>;
  totalCount: number;
  progress: number;
  onCreate: () => void;
}

/** Board toolbar, filters, mobile status tabs and progress bar. */
export default function BoardHeader({
  section,
  filters,
  onFiltersChange,
  projectMembers,
  projectTags,
  showArchived,
  onShowArchivedChange,
  sortBy,
  onSortByChange,
  isMobileView,
  mobileStatusTab,
  onMobileStatusChange,
  taskCounts,
  totalCount,
  progress,
  onCreate,
}: BoardHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="board-header">
      <div className="board-toolbar" style={{ '--sec': section.color } as React.CSSProperties}>
        <span className="board-section-color-bar" />
        <h2 className="board-section-title" style={{ color: section.color }}>{section.name}</h2>
        <button className="btn-primary" style={{ background: section.color }} onClick={onCreate}>
          + {t('tasks.create')}
        </button>
        <label className="show-archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => onShowArchivedChange(e.target.checked)}
          />
          {t('tasks.showArchived')}
        </label>
        <div className="sort-selector">
          <span className="sort-selector-label">{t('tasks.sort.label')}:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortBy)}
          >
            <option value="recent">{t('tasks.sort.recent')}</option>
            <option value="oldest">{t('tasks.sort.oldest')}</option>
            <option value="position">{t('tasks.sort.position')}</option>
          </select>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={onFiltersChange}
        projectMembers={projectMembers || []}
        projectTags={projectTags}
      />

      {isMobileView && (
        <div className="board-mobile-status-tabs" role="tablist" aria-label={t('tasks.statusTitle')}>
          {COLUMNS.map((status) => {
            const active = mobileStatusTab === status;
            return (
              <button
                key={status}
                className={`board-mobile-status-tab${active ? ' active' : ''}`}
                data-status={status}
                role="tab"
                aria-selected={active}
                onClick={() => onMobileStatusChange(status)}
              >
                <span className="board-mobile-status-tab-label">{t(`tasks.status.${status}`)}</span>
                <span className="board-mobile-status-tab-count">{taskCounts[status] ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}

      {totalCount > 0 && (
        <div className="board-progress-bar">
          <div className="board-progress-fill" style={{ width: `${progress}%`, background: section.color }} />
        </div>
      )}
    </div>
  );
}
