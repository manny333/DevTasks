import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useTranslation();

  if (user) return <Navigate to="/projects" replace />;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">{t('auth.welcome')}</h1>
        <p className="login-subtitle">{t('auth.subtitle')}</p>
        <div className="login-google-btn">
          <GoogleLogin
            onSuccess={(res) => {
              if (res.credential) login(res.credential);
            }}
            onError={() => console.error('Google login failed')}
            shape="rectangular"
            size="large"
            text="signin_with"
          />
        </div>
      </div>
    </div>
  );
}
