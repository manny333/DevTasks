import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Section, Task, TaskStatus } from '../../types';

interface ListViewProps {
  sections: Section[];
  onTaskClick: (task: Task) => void;
}

type SortKey = 'title' | 'section' | 'status' | 'dueDate' | 'createdAt';
type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  IN_REVIEW: 2,
  DONE: 3,
};

function dueDateVal(d: string | null | undefined): number {
  if (!d) return Number.MAX_SAFE_INTEGER;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

export default function ListView({ sections, onTaskClick }: ListViewProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showArchived, setShowArchived] = useState(false);

  const allTasks: (Task & { sectionName: string; sectionColor: string; sectionId: string })[] = useMemo(() => {
    const result: (Task & { sectionName: string; sectionColor: string; sectionId: string })[] = [];
    for (const sec of sections) {
      for (const task of sec.tasks || []) {
        if (!showArchived && task.archived) continue;
        result.push({
          ...task,
          sectionName: sec.name,
          sectionColor: sec.color,
          sectionId: sec.id,
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, showArchived]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...allTasks].sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return dir * a.title.localeCompare(b.title);
        case 'section':
          return dir * a.sectionName.localeCompare(b.sectionName);
        case 'status':
          return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        case 'dueDate':
          return dir * (dueDateVal(a.dueDate) - dueDateVal(b.dueDate));
        case 'createdAt':
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        default:
          return 0;
      }
    });
  }, [allTasks, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="list-sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>;
  };

  const doneCount = allTasks.filter((t) => t.status === 'DONE').length;
  const pct = allTasks.length > 0 ? Math.round((doneCount / allTasks.length) * 100) : 0;

  return (
    <div className="list-view">
      <div className="list-view-header">
        <div className="list-view-info">
          <span className="list-view-count">
            {allTasks.length} {t('tasks.title').toLowerCase()}{allTasks.length !== 1 ? 's' : ''}
          </span>
          {allTasks.length > 0 && (
            <>
              <span className="task-modal-meta-sep" />
              <span className="list-view-progress">{doneCount}/{allTasks.length} {t('subtasks.progress', { done: doneCount, total: allTasks.length }).toLowerCase()}</span>
            </>
          )}
        </div>
        <label className="show-archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t('tasks.showArchived')}
        </label>
      </div>

      {allTasks.length > 0 && (
        <div className="board-progress-bar" style={{ marginBottom: 8 }}>
          <div className="board-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="list-table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              <th className="list-th-title" onClick={() => handleSort('title')}>
                {t('tasks.title')}{sortIndicator('title')}
              </th>
              <th className="list-th-section" onClick={() => handleSort('section')}>
                {t('sections.title')}{sortIndicator('section')}
              </th>
              <th className="list-th-status" onClick={() => handleSort('status')}>
                {t('tasks.statusLabel')}{sortIndicator('status')}
              </th>
              <th className="list-th-due" onClick={() => handleSort('dueDate')}>
                {t('tasks.dueDate')}{sortIndicator('dueDate')}
              </th>
              <th className="list-th-assignees">{t('members.title')}</th>
              <th className="list-th-tags">{t('tags.title')}</th>
              <th className="list-th-progress">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => (
              <tr key={task.id} className="list-row" onClick={() => onTaskClick(task)}>
                <td className="list-cell-title">
                  <div className="list-cell-title-inner">
                    <span className="list-task-title">{task.title}</span>
                    {task._count.comments > 0 && (
                      <span className="list-comment-count" title={`${task._count.comments} comments`}>
                        💬 {task._count.comments}
                      </span>
                    )}
                  </div>
                </td>
                <td className="list-cell-section">
                  <div className="list-cell-section-inner">
                    <span className="list-section-dot" style={{ background: task.sectionColor }} />
                    {task.sectionName}
                  </div>
                </td>
                <td>
                  <span className="list-status-badge" data-status={task.status}>
                    {t(`tasks.status.${task.status}`)}
                  </span>
                </td>
                <td className="list-cell-due">
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString()
                    : <span className="list-cell-empty">—</span>}
                </td>
                <td>
                  <div className="list-assignees">
                    {task.assignees?.slice(0, 3).filter(a => a?.user).map((a) => (
                      a.user.avatar ? (
                        <img key={a.userId} className="list-avatar" src={a.user.avatar} alt={a.user.name} title={a.user.name} />
                      ) : (
                        <span key={a.userId} className="list-avatar list-avatar-init" title={a.user.name}>{a.user.name.charAt(0).toUpperCase()}</span>
                      )
                    ))}
                    {task.assignees && task.assignees.length > 3 && (
                      <span className="list-avatar list-avatar-more">+{task.assignees.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="list-cell-tags">
                  <div className="list-tags">
                    {task.tags && task.tags.length > 0 && (() => {
                      const valid = task.tags.filter(tt => tt?.tag);
                      const shown = valid.slice(0, 2);
                      const overflow = valid.length - 2;
                      return (
                        <>
                          {shown.map((tt) => (
                            <span key={tt.tag!.id} className="tag-badge" style={{ backgroundColor: tt.tag!.color, fontSize: 9 }}>
                              {tt.tag!.name}
                            </span>
                          ))}
                          {overflow > 0 && (
                            <span className="list-tag-more">+{overflow}</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </td>
                <td className="list-cell-progress">
                  {(() => {
                    const total = task.subtasks?.length ?? task._count.subtasks ?? 0;
                    if (total === 0) return <span className="list-cell-empty">—</span>;
                    const done = (task.subtasks ?? []).filter((s) => s.completed).length;
                    const cellPct = Math.round((done / total) * 100);
                    return (
                      <div className="list-progress-wrap" title={`${done}/${total}`}>
                        <div className="list-progress-track">
                          <div className="list-progress-fill" style={{ width: `${cellPct}%` }} />
                        </div>
                        <span className="list-progress-text">{done}/{total}</span>
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
