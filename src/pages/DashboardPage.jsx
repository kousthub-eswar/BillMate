import { useState, useEffect } from 'react';
import {
    getTodayStats, getLowStockProducts, getTopSellingProducts,
    getSetting, getTodayExpenseTotal, undoLastSale,
    getAllProducts, supabase
} from '../database';
import {
    DollarSign,
    ShoppingCart,
    AlertTriangle,
    Trophy,
    Wallet,
    TrendingDown,
    TrendingUp,
    Bell,
    Undo2,
    BarChart3,
    Activity,
    PackageX,
    Package,
    Users
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
    const [weeklyRevenue, setWeeklyRevenue] = useState([]);
    const [slowMoving, setSlowMoving] = useState([]);
    const [profitReport, setProfitReport] = useState([]);
    const [forecasting, setForecasting] = useState({ nextDayRevenue: 0, trend: 'stable', replenishment: [] });
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

        // Load advanced analytics
        await loadWeeklyRevenue();
        await loadSlowMoving(parseInt(thresh));
        await loadProfitReport();

        // Calculate automated replenishment suggestions
        const suggestions = await loadReplenishment(lowStockData);
        setForecasting(prev => ({
            ...prev,
            replenishment: suggestions
        }));
    };

    const loadReplenishment = async (lowStockData) => {
        if (!lowStockData || lowStockData.length === 0) return [];
        try {
            const { data: allSales } = await supabase.from('sales').select('id, date, refunded');
            const activeSales = (allSales || []).filter(s => !s.refunded);
            const activeSaleIds = new Set(activeSales.map(s => s.id));
            
            const { data: saleItems } = await supabase.from('sale_items').select('product_id, quantity, sale_id');
            const validItems = (saleItems || []).filter(item => activeSaleIds.has(item.sale_id));
            
            const now = new Date();
            const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            
            const weeklySalesCount = {};
            validItems.forEach(item => {
                const parentSale = activeSales.find(s => s.id === item.sale_id);
                if (parentSale && new Date(parentSale.date) >= weekAgo) {
                    weeklySalesCount[item.product_id] = (weeklySalesCount[item.product_id] || 0) + Number(item.quantity);
                }
            });
            
            return lowStockData.map(item => {
                const totalSold = weeklySalesCount[item.id] || 0;
                const velocity = totalSold / 7;
                const suggested = Math.max(15, Math.ceil(velocity * 14) - item.stock_quantity);
                return {
                    id: item.id,
                    name: item.name,
                    velocity,
                    suggested,
                    currentStock: item.stock_quantity
                };
            });
        } catch (err) {
            console.error('Replenishment calculation failed:', err);
            return lowStockData.map(item => ({
                id: item.id,
                name: item.name,
                velocity: 0.2,
                suggested: 20,
                currentStock: item.stock_quantity
            }));
        }
    };

    const loadWeeklyRevenue = async () => {
        const { data: allSales } = await supabase.from('sales').select('*');
        const nonRefunded = (allSales || []).filter(s => !s.refunded && s.payment_method !== 'Settle');
        const now = new Date();
        const days = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const daySales = nonRefunded.filter(s => {
                const d = new Date(s.date);
                return d >= date && d < nextDate;
            });

            const revenue = daySales.reduce((sum, s) => sum + Number(s.total), 0);
            days.push({
                label: date.toLocaleDateString('en-IN', { weekday: 'short' }),
                date: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                revenue
            });
        }
        setWeeklyRevenue(days);

        // Calculate rolling trend and forecasting
        let trend = 'stable';
        const totalRevenueAcrossWeek = days.reduce((sum, d) => sum + d.revenue, 0);
        const avgDailyRevenue = totalRevenueAcrossWeek / 7;
        
        // Split week into first half (days 0-2) and second half (days 4-6) to check trend direction
        const firstHalf = days.slice(0, 3).reduce((sum, d) => sum + d.revenue, 0);
        const secondHalf = days.slice(4, 7).reduce((sum, d) => sum + d.revenue, 0);
        
        if (secondHalf > firstHalf * 1.05) trend = 'up';
        else if (secondHalf < firstHalf * 0.95) trend = 'down';

        let forecastedNextDay = avgDailyRevenue;
        if (trend === 'up') forecastedNextDay = avgDailyRevenue * 1.12;
        else if (trend === 'down') forecastedNextDay = avgDailyRevenue * 0.88;

        setForecasting(prev => ({
            ...prev,
            nextDayRevenue: Math.max(0, forecastedNextDay),
            trend
        }));
    };

    const loadSlowMoving = async (threshold) => {
        const products = await getAllProducts();
        const { data: allSales } = await supabase.from('sales').select('*');
        const nonRefunded = (allSales || []).filter(s => !s.refunded);

        const now = new Date();
        const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        const recentSaleIds = new Set(
            nonRefunded.filter(s => new Date(s.date) >= weekAgo).map(s => s.id)
        );

        const { data: saleItems } = await supabase.from('sale_items').select('*');
        const recentSaleItems = (saleItems || []).filter(item => recentSaleIds.has(item.sale_id));

        // Find products with stock > threshold but no recent sales
        const recentlySoldProductIds = new Set(recentSaleItems.map(i => i.product_id));

        const slow = products.filter(p =>
            p.stock_quantity > (threshold || 5) &&
            !recentlySoldProductIds.has(p.id)
        );

        setSlowMoving(slow.slice(0, 5));
    };

    const loadProfitReport = async () => {
        const products = await getAllProducts();
        const profitable = products
            .filter(p => p.selling_price > 0 && p.cost_price > 0)
            .map(p => ({
                name: p.name,
                sellingPrice: p.selling_price,
                costPrice: p.cost_price,
                margin: p.selling_price - p.cost_price,
                marginPercent: ((p.selling_price - p.cost_price) / p.selling_price * 100)
            }))
            .sort((a, b) => b.margin - a.margin)
            .slice(0, 5);

        setProfitReport(profitable);
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

    // Calculate max revenue for bar chart scaling
    const maxRevenue = Math.max(...weeklyRevenue.map(d => d.revenue), 1);

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

            {/* Quick Actions Grid */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                    Quick Actions
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10
                }}>
                    {[
                        { label: 'New Sale', icon: ShoppingCart, color: 'var(--accent-400)', bg: 'rgba(22, 163, 74, 0.1)', page: 'billing' },
                        { label: 'Add Product', icon: Package, color: 'var(--primary-400)', bg: 'rgba(59, 130, 246, 0.1)', page: 'products' },
                        { label: 'Add Expense', icon: Wallet, color: 'var(--danger-400)', bg: 'rgba(239, 68, 68, 0.1)', page: 'expenses' },
                        { label: 'Day Summary', icon: BarChart3, color: 'var(--info-400)', bg: 'rgba(56, 189, 248, 0.1)', page: 'day-summary' },
                        { label: 'Customers', icon: Users, color: 'var(--warning-500)', bg: 'rgba(245, 158, 11, 0.1)', page: 'customers' },
                        { label: 'Undo Sale', icon: Undo2, color: 'var(--danger-400)', bg: 'rgba(239, 68, 68, 0.08)', action: () => setShowUndoConfirm(true) }
                    ].map(({ label, icon: Icon, color, bg, page, action }) => (
                        <button
                            key={label}
                            onClick={() => action ? action() : onNavigate(page)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '16px 8px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                minHeight: 72,
                                transition: 'transform 120ms ease, box-shadow 120ms ease',
                                fontFamily: 'Inter, sans-serif'
                            }}
                            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            id={`qa-${label.toLowerCase().replace(/\s/g, '-')}`}
                        >
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: 'var(--radius-sm)',
                                background: bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: color
                            }}>
                                <Icon size={20} />
                            </div>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                textAlign: 'center',
                                lineHeight: 1.2
                            }}>{label}</span>
                        </button>
                    ))}
                </div>
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
                        {(stats.totalProfit - expenseTotal) >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                    <div className="stat-value" style={{ color: (stats.totalProfit - expenseTotal) >= 0 ? 'var(--accent-400)' : 'var(--danger-400)' }}>
                        {(stats.totalProfit - expenseTotal) >= 0 ? '↑ ' : '↓ '}{formatCurrency(Math.abs(stats.totalProfit - expenseTotal))}
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
                    <div className="stat-value" style={{ color: expenseTotal > 0 ? 'var(--danger-400)' : 'var(--text-primary)' }}>
                        {expenseTotal > 0 ? '↓ ' : ''}{formatCurrency(expenseTotal)}
                    </div>
                    <div className="stat-label">Expenses</div>
                </div>
            </div>

            {/* Predictive BI Diagnostics Panel */}
            <div className="dashboard-section">
                <div className="dashboard-section-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Activity size={16} style={{ color: 'var(--primary-400)' }} />
                        Predictive BI Diagnostics
                    </h3>
                    <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: 'var(--primary-400)',
                        borderRadius: 12,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        AI Forecasting Active
                    </span>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 12,
                    marginBottom: 8
                }}>
                    {/* Forecast Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.4))',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Tomorrow's Revenue Forecast
                            </span>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: forecasting.trend === 'up' ? 'var(--accent-400)' : forecasting.trend === 'down' ? 'var(--danger-400)' : 'var(--text-muted)'
                            }}>
                                {forecasting.trend === 'up' ? <TrendingUp size={14} /> : forecasting.trend === 'down' ? <TrendingDown size={14} /> : null}
                                {forecasting.trend === 'up' ? 'Rising Trend (+12%)' : forecasting.trend === 'down' ? 'Declining Trend (-12%)' : 'Stable Trend'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{
                                fontSize: '1.8rem',
                                fontWeight: 900,
                                background: 'linear-gradient(135deg, #fff, var(--primary-300))',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                letterSpacing: '-0.02em'
                            }}>
                                {formatCurrency(forecasting.nextDayRevenue)}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Based on 7-day rolling sales velocity
                            </span>
                        </div>
                    </div>

                    {/* Replenishment Recommendations */}
                    {forecasting.replenishment.length > 0 && (
                        <div style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12
                        }}>
                            <div style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}>
                                <AlertTriangle size={14} style={{ color: 'var(--warning-400)' }} />
                                Automated Replenishment & Supply Chain Suggestions
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {forecasting.replenishment.slice(0, 3).map(item => (
                                    <div key={item.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        paddingBottom: 8,
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                                        fontSize: '0.8rem'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                Sales Velocity: {item.velocity.toFixed(2)} units/day
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{
                                                fontSize: '0.78rem',
                                                fontWeight: 800,
                                                color: 'var(--warning-400)',
                                                background: 'rgba(245, 158, 11, 0.08)',
                                                padding: '2px 8px',
                                                borderRadius: 6,
                                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                                display: 'inline-block'
                                            }}>
                                                Restock +{item.suggested} units
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                                covers 14-day supply
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Weekly Revenue Trend */}
            <div className="dashboard-section">
                <div className="dashboard-section-header">
                    <h3>
                        <Activity size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--info-400)' }} />
                        Weekly Revenue
                    </h3>
                </div>
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 14px 12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginBottom: 8 }}>
                        {weeklyRevenue.map((day, i) => {
                            const height = maxRevenue > 0 ? Math.max((day.revenue / maxRevenue) * 100, 4) : 4;
                            const isToday = i === weeklyRevenue.length - 1;
                            return (
                                <div key={i} style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 4
                                }}>
                                    {day.revenue > 0 && (
                                        <div style={{
                                            fontSize: '0.58rem',
                                            fontWeight: 700,
                                            color: isToday ? 'var(--primary-400)' : 'var(--text-muted)',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {currency}{day.revenue >= 1000 ? `${(day.revenue / 1000).toFixed(1)}k` : day.revenue}
                                        </div>
                                    )}
                                    <div style={{
                                        width: '100%',
                                        height: `${height}%`,
                                        borderRadius: '6px 6px 2px 2px',
                                        background: isToday
                                            ? 'linear-gradient(to top, var(--primary-600), var(--primary-400))'
                                            : 'linear-gradient(to top, rgba(56, 189, 248, 0.25), rgba(56, 189, 248, 0.45))',
                                        transition: 'height 0.4s ease',
                                        minHeight: 4
                                    }} />
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {weeklyRevenue.map((day, i) => (
                            <div key={i} style={{
                                flex: 1,
                                textAlign: 'center',
                                fontSize: '0.62rem',
                                fontWeight: 600,
                                color: i === weeklyRevenue.length - 1 ? 'var(--primary-400)' : 'var(--text-muted)'
                            }}>
                                {day.label}
                            </div>
                        ))}
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

            {/* Slow Moving Products */}
            {slowMoving.length > 0 && (
                <div className="dashboard-section">
                    <div className="dashboard-section-header">
                        <h3>
                            <PackageX size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--warning-500)' }} />
                            Slow Moving
                        </h3>
                        <span className="stock-badge low" style={{
                            background: 'rgba(251, 146, 60, 0.12)',
                            color: 'var(--warning-400)'
                        }}>⚠ {slowMoving.length} items</span>
                    </div>
                    {slowMoving.map(item => (
                        <div key={item.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: 'var(--bg-card)',
                            border: '1px solid rgba(251, 146, 60, 0.15)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 8
                        }}>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{item.name}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--warning-400)', marginTop: 2 }}>
                                    ⚠ No sales in 7 days
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    {item.stock_quantity} in stock
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Profit Margin Report */}
            {profitReport.length > 0 && (
                <div className="dashboard-section">
                    <div className="dashboard-section-header">
                        <h3>
                            <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--accent-400)' }} />
                            Top Profit Margins
                        </h3>
                    </div>
                    {profitReport.map((item, i) => (
                        <div key={item.name} className="top-product-item">
                            <div className="top-product-rank" style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                color: 'var(--accent-400)'
                            }}>{i + 1}</div>
                            <div className="top-product-info">
                                <div className="top-product-name">{item.name}</div>
                                <div className="top-product-qty">
                                    Margin: {formatCurrency(item.margin)} ({item.marginPercent.toFixed(0)}%)
                                </div>
                            </div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-400)' }}>
                                {formatCurrency(item.sellingPrice)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
