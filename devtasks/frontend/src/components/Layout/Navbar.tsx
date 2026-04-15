import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from '../Notifications/NotificationPanel';
import logoIcon from '../../assets/logo-kanvy.png';
import logoText from '../../assets/logo-kanvy-text.png';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const { unreadCount, newArrived, clearNewArrived } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [bellShake, setBellShake] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Trigger shake animation when a new notification arrives via SSE
  useEffect(() => {
    if (!newArrived) return;
    setBellShake(true);
  }, [newArrived]);

  const toggleLang = () => {
    const next = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  };

  return (
    <nav className="navbar">
      <Link to="/projects" className="navbar-brand navbar-logo-pill">
        <img src={logoIcon} alt="Kanvy" style={{ height: '32px', filter: 'none' }} />
        <img src={logoText} alt="Kanvy" style={{ height: '20px', marginLeft: '8px', filter: 'none' }} />
      </Link>

      <div className="navbar-actions">
        <button className="btn-icon btn-lang" onClick={toggleLang} title="Toggle language">
          {i18n.language === 'en' ? 'EN' : 'ES'}
        </button>
        <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        {user && (
          <div className="notif-bell" ref={bellRef} style={{ position: 'relative' }}>
            <button
              className={`btn-icon notif-bell__btn${bellShake ? ' notif-bell--shake' : ''}`}
              title={t('notifications.title')}
              onClick={() => setShowNotifications((prev) => !prev)}
              onAnimationEnd={() => {
                setBellShake(false);
                clearNewArrived();
              }}
            >
              🔔
              {unreadCount > 0 && (
                <span className="notif-bell__badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <NotificationPanel
                anchorRef={bellRef}
                onClose={() => setShowNotifications(false)}
              />
            )}
          </div>
        )}

        {user && (
          <div className="navbar-user">
            {user.avatar && <img src={user.avatar} alt={user.name} className="avatar-sm" referrerPolicy="no-referrer" />}
            <span>{user.name}</span>
            <button className="btn-secondary btn-sm" onClick={logout}>
              {t('auth.signOut')}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
