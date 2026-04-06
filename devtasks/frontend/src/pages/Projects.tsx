import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Project } from '../types';

const PROJECT_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4'];
const getProjectColor = (name: string) => PROJECT_COLORS[name.charCodeAt(0) % PROJECT_COLORS.length];

export default function Projects() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);

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
    <div className="projects-page">
      {/* Header */}
      <div className="projects-page-header">
        <div>
          <h1 className="projects-page-title">
            {user?.name ? `${user.name.split(' ')[0]}'s ${t('projects.title')}` : t('projects.title')}
          </h1>
          <p className="projects-page-subtitle">{t('projects.subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + {t('projects.create')}
        </button>
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
        <div className="projects-grid">
          {projects.map((project) => {
            const color = getProjectColor(project.name);
            const initial = project.name.charAt(0).toUpperCase();
            return (
              <div key={project.id} className="project-card-wrapper">
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
    </div>
  );
}

