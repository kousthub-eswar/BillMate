import { useState, useEffect } from 'react';
import { getTodayStats, getLowStockProducts, getTopSellingProducts, getSetting, getTodayExpenseTotal } from '../database';
import {
    TrendingUp,
    DollarSign,
    ShoppingCart,
    AlertTriangle,
    Trophy,
    Package,
    Wallet,
    TrendingDown
} from 'lucide-react';

export default function DashboardPage() {
    const [stats, setStats] = useState({ totalRevenue: 0, totalProfit: 0, transactionCount: 0 });
    const [lowStock, setLowStock] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [currency, setCurrency] = useState('₹');
    const [threshold, setThreshold] = useState(5);
    const [expenseTotal, setExpenseTotal] = useState(0);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        const [statsData, curr, thresh, expTotal] = await Promise.all([
            getTodayStats(),
            getSetting('currency'),
            getSetting('low_stock_threshold'),
            getTodayExpenseTotal()
        ]);

        setStats(statsData);
        setCurrency(curr);
        setThreshold(parseInt(thresh));
        setExpenseTotal(expTotal);

        const [lowStockData, topData] = await Promise.all([
            getLowStockProducts(parseInt(thresh)),
            getTopSellingProducts(5)
        ]);

        setLowStock(lowStockData);
        setTopProducts(topData);
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h1>Dashboard</h1>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon revenue">
                        <DollarSign size={20} />
                    </div>
                    <div className="stat-label">Today's Revenue</div>
                    <div className="stat-value">{currency}{stats.totalRevenue.toFixed(2)}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon profit">
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-label">Profit</div>
                    <div className="stat-value" style={{ color: 'var(--accent-400)' }}>
                        {currency}{stats.totalProfit.toFixed(2)}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon transactions">
                        <ShoppingCart size={20} />
                    </div>
                    <div className="stat-label">Transactions</div>
                    <div className="stat-value">{stats.transactionCount}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger-400)' }}>
                        <Wallet size={20} />
                    </div>
                    <div className="stat-label">Expenses</div>
                    <div className="stat-value" style={{ color: 'var(--danger-400)' }}>
                        {currency}{expenseTotal.toFixed(2)}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-400)' }}>
                        <TrendingDown size={20} />
                    </div>
                    <div className="stat-label">Net Profit</div>
                    <div className="stat-value" style={{ color: (stats.totalProfit - expenseTotal) >= 0 ? 'var(--accent-400)' : 'var(--danger-400)' }}>
                        {currency}{(stats.totalProfit - expenseTotal).toFixed(2)}
                    </div>
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
        </div>
    );
}
