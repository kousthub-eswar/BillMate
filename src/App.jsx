import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package,
  Clock, Settings, Wallet, Users, Truck, ClipboardList,
  Lock, Eye, EyeOff, KeyRound, CheckCircle
} from 'lucide-react';
import { initializeSettings } from './database';
import { isAuthenticated, getSession, signOut, onAuthStateChange, updatePassword } from './backend/auth';
import { ToastProvider, useToast } from './components/Toast';
import OnboardingWizard from './components/OnboardingWizard';
import SplashScreen from './components/SplashScreen';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BillingPage from './pages/BillingPage';
import ProductsPage from './pages/ProductsPage';
import SalesPage from './pages/SalesPage';
import ExpensesPage from './pages/ExpensesPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import PurchasesPage from './pages/PurchasesPage';
import SettingsPage from './pages/SettingsPage';
import DaySummaryPage from './pages/DaySummaryPage';

/* ── Set New Password Screen ── */
function ResetPasswordPage({ onComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const showToast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      showToast('Please enter a new password', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      setSuccess(true);
      showToast('Password updated successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to update password', 'error');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <div style={{
              width: 72, height: 72,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              borderRadius: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 32px rgba(34,197,94,0.25)'
            }}>
              <CheckCircle size={36} color="#fff" />
            </div>
            <h1 className="login-title" style={{ fontSize: '1.4rem' }}>Password Updated!</h1>
            <p className="login-subtitle" style={{ fontSize: '0.9rem', lineHeight: 1.5, marginTop: 8 }}>
              Your password has been changed successfully. You can now use your new password to sign in.
            </p>
          </div>
          <button
            onClick={onComplete}
            className="btn btn-primary btn-block"
            id="continue-after-reset-btn"
            style={{
              marginTop: 24,
              padding: '14px',
              fontSize: '0.95rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <CheckCircle size={18} /> Continue to App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
            borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(234,179,8,0.25)'
          }}>
            <KeyRound size={36} color="#fff" />
          </div>
          <h1 className="login-title" style={{ fontSize: '1.4rem' }}>Set New Password</h1>
          <p className="login-subtitle" style={{ fontSize: '0.9rem', lineHeight: 1.5, marginTop: 8 }}>
            Choose a strong password for your BillMate account.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%', marginTop: 8 }}>
          <div className="form-group">
            <label className="form-label">
              <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                autoComplete="new-password"
                id="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Confirm Password
            </label>
            <input
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              id="confirm-password"
            />
          </div>

          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p style={{
              margin: '-4px 0 8px',
              fontSize: '0.78rem',
              color: 'var(--danger-400)',
              fontWeight: 500
            }}>
              Passwords do not match
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            id="update-password-btn"
            style={{
              marginTop: 8,
              padding: '14px',
              fontSize: '0.95rem',
              fontWeight: 700,
              opacity: loading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {loading ? 'Updating...' : <><KeyRound size={18} /> Update Password</>}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [activePage, setActivePage] = useState('billing');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const savedTheme = localStorage.getItem('billmate_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Validate session on mount
    getSession().then(session => {
      if (session) {
        setLoggedIn(true);
        initializeSettings();
      } else {
        setLoggedIn(false);
      }
    });

    // Subscribe to auth changes
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link from their email
        setShowResetPassword(true);
        setLoggedIn(true); // They have a valid session for the reset
      } else if (event === 'SIGNED_IN' && session) {
        setLoggedIn(true);
      } else if (event === 'SIGNED_OUT') {
        setLoggedIn(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    await initializeSettings();
    setLoggedIn(true);
    if (!localStorage.getItem('billmate_onboarding_done')) {
      setShowOnboarding(true);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setLoggedIn(false);
    setActivePage('billing');
  };

  // Show reset password screen if user came from a reset link
  if (showResetPassword) {
    return (
      <ToastProvider>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
        <ResetPasswordPage onComplete={() => {
          setShowResetPassword(false);
          initializeSettings();
        }} />
      </ToastProvider>
    );
  }

  if (!loggedIn) {
    return (
      <ToastProvider>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
        <LoginPage onLogin={handleLogin} />
      </ToastProvider>
    );
  }

  const navItems = [
    { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { key: 'products', label: 'Products', icon: Package },
    { key: 'sales', label: 'Sales', icon: Clock },
    { key: 'billing', label: 'Bill', icon: ShoppingCart, isBilling: true },
    { key: 'customers', label: 'Khata', icon: Users },
    { key: 'suppliers', label: 'Suppliers', icon: Truck },
    { key: 'purchases', label: 'Purchases', icon: ClipboardList },
    { key: 'expenses', label: 'Expenses', icon: Wallet },
    { key: 'settings', label: 'Settings', icon: Settings }
  ];

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <DashboardPage onNavigate={setActivePage} />;
      case 'day-summary': return <DaySummaryPage onBack={() => setActivePage('dashboard')} />;
      case 'billing': return <BillingPage />;
      case 'products': return <ProductsPage />;
      case 'sales': return <SalesPage />;
      case 'expenses': return <ExpensesPage />;
      case 'customers': return <CustomersPage />;
      case 'suppliers': return <SuppliersPage />;
      case 'purchases': return <PurchasesPage />;
      case 'settings': return <SettingsPage onLogout={handleLogout} />;
      default: return <BillingPage />;
    }
  };

  if (showOnboarding) {
    return (
      <ToastProvider>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div className="app-container">
        {renderPage()}

        <nav className="bottom-nav">
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

