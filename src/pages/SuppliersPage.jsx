import { useState, useEffect } from 'react';
import {
    Truck, UserPlus, Search, Phone, MapPin,
    Edit2, Trash2, X, ChevronRight, Package,
    Calendar, DollarSign, RotateCcw, AlertTriangle
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import {
    getAllSuppliers, addSupplier, updateSupplier,
    deleteSupplier, searchSuppliers, getSupplierStats,
    getSetting, getPurchasesBySupplier
} from '../database';
import { useToast } from '../components/Toast';

const EMPTY_SUPPLIER = {
    name: '',
    phone: '',
    address: '',
    notes: ''
};

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [query, setQuery] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [formData, setFormData] = useState(EMPTY_SUPPLIER);
    const [showDelete, setShowDelete] = useState(null);
    const [showDetail, setShowDetail] = useState(null);
    const [supplierDetail, setSupplierDetail] = useState(null);
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [currency, setCurrency] = useState('₹');
    const [supplierStats, setSupplierStats] = useState({});
    const showToast = useToast();
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
    };

    const loadSuppliers = async () => {
        setLoading(true);
        setError(false);
        try {
            const all = await getAllSuppliers();
            // Enrich with stats
            const withStats = await Promise.all(all.map(async (s) => {
                const stats = await getSupplierStats(s.id);
                return { ...s, ...stats };
            }));
            // Sort by total spend descending
            withStats.sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0));
            setSuppliers(withStats);
        } catch (err) {
            setError(true);
            showToast('Failed to load suppliers', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSuppliers();
        loadCurrency();
    }, []);

    useEffect(() => {
        if (query.trim()) {
            (async () => {
                setLoading(true);
                setError(false);
                try {
                    const results = await searchSuppliers(query);
                    const withStats = await Promise.all(results.map(async (s) => {
                        const stats = await getSupplierStats(s.id);
                        return { ...s, ...stats };
                    }));
                    setSuppliers(withStats);
                } catch (err) {
                    setError(true);
                    showToast('Failed to search suppliers', 'error');
                } finally {
                    setLoading(false);
                }
            })();
        } else {
            loadSuppliers();
        }
    }, [query]);

    const openAdd = () => {
        setErrors({});
        setEditingSupplier(null);
        setFormData(EMPTY_SUPPLIER);
        setShowForm(true);
    };

    const openEdit = (supplier) => {
        setErrors({});
        setEditingSupplier(supplier);
        setFormData({
            name: supplier.name,
            phone: supplier.phone || '',
            address: supplier.address || '',
            notes: supplier.notes || ''
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        const newErrors = {};
        const trimmedName = formData.name.trim();
        const trimmedPhone = (formData.phone || '').trim();
        const trimmedAddress = (formData.address || '').trim();
        const trimmedNotes = (formData.notes || '').trim();

        if (!trimmedName) {
            newErrors.name = 'Supplier name is required';
        } else if (trimmedName.length > 100) {
            newErrors.name = 'Supplier name cannot exceed 100 characters';
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
            const payload = {
                name: trimmedName,
                phone: trimmedPhone,
                address: trimmedAddress,
                notes: trimmedNotes
            };

            if (editingSupplier) {
                await updateSupplier(editingSupplier.id, payload);
                showToast('Supplier updated');
            } else {
                await addSupplier(payload);
                showToast('Supplier added');
            }
            setShowForm(false);
            loadSuppliers();
        } catch (err) {
            showToast(err.message || 'Failed to save supplier', 'error');
        }
    };

    const handleDelete = async (id) => {
        await deleteSupplier(id);
        setShowDelete(null);
        showToast('Supplier deleted');
        loadSuppliers();
    };

    const viewDetail = async (supplier) => {
        const stats = await getSupplierStats(supplier.id);
        setSupplierDetail({ ...supplier, ...stats });
        setSupplierStats(stats);
        const history = await getPurchasesBySupplier(supplier.id);
        setPurchaseHistory(history.sort((a, b) => new Date(b.date) - new Date(a.date)));
        setShowDetail(supplier);
    };

    const formatCurrency = (val) => {
        const num = Number(val);
        if (num === 0) return `${currency}0`;
        return num % 1 === 0
            ? `${currency}${num.toLocaleString('en-IN')}`
            : `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="page-content">
            <AppHeader title="Suppliers">
                <button className="btn btn-primary btn-sm" onClick={openAdd} id="add-supplier-btn">
                    <UserPlus size={16} /> Add
                </button>
            </AppHeader>

            {/* Search */}
            <div className="search-bar">
                <Search />
                <input
                    type="text"
                    placeholder="Search suppliers..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    id="supplier-search"
                />
            </div>

            {/* Stats Summary */}
            {suppliers.length > 0 && (
                <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Suppliers</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary-400)' }}>
                        {suppliers.length}
                    </div>
                </div>
            )}

            {/* Supplier List */}
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
                        Failed to load suppliers. Please check your connection and try again.
                    </p>
                    <button
                        onClick={() => {
                            if (query.trim()) {
                                setQuery(query);
                            } else {
                                loadSuppliers();
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
            ) : suppliers.length === 0 ? (
                <div className="empty-state">
                    <Truck size={52} />
                    <h3>{query.trim() ? 'No Matching Suppliers' : 'No Suppliers Yet'}</h3>
                    <p>{query.trim() ? `No suppliers match "${query}"` : 'Add your first supplier to track purchases and inventory intake.'}</p>
                    {!query.trim() && (
                        <button className="btn btn-primary" onClick={openAdd}>
                            <UserPlus size={18} /> Add Supplier
                        </button>
                    )}
                </div>
            ) : (
                <div className="customer-list">
                    {suppliers.map(s => (
                        <div key={s.id} className="customer-item" onClick={() => viewDetail(s)}>
                            <div className="customer-avatar" style={{ background: 'linear-gradient(135deg, var(--info-500), var(--info-400))' }}>
                                {s.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="customer-info">
                                <div className="customer-name">{s.name}</div>
                                <div className="customer-phone">
                                    <Phone size={10} style={{ marginRight: 4 }} />
                                    {s.phone || 'No phone'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-400)' }}>
                                    {formatCurrency(s.totalSpend || 0)}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    {s.totalPurchases || 0} orders
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Supplier Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">
                            {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Name *</label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="e.g. Sharma Traders"
                                value={formData.name}
                                onChange={(e) => {
                                    setFormData({ ...formData, name: e.target.value });
                                    if (errors.name) setErrors(prev => ({ ...prev, name: null }));
                                }}
                                autoFocus
                                id="supplier-name-input"
                            />
                            {errors.name && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.name}</p>}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input
                                className="form-input"
                                type="tel"
                                placeholder="Optional"
                                value={formData.phone}
                                onChange={(e) => {
                                    setFormData({ ...formData, phone: e.target.value });
                                    if (errors.phone) setErrors(prev => ({ ...prev, phone: null }));
                                }}
                                id="supplier-phone-input"
                            />
                            {errors.phone && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.phone}</p>}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Address</label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="Optional"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                id="supplier-address-input"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Notes</label>
                            <textarea
                                className="form-input"
                                placeholder="Any notes about this supplier..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                style={{ minHeight: 80 }}
                                id="supplier-notes-input"
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            {editingSupplier && (
                                <button
                                    className="btn btn-danger"
                                    onClick={() => { setShowForm(false); setShowDelete(editingSupplier); }}
                                    style={{ width: 48 }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1 }} id="save-supplier">
                                {editingSupplier ? 'Update' : 'Add Supplier'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Supplier Detail Modal */}
            {showDetail && supplierDetail && (
                <div className="modal-overlay" onClick={() => setShowDetail(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh' }}>
                        <div className="modal-handle" />
                        <div className="modal-title">{supplierDetail.name}</div>

                        {/* Supplier Info */}
                        <div style={{ marginBottom: 20 }}>
                            {supplierDetail.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <Phone size={14} /> {supplierDetail.phone}
                                </div>
                            )}
                            {supplierDetail.address && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <MapPin size={14} /> {supplierDetail.address}
                                </div>
                            )}
                        </div>

                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                            <div style={{
                                padding: '14px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-400)' }}>
                                    {supplierStats.totalPurchases || 0}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Total Orders
                                </div>
                            </div>
                            <div style={{
                                padding: '14px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-400)' }}>
                                    {formatCurrency(supplierStats.totalSpend || 0)}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Total Spend
                                </div>
                            </div>
                        </div>

                        {supplierStats.lastPurchaseDate && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 18, fontSize: '0.8rem', color: 'var(--text-muted)',
                                padding: '10px 14px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <Calendar size={14} />
                                Last purchase: {new Date(supplierStats.lastPurchaseDate).toLocaleDateString('en-IN', {
                                    day: 'numeric', month: 'short', year: 'numeric'
                                })}
                            </div>
                        )}

                        {/* Purchase History */}
                        <div className="dashboard-section-header" style={{ marginBottom: 10 }}>
                            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <Package size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Purchase History
                            </h3>
                        </div>

                        {purchaseHistory.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: '0.82rem' }}>
                                No purchases from this supplier yet
                            </div>
                        ) : (
                            <div className="history-list" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                {purchaseHistory.map(p => (
                                    <div key={p.id} className="history-item">
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                                                Purchase #{p.id}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {new Date(p.date).toLocaleDateString('en-IN', {
                                                    day: 'numeric', month: 'short', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary-400)' }}>
                                            {formatCurrency(p.total_cost)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => { setShowDetail(null); openEdit(showDetail); }}
                                style={{ flex: 1 }}
                            >
                                <Edit2 size={16} /> Edit
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => { setShowDetail(null); setShowDelete(showDetail); }}
                                style={{ width: 48 }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {showDelete && (
                <ConfirmDialog
                    title="Delete Supplier?"
                    message={`Are you sure you want to delete ${showDelete.name}? This action cannot be undone.`}
                    confirmText="Delete"
                    variant="danger"
                    onConfirm={() => handleDelete(showDelete.id)}
                    onCancel={() => setShowDelete(null)}
                />
            )}
        </div>
    );
}
