import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import type { Section, Task, TaskStatus } from '../../types';
import TaskCard from './TaskCard';

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  canEdit: boolean;
  showPlaceholder?: boolean;
  onTaskClick: (task: Task) => void;
  onOpenCreate: (status: TaskStatus) => void;
  onAdvance: (task: Task) => void;
  allSections: Section[];
  onMoveSection: (task: Task, sectionId: string) => void;
  onArchive: (task: Task) => void;
}

export default function Column({ status, tasks, canEdit, showPlaceholder, onTaskClick, onOpenCreate, onAdvance, allSections, onMoveSection, onArchive }: ColumnProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const statusLabel = t(`tasks.status.${status}`);

  return (
    <div ref={setNodeRef} className={`kanban-column ${isOver ? 'drop-target' : ''}`}>
      <div className="column-header">
        <span className="column-status-dot" data-status={status} />
        <span className="column-title">{statusLabel}</span>
        <span className="column-count">{tasks.length}</span>
        {canEdit && (
          <button
            className="column-add-btn"
            onClick={() => onOpenCreate(status)}
            title={t('tasks.create')}
          >+</button>
        )}
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="column-tasks">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={canEdit}
              onClick={() => onTaskClick(task)}
              onAdvance={canEdit && status !== 'DONE' ? () => onAdvance(task) : undefined}
              allSections={canEdit ? allSections : undefined}
              onMoveSection={canEdit ? (sectionId) => onMoveSection(task, sectionId) : undefined}
              onArchive={canEdit ? () => onArchive(task) : undefined}
            />
          ))}
          {showPlaceholder && <div className="task-card-ghost" />}
        </div>
      </SortableContext>

      <div className="column-footer">
        <button className="add-task-btn" onClick={() => onOpenCreate(status)}>
          + {t('tasks.create')}
        </button>
      </div>
    </div>
  );
}

