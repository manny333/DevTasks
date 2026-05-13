import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import type { Section, Task } from '../../types';

interface TaskCardProps {
  task: Task;
  canEdit?: boolean;
  onClick?: () => void;
  isDragging?: boolean;
  onAdvance?: () => void;
  allSections?: Section[];
  onMoveSection?: (sectionId: string) => void;
  onArchive?: () => void;
}

// Extract first non-empty line for the card preview
function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) || '';
  return line.length > 100 ? line.slice(0, 100) + '…' : line;
}

export default function TaskCard({ task, canEdit = true, onClick, isDragging, onAdvance, allSections, onMoveSection, onArchive }: TaskCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: task.id });

  const otherSections = (allSections || []).filter((s) => s.id !== task.sectionId);
  const showMenu = canEdit && (otherSections.length > 0 || !!onArchive);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.right - 160 });
    }
    setMenuOpen((o) => !o);
  };

  const handleMoveClick = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    setMenuOpen(false);
    onMoveSection?.(sectionId);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.4 : 1,
  };

  const dueInfo = (() => {
    if (!task.dueDate) return null;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(due);
    dueDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (task.archived) return { tone: 'neutral', label: t('tasks.dueDateLabel', { date: dueDay.toLocaleDateString() }) };
    if (diffDays < 0) return { tone: 'overdue', label: t('tasks.due.overdue') };
    if (diffDays === 0) return { tone: 'today', label: t('tasks.due.today') };
    if (diffDays <= 2) return { tone: 'soon', label: t('tasks.due.soon') };
    return { tone: 'neutral', label: t('tasks.dueDateLabel', { date: dueDay.toLocaleDateString() }) };
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`task-card ${isDragging ? 'is-dragging' : ''} ${task.archived ? 'archived' : ''}`}
      onClick={onClick}
    >
      <div className="task-card-top">
        {onAdvance && (
          <button
            className="task-advance-btn"
            title={t('tasks.advance')}
            onClick={(e) => { e.stopPropagation(); onAdvance(); }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        )}
        <p className="task-card-title">{task.title}</p>
        {task.tags.length > 0 && (
          <div className="task-card-tags">
            {task.tags.filter(tt => tt?.tag).map(({ tag }) => (
              <span
                key={tag!.id}
                className="tag-badge"
                style={{ backgroundColor: tag!.color }}
              >
                {tag!.name}
              </span>
            ))}
          </div>
        )}
        {showMenu && (
          <div className="task-card-menu">
            <button
              ref={menuBtnRef}
              className="task-card-menu-btn"
              title={t('tasks.moveTo')}
              onClick={handleMenuToggle}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
            {menuOpen && createPortal(
              <div
                ref={menuRef}
                className="task-card-dropdown"
                style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
                onClick={(e) => e.stopPropagation()}
              >
                {onArchive && (
                  <button
                    className="task-card-dropdown-item"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive(); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
                    </svg>
                    {task.archived ? t('tasks.unarchive') : t('tasks.archive')}
                  </button>
                )}
                {onArchive && otherSections.length > 0 && onMoveSection && (
                  <div className="task-card-dropdown-divider" />
                )}
                {otherSections.length > 0 && onMoveSection && (
                  <>
                    <div className="task-card-dropdown-label">{t('tasks.moveTo')}</div>
                    {otherSections.map((sec) => (
                      <button
                        key={sec.id}
                        className="task-card-dropdown-item"
                        onClick={(e) => handleMoveClick(e, sec.id)}
                      >
                        <span className="task-card-dropdown-dot" style={{ background: sec.color }} />
                        {sec.name}
                      </button>
                    ))}
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
        )}
      </div>

      {task.description && (
        <div className="task-card-desc">
          <ReactMarkdown
            allowedElements={['p', 'strong', 'em', 'code', 'del', 'a']}
            unwrapDisallowed
          >
            {firstLine(task.description)}
          </ReactMarkdown>
        </div>
      )}

      {(() => {
        const total = task.subtasks?.length ?? task._count.subtasks ?? 0;
        if (total === 0) return null;
        const done = (task.subtasks ?? []).filter((s) => s.completed).length;
        const pct = Math.round((done / total) * 100);
        return (
          <div className="task-card-subtasks" title={`${done}/${total}`}>
            <div className="task-card-subtasks-meta">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              <span>{done}/{total}</span>
            </div>
            <div className="task-card-subtasks-progress">
              <div className="task-card-subtasks-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}

      <div className="task-card-footer">
        {dueInfo && (
          <span className={`task-card-due task-card-due-${dueInfo.tone}`} title={task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ''}>
            {dueInfo.label}
          </span>
        )}
        {task._count.comments > 0 && (
          <span className="task-card-comments">💬 {task._count.comments}</span>
        )}
        {task.assignees && task.assignees.length > 0 && (
          <div className="task-card-assignees">
            {task.assignees.slice(0, 4).map((a) => (
              a.user.avatar ? (
                <img
                  key={a.userId}
                  className="task-card-avatar"
                  src={a.user.avatar}
                  alt={a.user.name}
                  title={a.user.name}
                />
              ) : (
                <div
                  key={a.userId}
                  className="task-card-avatar task-card-avatar-initial"
                  title={a.user.name}
                >
                  {a.user.name.charAt(0).toUpperCase()}
                </div>
              )
            ))}
            {task.assignees.length > 4 && (
              <div className="task-card-avatar task-card-avatar-more">
                +{task.assignees.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
