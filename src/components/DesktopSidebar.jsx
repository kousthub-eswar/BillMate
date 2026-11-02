import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package,
  Clock, Settings, Wallet, Users, Truck, ClipboardList,
  BarChart3, LogOut, Sun, Moon, ChevronLeft, ChevronRight,
  Wifi, WifiOff, Store
} from 'lucide-react';
import Logo from './Logo';

export default function DesktopSidebar({
  activePage,
  onNavigate,
  onLogout,
  collapsed,
  onToggleCollapse
}) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState({
    status: navigator.onLine ? 'ONLINE' : 'OFFLINE',
    pendingCount: 0
  });
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSync = (e) => {
      if (e.detail) {
        setSyncState(e.detail);
        if (e.detail.status === 'ONLINE') setIsOnline(true);
        if (e.detail.status === 'OFFLINE') setIsOnline(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('billmate-sync-status', handleSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('billmate-sync-status', handleSync);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('billmate_theme', nextTheme);
  };

  const navGroups = [
    {
      group: 'Core POS',
      items: [
        { key: 'billing', label: 'Billing Terminal', icon: ShoppingCart, badge: 'POS' },
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      group: 'Inventory & Stock',
      items: [
        { key: 'products', label: 'Products & Stock', icon: Package },
        { key: 'purchases', label: 'Purchases', icon: ClipboardList },
        { key: 'suppliers', label: 'Suppliers', icon: Truck }
      ]
    },
    {
      group: 'Sales & Ledger',
      items: [
        { key: 'sales', label: 'Sales History', icon: Clock },
        { key: 'customers', label: 'Khata (Customers)', icon: Users }
      ]
    },
    {
      group: 'Financials',
      items: [
        { key: 'expenses', label: 'Expenses', icon: Wallet },
        { key: 'day-summary', label: 'Day Summary', icon: BarChart3 }
      ]
    },
    {
      group: 'Preferences',
      items: [
        { key: 'settings', label: 'Settings', icon: Settings }
      ]
    }
  ];

  return (
    <aside
      className={`desktop-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Main Navigation"
    >
      {/* Brand Header */}
      <div className="desktop-sidebar-header">
        <div className="desktop-sidebar-brand" onClick={() => onNavigate('billing')} style={{ cursor: 'pointer' }}>
          <Logo size={36} iconSize={20} borderRadius={10} />
          {!collapsed && (
            <div className="desktop-brand-text">
              <span className="desktop-brand-name">BillMate</span>
              <span className="desktop-brand-subtitle">
                <Store size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                POS Platform
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle button */}
        <button
          className="desktop-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Online / Offline status badge */}
      {!collapsed && (
        <div className="desktop-sidebar-status">
          <span className={`status-pill ${syncState.status === 'ONLINE' ? 'online' : (syncState.status === 'SYNCING' ? 'syncing' : (syncState.status === 'PENDING' ? 'pending' : 'offline'))}`}>
            <span className="status-dot" />
            {syncState.status === 'ONLINE' && 'Online (Synced)'}
            {syncState.status === 'SYNCING' && `Syncing (${syncState.pendingCount})...`}
            {syncState.status === 'PENDING' && `Pending (${syncState.pendingCount})`}
            {syncState.status === 'OFFLINE' && (syncState.pendingCount > 0 ? `Offline (${syncState.pendingCount} pending)` : 'Offline (Local)')}
          </span>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="desktop-sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.group} className="desktop-nav-group">
            {!collapsed && (
              <span className="desktop-nav-group-title">{group.group}</span>
            )}
            <ul className="desktop-nav-list">
              {group.items.map(({ key, label, icon: Icon, badge }) => {
                const isActive = activePage === key;
                return (
                  <li key={key}>
                    <button
                      className={`desktop-nav-link ${isActive ? 'active' : ''} ${key === 'billing' ? 'billing-link' : ''}`}
                      onClick={() => onNavigate(key)}
                      title={collapsed ? label : undefined}
                      id={`sidebar-nav-${key}`}
                    >
                      <span className="desktop-nav-icon">
                        <Icon size={18} />
                      </span>
                      {!collapsed && (
                        <span className="desktop-nav-label">{label}</span>
                      )}
                      {!collapsed && badge && (
                        <span className="desktop-nav-badge">{badge}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer Controls: Theme Toggle & Logout */}
      <div className="desktop-sidebar-footer">
        <button
          className="desktop-footer-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          id="sidebar-theme-toggle"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && (
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          )}
        </button>

        <button
          className="desktop-footer-btn logout-btn"
          onClick={onLogout}
          title="Sign out of BillMate"
          id="sidebar-logout-btn"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

