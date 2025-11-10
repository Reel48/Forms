import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import QuotesList from './pages/QuotesList';
import QuoteBuilder from './pages/QuoteBuilder';
import QuoteView from './pages/QuoteView';
import FormsList from './pages/FormsList';
import FormBuilder from './pages/FormBuilder';
import FormView from './pages/FormView';
import FormSubmissions from './pages/FormSubmissions';
import PublicFormView from './pages/PublicFormView';
import ClientsList from './pages/ClientsList';
import CompanySettingsPage from './pages/CompanySettings';
import Login from './pages/Login';
import Register from './pages/Register';
import './App.css';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  
  // Determine active section based on path
  const isFormsSection = location.pathname.startsWith('/forms');
  const isQuotesSection = !isFormsSection && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
  const isAdmin = role === 'admin';
  
  // Handle toggle switch
  const handleToggle = () => {
    if (isFormsSection) {
      navigate('/');
    } else {
      navigate('/forms');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };
  
  return (
    <nav>
      {/* Section Toggle Switcher */}
      <div className="section-switcher">
        <span className={`toggle-label ${isFormsSection ? 'active forms-active' : ''}`}>Forms</span>
        <button
          type="button"
          className={`toggle-switch ${isFormsSection ? 'forms-active' : 'quotes-active'}`}
          onClick={handleToggle}
          aria-label="Toggle between Forms and Quotes"
        >
          <span className="toggle-slider"></span>
        </button>
        <span className={`toggle-label ${isQuotesSection ? 'active quotes-active' : ''}`}>Quotes</span>
      </div>
      
      {/* Section-specific Navigation */}
      <ul>
        {isFormsSection ? (
          <>
            <li>
              <Link to="/forms" className={location.pathname === '/forms' ? 'active' : ''}>
                Forms List
              </Link>
            </li>
            {isAdmin && (
              <li>
                <Link to="/forms/new" className={location.pathname === '/forms/new' ? 'active' : ''}>
                  New Form
                </Link>
              </li>
            )}
          </>
        ) : (
          <>
            <li>
              <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
                Quotes List
              </Link>
            </li>
            {isAdmin && (
              <li>
                <Link to="/quotes/new" className={location.pathname === '/quotes/new' ? 'active' : ''}>
                  New Quote
                </Link>
              </li>
            )}
          </>
        )}
        {isAdmin && (
          <>
            <li>
              <Link to="/clients" className={location.pathname === '/clients' ? 'active' : ''}>
                Clients
              </Link>
            </li>
            <li>
              <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}>
                Settings
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

function AppContent() {
  const location = useLocation();
  const isPublicForm = location.pathname.startsWith('/public/form/');
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  return (
    <>
      {!isPublicForm && !isAuthPage && <Navigation />}
      <Routes>
        {/* Public routes */}
        <Route path="/public/form/:slug" element={<PublicFormView />} />
        
        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Protected routes - require authentication */}
        <Route path="/" element={<ProtectedRoute><QuotesList /></ProtectedRoute>} />
        <Route path="/quotes/:id" element={<ProtectedRoute><QuoteView /></ProtectedRoute>} />
        <Route path="/forms" element={<ProtectedRoute><FormsList /></ProtectedRoute>} />
        <Route path="/forms/:id" element={<ProtectedRoute><FormView /></ProtectedRoute>} />
        
        {/* Admin-only routes */}
        <Route path="/quotes/new" element={<ProtectedRoute requireAdmin><QuoteBuilder /></ProtectedRoute>} />
        <Route path="/quotes/:id/edit" element={<ProtectedRoute requireAdmin><QuoteBuilder /></ProtectedRoute>} />
        <Route path="/forms/new" element={<ProtectedRoute requireAdmin><FormBuilder /></ProtectedRoute>} />
        <Route path="/forms/:id/edit" element={<ProtectedRoute requireAdmin><FormBuilder /></ProtectedRoute>} />
        <Route path="/forms/:id/submissions" element={<ProtectedRoute requireAdmin><FormSubmissions /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute requireAdmin><ClientsList /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute requireAdmin><CompanySettingsPage /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
