import { useTranslation } from 'react-i18next';

// Frontend-friendly types (match backend response)
interface ImportSection {
  tempId: string;
  name: string;
  description?: string;
  action: 'create' | 'reuse';
  existingSectionId?: string;
  color?: string;
  tasks: ImportTask[];
  selected: boolean;
}

interface ImportTask {
  tempId: string;
  title: string;
  description?: string;
  section: string;
  tags: { name: string; action?: string }[];
  assignees: { email: string; name?: string; found?: boolean }[];
  subtasks: { title: string }[];
  startDate?: string;
  dueDate?: string;
  selected: boolean;
}

interface Props {
  preview: { sections: ImportSection[] };
  onChange: (sections: ImportSection[]) => void;
}

export default function AIImportPreview({ preview, onChange }: Props) {
  const { t } = useTranslation();

  const toggleSection = (tempId: string) => {
    onChange(preview.sections.map(s =>
      s.tempId === tempId ? { ...s, selected: !s.selected, tasks: s.tasks.map(t => ({ ...t, selected: !s.selected })) } : s
    ));
  };

  const toggleTask = (secTempId: string, taskTempId: string) => {
    onChange(preview.sections.map(s => {
      if (s.tempId !== secTempId) return s;
      const tasks = s.tasks.map(t => t.tempId === taskTempId ? { ...t, selected: !t.selected } : t);
      return { ...s, tasks, selected: tasks.some(t => t.selected) };
    }));
  };

  const totalTasks = preview.sections.reduce((sum, s) => sum + s.tasks.length, 0);
  const selectedTasks = preview.sections.reduce((sum, s) => sum + s.tasks.filter(t => t.selected).length, 0);
  const selectedSections = preview.sections.filter(s => s.selected).length;

  return (
    <div className="ai-preview">
      <div className="ai-preview-summary">
        <span className="ai-preview-summary-text">
          {t('ai.previewSummary', { sections: selectedSections, tasks: selectedTasks, total: totalTasks })}
        </span>
      </div>

      {preview.sections.map(sec => (
        <div key={sec.tempId} className="ai-preview-section">
          <div className="ai-preview-section-header">
            <label className="ai-preview-check">
              <input type="checkbox" checked={sec.selected} onChange={() => toggleSection(sec.tempId)} />
              <span className="ai-preview-section-dot" style={{ background: sec.color || '#6366f1' }} />
              <strong>{sec.name}</strong>
              {sec.action === 'reuse' && <span className="ai-badge ai-badge-reuse">{t('ai.existing')}</span>}
              {sec.action === 'create' && <span className="ai-badge ai-badge-new">{t('ai.new')}</span>}
            </label>
            <span className="ai-preview-section-count">{sec.tasks.length} {t('ai.tasks')}</span>
          </div>
          {sec.description && <p className="ai-preview-section-desc">{sec.description}</p>}
          <div className="ai-preview-tasks">
            {sec.tasks.map(task => (
              <div key={task.tempId} className={`ai-preview-task ${task.selected ? '' : 'deselected'}`}>
                <label className="ai-preview-check">
                  <input type="checkbox" checked={task.selected} onChange={() => toggleTask(sec.tempId, task.tempId)} />
                  <span className="ai-preview-task-title">{task.title}</span>
                </label>
                {task.description && <p className="ai-preview-task-desc">{task.description}</p>}
                <div className="ai-preview-task-meta">
                  {task.tags.length > 0 && (
                    <span className="ai-preview-tags">
                      {task.tags.slice(0, 4).map((tag, i) => (
                        <span key={i} className="ai-tag-badge">{tag.name}</span>
                      ))}
                    </span>
                  )}
                  {task.assignees.length > 0 && (
                    <span className="ai-preview-assignees">
                      {task.assignees.slice(0, 3).map((a, i) => (
                        <span key={i} className={`ai-assignee-chip ${a.found === false ? 'not-found' : ''}`} title={a.email}>
                          {a.name || a.email}
                        </span>
                      ))}
                    </span>
                  )}
                  {task.startDate && <span className="ai-preview-due">▶ {task.startDate}</span>}
                  {task.dueDate && <span className="ai-preview-due">📅 {task.dueDate}</span>}
                </div>
                {task.subtasks.length > 0 && (
                  <ul className="ai-preview-subtasks">
                    {task.subtasks.map((st, i) => (
                      <li key={i}>{st.title}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
