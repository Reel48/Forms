import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SessionTimeoutWarning } from './components/SessionTimeoutWarning';
import { NotificationProvider } from './components/NotificationSystem';
import { FaTimes } from 'react-icons/fa';
import './App.css';

// Lazy load components for better performance
const QuotesList = lazy(() => import('./pages/QuotesList'));
const QuoteBuilder = lazy(() => import('./pages/QuoteBuilder'));
const QuoteView = lazy(() => import('./pages/QuoteView'));
const FormsList = lazy(() => import('./pages/FormsList'));
const FormBuilder = lazy(() => import('./pages/FormBuilder'));
const FormView = lazy(() => import('./pages/FormView'));
const FormSubmissions = lazy(() => import('./pages/FormSubmissions'));
const PublicFormView = lazy(() => import('./pages/PublicFormView'));
const ClientsList = lazy(() => import('./pages/ClientsList'));
const FilesList = lazy(() => import('./pages/FilesList'));
const FileView = lazy(() => import('./pages/FileView'));
const ESignatureDocumentsList = lazy(() => import('./pages/ESignatureDocumentsList'));
const ESignatureView = lazy(() => import('./pages/ESignatureView'));
const FoldersList = lazy(() => import('./pages/FoldersList'));
const FolderView = lazy(() => import('./pages/FolderView'));
const CompanySettingsPage = lazy(() => import('./pages/CompanySettings'));
const Profile = lazy(() => import('./pages/Profile'));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const QuoteAnalytics = lazy(() => import('./pages/QuoteAnalytics'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ResendVerification = lazy(() => import('./pages/ResendVerification'));

// Loading component
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
    <div>Loading...</div>
  </div>
);

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role, signOut } = useAuth();
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLLIElement>(null);
  const searchTerm = searchParams.get('search') || '';
  
  // Determine active tab based on path
  const isFormsActive = location.pathname.startsWith('/forms');
  const isQuotesActive = !isFormsActive && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
  const isFilesActive = location.pathname.startsWith('/files');
  const isESignatureActive = location.pathname.startsWith('/esignature');
  const isFoldersActive = location.pathname.startsWith('/folders');
  const isClientsActive = location.pathname === '/clients';
  const isSettingsActive = location.pathname === '/settings';
  const isProfileActive = location.pathname === '/profile';
  const isDashboardActive = location.pathname === '/dashboard';
  const isEmailTemplatesActive = location.pathname === '/email-templates';
  const isAnalyticsActive = location.pathname === '/analytics';
  const isAdmin = role === 'admin';

  // Check if any settings-related page is active
  const isSettingsSectionActive = isSettingsActive || isClientsActive || isEmailTemplatesActive || isAnalyticsActive;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsDropdownOpen(false);
      }
    };

    if (isSettingsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsDropdownOpen]);

  // Close dropdown when navigating
  useEffect(() => {
    setIsSettingsDropdownOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };
  
  return (
    <nav role="navigation" aria-label="Main navigation" className="navbar-two-row">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      
      {/* Row 1: Logo, Search, User Info */}
      <div className="navbar-top-row">
        {/* Company Logo */}
        <div className="navbar-logo" style={{ paddingLeft: '1.5rem' }}>
          <Link to={isAdmin ? "/" : "/dashboard"} style={{ display: 'flex', alignItems: 'center' }}>
            <img 
              src="/logo-placeholder.png" 
              alt="Company Logo" 
              onError={(e) => {
                // Fallback to a simple text logo if image doesn't exist
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (!target.nextElementSibling) {
                  const fallback = document.createElement('span');
                  fallback.textContent = 'LOGO';
                  fallback.style.cssText = 'font-weight: 700; font-size: 1.25rem; color: #ffffff; padding: 0.5rem 1rem; background: rgba(255, 255, 255, 0.1); border-radius: 6px;';
                  target.parentElement?.appendChild(fallback);
                }
              }}
              style={{
                height: '45px',
                width: 'auto',
                objectFit: 'contain'
              }}
            />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="navbar-search" style={{ paddingLeft: '1.5rem' }}>
          <input
            type="text"
            placeholder="Search folders, files, forms, e-signatures..."
            value={searchTerm}
            onChange={(e) => {
              const newSearch = e.target.value;
              if (newSearch) {
                setSearchParams({ search: newSearch });
              } else {
                setSearchParams({});
              }
            }}
            style={{
              width: '100%',
              padding: '0.5rem 2.5rem 0.5rem 0.75rem',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              outline: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
            }}
          />
          <style>{`
            .navbar-search input::placeholder {
              color: rgba(255, 255, 255, 0.6);
            }
            .navbar-search input:focus {
              border-color: rgba(255, 255, 255, 0.5);
              background-color: rgba(255, 255, 255, 0.15);
            }
          `}</style>
          {searchTerm && (
            <button
              onClick={() => setSearchParams({})}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.7)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Clear search"
            >
              <FaTimes />
            </button>
          )}
        </div>

        {/* User Info */}
        {user && (
          <div className="navbar-user-section" style={{ paddingRight: '1.5rem' }}>
            <span 
              className="user-email" 
              title={user.email}
              style={{
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {user.email}
            </span>
            <span className="user-role-badge">{role}</span>
            <button onClick={handleLogout} className="logout-button">Logout</button>
          </div>
        )}
      </div>

      {/* Row 2: Navigation Links */}
      <div className="navbar-bottom-row" style={{ paddingLeft: '1.5rem' }}>
        {isAdmin ? (
          <ul className="nav-tabs" role="menubar">
            <li>
              <Link 
                to="/folders"
                className={`nav-tab ${isFoldersActive ? 'active' : ''}`}
              >
                Folders
              </Link>
            </li>
            <li>
              <Link 
                to="/" 
                className={`nav-tab ${isQuotesActive ? 'active' : ''}`}
              >
                Quotes
              </Link>
            </li>
            <li>
              <Link 
                to="/forms" 
                className={`nav-tab ${isFormsActive ? 'active' : ''}`}
              >
                Forms
              </Link>
            </li>
            <li>
              <Link
                to="/files"
                className={`nav-tab ${isFilesActive ? 'active' : ''}`}
              >
                Files
              </Link>
            </li>
            <li>
              <Link
                to="/esignature"
                className={`nav-tab ${isESignatureActive ? 'active' : ''}`}
              >
                E-Signatures
              </Link>
            </li>
            <li>
              <Link
                to="/chat"
                className={`nav-tab ${location.pathname.startsWith('/chat') ? 'active' : ''}`}
              >
                Chat
              </Link>
            </li>
            <li 
              ref={dropdownRef}
              className={`nav-dropdown ${isSettingsDropdownOpen ? 'open' : ''}`}
            >
              <button
                type="button"
                className={`nav-tab nav-tab-dropdown ${isSettingsSectionActive ? 'active' : ''}`}
                onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
                aria-expanded={isSettingsDropdownOpen}
                aria-haspopup="true"
              >
                Settings
                <span className="dropdown-arrow">▼</span>
              </button>
              {isSettingsDropdownOpen && (
                <ul className="nav-dropdown-menu" role="menu">
                  <li role="none">
                    <Link 
                      to="/clients" 
                      className={`nav-dropdown-item ${isClientsActive ? 'active' : ''}`}
                      role="menuitem"
                    >
                      Clients
                    </Link>
                  </li>
                  <li role="none">
                    <Link 
                      to="/settings" 
                      className={`nav-dropdown-item ${isSettingsActive ? 'active' : ''}`}
                      role="menuitem"
                    >
                      Reel48 Info
                    </Link>
                  </li>
                  <li role="none">
                    <Link 
                      to="/analytics" 
                      className={`nav-dropdown-item ${isAnalyticsActive ? 'active' : ''}`}
                      role="menuitem"
                    >
                      Analytics
                    </Link>
                  </li>
                  <li role="none">
                    <Link 
                      to="/email-templates" 
                      className={`nav-dropdown-item ${isEmailTemplatesActive ? 'active' : ''}`}
                      role="menuitem"
                    >
                      Email Templates
                    </Link>
                  </li>
                </ul>
              )}
            </li>
          </ul>
        ) : (
          <ul className="nav-tabs" role="menubar">
            <li>
              <Link 
                to="/dashboard" 
                className={`nav-tab ${isDashboardActive ? 'active' : ''}`}
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link 
                to="/profile" 
                className={`nav-tab ${isProfileActive ? 'active' : ''}`}
              >
                Profile
              </Link>
            </li>
          </ul>
        )}
      </div>
    </nav>
  );
}

function HomePage() {
  const { role } = useAuth();
  return role === 'admin' ? <QuotesList /> : <CustomerDashboard />;
}

function AppContent() {
  const location = useLocation();
  const isPublicForm = location.pathname.startsWith('/public/form/');
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/forgot-password' || location.pathname === '/reset-password' || location.pathname === '/verify-email' || location.pathname === '/resend-verification';
  
  return (
    <>
      {!isPublicForm && !isAuthPage && <Navigation />}
      <SessionTimeoutWarning />
      <main id="main-content" role="main">
        <Routes>
          {/* Public routes */}
          <Route path="/public/form/:slug" element={<Suspense fallback={<LoadingFallback />}><PublicFormView /></Suspense>} />
          <Route path="/s/:short_code" element={<Suspense fallback={<LoadingFallback />}><PublicFormView /></Suspense>} />
          
          {/* Auth routes */}
          <Route path="/login" element={<Suspense fallback={<LoadingFallback />}><Login /></Suspense>} />
          <Route path="/register" element={<Suspense fallback={<LoadingFallback />}><Register /></Suspense>} />
          <Route path="/forgot-password" element={<Suspense fallback={<LoadingFallback />}><ForgotPassword /></Suspense>} />
          <Route path="/reset-password" element={<Suspense fallback={<LoadingFallback />}><ResetPassword /></Suspense>} />
          <Route path="/verify-email" element={<Suspense fallback={<LoadingFallback />}><VerifyEmail /></Suspense>} />
          <Route path="/resend-verification" element={<Suspense fallback={<LoadingFallback />}><ResendVerification /></Suspense>} />
          
          {/* Protected routes - require authentication */}
          <Route path="/" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><HomePage /></Suspense></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><CustomerDashboard /></Suspense></ProtectedRoute>} />
          <Route path="/quotes/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><QuoteView /></Suspense></ProtectedRoute>} />
          <Route path="/forms" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FormsList /></Suspense></ProtectedRoute>} />
          <Route path="/forms/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FormView /></Suspense></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FilesList /></Suspense></ProtectedRoute>} />
          <Route path="/files/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FileView /></Suspense></ProtectedRoute>} />
          <Route path="/esignature" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><ESignatureDocumentsList /></Suspense></ProtectedRoute>} />
          <Route path="/esignature/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><ESignatureView /></Suspense></ProtectedRoute>} />
          <Route path="/folders" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FoldersList /></Suspense></ProtectedRoute>} />
          <Route path="/folders/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FolderView /></Suspense></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><ChatPage /></Suspense></ProtectedRoute>} />
          
          {/* Admin-only routes */}
          <Route path="/quotes/new" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/quotes/:id/edit" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/forms/new" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/forms/:id/edit" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/forms/:id/submissions" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormSubmissions /></Suspense></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><ClientsList /></Suspense></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><CompanySettingsPage /></Suspense></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteAnalytics /></Suspense></ProtectedRoute>} />
          <Route path="/email-templates" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><EmailTemplates /></Suspense></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><Profile /></Suspense></ProtectedRoute>} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
