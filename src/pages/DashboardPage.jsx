import { useState, useEffect } from 'react';
import { getTodayStats, getLowStockProducts, getTopSellingProducts, getSetting, getTodayExpenseTotal, undoLastSale } from '../database';
import {
    DollarSign,
    ShoppingCart,
    AlertTriangle,
    Trophy,
    Wallet,
    TrendingDown,
    Bell,
    Undo2,
    BarChart3
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import AlertsPanel, { useAlertCount } from '../components/AlertsPanel';
import { useToast } from '../components/Toast';

export default function DashboardPage({ onNavigate }) {
    const [stats, setStats] = useState({ totalRevenue: 0, totalProfit: 0, transactionCount: 0 });
    const [lowStock, setLowStock] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [currency, setCurrency] = useState('₹');
    const [expenseTotal, setExpenseTotal] = useState(0);
    const [showAlerts, setShowAlerts] = useState(false);
    const [showUndoConfirm, setShowUndoConfirm] = useState(false);
    const alertCount = useAlertCount();
    const showToast = useToast();

    const loadDashboard = async () => {
        const [statsData, curr, thresh, expTotal] = await Promise.all([
            getTodayStats(),
            getSetting('currency'),
            getSetting('low_stock_threshold'),
            getTodayExpenseTotal()
        ]);

        setStats(statsData);
        setCurrency(curr);
        setExpenseTotal(expTotal);

        const [lowStockData, topData] = await Promise.all([
            getLowStockProducts(parseInt(thresh)),
            getTopSellingProducts(5)
        ]);

        setLowStock(lowStockData);
        setTopProducts(topData);
    };

    useEffect(() => {
        loadDashboard();
    }, []);

    const handleUndoLastSale = async () => {
        try {
            const result = await undoLastSale();
            if (result.success) {
                showToast('Last sale undone successfully');
                loadDashboard();
            } else {
                showToast(result.message || 'No recent sale to undo', 'error');
            }
        } catch (err) {
            showToast('Failed to undo sale', 'error');
        }
        setShowUndoConfirm(false);
    };

    const formatCurrency = (val) => {
        const num = Number(val);
        if (num === 0) return `${currency}0`;
        return num % 1 === 0 ? `${currency}${num.toLocaleString('en-IN')}` : `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    return (
        <div className="page-content" style={{ position: 'relative' }}>
            <AppHeader title="Dashboard" />

            {/* Greeting + Bell Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>
                        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <h2 style={{
                        fontSize: '1.4rem',
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, var(--primary-300), var(--primary-500))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.02em',
                        margin: 0
                    }}>
                        {getGreeting()}! 👋
                    </h2>
                </div>

                {/* Notification Bell */}
                <button
                    onClick={() => setShowAlerts(true)}
                    className="btn btn-ghost btn-icon"
                    style={{ position: 'relative', flexShrink: 0, marginTop: 4 }}
                    id="alerts-bell"
                >
                    <Bell size={22} />
                    {alertCount > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'var(--danger-500)',
                            color: 'white',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)',
                            animation: 'pulse 2s infinite'
                        }}>
                            {alertCount > 9 ? '9+' : alertCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button
                    className="btn btn-primary"
                    onClick={() => onNavigate('day-summary')}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600, #c88b20))',
                        color: '#000',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                    id="view-day-summary"
                >
                    <BarChart3 size={18} />
                    View Day Summary
                </button>
                <button
                    className="btn"
                    onClick={() => setShowUndoConfirm(true)}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--danger-400)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        cursor: 'pointer'
                    }}
                    id="undo-last-sale"
                >
                    <Undo2 size={18} />
                    Undo Last Sale
                </button>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon revenue">
                        <DollarSign size={18} />
                    </div>
                    <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
                    <div className="stat-label">Today's Revenue</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon net-profit">
                        <TrendingDown size={18} />
                    </div>
                    <div className="stat-value" style={{ color: (stats.totalProfit - expenseTotal) >= 0 ? 'var(--accent-400)' : 'var(--danger-400)' }}>
                        {formatCurrency(stats.totalProfit - expenseTotal)}
                    </div>
                    <div className="stat-label">Net Profit</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon transactions">
                        <ShoppingCart size={18} />
                    </div>
                    <div className="stat-value">{stats.transactionCount}</div>
                    <div className="stat-label">Transactions</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon expenses">
                        <Wallet size={18} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--danger-400)' }}>
                        {formatCurrency(expenseTotal)}
                    </div>
                    <div className="stat-label">Expenses</div>
                </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="dashboard-section">
                <div className="dashboard-section-header">
                    <h3>
                        <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--warning-500)' }} />
                        Low Stock Items
                    </h3>
                    <span className="stock-badge low">{lowStock.length} items</span>
                </div>
                {lowStock.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        All items well stocked 👍
                    </div>
                ) : (
                    lowStock.slice(0, 5).map(item => (
                        <div key={item.id} className="low-stock-item">
                            <span className="product-name">{item.name}</span>
                            <span className="stock-count">{item.stock_quantity} left</span>
                        </div>
                    ))
                )}
            </div>

            {/* Top Selling Products */}
            <div className="dashboard-section">
                <div className="dashboard-section-header">
                    <h3>
                        <Trophy size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--warning-400)' }} />
                        Top Selling
                    </h3>
                </div>
                {topProducts.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No sales data yet
                    </div>
                ) : (
                    topProducts.map((item, index) => (
                        <div key={item.name} className="top-product-item">
                            <div className="top-product-rank">{index + 1}</div>
                            <div className="top-product-info">
                                <div className="top-product-name">{item.name}</div>
                                <div className="top-product-qty">{item.quantity} units sold</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Alerts Panel */}
            <AlertsPanel
                isOpen={showAlerts}
                onClose={() => setShowAlerts(false)}
                onNavigate={onNavigate}
            />

            {/* Undo Confirmation Dialog */}
            {showUndoConfirm && (
                <div className="modal-overlay" onClick={() => setShowUndoConfirm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
                        <div className="modal-handle" />
                        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                            <div style={{
                                width: 56, height: 56,
                                borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px'
                            }}>
                                <Undo2 size={28} style={{ color: 'var(--danger-400)' }} />
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                                Undo Last Sale?
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Are you sure you want to undo the most recent sale? This will restore product stock and reverse the transaction.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                className="btn btn-block"
                                onClick={() => setShowUndoConfirm(false)}
                                style={{
                                    flex: 1,
                                    background: 'var(--bg-tertiary)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    fontWeight: 700
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-block"
                                onClick={handleUndoLastSale}
                                style={{
                                    flex: 1,
                                    background: 'var(--danger-500)',
                                    color: '#fff',
                                    border: 'none',
                                    fontWeight: 700
                                }}
                                id="confirm-undo-sale"
                            >
                                Yes, Undo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
