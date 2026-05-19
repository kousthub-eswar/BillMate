import { useState, useEffect, useRef } from 'react';
import {
    Search, Plus, Edit2, Trash2, Package, X,
    ChevronRight, Star, Minus, Scan, PackagePlus,
    AlertTriangle, Tags
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import BarcodeScanner from '../components/BarcodeScanner';
import {
    getAllProducts, addProduct, updateProduct,
    deleteProduct, adjustStock, getCategories, getSetting,
    quickRestock, getAllSuppliers, updateProductCategories
} from '../database';
import { useToast } from '../components/Toast';

const EMPTY_PRODUCT = {
    name: '',
    selling_price: '',
    cost_price: '',
    stock_quantity: '',
    category: 'General',
    frequently_used: false,
    barcode: ''
};

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [query, setQuery] = useState('');
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [showForm, setShowForm] = useState(false);
    const [showStockModal, setShowStockModal] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState(EMPTY_PRODUCT);
    const [stockProduct, setStockProduct] = useState(null);
    const [stockAdjust, setStockAdjust] = useState(0);
    const [showDelete, setShowDelete] = useState(null);
    const [showRestock, setShowRestock] = useState(null);
    const [restockQty, setRestockQty] = useState('');
    const [restockPrice, setRestockPrice] = useState('');
    const [restockSupplier, setRestockSupplier] = useState('');
    const [suppliers, setSuppliers] = useState([]);
    const [currency, setCurrency] = useState('₹');
    const [lowStockThreshold, setLowStockThreshold] = useState(5);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [editCategoryValue, setEditCategoryValue] = useState('');
    const [showDeleteCategory, setShowDeleteCategory] = useState(null);
    const showToast = useToast();

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
        const threshold = await getSetting('low_stock_threshold');
        setLowStockThreshold(parseInt(threshold) || 5);
    };

    const loadSuppliers = async () => {
        const sups = await getAllSuppliers();
        setSuppliers(sups);
    };

    const loadProducts = async () => {
        const all = await getAllProducts();
        setProducts(all);
        const cats = await getCategories();
        setCategories(['All', ...cats]);
    };

    const filterProducts = () => {
        let result = [...products];

        if (query.trim()) {
            result = result.filter(p =>
                p.name.toLowerCase().includes(query.toLowerCase())
            );
        }

        if (activeCategory !== 'All') {
            result = result.filter(p => p.category === activeCategory);
        }

        setFiltered(result);
    };

    useEffect(() => {
        loadProducts();
        loadCurrency();
        loadSuppliers();
    }, []);

    useEffect(() => {
        filterProducts();
    }, [query, activeCategory, products]);

    const openAdd = () => {
        setEditingProduct(null);
        setFormData(EMPTY_PRODUCT);
        setShowForm(true);
    };

    const openEdit = (product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            selling_price: product.selling_price.toString(),
            cost_price: product.cost_price.toString(),
            stock_quantity: product.stock_quantity.toString(),
            category: product.category || 'General',
            frequently_used: product.frequently_used,
            barcode: product.barcode || ''
        });
        setShowForm(true);
    };

    const openStock = (product) => {
        setStockProduct(product);
        setStockAdjust(0);
        setShowStockModal(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            showToast('Product name is required', 'error');
            return;
        }

        try {
            if (editingProduct) {
                await updateProduct(editingProduct.id, {
                    ...formData,
                    selling_price: parseFloat(formData.selling_price) || 0,
                    cost_price: parseFloat(formData.cost_price) || 0,
                    stock_quantity: parseInt(formData.stock_quantity) || 0,
                    frequently_used: formData.frequently_used ? 1 : 0
                });
                showToast('Product updated');
            } else {
                await addProduct({
                    ...formData,
                    frequently_used: formData.frequently_used ? 1 : 0,
                    barcode: formData.barcode || ''
                });
                showToast('Product added');
            }

            setShowForm(false);
            loadProducts();
        } catch (err) {
            showToast(err.message || 'Failed to save product', 'error');
        }
    };

    const handleDelete = async (id) => {
        await deleteProduct(id);
        setShowDelete(null);
        showToast('Product deleted');
        loadProducts();
    };

    const handleStockAdjust = async () => {
        if (stockAdjust === 0 || !stockProduct) return;
        await adjustStock(stockProduct.id, stockAdjust);
        setShowStockModal(false);
        showToast(`Stock ${stockAdjust > 0 ? 'added' : 'reduced'}`);
        loadProducts();
    };

    const openRestock = (product) => {
        setShowRestock(product);
        setRestockQty('');
        setRestockPrice(product.cost_price ? product.cost_price.toString() : '');
        setRestockSupplier('');
    };

    const handleRestock = async () => {
        const qty = parseInt(restockQty);
        const price = parseFloat(restockPrice);
        if (!qty || qty <= 0) {
            showToast('Enter a valid quantity', 'error');
            return;
        }
        if (!price || price < 0) {
            showToast('Enter a valid price', 'error');
            return;
        }
        try {
            await quickRestock(
                showRestock.id,
                qty,
                price,
                restockSupplier ? parseInt(restockSupplier) : null
            );
            showToast(`Restocked ${qty} units of ${showRestock.name}`);
            setShowRestock(null);
            loadProducts();
        } catch (err) {
            showToast(err.message || 'Restock failed', 'error');
        }
    };

    return (
        <div className="page-content">
            <AppHeader title="Products">
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowCategoryManager(true)} id="manage-categories-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Tags size={14} /> Categories
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={openAdd} id="add-product-btn">
                        <Plus size={16} /> Add
                    </button>
                </div>
            </AppHeader>

            {/* Search */}
            <div className="search-bar">
                <Search />
                <input
                    type="text"
                    placeholder="Search products..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    id="product-search-list"
                />
            </div>

            {/* Category Chips */}
            {categories.length > 1 && (
                <div className="category-chips">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            className={`category-chip ${activeCategory === cat ? 'active' : ''}`}
                            onClick={() => setActiveCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {/* Product List */}
            {filtered.length === 0 ? (
                <div className="empty-state">
                    <Package size={52} />
                    <h3>{query.trim() ? 'No Matching Products' : 'No Products Yet'}</h3>
                    <p>{query.trim() ? `No products match "${query}"` : 'Tap the + button to add your first product and start billing.'}</p>
                    {!query.trim() && (
                        <button className="btn btn-primary" onClick={openAdd}>
                            <Plus size={18} /> Add First Product
                        </button>
                    )}
                </div>
            ) : (
                filtered.map(product => {
                    const isOutOfStock = product.stock_quantity <= 0;
                    const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= lowStockThreshold;
                    return (
                        <div key={product.id} className={`product-list-item ${isOutOfStock ? 'out-of-stock' : ''}`} onClick={() => openEdit(product)}>
                            <div className="product-avatar" style={
                                isOutOfStock ? { background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', opacity: 0.7 } :
                                isLowStock ? { background: 'linear-gradient(135deg, #92400e, #b45309)' } : {}
                            }>
                                {product.frequently_used ? (
                                    <Star size={18} />
                                ) : (
                                    product.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="product-list-info">
                                <div className="product-list-name">{product.name}</div>
                                <div className="product-list-meta">
                                    <span>{product.category}</span>
                                    <span className={`stock-badge ${isOutOfStock ? 'out' : isLowStock ? 'low' : 'ok'}`}>
                                        {isOutOfStock ? (
                                            <><AlertTriangle size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} /> Out of stock</>
                                        ) : isLowStock ? (
                                            <><AlertTriangle size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} /> {product.stock_quantity} left</>
                                        ) : (
                                            <>{product.stock_quantity} in stock</>
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="product-list-price">{currency}{product.selling_price}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                        Cost: {currency}{product.cost_price}
                                    </div>
                                </div>
                                {(isOutOfStock || isLowStock) && (
                                    <button
                                        className="btn btn-sm"
                                        onClick={(e) => { e.stopPropagation(); openRestock(product); }}
                                        id={`quick-restock-${product.id}`}
                                        style={{
                                            padding: '6px 10px',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            background: isOutOfStock ? 'rgba(239, 68, 68, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                                            color: isOutOfStock ? 'var(--danger-400)' : 'var(--warning-400)',
                                            border: `1px solid ${isOutOfStock ? 'rgba(239, 68, 68, 0.25)' : 'rgba(251, 191, 36, 0.25)'}`,
                                            borderRadius: 8,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        <PackagePlus size={12} /> Restock
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })
            )}

            {/* Add/Edit Product Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">
                            {editingProduct ? 'Edit Product' : 'Add Product'}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Product Name</label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="e.g. Notebook"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                id="product-name-input"
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label className="form-label">Selling Price</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.selling_price}
                                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                                    id="selling-price-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Cost Price</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.cost_price}
                                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                                    id="cost-price-input"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label className="form-label">Stock Quantity</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0"
                                    value={formData.stock_quantity}
                                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                                    id="stock-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="General"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    id="category-input"
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Barcode (Optional)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="Scan or type barcode"
                                    value={formData.barcode}
                                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                />
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowScanner(true)}
                                    style={{ padding: '0 12px' }}
                                >
                                    <Scan size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="toggle-row">
                            <span style={{ fontSize: '0.85rem' }}>
                                <Star size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--warning-400)' }} />
                                Frequently Used
                            </span>
                            <div
                                className={`toggle-switch ${formData.frequently_used ? 'active' : ''}`}
                                onClick={() => setFormData({ ...formData, frequently_used: !formData.frequently_used })}
                            />
                        </div>

                        <div style={{
                            position: 'sticky',
                            bottom: -24,
                            background: 'var(--bg-secondary)',
                            paddingTop: 16,
                            paddingBottom: 24,
                            marginTop: 16,
                            marginInline: -22,
                            paddingInline: 22,
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            gap: 12,
                            zIndex: 10
                        }}>
                            {editingProduct && (
                                <>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => { setShowForm(false); openStock(editingProduct); }}
                                        style={{ flex: 1 }}
                                    >
                                        Adjust Stock
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => { setShowForm(false); openRestock(editingProduct); }}
                                        style={{ flex: 1 }}
                                    >
                                        <PackagePlus size={14} /> Restock
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => { setShowForm(false); setShowDelete(editingProduct); }}
                                        style={{ width: 48 }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                            <button className="btn btn-primary" onClick={handleSave} style={{ flex: 2 }} id="save-product">
                                {editingProduct ? 'Update' : 'Add Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stock Adjustment Modal */}
            {showStockModal && stockProduct && (
                <div className="modal-overlay" onClick={() => setShowStockModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Adjust Stock</div>

                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stockProduct.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                Current: {stockProduct.stock_quantity}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
                            <button
                                className="qty-btn"
                                style={{ width: 48, height: 48, fontSize: '1.2rem' }}
                                onClick={() => setStockAdjust(prev => prev - 1)}
                            >
                                <Minus size={20} />
                            </button>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    fontSize: '2rem',
                                    fontWeight: 700,
                                    color: stockAdjust >= 0 ? 'var(--accent-400)' : 'var(--danger-400)'
                                }}>
                                    {stockAdjust > 0 ? `+${stockAdjust}` : stockAdjust}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    New: {Math.max(0, stockProduct.stock_quantity + stockAdjust)}
                                </div>
                            </div>
                            <button
                                className="qty-btn"
                                style={{ width: 48, height: 48, fontSize: '1.2rem' }}
                                onClick={() => setStockAdjust(prev => prev + 1)}
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        <button
                            className="btn btn-primary btn-block"
                            onClick={handleStockAdjust}
                            disabled={stockAdjust === 0}
                        >
                            Apply Adjustment
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {showDelete && (
                <ConfirmDialog
                    title="Delete Product?"
                    message={`Are you sure you want to delete ${showDelete.name}? This action cannot be undone.`}
                    confirmText="Delete"
                    variant="danger"
                    onConfirm={() => handleDelete(showDelete.id)}
                    onCancel={() => setShowDelete(null)}
                />
            )}

            {/* Barcode Scanner Modal */}
            {showScanner && (
                <BarcodeScanner
                    onScan={(code) => {
                        setFormData(prev => ({ ...prev, barcode: code }));
                        setShowScanner(false);
                        showToast(`Scanned: ${code}`);
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {/* Quick Restock Modal */}
            {showRestock && (
                <div className="modal-overlay" onClick={() => setShowRestock(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">
                            <PackagePlus size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                            Restock Product
                        </div>

                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>{showRestock.name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                Current stock: {showRestock.stock_quantity} | Cost: {currency}{showRestock.cost_price}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label className="form-label">Quantity *</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0"
                                    value={restockQty}
                                    onChange={(e) => setRestockQty(e.target.value)}
                                    autoFocus
                                    min="1"
                                    id="restock-qty"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Purchase Price ({currency})</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0.00"
                                    value={restockPrice}
                                    onChange={(e) => setRestockPrice(e.target.value)}
                                    min="0"
                                    step="0.01"
                                    id="restock-price"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Supplier (Optional)</label>
                            <select
                                className="form-input"
                                value={restockSupplier}
                                onChange={(e) => setRestockSupplier(e.target.value)}
                                id="restock-supplier"
                            >
                                <option value="">No supplier</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        {restockQty && restockPrice && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                background: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 16
                            }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Total Cost</span>
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-400)' }}>
                                    {currency}{(parseInt(restockQty || 0) * parseFloat(restockPrice || 0)).toFixed(2)}
                                </span>
                            </div>
                        )}

                        <button
                            className="btn btn-success btn-block"
                            onClick={handleRestock}
                            disabled={!restockQty || !restockPrice}
                            style={{ opacity: (!restockQty || !restockPrice) ? 0.5 : 1 }}
                            id="confirm-restock"
                        >
                            <PackagePlus size={18} /> Restock Now
                        </button>
                    </div>
                </div>
            )}

            {/* Category Manager Modal */}
            {showCategoryManager && (
                <div className="modal-overlay" onClick={() => { setShowCategoryManager(false); setEditingCategory(null); }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tags size={20} style={{ color: 'var(--primary-400)' }} />
                            Manage Categories
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                            Rename or delete categories. Deleting moves products to "General".
                        </div>

                        {categories.filter(c => c !== 'All').length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No categories yet. They appear when you assign categories to products.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '50vh', overflowY: 'auto' }}>
                                {categories.filter(c => c !== 'All').map(cat => {
                                    const productCount = products.filter(p => p.category === cat).length;
                                    return (
                                        <div key={cat} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '12px 14px',
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            transition: 'all 0.15s ease'
                                        }}>
                                            {editingCategory === cat ? (
                                                <>
                                                    <input
                                                        className="form-input"
                                                        type="text"
                                                        value={editCategoryValue}
                                                        onChange={(e) => setEditCategoryValue(e.target.value)}
                                                        autoFocus
                                                        style={{ flex: 1, padding: '8px 10px', fontSize: '0.85rem' }}
                                                        onKeyDown={async (e) => {
                                                            if (e.key === 'Enter' && editCategoryValue.trim()) {
                                                                try {
                                                                    await updateProductCategories(cat, editCategoryValue.trim());
                                                                    showToast(`Renamed "${cat}" → "${editCategoryValue.trim()}"`);
                                                                    setEditingCategory(null);
                                                                    loadProducts();
                                                                } catch (err) {
                                                                    showToast(err.message || 'Rename failed', 'error');
                                                                }
                                                            }
                                                            if (e.key === 'Escape') setEditingCategory(null);
                                                        }}
                                                    />
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                                                        onClick={async () => {
                                                            if (!editCategoryValue.trim()) return;
                                                            try {
                                                                await updateProductCategories(cat, editCategoryValue.trim());
                                                                showToast(`Renamed "${cat}" → "${editCategoryValue.trim()}"`);
                                                                setEditingCategory(null);
                                                                loadProducts();
                                                            } catch (err) {
                                                                showToast(err.message || 'Rename failed', 'error');
                                                            }
                                                        }}
                                                    >Save</button>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                                                        onClick={() => setEditingCategory(null)}
                                                    ><X size={14} /></button>
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{cat}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                            {productCount} product{productCount !== 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ padding: '6px 10px' }}
                                                        onClick={() => { setEditingCategory(cat); setEditCategoryValue(cat); }}
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{
                                                            padding: '6px 10px',
                                                            background: 'rgba(239, 68, 68, 0.08)',
                                                            color: 'var(--danger-400)',
                                                            border: '1px solid rgba(239, 68, 68, 0.2)'
                                                        }}
                                                        onClick={() => setShowDeleteCategory(cat)}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            className="btn btn-secondary btn-block"
                            onClick={() => { setShowCategoryManager(false); setEditingCategory(null); }}
                            style={{ marginTop: 16 }}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Category Confirmation */}
            {showDeleteCategory && (
                <ConfirmDialog
                    title={`Delete "${showDeleteCategory}"?`}
                    message={`All products in "${showDeleteCategory}" will be moved to "General". This cannot be undone.`}
                    confirmText="Delete Category"
                    variant="danger"
                    onConfirm={async () => {
                        try {
                            await updateProductCategories(showDeleteCategory, 'General');
                            showToast(`Category "${showDeleteCategory}" removed`);
                            setShowDeleteCategory(null);
                            loadProducts();
                        } catch (err) {
                            showToast(err.message || 'Delete failed', 'error');
                        }
                    }}
                    onCancel={() => setShowDeleteCategory(null)}
                />
            )}
        </div>
    );
}
