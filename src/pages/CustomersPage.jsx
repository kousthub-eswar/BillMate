import { useState, useEffect } from 'react';
import {
    Users, UserPlus, Search, Phone,
    History, RotateCcw, AlertTriangle
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import {
    getAllCustomers, addCustomer, updateCustomerBalance,
    searchCustomers, getCustomerHistory, getSetting
} from '../database';
import { useToast } from '../components/Toast';

export default function CustomersPage() {
    const [customers, setCustomers] = useState([]);
    const [query, setQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showSettleModal, setShowSettleModal] = useState(null); // Customer object
    const [showHistoryModal, setShowHistoryModal] = useState(null); // Customer object
    const [history, setHistory] = useState([]);

    const [formData, setFormData] = useState({ name: '', phone: '' });
    const [settleAmount, setSettleAmount] = useState('');
    const [currency, setCurrency] = useState('₹');
    const [errors, setErrors] = useState({});
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalCount, setHistoryTotalCount] = useState(0);

    const showToast = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadCustomers = async () => {
        setLoading(true);
        setError(false);
        try {
            const all = await getAllCustomers();
            all.sort((a, b) => b.balance - a.balance);
            setCustomers(all);
        } catch (err) {
            setError(true);
            showToast('Failed to load customers', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (val) => {
        setLoading(true);
        setError(false);
        try {
            const results = await searchCustomers(val);
            setCustomers(results);
        } catch (err) {
            setError(true);
            showToast('Failed to search customers', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCustomers();
        loadCurrency();
    }, []);

    useEffect(() => {
        if (query.trim()) {
            handleSearch(query);
        } else {
            loadCustomers();
        }
    }, [query]);

    const handleAdd = async () => {
        const newErrors = {};
        const trimmedName = formData.name.trim();
        const trimmedPhone = (formData.phone || '').trim();

        if (!trimmedName) {
            newErrors.name = 'Customer name is required';
        } else if (trimmedName.length > 100) {
            newErrors.name = 'Customer name cannot exceed 100 characters';
        }

        if (trimmedPhone && !/^[+\d\s]+$/.test(trimmedPhone)) {
            newErrors.phone = 'Phone number can only contain digits, spaces, and +';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            showToast('Please correct the validation errors', 'error');
            return;
        }

        try {
            await addCustomer({ name: trimmedName, phone: trimmedPhone });
            showToast('Customer added');
            setShowAddModal(false);
            setFormData({ name: '', phone: '' });
            loadCustomers();
        } catch (_err) {
            showToast('Failed to add customer', 'error');
        }
    };

    const handleSettle = async () => {
        const amount = parseFloat(settleAmount);
        const newErrors = {};

        if (isNaN(amount) || amount <= 0) {
            newErrors.settleAmount = 'Amount must be greater than zero';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            showToast('Please correct the validation errors', 'error');
            return;
        }

        try {
            await updateCustomerBalance(showSettleModal.id, amount);

            showToast('Payment settled');
            setShowSettleModal(null);
            setSettleAmount('');
            loadCustomers();
        } catch (_err) {
            showToast('Settlement failed', 'error');
        }
    };

    const loadHistory = async (customer) => {
        if (!customer) return;
        try {
            const result = await getCustomerHistory(customer.id, historyPage, 25);
            setHistory(result.data);
            setHistoryTotalCount(result.count);
        } catch (err) {
            showToast('Failed to load transaction history', 'error');
        }
    };

    const viewHistory = async (customer) => {
        setHistoryPage(1);
        setHistory([]);
        setShowHistoryModal(customer);
    };

    useEffect(() => {
        if (showHistoryModal) {
            loadHistory(showHistoryModal);
        }
    }, [showHistoryModal, historyPage]);

    return (
        <div className="page-content">
            <AppHeader title="Customers">
                <button className="btn btn-primary btn-sm" onClick={() => { setErrors({}); setShowAddModal(true); }}>
                    <UserPlus size={16} /> Add
                </button>
            </AppHeader>

            {/* Search */}
            <div className="search-bar">
                <Search />
                <input
                    type="text"
                    placeholder="Search by name or phone..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>

            {/* Stats */}
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Market Credit</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger-400)' }}>
                    {currency}{customers.reduce((sum, c) => sum + (c.balance || 0), 0).toFixed(2)}
                </div>
            </div>

            {/* List */}
            <div className="customer-list">
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
                            Failed to load customers. Please check your connection and try again.
                        </p>
                        <button
                            onClick={() => {
                                if (query.trim()) {
                                    handleSearch(query);
                                } else {
                                    loadCustomers();
                                }
                            }}
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
                ) : customers.length === 0 ? (
                    <div className="empty-state">
                        <Users size={52} />
                        <h3>{query.trim() ? 'No Matching Customers' : 'No Customers Yet'}</h3>
                        <p>{query.trim() ? `No customers match "${query}"` : 'Add customers to track credit (udhaar) and payment history.'}</p>
                        {!query.trim() && (
                            <button className="btn btn-primary" onClick={() => { setErrors({}); setShowAddModal(true); }}>
                                <UserPlus size={18} /> Add Customer
                            </button>
                        )}
                    </div>
                ) : (
                    customers.map(c => (
                        <div key={c.id} className="customer-item" onClick={() => viewHistory(c)}>
                            <div className="customer-avatar">
                                {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="customer-info">
                                <div className="customer-name">{c.name}</div>
                                <div className="customer-phone">
                                    <Phone size={10} style={{ marginRight: 4 }} />
                                    {c.phone || 'No phone'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div className={`customer-balance ${c.balance > 0 ? 'debt' : 'clean'}`}>
                                    {c.balance > 0 ? `${currency}${c.balance.toFixed(2)} Due` : 'Settled'}
                                </div>
                                {c.balance > 0 && (
                                    <button
                                        className="btn-settle"
                                        onClick={(e) => { e.stopPropagation(); setErrors({}); setShowSettleModal(c); }}
                                    >
                                        Settle
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Add Customer</div>

                        <div className="form-group">
                            <label className="form-label">Name</label>
                            <input
                                className="form-input"
                                value={formData.name}
                                onChange={(e) => {
                                    setFormData({ ...formData, name: e.target.value });
                                    if (errors.name) setErrors(prev => ({ ...prev, name: null }));
                                }}
                                placeholder="e.g. Raju Bhai"
                                autoFocus
                            />
                            {errors.name && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.name}</p>}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input
                                className="form-input"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => {
                                    setFormData({ ...formData, phone: e.target.value });
                                    if (errors.phone) setErrors(prev => ({ ...prev, phone: null }));
                                }}
                                placeholder="Optional"
                            />
                            {errors.phone && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.phone}</p>}
                        </div>

                        <button className="btn btn-primary btn-block" onClick={handleAdd}>
                            Save Customer
                        </button>
                    </div>
                </div>
            )}

            {/* Settle Modal */}
            {showSettleModal && (
                <div className="modal-overlay" onClick={() => setShowSettleModal(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Settle Payment</div>

                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{showSettleModal.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--danger-400)', marginTop: 4 }}>
                                Current Due: {currency}{showSettleModal.balance.toFixed(2)}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Amount Received ({currency})</label>
                            <input
                                className="form-input"
                                type="number"
                                value={settleAmount}
                                onChange={(e) => {
                                    setSettleAmount(e.target.value);
                                    if (errors.settleAmount) setErrors(prev => ({ ...prev, settleAmount: null }));
                                }}
                                placeholder="0.00"
                                style={{ fontSize: '1.5rem', textAlign: 'center', fontWeight: 600 }}
                                autoFocus
                            />
                            {errors.settleAmount && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500, textAlign: 'center' }}>{errors.settleAmount}</p>}
                        </div>

                        <button
                            className="btn btn-success btn-block"
                            onClick={handleSettle}
                            disabled={!settleAmount || parseFloat(settleAmount) <= 0}
                        >
                            Receive Payment
                        </button>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div className="modal-overlay" onClick={() => setShowHistoryModal(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">{showHistoryModal.name} - History</div>

                        {history.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                                No transaction history found
                            </div>
                        ) : (
                            <div className="history-list">
                                {history.map(h => {
                                    const isPayment = h.payment_method === 'Settle';
                                    return (
                                        <div key={h.id} className="history-item">
                                            <div>
                                                <div style={{ fontWeight: 600, color: isPayment ? 'var(--accent-400)' : 'var(--text-main)' }}>
                                                    {isPayment ? 'Payment Received' : (h.refunded ? 'Refunded Sale' : 'Purchase')}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {new Date(h.date).toLocaleDateString('en-IN', {
                                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </div>
                                            </div>
                                            <div style={{
                                                fontWeight: 700,
                                                color: isPayment ? 'var(--accent-400)' : (h.refunded ? 'var(--text-muted)' : 'var(--danger-400)'),
                                                textDecoration: h.refunded ? 'line-through' : 'none',
                                                fontSize: '1.1rem'
                                            }}>
                                                {isPayment ? '+' : '-'}{currency}{isPayment ? (h.settle_amount || 0).toFixed(2) : (h.total || 0).toFixed(2)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {historyTotalCount > 25 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginTop: 16,
                                padding: '12px 0 0',
                                borderTop: '1px solid var(--border-color)',
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)'
                            }}>
                                <button
                                    disabled={historyPage === 1}
                                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '4px 10px' }}
                                >
                                    Prev
                                </button>
                                <span style={{ fontWeight: 500 }}>
                                    Showing {Math.min(historyTotalCount, (historyPage - 1) * 25 + 1)}-{Math.min(historyTotalCount, historyPage * 25)} of {historyTotalCount}
                                </span>
                                <button
                                    disabled={historyPage * 25 >= historyTotalCount}
                                    onClick={() => setHistoryPage(p => p + 1)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '4px 10px' }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
