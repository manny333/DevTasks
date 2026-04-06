import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    const next = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  };

  return (
    <nav className="navbar">
      <Link to="/projects" className="navbar-brand">
        {t('app.name')}
      </Link>

      <div className="navbar-actions">
        <button className="btn-icon btn-lang" onClick={toggleLang} title="Toggle language">
          {i18n.language === 'en' ? 'EN' : 'ES'}
        </button>
        <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
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
