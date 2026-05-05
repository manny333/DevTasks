import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { Task, Section, MyAccess, ProjectMember } from '../../types';

interface CalendarBoardProps {
  projectId: string;
  allSections: Section[];
  projectMembers?: ProjectMember[];
  myAccess?: MyAccess;
  onTaskClick: (task: Task) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const startOffset = startDow === 0 ? 6 : startDow - 1;

  const days: Date[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function getWeekDays(date: Date): Date[] {
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  const today = new Date();
  return sameDay(d, today);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function CalendarBoard({ projectId, allSections, onTaskClick }: CalendarBoardProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const maxVisibleTasks = view === 'month' ? 3 : 12;

  const days = view === 'month'
    ? getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
    : getWeekDays(currentDate);

  const from = formatDate(days[0]);
  const to = formatDate(days[days.length - 1]);

  const fetchTasks = () => {
    setLoading(true);
    api
      .get(`/projects/${projectId}/calendar?from=${from}&to=${to}`)
      .then((res) => setTasks(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, from, to]);

  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const key = task.dueDate.slice(0, 10);
    const list = tasksByDay.get(key) || [];
    list.push(task);
    tasksByDay.set(key, list);
  }

  const navigate = (dir: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') {
        d.setMonth(d.getMonth() + dir);
      } else {
        d.setDate(d.getDate() + dir * 7);
      }
      return d;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  const headerLabel = view === 'month'
    ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : (() => {
        const start = days[0];
        const end = days[6];
        const startMonth = MONTH_NAMES[start.getMonth()];
        const endMonth = MONTH_NAMES[end.getMonth()];
        if (startMonth === endMonth) {
          return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
        }
        return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
      })();

  const sectionColor = (sectionId: string) =>
    allSections.find((s) => s.id === sectionId)?.color ?? '#6366f1';

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div className="calendar-board">
      {/* Calendar header */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 className="calendar-title" onClick={goToday}>{headerLabel}</h2>
          <button className="calendar-nav-btn" onClick={() => navigate(1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div className="calendar-actions">
          <button className="calendar-today-btn" onClick={goToday}>{t('calendar.today')}</button>
          <div className="calendar-view-toggle">
            <button
              className={`calendar-view-btn${view === 'month' ? ' active' : ''}`}
              onClick={() => setView('month')}
            >{t('calendar.month')}</button>
            <button
              className={`calendar-view-btn${view === 'week' ? ' active' : ''}`}
              onClick={() => setView('week')}
            >{t('calendar.week')}</button>
          </div>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="calendar-weekdays">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday">{t(`calendar.days.${d}`)}</div>
        ))}
      </div>

      {/* Grid */}
      <div className={`calendar-grid calendar-grid-${view}`}>
        {days.map((day) => {
          const key = formatDate(day);
          const dayTasks = tasksByDay.get(key) || [];
          const isCurrentMonth = view === 'month' ? day.getMonth() === currentDate.getMonth() : true;
          const visibleTasks = dayTasks.slice(0, maxVisibleTasks);
          const overflow = dayTasks.length - visibleTasks.length;

          return (
            <div
              key={key}
              className={`calendar-cell${!isCurrentMonth ? ' other-month' : ''}${isToday(day) ? ' today' : ''}`}
            >
              <span className="calendar-cell-day">{day.getDate()}</span>
              <div className="calendar-cell-tasks">
                {visibleTasks.map((task) => (
                  <button
                    key={task.id}
                    className="calendar-task-badge"
                    style={{ '--sec-color': sectionColor(task.sectionId) } as React.CSSProperties}
                    onClick={() => onTaskClick(task)}
                    title={task.title}
                  >
                    <span className="calendar-task-dot" style={{ background: sectionColor(task.sectionId) }} />
                    <span className="calendar-task-title">{task.title}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <span className="calendar-cell-more">+{overflow} {t('calendar.more')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
