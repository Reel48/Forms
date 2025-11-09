import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import QuotesList from './pages/QuotesList';
import QuoteBuilder from './pages/QuoteBuilder';
import QuoteView from './pages/QuoteView';
import FormsList from './pages/FormsList';
import FormBuilder from './pages/FormBuilder';
import FormView from './pages/FormView';
import ClientsList from './pages/ClientsList';
import CompanySettingsPage from './pages/CompanySettings';
import './App.css';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine active section based on path
  const isFormsSection = location.pathname.startsWith('/forms');
  const isQuotesSection = !isFormsSection && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
  
  // Handle toggle switch
  const handleToggle = () => {
    if (isFormsSection) {
      navigate('/');
    } else {
      navigate('/forms');
    }
  };
  
  return (
    <nav>
      {/* Section Toggle Switcher */}
      <div className="section-switcher">
        <span className={`toggle-label ${isQuotesSection ? 'active' : ''}`}>Quotes</span>
        <button
          type="button"
          className={`toggle-switch ${isFormsSection ? 'active' : ''}`}
          onClick={handleToggle}
          aria-label="Toggle between Forms and Quotes"
        >
          <span className="toggle-slider"></span>
        </button>
        <span className={`toggle-label ${isFormsSection ? 'active' : ''}`}>Forms</span>
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
            <li>
              <Link to="/forms/new" className={location.pathname === '/forms/new' ? 'active' : ''}>
                New Form
              </Link>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
                Quotes List
              </Link>
            </li>
            <li>
              <Link to="/quotes/new" className={location.pathname === '/quotes/new' ? 'active' : ''}>
                New Quote
              </Link>
            </li>
          </>
        )}
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
      </ul>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route path="/" element={<QuotesList />} />
        <Route path="/quotes/new" element={<QuoteBuilder />} />
        <Route path="/quotes/:id" element={<QuoteView />} />
        <Route path="/quotes/:id/edit" element={<QuoteBuilder />} />
        <Route path="/forms" element={<FormsList />} />
        <Route path="/forms/new" element={<FormBuilder />} />
        <Route path="/forms/:id" element={<FormView />} />
        <Route path="/forms/:id/edit" element={<FormBuilder />} />
        <Route path="/clients" element={<ClientsList />} />
        <Route path="/settings" element={<CompanySettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
