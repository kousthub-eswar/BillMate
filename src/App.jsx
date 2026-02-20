import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package,
  Clock, Settings, Wallet, Users
} from 'lucide-react';
import { initializeSettings } from './database';
import { isAuthenticated } from './backend/auth';
import { ToastProvider } from './components/Toast';
import OnboardingWizard from './components/OnboardingWizard';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BillingPage from './pages/BillingPage';
import ProductsPage from './pages/ProductsPage';
import SalesPage from './pages/SalesPage';
import ExpensesPage from './pages/ExpensesPage';
import CustomersPage from './pages/CustomersPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [activePage, setActivePage] = useState('billing');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Apply saved theme on app mount & initialize settings if already logged in
  useEffect(() => {
    const savedTheme = localStorage.getItem('billmate_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (isAuthenticated()) {
      initializeSettings();
    }
  }, []);

  const handleLogin = async () => {
    await initializeSettings();
    setLoggedIn(true);
    // Check if onboarding is needed
    if (!localStorage.getItem('billmate_onboarding_done')) {
      setShowOnboarding(true);
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setActivePage('billing');
  };


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

  // Show onboarding for first-time users
  if (showOnboarding) {
    return (
      <ToastProvider>
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      </ToastProvider>
    );
  }

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
