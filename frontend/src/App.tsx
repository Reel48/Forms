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
import Profile from './pages/Profile';
import CustomerDashboard from './pages/CustomerDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import './App.css';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  
  // Determine active tab based on path
  const isFormsActive = location.pathname.startsWith('/forms');
  const isQuotesActive = !isFormsActive && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
  const isClientsActive = location.pathname === '/clients';
  const isSettingsActive = location.pathname === '/settings';
  const isProfileActive = location.pathname === '/profile';
  const isDashboardActive = location.pathname === '/dashboard';
  const isAdmin = role === 'admin';

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
      {/* Main Navigation Tabs */}
      <ul className="nav-tabs">
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
            <li>
              <Link 
                to="/clients" 
                className={`nav-tab ${isClientsActive ? 'active' : ''}`}
              >
                Clients
              </Link>
            </li>
            <li>
              <Link 
                to="/settings" 
                className={`nav-tab ${isSettingsActive ? 'active' : ''}`}
              >
                Settings
              </Link>
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
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/forgot-password' || location.pathname === '/reset-password';
  
  return (
    <>
      {!isPublicForm && !isAuthPage && <Navigation />}
      <Routes>
        {/* Public routes */}
        <Route path="/public/form/:slug" element={<PublicFormView />} />
        
        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Protected routes - require authentication */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><CustomerDashboard /></ProtectedRoute>} />
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
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
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
