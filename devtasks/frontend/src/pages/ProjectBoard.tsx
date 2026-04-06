import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import type { Project, Section, Tag, Task } from '../types';
import Board from '../components/Kanban/Board';
import ManageTagsModal from '../components/Tags/ManageTagsModal';
import ManageMembersModal from '../components/Members/ManageMembersModal';
import UndoToast from '../components/UndoToast';

const SECTION_COLORS = [
  '#6366f1', '#f59e0b', '#22c55e', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
  '#ef4444', '#84cc16',
];

export default function ProjectBoard() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<Project | null>(null);
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);
  const [showManageTags, setShowManageTags] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [membersSectionTarget, setMembersSectionTarget] = useState<Section | null>(null);
  const [sectionTaskStats, setSectionTaskStats] = useState<Record<string, { done: number; total: number }>>({});
  const [pendingDeleteSection, setPendingDeleteSection] = useState<Section | null>(null);
  const deleteSectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showArchivedSections, setShowArchivedSections] = useState(false);
  useEffect(() => {
    if (!slug) return;
    api
      .get(`/projects/${slug}`)
      .then((res) => {
        setProject(res.data);
        if (res.data.sections?.length > 0) {
          setActiveSection(res.data.sections[0]);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!project) return;
    const stats: Record<string, { done: number; total: number }> = {};
    for (const sec of project.sections || []) {
      const active = (sec.tasks || []).filter(t => !t.archived);
      stats[sec.id] = { done: active.filter(t => t.status === 'DONE').length, total: active.length };
    }
    setSectionTaskStats(stats);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const deleteSection = (id: string) => {
    const sec = (project?.sections || []).find((s) => s.id === id);
    if (!sec) return;
    const remaining = (project?.sections || []).filter((s) => s.id !== id);
    setProject((prev) => prev ? { ...prev, sections: remaining } : prev);
    if (activeSection?.id === id) setActiveSection(remaining.find(s => !s.archived) ?? null);
    if (deleteSectionTimerRef.current) clearTimeout(deleteSectionTimerRef.current);
    setPendingDeleteSection(sec);
    deleteSectionTimerRef.current = setTimeout(async () => {
      await api.delete(`/sections/${id}`);
      setPendingDeleteSection(null);
    }, 4000);
  };

  const archiveSection = async (id: string) => {
    const res = await api.patch(`/sections/${id}/archive`);
    const updated: Section = res.data;
    setProject((prev) =>
      prev ? { ...prev, sections: (prev.sections || []).map((s) => s.id === id ? { ...s, archived: updated.archived } : s) } : prev
    );
    if (activeSection?.id === id && updated.archived) {
      const next = (project?.sections || []).find((s) => s.id !== id && !s.archived);
      setActiveSection(next ?? null);
    }
  };

  const undoDeleteSection = () => {
    if (!pendingDeleteSection) return;
    if (deleteSectionTimerRef.current) clearTimeout(deleteSectionTimerRef.current);
    setProject((prev) =>
      prev ? { ...prev, sections: [...(prev.sections || []), pendingDeleteSection] } : prev
    );
    setPendingDeleteSection(null);
  };

  const addSection = async (name: string, color: string) => {
    if (!project) return;
    const res = await api.post(`/projects/${project.id}/sections`, { name, color });
    const newSection = res.data;
    setProject((prev) =>
      prev ? { ...prev, sections: [...(prev.sections || []), newSection] } : prev
    );
    setActiveSection(newSection);
  };

  const handleTagsChange = (tags: Tag[]) => {
    setProject((prev) => prev ? { ...prev, tags } : prev);
  };

  const handleSectionTasksChanged = useCallback((sectionId: string, tasks: Task[]) => {
    const active = tasks.filter(t => !t.archived);
    setSectionTaskStats(prev => ({
      ...prev,
      [sectionId]: { done: active.filter(t => t.status === 'DONE').length, total: active.length },
    }));
  }, []);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!project) return <div className="error-state">Project not found</div>;

  const canEdit = !project.myAccess || project.myAccess.level === 'owner' || project.myAccess.accessType !== 'VIEWER';

  return (
    <div className="project-board-layout">
      {/* Sidebar */}
      <aside className="sections-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-project-name">{project.name}</span>
        </div>
        <nav className="sections-nav">
          <div className="sections-nav-title">{t('sections.title')}</div>
          {(project.sections || []).filter(sec => showArchivedSections ? true : !sec.archived).map((sec) => {
            const stats = sectionTaskStats[sec.id] ?? { done: 0, total: 0 };
            const pct = stats.total > 0 ? Math.round(stats.done / stats.total * 100) : 0;
            return (
              <div
                key={sec.id}
                className={`section-nav-item ${activeSection?.id === sec.id ? 'active' : ''} ${sec.archived ? 'archived' : ''}`}
                style={{ '--sec-color': sec.color } as React.CSSProperties}
              >
                <button
                  className="section-nav-btn"
                  onClick={() => setActiveSection(sec)}
                >
                  <span className="section-nav-dot" style={{ background: sec.color }} />
                  {sec.name}
                </button>
                {canEdit && (
                  <button
                    className="section-nav-share"
                    onClick={() => { setMembersSectionTarget(sec); setShowManageMembers(true); }}
                    title={t('members.shareSection')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </button>
                )}
                {canEdit && (
                  <button
                    className="section-nav-archive"
                    onClick={() => archiveSection(sec.id)}
                    title={sec.archived ? t('sections.unarchive') : t('sections.archive')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {sec.archived
                        ? <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><polyline points="10 12 12 14 14 12"/><line x1="12" y1="8" x2="12" y2="14"/></>
                        : <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>
                      }
                    </svg>
                  </button>
                )}
                {canEdit && (
                  <button
                    className="section-nav-delete"
                    onClick={() => deleteSection(sec.id)}
                    title={t('sections.delete')}
                  >
                    ×
                  </button>
                )}
                {stats.total > 0 && (
                  <div className="section-progress-track" title={`${pct}% completado`}>
                    <div className="section-progress-fill" style={{ width: `${pct}%`, background: sec.color }} />
                  </div>
                )}
              </div>
            );
          })}
          {(project.sections || []).some(s => s.archived) && (
            <button
              className="sections-show-archived-btn"
              onClick={() => setShowArchivedSections(o => !o)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
              {showArchivedSections ? t('sections.hideArchived') : t('sections.showArchived')}
              <span className="sections-archived-count">
                {(project.sections || []).filter(s => s.archived).length}
              </span>
            </button>
          )}
        </nav>
        {canEdit && <AddSectionInline onAdd={addSection} />}
        <div className="sidebar-section-divider" />
        {canEdit && (
          <button className="add-section-btn" onClick={() => { setMembersSectionTarget(null); setShowManageMembers(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/>
            </svg>
            {t('members.title')}
          </button>
        )}
        {canEdit && (
          <button className="add-section-btn" onClick={() => setShowManageTags(true)}>
            🏷 {t('tags.title')}
          </button>
        )}
      </aside>

      {/* Board area */}
      <main
        className="board-area"
        style={{ '--active-color': activeSection?.color ?? '#6366f1' } as React.CSSProperties}
      >
        {activeSection ? (
          <Board
            section={activeSection}
            projectTags={project.tags || []}
            projectMembers={project.members || []}
            allSections={project.sections || []}
            myAccess={project.myAccess}
            onTasksChanged={handleSectionTasksChanged}
          />
        ) : (
          <div className="empty-state">{t('sections.noSections')}</div>
        )}
      </main>

      {showManageTags && (
        <ManageTagsModal
          projectId={project.id}
          tags={project.tags || []}
          onClose={() => setShowManageTags(false)}
          onTagsChange={handleTagsChange}
        />
      )}

      {showManageMembers && (
        <ManageMembersModal
          project={project}
          initialSection={membersSectionTarget}
          onClose={() => { setShowManageMembers(false); setMembersSectionTarget(null); }}
        />
      )}

      {pendingDeleteSection && (
        <UndoToast
          message={`Sección "${pendingDeleteSection.name}" eliminada`}
          onUndo={undoDeleteSection}
          onDismiss={() => setPendingDeleteSection(null)}
        />
      )}
    </div>
  );
}

function AddSectionInline({ onAdd }: { onAdd: (name: string, color: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SECTION_COLORS[0]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim(), color);
    setName('');
    setColor(SECTION_COLORS[0]);
    setAdding(false);
  };

  if (!adding) {
    return (
      <button className="add-section-btn" onClick={() => setAdding(true)}>
        + {t('sections.create')}
      </button>
    );
  }

  return (
    <form className="add-section-form" onSubmit={submit}>
      <input
        type="text"
        placeholder={t('sections.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="section-color-label">{t('sections.color')}</div>
      <div className="section-color-swatches">
        {SECTION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`section-color-swatch ${color === c ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <div className="add-section-actions">
        <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>×</button>
        <button type="submit" className="btn-primary" style={{ background: color }}>
          {t('sections.create')}
        </button>
      </div>
    </form>
  );
}

