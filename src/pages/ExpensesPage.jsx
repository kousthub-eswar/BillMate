import { useState, useEffect } from 'react';
import {
    ShoppingCart, Truck, Zap, Home, MoreHorizontal,
    Plus, Trash2, Wallet, RotateCcw, AlertTriangle
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import {
    addExpense, getTodayExpenses, deleteExpense, getSetting, getTodayExpenseTotal
} from '../database';
import { useToast } from '../components/Toast';

const EXPENSE_TYPES = [
    { type: 'Stock Purchase', icon: ShoppingCart, color: 'rgba(99, 102, 241, 0.15)', iconColor: 'var(--primary-400)' },
    { type: 'Transport', icon: Truck, color: 'rgba(251, 191, 36, 0.15)', iconColor: 'var(--warning-400)' },
    { type: 'Electricity', icon: Zap, color: 'rgba(16, 185, 129, 0.15)', iconColor: 'var(--accent-400)' },
    { type: 'Rent', icon: Home, color: 'rgba(239, 68, 68, 0.15)', iconColor: 'var(--danger-400)' },
    { type: 'Other', icon: MoreHorizontal, color: 'rgba(148, 163, 184, 0.15)', iconColor: 'var(--text-secondary)' }
];

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState([]);
    const [selectedType, setSelectedType] = useState(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [currency, setCurrency] = useState('₹');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const [errors, setErrors] = useState({});
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [todayTotal, setTodayTotal] = useState(0);
    const showToast = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadExpenses = async () => {
        setLoading(true);
        setError(false);
        try {
            const [result, total] = await Promise.all([
                getTodayExpenses(page, 25),
                getTodayExpenseTotal()
            ]);
            setExpenses(result.data);
            setTotalCount(result.count);
            setTodayTotal(total);
        } catch (err) {
            setError(true);
            showToast('Failed to load expenses', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadExpenses();
        loadCurrency();
    }, [page]);

    const handleAddExpense = async () => {
        const newErrors = {};
        const parsedAmount = parseFloat(amount);

        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            newErrors.amount = 'Amount must be greater than zero';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            showToast('Please correct the validation errors', 'error');
            return;
        }

        try {
            await addExpense({
                type: selectedType,
                amount: parsedAmount,
                note: note.trim()
            });
            showToast('Expense added');
            setSelectedType(null);
            setAmount('');
            setNote('');
            setErrors({});
            loadExpenses();
        } catch (_err) {
            showToast('Failed to add expense', 'error');
        }
    };

    const handleDelete = async (id) => {
        await deleteExpense(id);
        setShowDeleteConfirm(null);
        showToast('Expense deleted');
        loadExpenses();
    };


    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTypeConfig = (type) => {
        return EXPENSE_TYPES.find(t => t.type === type) || EXPENSE_TYPES[4];
    };

    return (
        <div className="page-content">
            <AppHeader title="Expenses">
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger-400)' }}>
                    {currency}{todayTotal.toFixed(2)}
                </div>
            </AppHeader>

            {/* Quick Expense Type Buttons */}
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Expense Type
            </div>
            <div className="expense-type-grid">
                {/* eslint-disable-next-line no-unused-vars */}
                {EXPENSE_TYPES.map(({ type, icon: Icon, color, iconColor }) => (
                    <button
                        key={type}
                        className={`expense-type-btn ${selectedType === type ? 'selected' : ''}`}
                        onClick={() => {
                            setSelectedType(selectedType === type ? null : type);
                            setErrors({});
                        }}
                    >
                        <div className="expense-type-icon" style={{ background: color, color: iconColor }}>
                            <Icon size={20} />
                        </div>
                        <span className="expense-type-label">{type}</span>
                    </button>
                ))}
            </div>

            {/* Amount Input (shown when type is selected) */}
            {selectedType && (
                <div className="expense-form" style={{ animation: 'scaleIn 0.2s ease' }}>
                    <div className="form-group">
                        <label className="form-label">Amount ({currency})</label>
                        <input
                            className="form-input"
                            type="number"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => {
                                setAmount(e.target.value);
                                if (errors.amount) setErrors(prev => ({ ...prev, amount: null }));
                            }}
                            autoFocus
                            id="expense-amount"
                            style={{ fontSize: '1.2rem', fontWeight: 600, textAlign: 'center' }}
                        />
                        {errors.amount && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500, textAlign: 'center' }}>{errors.amount}</p>}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Note (optional)</label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="e.g. Weekly vegetables stock"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            id="expense-note"
                        />
                    </div>

                    <button
                        className="btn btn-primary btn-block btn-lg"
                        onClick={handleAddExpense}
                        disabled={!amount || parseFloat(amount) <= 0}
                        id="add-expense-btn"
                    >
                        <Plus size={18} /> Add {selectedType} Expense
                    </button>
                </div>
            )}

            {/* Today's Expense List */}
            <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Today's Expenses ({expenses.length})
                </div>

                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                        {[1, 2, 3].map(i => (
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
                            Failed to load expenses. Please check your connection and try again.
                        </p>
                        <button
                            onClick={loadExpenses}
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
                ) : expenses.length === 0 ? (
                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                        <Wallet size={44} />
                        <h3>No Expenses Today</h3>
                        <p>Tap a category above to record your first expense for the day.</p>
                    </div>
                ) : (
                    expenses.map(expense => {
                        const config = getTypeConfig(expense.type);
                        const Icon = config.icon;
                        return (
                            <div key={expense.id} className="expense-item">
                                <div className="expense-item-icon" style={{ background: config.color, color: config.iconColor }}>
                                    <Icon size={18} />
                                </div>
                                <div className="expense-item-info">
                                    <div className="expense-item-type">{expense.type}</div>
                                    <div className="expense-item-meta">
                                        {formatTime(expense.date)}
                                        {expense.note && <span> · {expense.note}</span>}
                                    </div>
                                </div>
                                <div className="expense-item-amount">
                                    -{currency}{expense.amount.toFixed(2)}
                                </div>
                                <button
                                    className="btn btn-ghost"
                                    style={{ padding: 4, color: 'var(--danger-400)' }}
                                    onClick={() => setShowDeleteConfirm(expense)}
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

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

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
                <ConfirmDialog
                    title="Delete Expense?"
                    message={`Are you sure you want to delete this ${showDeleteConfirm.type} expense of ${currency}${showDeleteConfirm.amount.toFixed(2)}?`}
                    confirmText="Delete"
                    variant="danger"
                    onConfirm={() => handleDelete(showDeleteConfirm.id)}
                    onCancel={() => setShowDeleteConfirm(null)}
                />
            )}
        </div>
    );
}
