import { useState, useEffect } from 'react';
import {
    Package, Plus, Search, Truck, X, ShoppingCart,
    Calendar, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import {
    getAllProducts, getAllSuppliers, createPurchase,
    getPurchases, getPurchaseById, deletePurchase,
    getSupplierById, getSetting
} from '../database';
import { useToast } from '../components/Toast';

export default function PurchasesPage() {
    const [purchases, setPurchases] = useState([]);
    const [filter, setFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [currency, setCurrency] = useState('₹');
    const [expandedId, setExpandedId] = useState(null);
    const [expandedItems, setExpandedItems] = useState([]);
    const [showDelete, setShowDelete] = useState(null);
    const [supplierNames, setSupplierNames] = useState({});

    // Form state
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [purchaseItems, setPurchaseItems] = useState([]);
    const [purchaseNotes, setPurchaseNotes] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [showProductPicker, setShowProductPicker] = useState(false);

    const showToast = useToast();

    const loadPurchases = async () => {
        const data = await getPurchases(filter);
        setPurchases(data);

        // Build a supplier name cache
        const names = {};
        for (const p of data) {
            if (p.supplier_id && !names[p.supplier_id]) {
                const sup = await getSupplierById(p.supplier_id);
                names[p.supplier_id] = sup ? sup.name : 'Unknown';
            }
        }
        setSupplierNames(prev => ({ ...prev, ...names }));
    };

    const loadFormData = async () => {
        const [sups, prods, curr] = await Promise.all([
            getAllSuppliers(),
            getAllProducts(),
            getSetting('currency')
        ]);
        setSuppliers(sups);
        setProducts(prods);
        setCurrency(curr);
    };

    useEffect(() => {
        loadPurchases();
        loadFormData();
    }, []);

    useEffect(() => {
        loadPurchases();
    }, [filter]);

    const openNewPurchase = () => {
        setSelectedSupplier('');
        setPurchaseItems([]);
        setPurchaseNotes('');
        setProductSearch('');
        setShowForm(true);
    };

    const addProductToOrder = (product) => {
        const existing = purchaseItems.find(item => item.product_id === product.id);
        if (existing) {
            setPurchaseItems(purchaseItems.map(item =>
                item.product_id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ));
        } else {
            setPurchaseItems([...purchaseItems, {
                product_id: product.id,
                product_name: product.name,
                quantity: 1,
                purchase_price: product.cost_price || 0
            }]);
        }
        setShowProductPicker(false);
        setProductSearch('');
    };

    const updateItem = (index, field, value) => {
        const updated = [...purchaseItems];
        updated[index] = { ...updated[index], [field]: value };
        setPurchaseItems(updated);
    };

    const removeItem = (index) => {
        setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
    };

    const totalCost = purchaseItems.reduce(
        (sum, item) => sum + (item.quantity * item.purchase_price), 0
    );

    const handleSavePurchase = async () => {
        if (!selectedSupplier) {
            showToast('Please select a supplier', 'error');
            return;
        }
        if (purchaseItems.length === 0) {
            showToast('Add at least one product', 'error');
            return;
        }
        // Validate quantities
        for (const item of purchaseItems) {
            if (!item.quantity || item.quantity <= 0) {
                showToast(`Invalid quantity for ${item.product_name}`, 'error');
                return;
            }
        }

        try {
            await createPurchase(parseInt(selectedSupplier), purchaseItems, purchaseNotes);
            showToast('Purchase recorded & stock updated');
            setShowForm(false);
            loadPurchases();
            loadFormData();
        } catch (err) {
            showToast(err.message || 'Failed to save purchase', 'error');
        }
    };

    const handleExpand = async (purchaseId) => {
        if (expandedId === purchaseId) {
            setExpandedId(null);
            setExpandedItems([]);
            return;
        }
        const purchase = await getPurchaseById(purchaseId);
        setExpandedItems(purchase?.items || []);
        setExpandedId(purchaseId);
    };

    const handleDelete = async (id) => {
        try {
            await deletePurchase(id);
            showToast('Purchase deleted & stock reversed');
            setShowDelete(null);
            loadPurchases();
            loadFormData();
        } catch (err) {
            showToast('Failed to delete purchase', 'error');
        }
    };

    const formatCurrency = (val) => {
        const num = Number(val);
        if (num === 0) return `${currency}0`;
        return num % 1 === 0
            ? `${currency}${num.toLocaleString('en-IN')}`
            : `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase())
    );

    const filters = [
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'all', label: 'All' }
    ];

    return (
        <div className="page-content">
            <AppHeader title="Purchases">
                <button className="btn btn-primary btn-sm" onClick={openNewPurchase} id="new-purchase-btn">
                    <Plus size={16} /> New
                </button>
            </AppHeader>

            {/* Filter Tabs */}
            <div className="filter-tabs">
                {filters.map(f => (
                    <button
                        key={f.key}
                        className={`filter-tab ${filter === f.key ? 'active' : ''}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Summary Card */}
            {purchases.length > 0 && (
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {purchases.length} Purchase{purchases.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-400)' }}>
                        {formatCurrency(purchases.reduce((s, p) => s + (p.total_cost || 0), 0))}
                    </div>
                </div>
            )}

            {/* Purchases List */}
            {purchases.length === 0 ? (
                <div className="empty-state">
                    <Package size={52} />
                    <h3>No Purchases Yet</h3>
                    <p>Record your first stock purchase to track inventory intake from suppliers.</p>
                    <button className="btn btn-primary" onClick={openNewPurchase}>
                        <Plus size={18} /> Record Purchase
                    </button>
                </div>
            ) : (
                purchases.map(purchase => (
                    <div key={purchase.id} className="sale-card" onClick={() => handleExpand(purchase.id)} style={{ cursor: 'pointer' }}>
                        <div className="sale-card-header">
                            <div>
                                <div className="sale-card-id">Purchase #{purchase.id}</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                                    <Truck size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    {supplierNames[purchase.supplier_id] || 'Unknown Supplier'}
                                </div>
                            </div>
                            <div className="sale-card-amount" style={{ color: 'var(--info-400)' }}>
                                {formatCurrency(purchase.total_cost)}
                            </div>
                        </div>
                        <div className="sale-card-details">
                            <span>
                                <Calendar size={12} />
                                {new Date(purchase.date).toLocaleDateString('en-IN', {
                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                            </span>
                            <span>
                                {expandedId === purchase.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {expandedId === purchase.id ? 'Less' : 'Details'}
                            </span>
                        </div>

                        {/* Expanded Items */}
                        {expandedId === purchase.id && (
                            <div className="sale-items-list" onClick={(e) => e.stopPropagation()}>
                                {purchase.notes && (
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                                        {purchase.notes}
                                    </div>
                                )}
                                {expandedItems.map((item, i) => (
                                    <div key={i} className="sale-item-row">
                                        <span>{item.product_name} × {item.quantity}</span>
                                        <span>{formatCurrency(item.quantity * item.purchase_price)}</span>
                                    </div>
                                ))}
                                <div className="sale-actions">
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={(e) => { e.stopPropagation(); setShowDelete(purchase); }}
                                        style={{ flex: 1 }}
                                    >
                                        <Trash2 size={14} /> Delete Purchase
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}

            {/* New Purchase Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
                        <div className="modal-handle" />
                        <div className="modal-title">New Purchase Order</div>

                        {/* Supplier Selection */}
                        <div className="form-group">
                            <label className="form-label">Supplier *</label>
                            <select
                                className="form-input"
                                value={selectedSupplier}
                                onChange={(e) => setSelectedSupplier(e.target.value)}
                                id="purchase-supplier-select"
                            >
                                <option value="">Select supplier...</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Add Products */}
                        <div className="form-group">
                            <label className="form-label">Products</label>
                            <button
                                className="btn btn-secondary btn-block"
                                onClick={() => setShowProductPicker(true)}
                                style={{ justifyContent: 'flex-start', gap: 8 }}
                            >
                                <Plus size={16} /> Add Product
                            </button>
                        </div>

                        {/* Purchase Items List */}
                        {purchaseItems.length > 0 && (
                            <div style={{ marginBottom: 18 }}>
                                {purchaseItems.map((item, index) => (
                                    <div key={index} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '12px',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: 8
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.product_name}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>Qty</div>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                                        style={{ padding: '6px 8px', fontSize: '0.85rem' }}
                                                        min="1"
                                                    />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>Price ({currency})</div>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={item.purchase_price}
                                                        onChange={(e) => updateItem(index, 'purchase_price', parseFloat(e.target.value) || 0)}
                                                        style={{ padding: '6px 8px', fontSize: '0.85rem' }}
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', marginLeft: 4 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-400)', marginBottom: 4 }}>
                                                {formatCurrency(item.quantity * item.purchase_price)}
                                            </div>
                                            <button
                                                onClick={() => removeItem(index)}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius-sm)',
                                                    padding: '4px 8px',
                                                    cursor: 'pointer',
                                                    color: 'var(--danger-400)'
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Total */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '14px 16px',
                                    background: 'rgba(14, 165, 233, 0.08)',
                                    border: '1px solid rgba(14, 165, 233, 0.2)',
                                    borderRadius: 'var(--radius-md)',
                                    marginTop: 4
                                }}>
                                    <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Total Cost</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--info-400)' }}>
                                        {formatCurrency(totalCost)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="form-group">
                            <label className="form-label">Notes (Optional)</label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="e.g. Invoice #123"
                                value={purchaseNotes}
                                onChange={(e) => setPurchaseNotes(e.target.value)}
                            />
                        </div>

                        <button
                            className="btn btn-primary btn-block"
                            onClick={handleSavePurchase}
                            disabled={!selectedSupplier || purchaseItems.length === 0}
                            style={{
                                opacity: (!selectedSupplier || purchaseItems.length === 0) ? 0.5 : 1
                            }}
                            id="save-purchase"
                        >
                            <ShoppingCart size={18} /> Save Purchase
                        </button>
                    </div>
                </div>
            )}

            {/* Product Picker Modal */}
            {showProductPicker && (
                <div className="modal-overlay" onClick={() => setShowProductPicker(false)} style={{ zIndex: 2100 }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '70vh' }}>
                        <div className="modal-handle" />
                        <div className="modal-title">Select Product</div>

                        <div className="search-bar" style={{ marginBottom: 12 }}>
                            <Search />
                            <input
                                type="text"
                                placeholder="Search products..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
                            {filteredProducts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No matching products
                                </div>
                            ) : (
                                filteredProducts.map(product => (
                                    <div
                                        key={product.id}
                                        className="product-list-item"
                                        onClick={() => addProductToOrder(product)}
                                    >
                                        <div className="product-avatar">
                                            {product.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="product-list-info">
                                            <div className="product-list-name">{product.name}</div>
                                            <div className="product-list-meta">
                                                <span>{product.category}</span>
                                                <span className={`stock-badge ${product.stock_quantity <= 5 ? 'low' : 'ok'}`}>
                                                    {product.stock_quantity} in stock
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Cost: {currency}{product.cost_price}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {showDelete && (
                <ConfirmDialog
                    title="Delete Purchase?"
                    message={`Are you sure you want to delete Purchase #${showDelete.id}? Stock quantities will be reversed.`}
                    confirmText="Delete"
                    variant="danger"
                    onConfirm={() => handleDelete(showDelete.id)}
                    onCancel={() => setShowDelete(null)}
                />
            )}
        </div>
    );
}
