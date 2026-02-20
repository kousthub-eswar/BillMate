import { useState, useEffect } from 'react';
import {
    ShoppingCart, Truck, Zap, Home, MoreHorizontal,
    Plus, Trash2, Wallet, ArrowDown
} from 'lucide-react';
import {
    addExpense, getTodayExpenses, deleteExpense, getSetting
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
    const showToast = useToast();

    useEffect(() => {
        loadExpenses();
        loadCurrency();
    }, []);

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadExpenses = async () => {
        const data = await getTodayExpenses();
        setExpenses(data);
    };

    const handleAddExpense = async () => {
        if (!selectedType || !amount || parseFloat(amount) <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }

        try {
            await addExpense({
                type: selectedType,
                amount: parseFloat(amount),
                note: note.trim()
            });
            showToast('Expense added');
            setSelectedType(null);
            setAmount('');
            setNote('');
            loadExpenses();
        } catch (err) {
            showToast('Failed to add expense', 'error');
        }
    };

    const handleDelete = async (id) => {
        await deleteExpense(id);
        setShowDeleteConfirm(null);
        showToast('Expense deleted');
        loadExpenses();
    };

    const todayTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

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
            <div className="page-header">
                <h1>Expenses</h1>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger-400)' }}>
                        {currency}{todayTotal.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Quick Expense Type Buttons */}
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Expense Type
            </div>
            <div className="expense-type-grid">
                {EXPENSE_TYPES.map(({ type, icon: Icon, color, iconColor }) => (
                    <button
                        key={type}
                        className={`expense-type-btn ${selectedType === type ? 'selected' : ''}`}
                        onClick={() => setSelectedType(selectedType === type ? null : type)}
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
                            onChange={(e) => setAmount(e.target.value)}
                            autoFocus
                            id="expense-amount"
                            style={{ fontSize: '1.2rem', fontWeight: 600, textAlign: 'center' }}
                        />
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

                {expenses.length === 0 ? (
                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                        <Wallet size={40} />
                        <h3>No Expenses Today</h3>
                        <p>Tap a category above to record an expense</p>
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

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
                <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Delete Expense?</div>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>
                            Remove <strong style={{ color: 'var(--text-primary)' }}>{showDeleteConfirm.type}</strong> expense
                            of <strong style={{ color: 'var(--danger-400)' }}>{currency}{showDeleteConfirm.amount.toFixed(2)}</strong>?
                        </p>
                        <div className="confirm-actions" style={{ marginTop: 20 }}>
                            <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm.id)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
