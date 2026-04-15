import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/Layout/Navbar';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectBoard from './pages/ProjectBoard';
import SearchModal from './components/Search/SearchModal';
import { useState, useEffect } from 'react';
import './i18n';
import './styles/globals.css';
import './styles/theme.css';
import './styles/kanban.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function App() {
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <div className="app-layout">
                      <Navbar />
                      <main className="app-main">
                        <div className="aurora-bg" aria-hidden="true">
                          <div className="aurora-orb aurora-orb-1" />
                          <div className="aurora-orb aurora-orb-2" />
                          <div className="aurora-orb aurora-orb-3" />
                          <div className="aurora-orb aurora-orb-4" />
                        </div>
                        <Routes>
                          <Route path="/projects" element={<Projects />} />
                          <Route path="/projects/:slug" element={<ProjectBoard />} />
                          <Route path="/" element={<Navigate to="/projects" replace />} />
                        </Routes>
                      </main>
                    </div>
                    {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
