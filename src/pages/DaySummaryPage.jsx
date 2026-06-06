import { useState, useEffect } from 'react';
import {
    ArrowLeft, DollarSign, TrendingUp, TrendingDown,
    ShoppingCart, Trophy, AlertTriangle, Wallet,
    Package, BarChart3, Lock, Banknote, Smartphone, RotateCcw
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
    getTodayStats, getTopSellingProducts, getLowStockProducts,
    getSetting, setSetting, getTodayExpenseTotal, getSales
} from '../database';

export default function DaySummaryPage({ onBack }) {
    const [stats, setStats] = useState({ totalRevenue: 0, totalProfit: 0, transactionCount: 0 });
    const [expenseTotal, setExpenseTotal] = useState(0);
    const [topProduct, setTopProduct] = useState(null);
    const [lowStock, setLowStock] = useState([]);
    const [currency, setCurrency] = useState('₹');
    const [loading, setLoading] = useState(true);
    const [todaySales, setTodaySales] = useState([]);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const showToast = useToast();
    const [error, setError] = useState(false);

    useEffect(() => {
        loadSummary();
    }, []);

    const loadSummary = async () => {
        setLoading(true);
        setError(false);
        try {
            const [statsData, curr, thresh, expTotal, topProducts, sales] = await Promise.all([
                getTodayStats(),
                getSetting('currency'),
                getSetting('low_stock_threshold'),
                getTodayExpenseTotal(),
                getTopSellingProducts(1),
                getSales('today')
            ]);

            setStats(statsData);
            setCurrency(curr);
            setExpenseTotal(expTotal);
            setTopProduct(topProducts.length > 0 ? topProducts[0] : null);
            setTodaySales(sales.filter(s => !s.refunded));

            const lowStockData = await getLowStockProducts(parseInt(thresh));
            setLowStock(lowStockData);
        } catch (err) {
            console.error('Failed to load day summary:', err);
            setError(true);
            showToast('Failed to load day summary', 'error');
        } finally {
            setLoading(false);
        }
    };

    const netProfit = stats.totalProfit - expenseTotal;

    if (loading) {
        return (
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <BarChart3 size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                    <div style={{ fontSize: '0.85rem' }}>Loading summary...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px 20px',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    maxWidth: '400px',
                    width: '90%',
                    boxSizing: 'border-box'
                }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'rgba(244, 63, 94, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--danger-500)',
                        marginBottom: '16px'
                    }}>
                        <AlertTriangle size={24} />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        Connection Failed
                    </h3>
                    <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '280px', lineHeight: 1.4 }}>
                        Failed to load day summary. Please check your connection and try again.
                    </p>
                    <button
                        onClick={loadSummary}
                        className="btn btn-primary"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            fontSize: '0.85rem'
                        }}
                    >
                        <RotateCcw size={14} /> Retry
                    </button>
                </div>
            </div>
        );
    }

    const cashReceived = todaySales.filter(s => s.payment_method === 'Cash').reduce((sum, s) => sum + s.total, 0);
    const upiReceived = todaySales.filter(s => s.payment_method === 'UPI').reduce((sum, s) => sum + s.total, 0);

    const handleCloseDay = async () => {
        await setSetting('last_closed_day', new Date().toISOString());
        showToast('Day closed successfully. Summary saved.');
        setShowCloseConfirm(false);
        onBack();
    };

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        className="btn btn-ghost btn-icon"
                        onClick={onBack}
                        style={{ flexShrink: 0 }}
                        id="day-summary-back"
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <div>
                        <h1 style={{
                            fontSize: '1.4rem',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, var(--primary-300), var(--primary-500))',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '-0.02em',
                            margin: 0
                        }}>
                            Day Summary
                        </h1>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>
                            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                </div>
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                        const printWindow = window.open('', '_blank');
                        printWindow.document.write(`
                            <html>
                                <head>
                                    <title>Day Summary Report</title>
                                    <style>
                                        body {
                                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                                            padding: 40px;
                                            max-width: 600px;
                                            margin: 0 auto;
                                            color: #09090b;
                                            background: #fff;
                                        }
                                        h1 { font-size: 24px; font-weight: 800; border-bottom: 2px solid #09090b; padding-bottom: 8px; margin-bottom: 24px; }
                                        .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e4e4e7; font-size: 14px; }
                                        .row.total { font-weight: 800; font-size: 18px; border-top: 2px solid #09090b; border-bottom: none; margin-top: 16px; }
                                        .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #71717a; margin-top: 32px; margin-bottom: 12px; letter-spacing: 0.5px; }
                                        .badge { font-weight: 600; }
                                        @media print {
                                            body { padding: 0; }
                                        }
                                    </style>
                                </head>
                                <body onload="window.print(); window.close();">
                                    <h1>BillMate Day Summary</h1>
                                    <div style="font-size: 12px; color: #71717a; margin-bottom: 24px;">
                                        Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </div>
                                    
                                    <div class="section-title">Financial Performance</div>
                                    <div class="row"><span>Total Revenue</span><span class="badge">${currency}${stats.totalRevenue.toFixed(2)}</span></div>
                                    <div class="row"><span>Product Profit</span><span class="badge">${currency}${stats.totalProfit.toFixed(2)}</span></div>
                                    <div class="row"><span>Total Expenses</span><span class="badge" style="color: #ef4444;">-${currency}${expenseTotal.toFixed(2)}</span></div>
                                    <div class="row total"><span>Net Profit</span><span>${currency}${netProfit.toFixed(2)}</span></div>
                                    
                                    <div class="section-title">Transaction Summary</div>
                                    <div class="row"><span>Total Transactions</span><span>${stats.transactionCount}</span></div>
                                    <div class="row"><span>Cash Received</span><span>${currency}${cashReceived.toFixed(2)}</span></div>
                                    <div class="row"><span>UPI Received</span><span>${currency}${upiReceived.toFixed(2)}</span></div>
                                    
                                    <div class="section-title">Highlights</div>
                                    <div class="row"><span>Top Selling Product</span><span>${topProduct ? `${topProduct.name} (${topProduct.quantity} units)` : 'No sales data'}</span></div>
                                    <div class="row"><span>Low Stock Warning</span><span style="${lowStock.length > 0 ? 'color: #f59e0b; font-weight: 700;' : ''}">${lowStock.length} items low</span></div>
                                </body>
                            </html>
                        `);
                        printWindow.document.close();
                    }}
                    id="print-summary-btn"
                >
                    Print Report
                </button>
            </div>

            {/* Revenue Card - Hero */}
            <div style={{
                background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600, #1d4ed8))',
                borderRadius: 'var(--radius-lg)',
                padding: '24px 20px',
                marginBottom: 16,
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute', top: -20, right: -20,
                    width: 100, height: 100,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)'
                }} />
                <div style={{
                    position: 'absolute', bottom: -30, left: -10,
                    width: 70, height: 70,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)'
                }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Total Revenue
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#000', letterSpacing: '-0.02em' }}>
                    {currency}{stats.totalRevenue.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 500, color: 'rgba(0,0,0,0.5)', marginTop: 4 }}>
                    from {stats.transactionCount} transaction{stats.transactionCount !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Financial Stats Grid */}
            <div className="stats-grid" style={{ marginBottom: 16 }}>
                <div className="stat-card">
                    <div className="stat-icon profit">
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-label">Product Profit</div>
                    <div className="stat-value" style={{ color: 'var(--accent-400)' }}>
                        {currency}{stats.totalProfit.toFixed(2)}
                    </div>
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
                    <div className="stat-icon" style={{
                        background: netProfit >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: netProfit >= 0 ? 'var(--accent-400)' : 'var(--danger-400)'
                    }}>
                        <TrendingDown size={20} />
                    </div>
                    <div className="stat-label">Net Profit</div>
                    <div className="stat-value" style={{ color: netProfit >= 0 ? 'var(--accent-400)' : 'var(--danger-400)' }}>
                        {currency}{netProfit.toFixed(2)}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon transactions">
                        <ShoppingCart size={20} />
                    </div>
                    <div className="stat-label">Total Transactions</div>
                    <div className="stat-value">{stats.transactionCount}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success-400)' }}>
                        <Banknote size={20} />
                    </div>
                    <div className="stat-label">Cash Received</div>
                    <div className="stat-value" style={{ color: 'var(--success-500)' }}>
                        {currency}{cashReceived.toFixed(2)}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--info-400)' }}>
                        <Smartphone size={20} />
                    </div>
                    <div className="stat-label">UPI Received</div>
                    <div className="stat-value" style={{ color: 'var(--info-500)' }}>
                        {currency}{upiReceived.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Top Selling Product */}
            <div className="dashboard-section" style={{ marginBottom: 16 }}>
                <div className="dashboard-section-header">
                    <h3>
                        <Trophy size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--warning-400)' }} />
                        Top Selling Product
                    </h3>
                </div>
                {topProduct ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px'
                    }}>
                        <div style={{
                            width: 44, height: 44,
                            borderRadius: 'var(--radius-md)',
                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600, #1d4ed8))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '1.1rem',
                            color: '#000',
                            flexShrink: 0
                        }}>
                            🏆
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                {topProduct.name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {topProduct.quantity} units sold today
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No sales data yet today
                    </div>
                )}
            </div>

            {/* Low Stock Items */}
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
                    lowStock.map(item => (
                        <div key={item.id} className="low-stock-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Package size={14} style={{ color: 'var(--warning-500)', flexShrink: 0 }} />
                                <span className="product-name">{item.name}</span>
                            </div>
                            <span className="stock-count" style={{
                                color: item.stock_quantity === 0 ? 'var(--danger-400)' : 'var(--warning-500)',
                                fontWeight: 700
                            }}>
                                {item.stock_quantity === 0 ? 'Out of stock' : `${item.stock_quantity} left`}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Close Day Button */}
            <div style={{ padding: '0 0 24px 0', marginTop: 16 }}>
                <button
                    className="btn btn-primary btn-lg btn-block"
                    onClick={() => setShowCloseConfirm(true)}
                    style={{ background: 'var(--danger-500)', color: '#fff', border: 'none', gap: 8 }}
                >
                    <Lock size={20} /> Close Day
                </button>
            </div>

            {/* Close Day Confirm */}
            {showCloseConfirm && (
                <ConfirmDialog
                    title="Close Day?"
                    message={`Are you sure you want to close the day? Total Revenue: ${currency}${stats.totalRevenue.toFixed(2)}, Cash: ${currency}${cashReceived.toFixed(2)}, UPI: ${currency}${upiReceived.toFixed(2)}`}
                    confirmText="Yes, Close Day"
                    variant="danger"
                    onConfirm={handleCloseDay}
                    onCancel={() => setShowCloseConfirm(false)}
                />
            )}
        </div>
    );
}
