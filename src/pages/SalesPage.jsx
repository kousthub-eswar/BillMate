import { useState, useEffect } from 'react';
import {
    Clock, ChevronDown, ChevronUp, RotateCcw,
    Calendar, ShoppingBag, CreditCard
} from 'lucide-react';
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
    const showToast = useToast();

    useEffect(() => {
        loadSales();
        loadCurrency();
    }, [filter, dateRange]);

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadSales = async () => {
        let filterParam = filter;
        if (filter === 'custom' && dateRange.startDate && dateRange.endDate) {
            filterParam = dateRange;
        }
        const data = await getSales(filterParam);
        setSales(data);
    };

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
        const success = await refundSale(saleId);
        if (success) {
            showToast('Sale refunded, stock restored');
            setShowRefundConfirm(null);
            setExpandedSale(null);
            loadSales();
        } else {
            showToast('Refund failed', 'error');
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
            <div className="page-header">
                <h1>Sales</h1>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    <div>{sales.length} transactions</div>
                    <div style={{ color: 'var(--primary-300)', fontWeight: 600 }}>{currency}{totalRevenue.toFixed(2)}</div>
                </div>
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
            {sales.length === 0 ? (
                <div className="empty-state">
                    <Clock size={48} />
                    <h3>No Sales</h3>
                    <p>No transactions found for this period</p>
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
                                    {currency}{sale.total.toFixed(2)}
                                </div>
                                {expandedSale === sale.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                        </div>

                        <div className="sale-card-details">
                            <span>
                                <ShoppingBag size={12} /> {sale.item_count || '?'} items
                            </span>
                            <span style={{ color: 'var(--accent-400)' }}>
                                Profit: {currency}{sale.profit?.toFixed(2) || '0.00'}
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

            {/* Refund Confirmation */}
            {showRefundConfirm && (
                <div className="modal-overlay" onClick={() => setShowRefundConfirm(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Refund Transaction?</div>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>
                            This will mark sale <strong style={{ color: 'var(--text-primary)' }}>#{showRefundConfirm.id}</strong> as refunded
                            and restore inventory stock.
                        </p>
                        <p style={{ textAlign: 'center', color: 'var(--danger-400)', fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>
                            {currency}{showRefundConfirm.total.toFixed(2)}
                        </p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setShowRefundConfirm(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => handleRefund(showRefundConfirm.id)}>
                                <RotateCcw size={16} /> Confirm Refund
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
