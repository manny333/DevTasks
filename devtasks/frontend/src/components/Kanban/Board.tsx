import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay, closestCorners } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { Section, Task, Tag, TaskStatus, MyAccess, ProjectMember } from '../../types';
import Column from './Column';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import CreateTaskModal from './CreateTaskModal';
import UndoToast from '../UndoToast';

const COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

interface BoardProps {
  section: Section;
  projectTags: Tag[];
  allSections: Section[];
  projectMembers?: ProjectMember[];
  myAccess?: MyAccess;
  onTaskMovedSection?: () => void;
  onTasksChanged?: (sectionId: string, tasks: Task[]) => void;
}

interface CreateDefaults {
  status: TaskStatus;
  title?: string;
  description?: string;
}

export default function Board({ section, projectTags, allSections, projectMembers, myAccess, onTaskMovedSection, onTasksChanged }: BoardProps) {
  const { t } = useTranslation();
  const canEditBoard = !myAccess || myAccess.level === 'owner' || myAccess.accessType !== 'VIEWER';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [overColumnStatus, setOverColumnStatus] = useState<TaskStatus | null>(null);
  const [createDefaults, setCreateDefaults] = useState<CreateDefaults | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileStatusTab, setMobileStatusTab] = useState<TaskStatus>('TODO');
  const deleteTaskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchTasks = () => {
    setLoading(true);
    api
      .get(`/sections/${section.id}/tasks?archived=${showArchived}`)
      .then((res) => setTasks(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id, showArchived]);

  useEffect(() => {
    if (!loading) onTasksChanged?.(section.id, tasks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, loading]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobileView(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setMobileStatusTab('TODO');
  }, [section.id]);

  const tasksForColumn = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status && (!t.archived || showArchived));

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setOverColumnStatus(null); return; }
    if (COLUMNS.includes(over.id as TaskStatus)) {
      setOverColumnStatus(over.id as TaskStatus);
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      setOverColumnStatus(overTask?.status ?? null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    setOverColumnStatus(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskId = active.id as string;

    let newStatus: TaskStatus;
    if (COLUMNS.includes(over.id as TaskStatus)) {
      newStatus = over.id as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (!overTask) return;
      newStatus = overTask.status;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const columnTasks = tasksForColumn(newStatus);
    const newPosition = columnTasks.length;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, position: newPosition } : t))
    );

    try {
      await api.patch(`/tasks/${taskId}/move`, { status: newStatus, position: newPosition });
    } catch {
      fetchTasks();
    }
  };

  const handleOpenCreate = (status: TaskStatus) => {
    setCreateDefaults({ status });
  };

  const handleAdvance = async (task: Task) => {
    const nextStatus: Record<string, TaskStatus> = {
      TODO: 'IN_PROGRESS',
      IN_PROGRESS: 'IN_REVIEW',
      IN_REVIEW: 'DONE',
    };
    const newStatus = nextStatus[task.status];
    if (!newStatus) return;
    const columnTasks = tasksForColumn(newStatus);
    const newPosition = columnTasks.length;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus, position: newPosition } : t))
    );
    try {
      await api.patch(`/tasks/${task.id}/move`, { status: newStatus, position: newPosition });
    } catch {
      fetchTasks();
    }
  };

  const handleMoveSection = async (task: Task, sectionId: string) => {
    try {
      await api.patch(`/tasks/${task.id}/move-section`, { sectionId });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (selectedTask?.id === task.id) setSelectedTask(null);
      onTaskMovedSection?.();
    } catch {
      fetchTasks();
    }
  };

  const handleTaskCreated = (task: Task) => {
    setTasks((prev) => [...prev, task]);
    setCreateDefaults(null);
  };

  const updateTask = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  };

  const archiveTask = async (task: Task) => {
    const res = await api.patch(`/tasks/${task.id}/archive`);
    updateTask({ ...task, archived: res.data.archived });
  };

  const deleteTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
    if (deleteTaskTimerRef.current) clearTimeout(deleteTaskTimerRef.current);
    setPendingDeleteTask(task);
    deleteTaskTimerRef.current = setTimeout(async () => {
      await api.delete(`/tasks/${taskId}`);
      setPendingDeleteTask(null);
    }, 4000);
  };

  const undoDeleteTask = () => {
    if (!pendingDeleteTask) return;
    if (deleteTaskTimerRef.current) clearTimeout(deleteTaskTimerRef.current);
    setTasks((prev) => [...prev, pendingDeleteTask].sort((a, b) => a.position - b.position));
    setPendingDeleteTask(null);
  };

  const activeTasks = tasks.filter(t => !t.archived);
  const doneCount = activeTasks.filter(t => t.status === 'DONE').length;
  const totalCount = activeTasks.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div className="board-wrapper">
      <div className="board-header">
        <div className="board-toolbar" style={{ '--sec': section.color } as React.CSSProperties}>
          <span className="board-section-color-bar" />
          <h2 className="board-section-title" style={{ color: section.color }}>{section.name}</h2>
          <button className="btn-primary" style={{ background: section.color }} onClick={() => handleOpenCreate('TODO')}>
            + {t('tasks.create')}
          </button>
          <label className="show-archived-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {t('tasks.showArchived')}
          </label>
        </div>

        {isMobileView && (
          <div className="board-mobile-status-tabs" role="tablist" aria-label={t('tasks.statusTitle')}>
            {COLUMNS.map((status) => {
              const count = tasksForColumn(status).length;
              const active = mobileStatusTab === status;
              return (
                <button
                  key={status}
                  className={`board-mobile-status-tab${active ? ' active' : ''}`}
                  data-status={status}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileStatusTab(status)}
                >
                  <span className="board-mobile-status-tab-label">{t(`tasks.status.${status}`)}</span>
                  <span className="board-mobile-status-tab-count">{count}</span>
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

      {isMobileView ? (
        <div className="kanban-board mobile-single-column">
          <Column
            key={mobileStatusTab}
            status={mobileStatusTab}
            tasks={tasksForColumn(mobileStatusTab)}
            canEdit={canEditBoard}
            onTaskClick={setSelectedTask}
            onOpenCreate={handleOpenCreate}
            onAdvance={handleAdvance}
            allSections={allSections}
            onMoveSection={handleMoveSection}
            onArchive={archiveTask}
          />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="kanban-board">
            {COLUMNS.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={tasksForColumn(status)}
                canEdit={canEditBoard}
                onTaskClick={setSelectedTask}
                onOpenCreate={handleOpenCreate}
                onAdvance={handleAdvance}
                allSections={allSections}
                onMoveSection={handleMoveSection}
                onArchive={archiveTask}
                showPlaceholder={activeTask !== null && overColumnStatus === status && activeTask.status !== status}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {canEditBoard && isMobileView && (
        <button
          className="board-fab-create"
          onClick={() => handleOpenCreate(mobileStatusTab)}
          title={t('tasks.create')}
        >
          <span>+</span>
          {t('tasks.create')}
        </button>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          projectTags={projectTags}
          projectMembers={projectMembers}
          canEdit={canEditBoard}
          allSections={allSections}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onMoveSection={handleMoveSection}
        />
      )}

      {canEditBoard && createDefaults && (
        <CreateTaskModal
          sectionId={section.id}
          projectTags={projectTags}
          defaultStatus={createDefaults.status}
          defaultTitle={createDefaults.title}
          defaultDescription={createDefaults.description}
          onClose={() => setCreateDefaults(null)}
          onCreate={handleTaskCreated}
        />
      )}

      {pendingDeleteTask && (
        <UndoToast
          message={`Tarea "${pendingDeleteTask.title}" eliminada`}
          onUndo={undoDeleteTask}
          onDismiss={() => setPendingDeleteTask(null)}
        />
      )}
    </div>
  );
}

