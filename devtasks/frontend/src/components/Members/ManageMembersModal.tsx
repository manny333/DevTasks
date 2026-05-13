import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { AccessType, Project, ProjectMember, Section, SectionMember } from '../../types';

type Tab = 'project' | 'section';

interface ManageMembersModalProps {
  project: Project;
  initialSection?: Section | null;
  onClose: () => void;
  onProjectMembersChange?: (members: ProjectMember[]) => void;
}

const ACCESS_LABELS: Record<AccessType, string> = {
  FULL: 'Full',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

function UserAvatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    return <img className="member-avatar" src={avatar} alt={name} />;
  }
  return (
    <div className="member-avatar member-avatar-initial">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ManageMembersModal({
  project,
  initialSection,
  onClose,
  onProjectMembersChange,
}: ManageMembersModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>(initialSection ? 'section' : 'project');
  const [selectedSection, setSelectedSection] = useState<Section | null>(initialSection ?? null);

  // Project members
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>(project.members ?? []);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAccessType, setInviteAccessType] = useState<AccessType>('FULL');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Section members
  const [sectionMembers, setSectionMembers] = useState<SectionMember[]>([]);
  const [sectionInviteEmail, setSectionInviteEmail] = useState('');
  const [sectionInviteAccessType, setSectionInviteAccessType] = useState<AccessType>('VIEWER');
  const [sectionInviting, setSectionInviting] = useState(false);
  const [sectionInviteError, setSectionInviteError] = useState('');
  const [loadingSection, setLoadingSection] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!selectedSection) return;
    setLoadingSection(true);
    api.get(`/sections/${selectedSection.id}/members`)
      .then((res) => setSectionMembers(res.data))
      .finally(() => setLoadingSection(false));
  }, [selectedSection]);

  const inviteProjectMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError('');
    setInviting(true);
    try {
      const res = await api.post(`/projects/${project.id}/members`, {
        email: inviteEmail.trim(),
        accessType: inviteAccessType,
      });
      const updated = [...projectMembers, res.data];
      setProjectMembers(updated);
      onProjectMembersChange?.(updated);
      setInviteEmail('');
    } catch (err: any) {
      setInviteError(err?.response?.data?.error || t('members.inviteError'));
    } finally {
      setInviting(false);
    }
  };

  const updateProjectMemberAccess = async (userId: string, accessType: AccessType) => {
    try {
      const res = await api.patch(`/projects/${project.id}/members/${userId}`, { accessType });
      setProjectMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, accessType: res.data.accessType } : m))
      );
    } catch { /* ignore */ }
  };

  const removeProjectMember = async (userId: string) => {
    try {
      await api.delete(`/projects/${project.id}/members/${userId}`);
      const updated = projectMembers.filter((m) => m.userId !== userId);
      setProjectMembers(updated);
      onProjectMembersChange?.(updated);
    } catch { /* ignore */ }
  };

  const inviteSectionMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSection || !sectionInviteEmail.trim()) return;
    setSectionInviteError('');
    setSectionInviting(true);
    try {
      const res = await api.post(`/sections/${selectedSection.id}/members`, {
        email: sectionInviteEmail.trim(),
        accessType: sectionInviteAccessType,
      });
      setSectionMembers((prev) => [...prev, res.data]);
      setSectionInviteEmail('');
    } catch (err: any) {
      setSectionInviteError(err?.response?.data?.error || t('members.inviteError'));
    } finally {
      setSectionInviting(false);
    }
  };

  const updateSectionMemberAccess = async (userId: string, accessType: AccessType) => {
    if (!selectedSection) return;
    try {
      const res = await api.patch(`/sections/${selectedSection.id}/members/${userId}`, { accessType });
      setSectionMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, accessType: res.data.accessType } : m))
      );
    } catch { /* ignore */ }
  };

  const removeSectionMember = async (userId: string) => {
    if (!selectedSection) return;
    try {
      await api.delete(`/sections/${selectedSection.id}/members/${userId}`);
      setSectionMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch { /* ignore */ }
  };

  const sections = project.sections ?? [];

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal manage-members-modal">
        {/* Header */}
        <div className="create-task-header">
          <div className="create-task-header-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <span className="create-task-header-title">{t('members.title')}</span>
          <button className="btn-icon modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="members-tabs">
          <button
            className={`btn-tab ${tab === 'project' ? 'active' : ''}`}
            onClick={() => setTab('project')}
          >
            {t('members.tabs.project')}
          </button>
          <button
            className={`btn-tab ${tab === 'section' ? 'active' : ''}`}
            onClick={() => setTab('section')}
          >
            {t('members.tabs.section')}
          </button>
        </div>

        {/* Project tab */}
        {tab === 'project' && (
          <div className="members-tab-content">
            {/* Owner row */}
            <div className="member-row">
              <UserAvatar name={project.owner.name} avatar={project.owner.avatar} />
              <div className="member-info">
                <span className="member-name">{project.owner.name}</span>
                <span className="member-email">{project.owner.email ?? ''}</span>
              </div>
              <span className="member-role-badge owner">{t('members.owner')}</span>
            </div>

            {/* Existing members */}
            {projectMembers.map((m) => (
              <div key={m.id} className="member-row">
                <UserAvatar name={m.user.name} avatar={m.user.avatar} />
                <div className="member-info">
                  <span className="member-name">{m.user.name}</span>
                  <span className="member-email">{m.user.email}</span>
                </div>
                <select
                  className="member-access-select"
                  value={m.accessType}
                  onChange={(e) => updateProjectMemberAccess(m.userId, e.target.value as AccessType)}
                >
                  {(Object.keys(ACCESS_LABELS) as AccessType[]).map((at) => (
                    <option key={at} value={at}>{ACCESS_LABELS[at]}</option>
                  ))}
                </select>
                <button
                  className="btn-icon member-remove-btn"
                  title={t('members.remove')}
                  onClick={() => removeProjectMember(m.userId)}
                >
                  ×
                </button>
              </div>
            ))}

            {/* Invite form */}
            <form className="member-invite-form" onSubmit={inviteProjectMember}>
              <input
                type="email"
                className="members-email-input"
                placeholder={t('members.emailPlaceholder')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="member-access-select"
                value={inviteAccessType}
                onChange={(e) => setInviteAccessType(e.target.value as AccessType)}
              >
                {(Object.keys(ACCESS_LABELS) as AccessType[]).map((at) => (
                  <option key={at} value={at}>{ACCESS_LABELS[at]}</option>
                ))}
              </select>
              <button className="btn-primary" type="submit" disabled={inviting}>
                {inviting ? '…' : t('members.invite')}
              </button>
            </form>
            {inviteError && <p className="member-error">{inviteError}</p>}
          </div>
        )}

        {/* Section tab */}
        {tab === 'section' && (
          <div className="members-tab-content">
            {/* Section picker */}
            <div className="section-picker-row">
              <label className="section-picker-label">{t('sections.title')}:</label>
              <div className="section-picker-btns">
                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    className={`section-picker-btn ${selectedSection?.id === sec.id ? 'active' : ''}`}
                    style={{ '--sec-color': sec.color } as React.CSSProperties}
                    onClick={() => setSelectedSection(sec)}
                  >
                    <span className="section-nav-dot" style={{ background: sec.color }} />
                    {sec.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedSection == null ? (
              <p className="members-empty">{t('members.selectSection')}</p>
            ) : loadingSection ? (
              <div className="spinner" style={{ margin: '20px auto' }} />
            ) : (
              <>
                {sectionMembers.length === 0 && (
                  <p className="members-empty">{t('members.noSectionMembers')}</p>
                )}
                {sectionMembers.map((m) => (
                  <div key={m.id} className="member-row">
                    <UserAvatar name={m.user.name} avatar={m.user.avatar} />
                    <div className="member-info">
                      <span className="member-name">{m.user.name}</span>
                      <span className="member-email">{m.user.email}</span>
                    </div>
                    <select
                      className="member-access-select"
                      value={m.accessType}
                      onChange={(e) => updateSectionMemberAccess(m.userId, e.target.value as AccessType)}
                    >
                      {(Object.keys(ACCESS_LABELS) as AccessType[]).map((at) => (
                        <option key={at} value={at}>{ACCESS_LABELS[at]}</option>
                      ))}
                    </select>
                    <button
                      className="btn-icon member-remove-btn"
                      title={t('members.remove')}
                      onClick={() => removeSectionMember(m.userId)}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Invite to section form */}
                <form className="member-invite-form" onSubmit={inviteSectionMember}>
                  <input
                    type="email"
                    className="members-email-input"
                    placeholder={t('members.emailPlaceholder')}
                    value={sectionInviteEmail}
                    onChange={(e) => setSectionInviteEmail(e.target.value)}
                  />
                  <select
                    className="member-access-select"
                    value={sectionInviteAccessType}
                    onChange={(e) => setSectionInviteAccessType(e.target.value as AccessType)}
                  >
                    {(Object.keys(ACCESS_LABELS) as AccessType[]).map((at) => (
                      <option key={at} value={at}>{ACCESS_LABELS[at]}</option>
                    ))}
                  </select>
                  <button className="btn-primary" type="submit" disabled={sectionInviting}>
                    {sectionInviting ? '…' : t('members.invite')}
                  </button>
                </form>
                {sectionInviteError && <p className="member-error">{sectionInviteError}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
