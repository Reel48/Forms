import { BrowserRouter, Routes, Route, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SessionTimeoutWarning } from './components/SessionTimeoutWarning';
import { NotificationProvider } from './components/NotificationSystem';
import ErrorBoundary from './components/ErrorBoundary';
import { FaTimes, FaBars, FaUserCircle } from 'react-icons/fa';
import { getLogoForDarkBackground } from './utils/logoUtils';
import './App.css';

// Retry function for lazy loading with chunk error recovery
const retryLazyLoad = (importFn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      importFn()
        .then(resolve)
        .catch((error) => {
          const errorMessage = error?.message || String(error || '');
          const errorName = error?.name || '';
          
          // Check for chunk load errors (including 404s and network errors)
          const isChunkError =
            errorMessage.includes("Unexpected token '<'") ||
            errorMessage.includes('Failed to fetch dynamically imported module') ||
            errorMessage.includes('Loading chunk') ||
            errorMessage.includes('ChunkLoadError') ||
            errorMessage.includes('importing a module script failed') ||
            errorMessage.includes('ERR_ABORTED') ||
            errorMessage.includes('404') ||
            errorMessage.includes('Not Found') ||
            errorName === 'ChunkLoadError' ||
            errorName === 'TypeError';

          // Check if it's a network error (404, network failure, etc.)
          const isNetworkError = 
            errorMessage.includes('ERR_ABORTED') ||
            errorMessage.includes('404') ||
            errorMessage.includes('Failed to fetch') ||
            errorMessage.includes('NetworkError') ||
            (error && typeof error === 'object' && 'status' in error && (error as any).status === 404);

          if (isChunkError || isNetworkError) {
            // For 404s and network errors, the chunk file doesn't exist
            // Force a full page reload to get fresh HTML with correct chunk references
            if (isNetworkError || errorMessage.includes('404') || errorMessage.includes('ERR_ABORTED')) {
              const KEY = 'forms:chunk_recovery_reload_v2';
              const reloadCount = parseInt(sessionStorage.getItem(KEY) || '0', 10);
              const MAX_RELOADS = 2;
              
              if (reloadCount < MAX_RELOADS) {
                sessionStorage.setItem(KEY, (reloadCount + 1).toString());
                console.warn(`[retryLazyLoad] Chunk file not found (404/network error), reloading page to get fresh assets... (${reloadCount + 1}/${MAX_RELOADS})`);
                
                // Clear cache before reload
                if ('caches' in window) {
                  caches.keys().then((names) => {
                    names.forEach((name) => caches.delete(name));
                  });
                }
                
                // Force reload to get fresh HTML
                setTimeout(() => {
                  window.location.reload();
                }, 100);
                
                // Don't reject immediately - let the reload happen
                return;
              }
            }
            
            // For other chunk errors, retry with cache clearing
            if (remaining > 0) {
              console.warn(`[retryLazyLoad] Chunk load error, retrying... (${retries - remaining + 1}/${retries})`);
              
              // Clear cache and retry
              if ('caches' in window) {
                caches.keys().then((names) => {
                  names.forEach((name) => caches.delete(name));
                });
              }
              setTimeout(() => attempt(remaining - 1), delay);
            } else {
              reject(error);
            }
          } else {
            reject(error);
          }
        });
    };
    attempt(retries);
  });
};

// Lazy load components for better performance with retry logic
const QuotesList = lazy(() => retryLazyLoad(() => import('./pages/QuotesList')));
const QuoteBuilder = lazy(() => retryLazyLoad(() => import('./pages/QuoteBuilder')));
const QuoteView = lazy(() => retryLazyLoad(() => import('./pages/QuoteView')));
const FormsList = lazy(() => retryLazyLoad(() => import('./pages/FormsList')));
const TypeformImport = lazy(() => retryLazyLoad(() => import('./pages/TypeformImport')));
const FormView = lazy(() => retryLazyLoad(() => import('./pages/FormView')));
const FormSubmissions = lazy(() => retryLazyLoad(() => import('./pages/FormSubmissions')));
const PublicFormView = lazy(() => retryLazyLoad(() => import('./pages/PublicFormView')));
const ClientsList = lazy(() => retryLazyLoad(() => import('./pages/ClientsList')));
const FilesList = lazy(() => retryLazyLoad(() => import('./pages/FilesList')));
const FileView = lazy(() => retryLazyLoad(() => import('./pages/FileView')));
const ESignatureDocumentsList = lazy(() => retryLazyLoad(() => import('./pages/ESignatureDocumentsList')));
const ESignatureView = lazy(() => retryLazyLoad(() => import('./pages/ESignatureView')));
const FoldersList = lazy(() => retryLazyLoad(() => import('./pages/FoldersList')));
const FolderView = lazy(() => retryLazyLoad(() => import('./pages/FolderView')));
const CompanySettingsPage = lazy(() => retryLazyLoad(() => import('./pages/CompanySettings')));
const Profile = lazy(() => retryLazyLoad(() => import('./pages/Profile')));
const Onboarding = lazy(() => retryLazyLoad(() => import('./pages/Onboarding')));
const CustomerDashboard = lazy(() => retryLazyLoad(() => import('./pages/CustomerDashboard')));
const QuoteAnalytics = lazy(() => retryLazyLoad(() => import('./pages/QuoteAnalytics')));
const EmailTemplates = lazy(() => retryLazyLoad(() => import('./pages/EmailTemplates')));
const ChatPage = lazy(() => retryLazyLoad(() => import('./pages/ChatPage')));
const CustomerChatPage = lazy(() => retryLazyLoad(() => import('./pages/CustomerChatPage')));
const CustomerSchedulingPage = lazy(() => retryLazyLoad(() => import('./pages/CustomerSchedulingPage')));
const AdminCalendarView = lazy(() => retryLazyLoad(() => import('./pages/AdminCalendarView')));
const KnowledgeBaseUpload = lazy(() => retryLazyLoad(() => import('./pages/KnowledgeBaseUpload')));
const Login = lazy(() => retryLazyLoad(() => import('./pages/Login')));
const Register = lazy(() => retryLazyLoad(() => import('./pages/Register')));
const ForgotPassword = lazy(() => retryLazyLoad(() => import('./pages/ForgotPassword')));
const ResetPassword = lazy(() => retryLazyLoad(() => import('./pages/ResetPassword')));
const VerifyEmail = lazy(() => retryLazyLoad(() => import('./pages/VerifyEmail')));
const ResendVerification = lazy(() => retryLazyLoad(() => import('./pages/ResendVerification')));

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
  const dropdownRef = useRef<HTMLLIElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const searchTerm = searchParams.get('search') || '';
  
  // Utility bar color state - default to blue-500
  const [utilityBarColor, setUtilityBarColor] = useState<string>(() => {
    const saved = localStorage.getItem('utilityBarColor');
    return saved || 'rgb(59 130 246)'; // blue-500 default
  });
  
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
  const isKnowledgeBaseActive = location.pathname === '/admin/knowledge-base';
  const isAdmin = role === 'admin';

  // Check if any settings-related page is active
  const isSettingsSectionActive = isSettingsActive || isClientsActive || isEmailTemplatesActive || isAnalyticsActive || isKnowledgeBaseActive;

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

  // Apply utility bar color to CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--utility-bar-color', utilityBarColor);
    localStorage.setItem('utilityBarColor', utilityBarColor);
  }, [utilityBarColor]);

  // Tailwind color options (500 shade for each color)
  const tailwindColors = [
    { name: 'Blue', value: 'rgb(59 130 246)', class: 'blue-500' },
    { name: 'Red', value: 'rgb(239 68 68)', class: 'red-500' },
    { name: 'Green', value: 'rgb(34 197 94)', class: 'green-500' },
    { name: 'Yellow', value: 'rgb(234 179 8)', class: 'yellow-500' },
    { name: 'Purple', value: 'rgb(168 85 247)', class: 'purple-500' },
    { name: 'Pink', value: 'rgb(236 72 153)', class: 'pink-500' },
    { name: 'Indigo', value: 'rgb(99 102 241)', class: 'indigo-500' },
    { name: 'Teal', value: 'rgb(20 184 166)', class: 'teal-500' },
    { name: 'Orange', value: 'rgb(249 115 22)', class: 'orange-500' },
    { name: 'Cyan', value: 'rgb(6 182 212)', class: 'cyan-500' },
    { name: 'Emerald', value: 'rgb(16 185 129)', class: 'emerald-500' },
    { name: 'Violet', value: 'rgb(139 92 246)', class: 'violet-500' },
    { name: 'Fuchsia', value: 'rgb(217 70 239)', class: 'fuchsia-500' },
    { name: 'Rose', value: 'rgb(244 63 94)', class: 'rose-500' },
    { name: 'Sky', value: 'rgb(14 165 233)', class: 'sky-500' },
    { name: 'Lime', value: 'rgb(132 204 22)', class: 'lime-500' },
    { name: 'Amber', value: 'rgb(245 158 11)', class: 'amber-500' },
    { name: 'Slate', value: 'rgb(100 116 139)', class: 'slate-500' },
    { name: 'Gray', value: 'rgb(107 114 128)', class: 'gray-500' },
    { name: 'Zinc', value: 'rgb(113 113 122)', class: 'zinc-500' },
    { name: 'Neutral', value: 'rgb(115 115 115)', class: 'neutral-500' },
    { name: 'Stone', value: 'rgb(120 113 108)', class: 'stone-500' },
  ];

  const handleColorSelect = (colorValue: string) => {
    setUtilityBarColor(colorValue);
  };

  
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
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Utility Bar Color</div>
                  <div className="color-picker-grid">
                    {tailwindColors.map((color) => (
                      <button
                        key={color.class}
                        className={`color-option ${utilityBarColor === color.value ? 'selected' : ''}`}
                        onClick={() => handleColorSelect(color.value)}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                        aria-label={`Select ${color.name} color`}
                      />
                    ))}
                  </div>
                </div>
                <div className="dropdown-divider"></div>
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
          <div className="navbar-user-section">
            <Link
              to="/profile"
              className="hamburger-button"
              title={user.email}
              aria-label="Open profile"
              style={{
                textDecoration: 'none',
                cursor: 'pointer',
                color: '#ffffff',
              }}
            >
              <FaUserCircle />
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
                  <li role="none">
                    <Link 
                      to="/admin/knowledge-base" 
                      className={`nav-dropdown-item ${isKnowledgeBaseActive ? 'active' : ''}`}
                      role="menuitem"
                    >
                      Knowledge Base
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
  const isOnboardingPage = location.pathname === '/onboarding';
  
  return (
    <>
      {!isPublicForm && !isAuthPage && !isOnboardingPage && <Navigation />}
      <SessionTimeoutWarning />
      <main id="main-content" role="main">
        <ErrorBoundary>
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
          <Route path="/onboarding" element={<ProtectedRoute skipProfileCheck><Suspense fallback={<LoadingFallback />}><Onboarding /></Suspense></ProtectedRoute>} />
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
          <Route path="/forms/:id/submissions" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><FormSubmissions /></Suspense></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><ClientsList /></Suspense></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><CompanySettingsPage /></Suspense></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><QuoteAnalytics /></Suspense></ProtectedRoute>} />
          <Route path="/admin/calendar" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><AdminCalendarView /></Suspense></ProtectedRoute>} />
          <Route path="/email-templates" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><EmailTemplates /></Suspense></ProtectedRoute>} />
          <Route path="/admin/knowledge-base" element={<ProtectedRoute requireAdmin><Suspense fallback={<LoadingFallback />}><KnowledgeBaseUpload /></Suspense></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute skipProfileCheck><Suspense fallback={<LoadingFallback />}><Profile /></Suspense></ProtectedRoute>} />
          </Routes>
        </ErrorBoundary>
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
