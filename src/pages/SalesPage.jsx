import { useState, useEffect } from 'react';
import {
    Clock, ChevronDown, ChevronUp, RotateCcw,
    ShoppingBag, Search, Filter, AlertTriangle
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { getSales, getSaleById, refundSale, getSetting } from '../database';
import { generateReceipt, shareOnWhatsApp } from '../backend/receipt';
import { getAllSettings } from '../database';
import { useToast } from '../components/Toast';

export default function SalesPage() {
    const [sales, setSales] = useState([]);
    const [filter, setFilter] = useState('today');
    const [expandedSale, setExpandedSale] = useState(null);
    const [saleDetails, setSaleDetails] = useState(null);
    const [showRefundConfirm, setShowRefundConfirm] = useState(null);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [currency, setCurrency] = useState('₹');
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [filter, dateRange, searchQuery, paymentFilter]);

    const showToast = useToast();

    const formatCurrency = (val) => {
        const num = Number(val);
        if (num === 0) return `${currency}0`;
        return num % 1 === 0 ? `${currency}${num.toLocaleString('en-IN')}` : `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadSales = async () => {
        setLoading(true);
        setError(false);
        try {
            let filterParam = filter;
            if (filter === 'custom' && dateRange.startDate && dateRange.endDate) {
                filterParam = dateRange;
            }
            const result = await getSales(filterParam, page, 25, searchQuery, paymentFilter);
            setSales(result.data);
            setTotalCount(result.count);
        } catch (err) {
            setError(true);
            showToast('Failed to load sales', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSales();
        loadCurrency();
    }, [filter, dateRange, page, searchQuery, paymentFilter]);

    const toggleExpand = async (saleId) => {
        if (expandedSale === saleId) {
            setExpandedSale(null);
            setSaleDetails(null);
        } else {
            const detail = await getSaleById(saleId);
            setExpandedSale(saleId);
            setSaleDetails(detail);
        }
    };

    const handleRefund = async (saleId) => {
        try {
            await refundSale(saleId);
            showToast('Sale refunded, stock restored');
            setShowRefundConfirm(null);
            setExpandedSale(null);
            loadSales();
        } catch (error) {
            showToast(error.message || 'Refund failed', 'error');
        }
    };

    const handleShareReceipt = async (sale) => {
        const detail = await getSaleById(sale.id);
        const settings = await getAllSettings();
        const receipt = generateReceipt(detail, detail.items, settings);
        const phone = prompt('Enter customer phone number (with country code):');
        if (phone) {
            shareOnWhatsApp(phone, receipt);
        }
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const totalRevenue = sales
        .filter(s => !s.refunded)
        .reduce((sum, s) => sum + s.total, 0);

    return (
        <div className="page-content">
            <AppHeader title="Sales">
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    <div>{totalCount} transactions</div>
                    <div style={{ color: 'var(--primary-300)', fontWeight: 600 }}>{formatCurrency(totalRevenue)}</div>
                </div>
            </AppHeader>

            {/* Search Bar */}
            <div className="search-bar" style={{ marginBottom: 12 }}>
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search by Invoice # or Customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    id="sales-search"
                    style={{ flex: 1, border: 'none', background: 'none', outline: 'none', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.88rem' }}
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                    >✕</button>
                )}
            </div>

            {/* Payment Method Filter */}
            <div className="sales-payment-filter" style={{
                display: 'flex',
                gap: 6,
                marginBottom: 12,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
            }}>
                {['All', 'Cash', 'UPI', 'Card', 'Credit'].map(method => (
                    <button
                        key={method}
                        onClick={() => setPaymentFilter(method)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 20,
                            border: paymentFilter === method ? '1.5px solid var(--primary-500)' : '1px solid var(--border-color)',
                            background: paymentFilter === method ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-card)',
                            color: paymentFilter === method ? 'var(--primary-400)' : 'var(--text-secondary)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            fontFamily: 'Inter, sans-serif',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {method === 'All' && <Filter size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                        {method}
                    </button>
                ))}
            </div>

            {/* Filter Tabs */}
            <div className="filter-tabs">
                {[
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: '7 Days' },
                    { key: 'month', label: 'This Month' },
                    { key: 'all', label: 'All' },
                    { key: 'custom', label: 'Custom' }
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        className={`filter-tab ${filter === key ? 'active' : ''}`}
                        onClick={() => setFilter(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Custom Date Range */}
            {filter === 'custom' && (
                <div className="date-range">
                    <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>to</span>
                    <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                    />
                </div>
            )}

            {/* Sales List */}
            {(searchQuery || paymentFilter !== 'All') && (
                <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: 10,
                    fontWeight: 600
                }}>
                    Showing {Math.min(totalCount, (page - 1) * 25 + 1)}-{Math.min(totalCount, page * 25)} of {totalCount} transactions
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="skeleton-shimmer" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px',
                            borderRadius: 'var(--radius-md)',
                            minHeight: '72px',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '70%' }}>
                                <div className="skeleton-box" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                    <div className="skeleton-box" style={{ width: '40%', height: '16px' }} />
                                    <div className="skeleton-box" style={{ width: '60%', height: '12px' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, width: '20%' }}>
                                <div className="skeleton-box" style={{ width: '60px', height: '16px' }} />
                                <div className="skeleton-box" style={{ width: '40px', height: '12px' }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
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
                    margin: '20px 0'
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
                        Failed to load sales history. Please check your connection and try again.
                    </p>
                    <button
                        onClick={loadSales}
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
            ) : sales.length === 0 ? (
                <div className="empty-state">
                    <Clock size={52} />
                    <h3>{searchQuery || paymentFilter !== 'All' ? 'No Matching Sales' : 'No Sales Yet'}</h3>
                    <p>{searchQuery ? `No transactions match "${searchQuery}"` : paymentFilter !== 'All' ? `No ${paymentFilter} transactions found for this period.` : 'No transactions found for this period. Sales will appear here after billing.'}</p>
                </div>
            ) : (
                sales.map(sale => (
                    <div
                        key={sale.id}
                        className={`sale-card ${sale.refunded ? 'refunded' : ''}`}
                        onClick={() => toggleExpand(sale.id)}
                    >
                        <div className="sale-card-header">
                            <div>
                                <div className="sale-card-id">
                                    #{sale.id} · {formatDate(sale.date)}
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                                    <span className="payment-badge">{sale.payment_method}</span>
                                    {sale.refunded && <span className="refund-badge">Refunded</span>}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                <div className="sale-card-amount" style={sale.refunded ? { textDecoration: 'line-through' } : {}}>
                                    {formatCurrency(sale.total)}
                                </div>
                                {expandedSale === sale.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                        </div>

                        <div className="sale-card-details">
                            <span>
                                <ShoppingBag size={12} /> {sale.item_count || '?'} items
                            </span>
                            <span style={{ color: 'var(--accent-400)' }}>
                                Profit: {formatCurrency(sale.profit || 0)}
                            </span>
                        </div>

                        {/* Expanded Details */}
                        {expandedSale === sale.id && saleDetails && (
                            <div className="sale-items-list" onClick={(e) => e.stopPropagation()}>
                                {saleDetails.items?.map((item, idx) => (
                                    <div key={idx} className="sale-item-row">
                                        <span>{item.product_name} × {item.quantity}</span>
                                        <span>{currency}{item.subtotal?.toFixed(2)}</span>
                                    </div>
                                ))}

                                <div className="sale-actions">
                                    {!sale.refunded && (
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={(e) => { e.stopPropagation(); setShowRefundConfirm(sale); }}
                                        >
                                            <RotateCcw size={14} /> Refund
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={(e) => { e.stopPropagation(); handleShareReceipt(sale); }}
                                    >
                                        Share Receipt
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}

            {totalCount > 25 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 16,
                    marginBottom: 20,
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)'
                }}>
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 12px' }}
                    >
                        Previous
                    </button>
                    <span style={{ fontWeight: 500 }}>
                        Showing {Math.min(totalCount, (page - 1) * 25 + 1)}-{Math.min(totalCount, page * 25)} of {totalCount} results
                    </span>
                    <button
                        disabled={page * 25 >= totalCount}
                        onClick={() => setPage(p => p + 1)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 12px' }}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Refund Confirmation */}
            {showRefundConfirm && (
                <ConfirmDialog
                    title="Refund Transaction?"
                    message={`Are you sure you want to refund this transaction of ${formatCurrency(showRefundConfirm.total)}? This will restore stock for all items.`}
                    confirmText="Refund"
                    variant="danger"
                    onConfirm={() => handleRefund(showRefundConfirm.id)}
                    onCancel={() => setShowRefundConfirm(null)}
                />
            )}
        </div>
    );
}
