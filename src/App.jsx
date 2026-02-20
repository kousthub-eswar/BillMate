import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package,
  Clock, Settings, Wallet, Users
} from 'lucide-react';
import { isAuthenticated } from './backend/auth';
import { initializeSettings } from './database';
import { ToastProvider } from './components/Toast';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BillingPage from './pages/BillingPage';
import ProductsPage from './pages/ProductsPage';
import SalesPage from './pages/SalesPage';
import ExpensesPage from './pages/ExpensesPage';
import CustomersPage from './pages/CustomersPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activePage, setActivePage] = useState('billing');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (isAuthenticated()) {
        await initializeSettings();
        setLoggedIn(true);
      }
      setLoading(false);
    };
    init();
  }, []);

  const handleLogin = async () => {
    setLoggedIn(true);
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setActivePage('billing');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48,
            height: 48,
            border: '3px solid var(--border-color)',
            borderTopColor: 'var(--primary-500)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <ToastProvider>
        <LoginPage onLogin={handleLogin} />
      </ToastProvider>
    );
  }

  const navItems = [
    { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { key: 'products', label: 'Products', icon: Package },
    { key: 'sales', label: 'Sales', icon: Clock },
    { key: 'billing', label: 'Bill', icon: ShoppingCart, isBilling: true },
    { key: 'expenses', label: 'Expenses', icon: Wallet },
    { key: 'customers', label: 'Khata', icon: Users },
    { key: 'settings', label: 'Settings', icon: Settings }
  ];

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <DashboardPage onNavigate={setActivePage} />;
      case 'billing': return <BillingPage />;
      case 'products': return <ProductsPage />;
      case 'sales': return <SalesPage />;
      case 'expenses': return <ExpensesPage />;
      case 'customers': return <CustomersPage />;
      case 'settings': return <SettingsPage onLogout={handleLogout} />;
      default: return <BillingPage />;
    }
  };

  return (
    <ToastProvider>
      <div className="app-container">
        {renderPage()}

        {/* Bottom Navigation */}
        <nav className="bottom-nav">
          {/* eslint-disable-next-line no-unused-vars */}
          {navItems.map(({ key, label, icon: Icon, isBilling }) => (
            <button
              key={key}
              className={`nav-item ${activePage === key ? 'active' : ''} ${isBilling ? 'billing-nav' : ''}`}
              onClick={() => setActivePage(key)}
              id={`nav-${key}`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}

export default App;
