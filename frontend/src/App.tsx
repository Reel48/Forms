import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
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
  
  // Determine active section based on path
  const isFormsSection = location.pathname.startsWith('/forms');
  const isQuotesSection = !isFormsSection && (location.pathname === '/' || location.pathname.startsWith('/quotes'));
  
  return (
    <nav>
      {/* Section Switcher */}
      <div className="section-switcher">
        <Link 
          to="/forms" 
          className={`section-tab ${isFormsSection ? 'active' : ''}`}
        >
          Forms
        </Link>
        <Link 
          to="/" 
          className={`section-tab ${isQuotesSection ? 'active' : ''}`}
        >
          Quotes
        </Link>
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
