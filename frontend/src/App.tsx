import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SessionTimeoutWarning } from './components/SessionTimeoutWarning';
import { NotificationProvider } from './components/NotificationSystem';
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
const CompanySettingsPage = lazy(() => import('./pages/CompanySettings'));
const Profile = lazy(() => import('./pages/Profile'));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const QuoteAnalytics = lazy(() => import('./pages/QuoteAnalytics'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
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
  const { user, role, signOut } = useAuth();
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLLIElement>(null);
  
  // Determine active tab based on path
  const isFormsActive = location.pathname.startsWith('/forms');
  const isQuotesActive = !isFormsActive && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
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
    <nav role="navigation" aria-label="Main navigation">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Main Navigation Tabs */}
      <ul className="nav-tabs" role="menubar">
        {isAdmin ? (
          <>
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
                to="/" 
                className={`nav-tab ${isQuotesActive ? 'active' : ''}`}
              >
                Quotes
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
                      Reel48 Settings
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
          </>
        ) : (
          <>
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
          </>
        )}
      </ul>

      {/* User Info */}
      {user && (
        <div className="user-info">
          <span className="user-email">{user.email}</span>
          <span className="user-role">({role})</span>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
      )}
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
