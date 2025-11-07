import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import QuotesList from './pages/QuotesList';
import QuoteBuilder from './pages/QuoteBuilder';
import QuoteView from './pages/QuoteView';
import ClientsList from './pages/ClientsList';
import CompanySettingsPage from './pages/CompanySettings';
import './App.css';

function Navigation() {
  const location = useLocation();
  
  return (
    <nav>
      <ul>
        <li>
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            Quotes
          </Link>
        </li>
        <li>
          <Link to="/quotes/new" className={location.pathname === '/quotes/new' ? 'active' : ''}>
            New Quote
          </Link>
        </li>
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
        <Route path="/clients" element={<ClientsList />} />
        <Route path="/settings" element={<CompanySettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
