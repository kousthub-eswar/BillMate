import { useState, useEffect } from 'react';
import {
    Search, Plus, Edit2, Trash2, Package, X,
    ChevronRight, Star, Minus, Scan
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import {
    getAllProducts, addProduct, updateProduct,
    deleteProduct, adjustStock, getCategories, getSetting
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
    const [currency, setCurrency] = useState('₹');
    const showToast = useToast();

    useEffect(() => {
        loadProducts();
        loadCurrency();
    }, []);

    useEffect(() => {
        filterProducts();
    }, [query, activeCategory, products]);

    const loadCurrency = async () => {
        const c = await getSetting('currency');
        setCurrency(c);
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
                    ...formData,
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
        } catch (error) {
            showToast('Failed to save product', 'error');
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

    return (
        <div className="page-content">
            <div className="page-header">
                <h1>Products</h1>
                <button className="btn btn-primary btn-sm" onClick={openAdd} id="add-product-btn">
                    <Plus size={16} /> Add
                </button>
            </div>

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
                    <Package size={48} />
                    <h3>No Products</h3>
                    <p>Add products to start billing</p>
                </div>
            ) : (
                filtered.map(product => (
                    <div key={product.id} className="product-list-item" onClick={() => openEdit(product)}>
                        <div className="product-avatar">
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
                                <span className={`stock-badge ${product.stock_quantity <= 5 ? 'low' : 'ok'}`}>
                                    {product.stock_quantity} in stock
                                </span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="product-list-price">{currency}{product.selling_price}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                Cost: {currency}{product.cost_price}
                            </div>
                        </div>
                    </div>
                ))
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

                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
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
                <div className="modal-overlay" onClick={() => setShowDelete(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Delete Product?</div>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>
                            Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{showDelete.name}</strong>?
                        </p>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 20 }}>
                            This action cannot be undone.
                        </p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setShowDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => handleDelete(showDelete.id)}>Delete</button>
                        </div>
                    </div>
                </div>
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
        </div>
    );
}
