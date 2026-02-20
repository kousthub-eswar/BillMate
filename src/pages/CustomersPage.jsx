import { useState, useEffect } from 'react';
import {
    Users, UserPlus, Search, Phone, ArrowDownLeft,
    ArrowUpRight, History
} from 'lucide-react';
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

    const showToast = useToast();

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

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadCustomers = async () => {
        const all = await getAllCustomers();
        // Sort by balance (highest debt first)
        all.sort((a, b) => b.balance - a.balance);
        setCustomers(all);
    };

    const handleSearch = async (val) => {
        const results = await searchCustomers(val);
        setCustomers(results);
    };

    const handleAdd = async () => {
        if (!formData.name.trim()) {
            showToast('Name is required', 'error');
            return;
        }

        try {
            await addCustomer(formData);
            showToast('Customer added');
            setShowAddModal(false);
            setFormData({ name: '', phone: '' });
            loadCustomers();
        } catch (err) {
            showToast('Failed to add customer', 'error');
        }
    };

    const handleSettle = async () => {
        const amount = parseFloat(settleAmount);
        if (!amount || amount <= 0) {
            showToast('Enter valid amount', 'error');
            return;
        }

        try {
            // Negative amount to reduce balance
            await updateCustomerBalance(showSettleModal.id, -amount);

            // We should ideally record this settlement transaction 
            // For now we just update balance

            showToast('Payment settled');
            setShowSettleModal(null);
            setSettleAmount('');
            loadCustomers();
        } catch (err) {
            showToast('Settlement failed', 'error');
        }
    };

    const viewHistory = async (customer) => {
        const hist = await getCustomerHistory(customer.id);
        setHistory(hist.reverse()); // Newest first
        setShowHistoryModal(customer);
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h1>Customers</h1>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
                    <UserPlus size={16} /> Add
                </button>
            </div>

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
                {customers.length === 0 ? (
                    <div className="empty-state">
                        <Users size={48} />
                        <h3>No Customers</h3>
                        <p>Add customers to manage credit/udhaar</p>
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
                                        onClick={(e) => { e.stopPropagation(); setShowSettleModal(c); }}
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
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Raju Bhai"
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input
                                className="form-input"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="Optional"
                            />
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
                                onChange={(e) => setSettleAmount(e.target.value)}
                                placeholder="0.00"
                                style={{ fontSize: '1.5rem', textAlign: 'center', fontWeight: 600 }}
                                autoFocus
                            />
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
                                {history.map(h => (
                                    <div key={h.id} className="history-item">
                                        <div>
                                            <div style={{ fontWeight: 500 }}>
                                                {h.refunded ? 'Refunded Sale' : 'Purchase'}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {new Date(h.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{
                                            fontWeight: 600,
                                            color: h.refunded ? 'var(--text-muted)' : 'var(--danger-400)',
                                            textDecoration: h.refunded ? 'line-through' : 'none'
                                        }}>
                                            -{currency}{h.total.toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
