import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Project } from '../types';
import AIImportModal from '../components/AI/AIImportModal';
import balonImg from '../assets/balon_fifa_2026.png';

const PROJECT_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4'];
const getProjectColor = (name: string) => PROJECT_COLORS[name.charCodeAt(0) % PROJECT_COLORS.length];

export default function Projects() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);
  const ballAnimRef = useRef(0);
  const ballElsRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const ballPhysicsRef = useRef<{ id: number; x: number; y: number; vx: number; vy: number; life: number }[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [search, setSearch] = useState('');

  const totalSections = useMemo(() => projects.reduce((s, p) => s + (p._count?.sections ?? 0), 0), [projects]);
  const totalMembers = useMemo(() => projects.reduce((s, p) => s + (p._count?.members ?? 0), 0), [projects]);

  const { wcLabel } = useMemo(() => {
    const now = Date.now();
    const start = new Date('2026-06-11T00:00:00').getTime();
    const end = new Date('2026-07-19T23:59:59').getTime();
    const daysToWC = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    let label: string;
    if (now < start) {
      label = daysToWC === 1 ? '1 day to kickoff' : `${daysToWC} days to kickoff`;
    } else if (now <= end) {
      label = 'LIVE';
    } else {
      label = 'Finished';
    }
    return { wcLabel: label };
  }, []);

  const spawnBall = (clientX: number, clientY: number, vx?: number, vy?: number) => {
    const id = Date.now() + Math.random();
    const img = document.createElement('img');
    img.src = balonImg;
    img.style.cssText = `position:fixed;width:40px;height:40px;pointer-events:none;z-index:9999;left:${clientX - 20}px;top:${clientY - 20}px;transform:translateZ(0);will-change:transform;`;
    document.body.appendChild(img);

    ballElsRef.current.set(id, img);
    ballPhysicsRef.current.push({ id, x: clientX - 20, y: clientY - 20, vx: vx ?? (Math.random() - 0.5) * 14, vy: vy ?? (-12 - Math.random() * 4), life: 1 });

    if (!ballAnimRef.current) ballAnimRef.current = requestAnimationFrame(tickBalls);
  };

  const tickBalls = () => {
    const GRAVITY = 0.5;
    const BOUNCE = 0.65;
    const SIZE = 40;

    for (const b of ballPhysicsRef.current) {
      b.vy += GRAVITY; b.x += b.vx; b.y += b.vy; b.life -= 0.004;
      const right = window.innerWidth - SIZE;
      const bottom = window.innerHeight - SIZE;
      if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * BOUNCE; }
      if (b.x > right) { b.x = right; b.vx = -Math.abs(b.vx) * BOUNCE; }
      if (b.y > bottom) { b.y = bottom; b.vy = -Math.abs(b.vy) * BOUNCE; }
      const el = ballElsRef.current.get(b.id);
      if (el) { el.style.left = `${b.x}px`; el.style.top = `${b.y}px`; el.style.opacity = String(Math.max(0, b.life)); }
    }

    const keep: { id: number; x: number; y: number; vx: number; vy: number; life: number }[] = [];
    const dead: number[] = [];
    for (const b of ballPhysicsRef.current) {
      if (b.life <= 0 || b.y > window.innerHeight + 100) dead.push(b.id);
      else keep.push(b);
    }

    for (const id of dead) { ballElsRef.current.get(id)?.remove(); ballElsRef.current.delete(id); }
    ballPhysicsRef.current = keep;

    if (ballPhysicsRef.current.length > 0) ballAnimRef.current = requestAnimationFrame(tickBalls);
    else ballAnimRef.current = 0;
  };

  const handleBallsClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.modal-overlay, .project-card-menu-btn, .project-card-dropdown, .btn-hero-create, .btn-primary, .btn-ai, .projects-search-input, input, textarea, .modal, a')) return;
    spawnBall(e.clientX, e.clientY);
  };

  useEffect(() => () => {
    cancelAnimationFrame(ballAnimRef.current);
    for (const el of ballElsRef.current.values()) el.remove();
    ballElsRef.current.clear();
    ballPhysicsRef.current = [];
  }, []);

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 3;
      const count = 20;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
        const speed = 8 + Math.random() * 8;
        spawnBall(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40, Math.cos(angle) * speed, Math.sin(angle) * speed);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [loading]);

  const closeCreate = () => {
    setShowCreate(false);
    setForm({ name: '', description: '' });
  };

  const deleteProject = async () => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.name) return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${deleteTarget.id}`);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirm('');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    api.get('/projects').then((res) => setProjects(res.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.project-card-menu-wrapper')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const openEdit = (project: Project) => {
    setOpenMenuId(null);
    setEditTarget(project);
    setEditForm({ name: project.name, description: project.description ?? '' });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      const res = await api.patch(`/projects/${editTarget.id}`, editForm);
      setProjects((prev) => prev.map((p) => p.id === editTarget.id ? { ...p, ...res.data } : p));
      setEditTarget(null);
    } finally {
      setEditSaving(false);
    }
  };

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await api.post('/projects', { ...form, template: 'blank' });
      setProjects((prev) => [res.data, ...prev]);
      closeCreate();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div className="projects-page" onClick={handleBallsClick}>
      {/* Hero Banner */}
      <div className="projects-hero">
        <div className="projects-hero-dots" />

        <div className="projects-hero-content">
          <div className="projects-hero-left">
            {/* World Cup 2026 Badge */}
            <div className="wc-badge">
              <svg className="wc-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                <path d="M4 22h16"/>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
              </svg>
              <span className="wc-badge-label">World Cup 2026</span>
              <span className="wc-badge-sep">·</span>
              <span className="wc-badge-count">{wcLabel}</span>
              <span className="wc-badge-hosts">USA · Canada · Mexico</span>
            </div>

            <h1 className="projects-hero-title">
              {user?.name ? `${user.name.split(' ')[0]}'s ${t('projects.title')}` : t('projects.title')}
            </h1>
            <p className="projects-hero-subtitle">{t('projects.subtitle')}</p>

            <div className="projects-hero-stats">
              <span className="hero-stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                {projects.length} {t('projects.title')}
              </span>
              <span className="hero-stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                </svg>
                {totalMembers} {t('projects.members')}
              </span>
            </div>

            <div className="hero-actions-row">
              <button className="btn-hero-create" onClick={() => setShowCreate(true)}>
                + {t('projects.create')}
              </button>
              <button className="btn-hero-create" onClick={() => setShowAIImport(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                {t('ai.importButton')}
              </button>
            </div>
          </div>
          {user?.avatar && (
            <div className="projects-hero-avatar">
              <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
            </div>
          )}
        </div>

        <div className="projects-hero-wave">
          <svg viewBox="0 0 1200 40" preserveAspectRatio="none">
            <path d="M0,18 C300,34 600,4 900,18 C1050,26 1150,16 1200,18 L1200,40 L0,40 Z" fill="var(--bg-primary)"/>
          </svg>
        </div>
      </div>

      {/* Stats row */}
      <div className="projects-stats-row">
        <div className="projects-stat-card">
          <span className="stat-card-number">{projects.length}</span>
          <span className="stat-card-label">{t('projects.title')}</span>
        </div>
        <div className="projects-stat-card">
          <span className="stat-card-number">{totalSections}</span>
          <span className="stat-card-label">{t('sections.title')}</span>
        </div>
        <div className="projects-stat-card">
          <span className="stat-card-number">{totalMembers}</span>
          <span className="stat-card-label">{t('projects.members')}</span>
        </div>
      </div>

      {/* Empty state */}
      {projects.length === 0 ? (
        <div className="projects-empty-state">
          <div className="projects-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <p className="projects-empty-title">{t('projects.noProjects')}</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + {t('projects.create')}
          </button>
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="projects-search-bar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="projects-search-input"
              placeholder={t('projects.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="projects-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <div className="projects-grid">
            {projects
              .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))
              .map((project, index) => {
            const color = getProjectColor(project.name);
            const initial = project.name.charAt(0).toUpperCase();
            return (
              <div key={project.id} className="project-card-wrapper project-card-animate" style={{ animationDelay: `${index * 60}ms` }}>
                <Link to={`/projects/${project.slug}`} className="project-card">
                  <div className="project-card-top" style={{ background: color }}>
                    <span className="project-card-initial">{initial}</span>
                  </div>
                  <div className="project-card-body">
                    <h2>{project.name}</h2>
                    {project.description && <p>{project.description}</p>}
                  </div>
                  <div className="project-card-meta">
                    <span className="project-meta-item">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                      </svg>
                      {project._count?.sections ?? 0} {t('projects.sections')}
                    </span>
                    <span className="project-meta-item">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      {project._count?.members ?? 0} {t('projects.members')}
                    </span>
                    {project.myAccess && (
                      <span className={`project-access-badge access-${project.myAccess.level === 'owner' ? 'owner' : project.myAccess.accessType.toLowerCase()}`}>
                        {project.myAccess.level === 'owner'
                          ? t('members.owner')
                          : project.myAccess.level === 'section'
                          ? t('members.sectionAccess')
                          : project.myAccess.accessType === 'FULL'
                          ? t('members.access.full')
                          : project.myAccess.accessType === 'EDITOR'
                          ? t('members.access.editor')
                          : t('members.access.viewer')}
                      </span>
                    )}
                  </div>
                </Link>

                {/* ⋯ menu */}
                <div className="project-card-menu-wrapper">
                  <button
                    className="project-card-menu-btn"
                    onClick={(e) => { e.preventDefault(); setOpenMenuId(openMenuId === project.id ? null : project.id); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
                    </svg>
                  </button>
                  {openMenuId === project.id && (
                    <div className="project-card-dropdown">
                      <button onClick={(e) => { e.preventDefault(); openEdit(project); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        {t('common.edit')}
                      </button>
                      <button className="danger" onClick={(e) => { e.preventDefault(); setOpenMenuId(null); setDeleteTarget(project); setDeleteConfirm(''); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                        {t('common.delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );  
          })}
          </div>
        </>
      )}

      {/* Create project modal */}
      {showCreate && (
        <div
          className="modal-overlay"
          ref={overlayRef}
          onClick={(e) => { if (e.target === overlayRef.current) closeCreate(); }}
        >
          <div className="modal create-project-modal">
            <div className="create-task-header">
              <div className="create-task-header-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <span className="create-task-header-title">
                {t('projects.create')}
              </span>
              <button className="btn-icon modal-close" onClick={closeCreate}>×</button>
            </div>

            <form onSubmit={createProject} className="create-project-form">
                <input
                  className="create-project-name-input"
                  type="text"
                  placeholder={t('projects.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  required
                />
                <textarea
                  className="create-project-desc-input"
                  placeholder={t('projects.description')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
                <div className="create-project-footer">
                  <button type="button" className="btn-secondary" onClick={closeCreate}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </form>
          </div>
        </div>
      )}

      {/* Delete project modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDeleteTarget(null); setDeleteConfirm(''); } }}>
          <div className="modal delete-project-modal">
            <div className="delete-modal-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <h2 className="delete-modal-title">{t('projects.deleteTitle')}</h2>
            <p className="delete-modal-desc">
              {t('projects.deleteWarning')} <strong>{t('projects.deleteType')}</strong>:
            </p>
            <code className="delete-modal-name">{deleteTarget.name}</code>
            <input
              className="delete-modal-input"
              type="text"
              placeholder={deleteTarget.name}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoFocus
            />
            <div className="delete-modal-footer">
              <button className="btn-secondary" onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-danger"
                disabled={deleteConfirm !== deleteTarget.name || deleting}
                onClick={deleteProject}
              >
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit project modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <div className="modal create-project-modal">
            <div className="create-task-header">
              <div className="create-task-header-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <span className="create-task-header-title">{t('projects.editTitle')}</span>
              <button className="btn-icon modal-close" onClick={() => setEditTarget(null)}>×</button>
            </div>
            <form onSubmit={saveEdit} className="create-project-form">
              <input
                className="create-project-name-input"
                type="text"
                placeholder={t('projects.namePlaceholder')}
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                autoFocus
                required
              />
              <textarea
                className="create-project-desc-input"
                placeholder={t('projects.description')}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
              <div className="create-project-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={editSaving}>
                  {editSaving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAIImport && (
        <AIImportModal onClose={() => setShowAIImport(false)} onImported={() => { setShowAIImport(false); api.get('/projects').then(res => setProjects(res.data)); }} />
      )}
    </div>
  );
}

