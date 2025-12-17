import { BrowserRouter, Routes, Route, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SessionTimeoutWarning } from './components/SessionTimeoutWarning';
import { NotificationProvider } from './components/NotificationSystem';
import { FaTimes, FaBars } from 'react-icons/fa';
import { getLogoForDarkBackground } from './utils/logoUtils';
import { clientsAPI } from './api';
import './App.css';

// Lazy load components for better performance
const QuotesList = lazy(() => import('./pages/QuotesList'));
const QuoteBuilder = lazy(() => import('./pages/QuoteBuilder'));
const QuoteView = lazy(() => import('./pages/QuoteView'));
const FormsList = lazy(() => import('./pages/FormsList'));
const FormBuilder = lazy(() => import('./pages/FormBuilder'));
const TypeformImport = lazy(() => import('./pages/TypeformImport'));
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
const CustomerChatPage = lazy(() => import('./pages/CustomerChatPage'));
const CustomerSchedulingPage = lazy(() => import('./pages/CustomerSchedulingPage'));
const AdminCalendarView = lazy(() => import('./pages/AdminCalendarView'));
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
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLLIElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const searchTerm = searchParams.get('search') || '';
  
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error: any) {
      // If session is already missing or expired, that's okay - we still want to logout
      // Clear local state and navigate to login regardless
      console.warn('Logout warning (session may already be expired):', error?.message || error);
    } finally {
      // Always clear local state and navigate to login, even if signOut fails
      // This ensures users can always logout, even with expired sessions
      navigate('/login');
    }
  };
  
  // Determine active tab based on path
  const isFormsActive = location.pathname.startsWith('/forms');
  const isQuotesActive = !isFormsActive && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
  const isSchedulingActive = location.pathname.startsWith('/scheduling');
  const isCalendarActive = location.pathname.startsWith('/admin/calendar');
  const isFilesActive = location.pathname.startsWith('/files');
  const isESignatureActive = location.pathname.startsWith('/esignature');
  const isFoldersActive = location.pathname.startsWith('/folders');
  const isClientsActive = location.pathname === '/clients';
  const isSettingsActive = location.pathname === '/settings';
  const isProfileActive = location.pathname === '/profile';
  const isDashboardActive = location.pathname === '/dashboard';
  const isEmailTemplatesActive = location.pathname === '/email-templates';
  const isAnalyticsActive = location.pathname === '/analytics';
  const isChatActive = location.pathname === '/chat' || location.pathname === '/admin/chat';
  const isAdmin = role === 'admin';

  // Check if any settings-related page is active
  const isSettingsSectionActive = isSettingsActive || isClientsActive || isEmailTemplatesActive || isAnalyticsActive;

  // Load profile picture for mobile navbar
  useEffect(() => {
    const loadProfilePicture = async () => {
      if (user) {
        try {
          const response = await clientsAPI.getMyProfile();
          if (response.data) {
            setProfilePictureUrl(response.data.profile_picture_url || null);
            setClientName(response.data.name || null);
          }
        } catch (error) {
          console.error('Failed to load profile picture:', error);
        }
      }
    };
    loadProfilePicture();
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsDropdownOpen(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };

    if (isSettingsDropdownOpen || isRoleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsDropdownOpen, isRoleDropdownOpen]);

  // Close dropdown when navigating
  useEffect(() => {
    setIsSettingsDropdownOpen(false);
    setIsRoleDropdownOpen(false);
    setIsNavMenuOpen(false); // Close nav menu when navigating
  }, [location.pathname]);

  
  return (
    <nav role="navigation" aria-label="Main navigation" className="navbar-two-row">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      
      {/* Row 0: Global Utility Bar - Role Badge */}
      <div className="navbar-utility-bar">
        <div className="utility-bar-thin"></div>
        <div className="utility-bar-role-container">
          <div className={`role-badge-wrapper ${isRoleDropdownOpen ? 'open' : ''}`} ref={roleDropdownRef}>
            <span 
              className="role-badge" 
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
            >
              {role}
              <span className="role-badge-arrow">▼</span>
            </span>
            {isRoleDropdownOpen && (
              <div className="role-dropdown-content">
                <Link to="/profile" onClick={() => setIsRoleDropdownOpen(false)} className="dropdown-link">
                  Profile
                </Link>
                <div className="dropdown-divider"></div>
                <button onClick={handleLogout} className="dropdown-button-logout">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Row 1: Hamburger, Search, Logo, User Info */}
      <div className="navbar-top-row">
        {/* Hamburger Menu */}
        <div className="navbar-hamburger" style={{ paddingLeft: '1.5rem' }}>
          <button
            onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
            className="hamburger-button"
            aria-label="Toggle navigation menu"
          >
            {isNavMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
        
        {/* Company Logo */}
        <div className="navbar-logo" style={{ paddingLeft: '1.5rem' }}>
          <Link to={isAdmin ? "/" : "/dashboard"} style={{ display: 'flex', alignItems: 'center' }}>
            <img 
              src={getLogoForDarkBackground()} 
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
                height: '36px',
                width: 'auto',
                objectFit: 'contain'
              }}
            />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="navbar-search" style={{ paddingLeft: '0.75rem' }}>
          <input
            type="text"
            placeholder="Search"
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
            {/* Desktop: Show email */}
            <Link
              to="/profile"
              className="user-email desktop-only"
              title={user.email}
              style={{
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              {user.email}
            </Link>
            {/* Mobile: Show profile picture avatar */}
            <Link
              to="/profile"
              className="user-avatar mobile-only"
              title={user.email}
              style={{
                display: 'none', // Hidden by default, shown via CSS on mobile
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              {profilePictureUrl ? (
                <img
                  src={profilePictureUrl}
                  alt="Profile"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid rgba(255, 255, 255, 0.3)'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    color: '#ffffff',
                    fontWeight: 'bold'
                  }}
                >
                  {clientName ? clientName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </Link>
          </div>
        )}
      </div>

      {/* Row 2: Navigation Links - Only shown when hamburger menu is open */}
      {isNavMenuOpen && (
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
                to="/admin/chat"
                className={`nav-tab ${location.pathname === '/admin/chat' ? 'active' : ''}`}
              >
                Chat
              </Link>
            </li>
            <li>
              <Link
                to="/admin/calendar"
                className={`nav-tab ${isCalendarActive ? 'active' : ''}`}
              >
                Calendar
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
                to="/chat" 
                className={`nav-tab ${isChatActive ? 'active' : ''}`}
              >
                Chat
              </Link>
            </li>
            <li>
              <Link 
                to="/scheduling" 
                className={`nav-tab ${isSchedulingActive ? 'active' : ''}`}
              >
                Schedule Meeting
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
          <Route path="/chat" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><CustomerChatPage /></Suspense></ProtectedRoute>} />
          <Route path="/scheduling" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><CustomerSchedulingPage /></Suspense></ProtectedRoute>} />
          <Route path="/quotes/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><QuoteView /></Suspense></ProtectedRoute>} />
          <Route path="/forms" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FormsList /></Suspense></ProtectedRoute>} />
          <Route path="/forms/import-typeform" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><TypeformImport /></Suspense></ProtectedRoute>} />
          <Route path="/forms/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FormView /></Suspense></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FilesList /></Suspense></ProtectedRoute>} />
          <Route path="/files/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FileView /></Suspense></ProtectedRoute>} />
          <Route path="/esignature" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><ESignatureDocumentsList /></Suspense></ProtectedRoute>} />
          <Route path="/esignature/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><ESignatureView /></Suspense></ProtectedRoute>} />
          <Route path="/folders" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FoldersList /></Suspense></ProtectedRoute>} />
          <Route path="/folders/:id" element={<ProtectedRoute><Suspense fallback={<LoadingFallback />}><FolderView /></Suspense></ProtectedRoute>} />
          <Route path="/admin/chat" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><ChatPage /></Suspense></ProtectedRoute>} />
          
          {/* Admin-only routes */}
          <Route path="/quotes/new" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/quotes/:id/edit" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/forms/new" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/forms/:id/edit" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormBuilder /></Suspense></ProtectedRoute>} />
          <Route path="/forms/:id/submissions" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormSubmissions /></Suspense></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><ClientsList /></Suspense></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><CompanySettingsPage /></Suspense></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteAnalytics /></Suspense></ProtectedRoute>} />
          <Route path="/admin/calendar" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><AdminCalendarView /></Suspense></ProtectedRoute>} />
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
