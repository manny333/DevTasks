import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Section, Task } from '../../types';

interface GanttBoardProps {
  sections: Section[];
  onTaskClick: (task: Task) => void;
}

type ZoomLevel = 'day' | 'week' | 'month';

const DAY_MS = 1000 * 60 * 60 * 24;

function padDate(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function formatDateShort(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('en', { month: 'short' });
}

interface GanttTask {
  task: Task;
  sectionName: string;
  sectionColor: string;
  startDate: Date;
  endDate: Date;
}

export default function GanttBoard({ sections, onTaskClick }: GanttBoardProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [scheduleMode, setScheduleMode] = useState<'normal' | 'phases' | 'sequential'>('normal');
  const timelineRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allTasks = useMemo<GanttTask[]>(() => {
    const result: GanttTask[] = [];
    for (const sec of sections) {
      for (const task of sec.tasks || []) {
        if (task.archived) continue;
        if (!task.dueDate) continue;
        const endDate = new Date(task.dueDate);
        if (Number.isNaN(endDate.getTime())) continue;
        const rawStart = task.startDate || task.createdAt || task.dueDate;
        const startDate = new Date(rawStart as string);
        if (Number.isNaN(startDate.getTime())) continue;
        if (startDate.getTime() === endDate.getTime()) {
          startDate.setDate(startDate.getDate() - 1);
        }
        result.push({
          task,
          sectionName: sec.name,
          sectionColor: sec.color,
          startDate: startDate < endDate ? startDate : padDate(endDate, -1),
          endDate,
        });
      }
    }
    return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [sections]);

  // Apply schedule mode
  const displayTasks = useMemo(() => {
    if (scheduleMode === 'normal') return allTasks;

    if (scheduleMode === 'phases') {
      const bySection = new Map<string, GanttTask[]>();
      for (const gt of allTasks) {
        const list = bySection.get(gt.task.sectionId) || [];
        list.push(gt);
        bySection.set(gt.task.sectionId, list);
      }
      const phased: GanttTask[] = [];
      for (const [, tasks] of bySection) {
        // Find earliest start date in this phase
        let phaseStart = tasks[0].startDate.getTime();
        for (const t of tasks) {
          if (t.startDate.getTime() < phaseStart) phaseStart = t.startDate.getTime();
        }
        for (const gt of tasks) {
          const duration = Math.max(1, daysBetween(gt.startDate, gt.endDate));
          const newStart = new Date(phaseStart);
          const newEnd = new Date(phaseStart);
          newEnd.setDate(newEnd.getDate() + duration);
          phased.push({
            ...gt,
            startDate: newStart,
            endDate: newEnd,
          });
        }
      }
      return phased.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }

    // sequential: chain tasks so each starts where the previous ends
    const sequenced: GanttTask[] = [];
    for (const gt of allTasks) {
      const prev = sequenced.length > 0 ? sequenced[sequenced.length - 1] : null;
      const duration = Math.max(1, daysBetween(gt.startDate, gt.endDate));
      const newStart = prev ? new Date(prev.endDate.getTime()) : new Date(gt.startDate.getTime());
      const newEnd = new Date(newStart.getTime());
      newEnd.setDate(newEnd.getDate() + duration);
      sequenced.push({
        ...gt,
        startDate: newStart,
        endDate: newEnd,
      });
    }
    return sequenced;
  }, [allTasks, scheduleMode]);

  const { minDate, totalDays } = useMemo(() => {
    if (displayTasks.length === 0) {
      const d = new Date();
      return { minDate: padDate(d, -7), maxDate: padDate(d, 14), totalDays: 21 };
    }
    let min = displayTasks[0].startDate;
    let max = displayTasks[0].endDate;
    for (const t of displayTasks) {
      if (t.startDate < min) min = t.startDate;
      if (t.endDate > max) max = t.endDate;
    }
    const paddedMin = padDate(min, -3);
    const paddedMax = padDate(max, 5);
    return { minDate: paddedMin, maxDate: paddedMax, totalDays: daysBetween(paddedMin, paddedMax) };
  }, [displayTasks]);

  const pxPerDay = zoom === 'day' ? 40 : zoom === 'week' ? 20 : 10;
  const timelineWidth = totalDays * pxPerDay + 40;

  useEffect(() => {
    const tl = timelineRef.current;
    const sb = sidebarRef.current;
    if (!tl || !sb) return;
    const sync = () => {
      if (tl && sb) sb.scrollTop = tl.scrollTop;
    };
    tl.addEventListener('scroll', sync);
    return () => tl.removeEventListener('scroll', sync);
  }, []);

  const scrollToToday = () => {
    if (timelineRef.current) {
      const todayOffset = daysBetween(minDate, today) * pxPerDay;
      timelineRef.current.scrollLeft = todayOffset - 120;
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { section: Section; tasks: GanttTask[] }>();
    for (const sec of sections) {
      map.set(sec.id, { section: sec, tasks: [] });
    }
    for (const gt of displayTasks) {
      const group = map.get(gt.task.sectionId);
      if (group) group.tasks.push(gt);
    }
    return [...map.values()].filter(g => g.tasks.length > 0 || (g.section.tasks || []).some(t => !t.archived && !t.dueDate));
  }, [sections, allTasks]);

  const dayColumns: Date[] = [];
  for (let i = 0; i <= totalDays; i++) {
    dayColumns.push(padDate(minDate, i));
  }

  const ROW_HEIGHT = 32;
  const SECTION_HEADER_HEIGHT = 30;
  const HEADER_HEIGHT = 44;

  // Calculate row positions for each task
  let rowIndex = 0;
  const taskRows = new Map<string, { row: number; gt: GanttTask }>();
  for (const group of grouped) {
    rowIndex++; // section header row
    for (const gt of group.tasks) {
      taskRows.set(gt.task.id, { row: rowIndex, gt });
      rowIndex++;
    }
    const unscheduledCount = (group.section.tasks || []).filter(t => !t.archived && !t.dueDate).length;
    for (let i = 0; i < unscheduledCount; i++) {
      rowIndex++;
    }
  }
  const totalRows = rowIndex;
  const contentHeight = totalRows * ROW_HEIGHT + grouped.length * SECTION_HEADER_HEIGHT;

  if (allTasks.length === 0) {
    return (
      <div className="gantt-board">
        <div className="gantt-toolbar">
          <div className="gantt-view-toggle">
            <button className={`calendar-view-btn ${zoom === 'day' ? 'active' : ''}`} onClick={() => setZoom('day')}>{t('gantt.day')}</button>
            <button className={`calendar-view-btn ${zoom === 'week' ? 'active' : ''}`} onClick={() => setZoom('week')}>{t('gantt.week')}</button>
            <button className={`calendar-view-btn ${zoom === 'month' ? 'active' : ''}`} onClick={() => setZoom('month')}>{t('gantt.month')}</button>
          </div>
          <div className="gantt-view-toggle">
            <button className={`calendar-view-btn ${scheduleMode === 'normal' ? 'active' : ''}`} onClick={() => setScheduleMode('normal')}>{t('gantt.normal')}</button>
            <button className={`calendar-view-btn ${scheduleMode === 'phases' ? 'active' : ''}`} onClick={() => setScheduleMode('phases')}>{t('gantt.phases')}</button>
            <button className={`calendar-view-btn ${scheduleMode === 'sequential' ? 'active' : ''}`} onClick={() => setScheduleMode('sequential')}>{t('gantt.sequential')}</button>
          </div>
          <button className="calendar-today-btn" onClick={scrollToToday}>{t('calendar.today')}</button>
        </div>
        <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('gantt.empty')}
        </div>
      </div>
    );
  }

  return (
    <div className="gantt-board">
      <div className="gantt-toolbar">
        <div className="gantt-view-toggle">
          <button className={`calendar-view-btn ${zoom === 'day' ? 'active' : ''}`} onClick={() => setZoom('day')}>{t('gantt.day')}</button>
          <button className={`calendar-view-btn ${zoom === 'week' ? 'active' : ''}`} onClick={() => setZoom('week')}>{t('gantt.week')}</button>
          <button className={`calendar-view-btn ${zoom === 'month' ? 'active' : ''}`} onClick={() => setZoom('month')}>{t('gantt.month')}</button>
        </div>
        <div className="gantt-view-toggle">
          <button className={`calendar-view-btn ${scheduleMode === 'normal' ? 'active' : ''}`} onClick={() => setScheduleMode('normal')}>{t('gantt.normal')}</button>
          <button className={`calendar-view-btn ${scheduleMode === 'phases' ? 'active' : ''}`} onClick={() => setScheduleMode('phases')}>{t('gantt.phases')}</button>
          <button className={`calendar-view-btn ${scheduleMode === 'sequential' ? 'active' : ''}`} onClick={() => setScheduleMode('sequential')}>{t('gantt.sequential')}</button>
        </div>
        <button className="calendar-today-btn" onClick={scrollToToday}>{t('calendar.today')}</button>
      </div>

      <div className="gantt-chart">
        {/* Sidebar */}
        <div className="gantt-sidebar" ref={sidebarRef}>
          <div className="gantt-sidebar-header" style={{ height: HEADER_HEIGHT }}>
            <span className="gantt-sidebar-title">{t('tasks.title')}</span>
            <span className="gantt-mode-indicator">{t(`gantt.${scheduleMode}`)}</span>
          </div>
          {grouped.map(group => (
            <div key={group.section.id}>
              <div className="gantt-sidebar-section" style={{ height: SECTION_HEADER_HEIGHT }}>
                <span className="gantt-sidebar-dot" style={{ background: group.section.color }} />
                <span className="gantt-sidebar-section-name">{group.section.name}</span>
                <span className="gantt-sidebar-count">{group.tasks.length}</span>
              </div>
              {group.tasks.map(gt => (
                <div
                  key={gt.task.id}
                  className="gantt-sidebar-task"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => onTaskClick(gt.task)}
                >
                  <span className="gantt-sidebar-task-title">{gt.task.title}</span>
                </div>
              ))}
              {(() => {
                const unsch = (group.section.tasks || []).filter(t => !t.archived && !t.dueDate);
                if (unsch.length === 0) return null;
                return unsch.map(task => (
                  <div key={task.id} className="gantt-sidebar-task gantt-sidebar-task-unscheduled" style={{ height: ROW_HEIGHT }} onClick={() => onTaskClick(task)}>
                    <span className="gantt-sidebar-task-title">{task.title}</span>
                    <span className="gantt-unscheduled-badge">{t('gantt.unscheduled')}</span>
                  </div>
                ));
              })()}
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="gantt-timeline" ref={timelineRef} key={scheduleMode}>
          <div className="gantt-timeline-inner" style={{ width: timelineWidth, minHeight: contentHeight + HEADER_HEIGHT }}>
            {/* Header */}
            <div className="gantt-timeline-header" style={{ height: HEADER_HEIGHT }}>
              {dayColumns.map((d, i) => {
                const isToday = d.getTime() === today.getTime();
                const showLabel = zoom === 'day' || d.getDate() === 1 || d.getDay() === 1;
                return (
                  <div
                    key={i}
                    className={`gantt-header-cell ${isToday ? 'today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`}
                    style={{ width: pxPerDay }}
                  >
                    {showLabel && (
                      zoom === 'month' ? formatMonth(d) : formatDateShort(d)
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grid + Bars */}
            <div className="gantt-timeline-body" style={{ width: timelineWidth, minHeight: contentHeight }}>
              {/* Grid columns */}
              {dayColumns.map((d, i) => (
                <div
                  key={i}
                  className={`gantt-grid-col ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''} ${d.getTime() === today.getTime() ? 'today' : ''}`}
                  style={{ left: i * pxPerDay, width: pxPerDay, height: contentHeight }}
                />
              ))}

              {/* Today line */}
              {(() => {
                const todayIdx = daysBetween(minDate, today);
                if (todayIdx >= 0 && todayIdx <= totalDays) {
                  return (
                    <div className="gantt-today-line" style={{ left: todayIdx * pxPerDay + pxPerDay / 2, height: contentHeight }} />
                  );
                }
                return null;
              })()}

              {/* Task bars */}
              {displayTasks.map(gt => {
                const startOffset = daysBetween(minDate, gt.startDate);
                const duration = Math.max(1, daysBetween(gt.startDate, gt.endDate));
                const row = taskRows.get(gt.task.id);
                if (!row) return null;
                const top = (row.row * ROW_HEIGHT) + (grouped.findIndex(g => g.section.id === gt.task.sectionId) * SECTION_HEADER_HEIGHT);
                return (
                  <div
                    key={gt.task.id}
                    className="gantt-bar"
                    style={{
                      left: startOffset * pxPerDay + 2,
                      width: Math.max(pxPerDay - 4, duration * pxPerDay - 4),
                      top: top + (ROW_HEIGHT - 22) / 2,
                      height: 22,
                      background: gt.sectionColor,
                    }}
                    onClick={() => onTaskClick(gt.task)}
                    title={`${gt.task.title}\n${gt.startDate.toLocaleDateString()} → ${gt.endDate.toLocaleDateString()}`}
                  >
                    <span className="gantt-bar-label">{gt.task.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
