import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search, Plus, Minus, Trash2, ShoppingBag,
    CreditCard, Smartphone, Banknote, ChevronRight,
    X, MessageCircle, Package, AlertTriangle, Users, Scan,
    Percent, Tag, ChevronDown, ChevronUp
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import BarcodeScanner from '../components/BarcodeScanner';
import {
    searchProducts, getFrequentProducts, createSale,
    getSaleById, getAllSettings, getAllCustomers,
    addProduct, getCategories
} from '../database';
import { generateReceipt, shareOnWhatsApp } from '../backend/receipt';
import { useToast } from '../components/Toast';

export default function BillingPage() {
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [frequentProducts, setFrequentProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [receiptText, setReceiptText] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [settings, setSettings] = useState({});
    const [lowStockThreshold, setLowStockThreshold] = useState(5);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showScanner, setShowScanner] = useState(false);
    const showToast = useToast();

    // Discount state
    const [discountType, setDiscountType] = useState('flat'); // 'flat' or 'percent'
    const [discountValue, setDiscountValue] = useState('');
    const [showDiscount, setShowDiscount] = useState(false);

    // Quick Add Product state
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickAddForm, setQuickAddForm] = useState({
        name: '', selling_price: '', cost_price: '', stock_quantity: '', category: ''
    });
    const [categories, setCategories] = useState([]);
    const [quickAddLoading, setQuickAddLoading] = useState(false);

    // Quantity Keypad state
    const [qtyPadItem, setQtyPadItem] = useState(null);
    const [qtyPadValue, setQtyPadValue] = useState('');

    // Cart bottom sheet state
    const [cartOpen, setCartOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [addedItemId, setAddedItemId] = useState(null);

    const cartSheetRef = useRef(null);

    const loadFrequent = async () => {
        const products = await getFrequentProducts();
        setFrequentProducts(products);
    };

    const loadSettings = async () => {
        const s = await getAllSettings();
        setSettings(s);
        setLowStockThreshold(parseInt(s.low_stock_threshold) || 5);
    };

    const loadCustomers = async () => {
        const c = await getAllCustomers();
        setCustomers(c);
    };

    useEffect(() => {
        loadFrequent();
        loadSettings();
        loadCustomers();
        loadCategories();
    }, []);

    const loadCategories = async () => {
        const cats = await getCategories();
        setCategories(cats);
    };

    const handleSearch = useCallback(async (value) => {
        setQuery(value);
        if (value.trim().length > 0) {
            const results = await searchProducts(value);
            setSearchResults(results);
        } else {
            setSearchResults([]);
        }
    }, []);

    const addToCart = (product) => {
        if (product.stock_quantity <= 0) {
            showToast('Out of stock', 'error');
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock_quantity) {
                    showToast(`Only ${product.stock_quantity} in stock`, 'error');
                    return prev;
                }
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { ...product, quantity: 1 }];
        });

        if (query) {
            setQuery('');
            setSearchResults([]);
        }
        showToast(`${product.name} added`);

        // Show bounce feedback on the added item
        setAddedItemId(product.id);
        setTimeout(() => setAddedItemId(null), 300);
    };

    const handleScan = async (code) => {
        setShowScanner(false);
        const results = await searchProducts(code);
        const product = results.find(p => p.barcode === code);

        if (product) {
            addToCart(product);
        } else if (results.length > 0) {
            addToCart(results[0]);
        } else {
            showToast('Product not found', 'error');
        }
    };

    const updateQuantity = (productId, delta) => {
        setCart(prev => {
            return prev
                .map(item => {
                    if (item.id === productId) {
                        const newQty = item.quantity + delta;
                        return newQty > 0 ? { ...item, quantity: newQty } : null;
                    }
                    return item;
                })
                .filter(Boolean);
        });
    };

    const removeFromCart = (productId) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const clearCart = () => {
        setCart([]);
        setDiscountValue('');
        setShowDiscount(false);
        setCartOpen(false);
    };

    const cartSubtotal = cart.reduce((sum, item) => sum + Number(item.selling_price) * item.quantity, 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate discount
    const parsedDiscount = parseFloat(discountValue) || 0;
    let discountAmount = 0;
    if (parsedDiscount > 0) {
        if (discountType === 'percent') {
            discountAmount = Math.min((cartSubtotal * parsedDiscount) / 100, cartSubtotal);
        } else {
            discountAmount = Math.min(parsedDiscount, cartSubtotal);
        }
    }
    const cartTotal = cartSubtotal - discountAmount;

    const handleCheckout = async () => {
        if (cart.length === 0) return;

        try {
            const discountObj = discountAmount > 0
                ? { type: discountType, value: parsedDiscount, amount: discountAmount }
                : null;

            const result = await createSale(cart, paymentMethod, selectedCustomer?.id, discountObj);
            const sale = await getSaleById(result.saleId);
            const receipt = generateReceipt(sale, sale.items, settings);

            setReceiptText(receipt);
            setShowCheckout(false);
            setShowReceipt(true);
            setCart([]);
            setSelectedCustomer(null);
            setPaymentMethod('Cash');
            setDiscountValue('');
            setShowDiscount(false);
            setCartOpen(false);
            showToast('Sale completed!');
            loadFrequent();
        } catch (_err) {
            showToast('Checkout failed', 'error');
        }
    };

    const handleShareWhatsApp = () => {
        if (customerPhone.trim()) {
            shareOnWhatsApp(customerPhone, receiptText);
        }
    };

    const currency = settings.currency || '₹';

    const formatCurrency = (val) => {
        const num = Number(val);
        if (num === 0) return `${currency}0`;
        return num % 1 === 0 ? `${currency}${num.toLocaleString('en-IN')}` : `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Filter products by category
    const displayProducts = query.trim().length > 0
        ? searchResults
        : frequentProducts;

    const filteredProducts = selectedCategory === 'All'
        ? displayProducts
        : displayProducts.filter(p => p.category === selectedCategory);

    const allCategories = ['All', ...categories];

    // Close cart when clicking outside
    useEffect(() => {
        if (cart.length === 0 && cartOpen) {
            setCartOpen(false);
        }
    }, [cart.length, cartOpen]);

    return (
        <div className="pos-page">
            {/* Header */}
            <div className="pos-header">
                <AppHeader title="Billing">
                    {cart.length > 0 && (
                        <button
                            className="pos-clear-btn"
                            onClick={clearCart}
                            id="clear-cart-btn"
                        >
                            <Trash2 size={14} />
                            Clear
                        </button>
                    )}
                </AppHeader>
            </div>

            {/* Search Bar */}
            <div className="pos-search-bar" id="pos-search-bar">
                <Search size={18} className="pos-search-icon" />
                <input
                    type="text"
                    placeholder="Search products..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    id="product-search"
                    className="pos-search-input"
                />
                <button
                    onClick={() => setShowScanner(true)}
                    className="pos-scan-btn"
                    id="scan-barcode-btn"
                >
                    <Scan size={18} />
                </button>
            </div>

            {/* Category Pills */}
            {categories.length > 0 && (
                <div className="pos-category-pills" id="category-pills">
                    {allCategories.map(cat => (
                        <button
                            key={cat}
                            className={`pos-category-pill ${selectedCategory === cat ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {/* Product Grid */}
            <div className="pos-products-area">
                {query === '' && frequentProducts.length === 0 && (
                    <div className="pos-empty-state">
                        <Package size={48} />
                        <h3>Start Billing</h3>
                        <p>Search products or add frequently used items for quick access</p>
                    </div>
                )}

                {/* No Results - Quick Add Prompt */}
                {query.trim().length > 0 && searchResults.length === 0 && (
                    <div className="pos-no-results">
                        <Package size={32} />
                        <div className="pos-no-results-title">Product not found</div>
                        <div className="pos-no-results-sub">&quot;{query}&quot; doesn&apos;t match any products</div>
                        <button
                            className="pos-quick-add-trigger"
                            onClick={() => {
                                setQuickAddForm({ name: query.trim(), selling_price: '', cost_price: '', stock_quantity: '', category: '' });
                                setShowQuickAdd(true);
                            }}
                            id="quick-add-product-btn"
                        >
                            <Plus size={18} />
                            Quick Add Product
                        </button>
                    </div>
                )}

                {/* Product Cards Grid */}
                {filteredProducts.length > 0 && (
                    <>
                        {query === '' && (
                            <div className="pos-section-label">
                                {selectedCategory === 'All' ? 'Frequent Items' : selectedCategory}
                            </div>
                        )}
                        <div className="pos-product-grid">
                            {filteredProducts.map(product => {
                                const isOutOfStock = product.stock_quantity <= 0;
                                const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= lowStockThreshold;
                                return (
                                    <div
                                        key={product.id}
                                        className={`pos-product-card ${isOutOfStock ? 'out-of-stock' : ''} ${addedItemId === product.id ? 'item-added-bounce' : ''}`}
                                        onClick={() => !isOutOfStock && addToCart(product)}
                                        id={`product-card-${product.id}`}
                                    >
                                        {/* Product Image Placeholder */}
                                        <div className="pos-product-image">
                                            <span className="pos-product-initial">
                                                {product.name.charAt(0).toUpperCase()}
                                            </span>
                                            {isOutOfStock && (
                                                <div className="pos-stock-badge out">Out of stock</div>
                                            )}
                                            {isLowStock && (
                                                <div className="pos-stock-badge low">
                                                    <AlertTriangle size={10} /> {product.stock_quantity} left
                                                </div>
                                            )}
                                        </div>

                                        {/* Product Info */}
                                        <div className="pos-product-info">
                                            <div className="pos-product-name">{product.name}</div>
                                            <div className="pos-product-price-row">
                                                <span className="pos-product-price">{formatCurrency(product.selling_price)}</span>
                                                {!isOutOfStock && (
                                                    <button className="pos-add-btn" onClick={(e) => { e.stopPropagation(); addToCart(product); }}>
                                                        <Plus size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Floating Cart Indicator */}
            {cart.length > 0 && !cartOpen && (
                <div className="pos-floating-cart" onClick={() => setCartOpen(true)} id="floating-cart-btn">
                    <div className="pos-floating-cart-left">
                        <ShoppingBag size={20} />
                        <span className="pos-floating-cart-count">{cartCount} {cartCount === 1 ? 'item' : 'items'}</span>
                    </div>
                    <div className="pos-floating-cart-right">
                        <span className="pos-floating-cart-total">{formatCurrency(cartTotal)}</span>
                        <ChevronUp size={18} />
                    </div>
                </div>
            )}

            {/* Cart Bottom Sheet */}
            {cartOpen && (
                <div className="pos-cart-overlay" onClick={() => setCartOpen(false)}>
                    <div className="pos-cart-sheet" ref={cartSheetRef} onClick={(e) => e.stopPropagation()}>
                        <div className="pos-cart-handle" />

                        {/* Cart Header */}
                        <div className="pos-cart-header">
                            <div className="pos-cart-title">
                                <ShoppingBag size={20} />
                                <span>Current Order</span>
                                <span className="pos-cart-badge">{cartCount}</span>
                            </div>
                            <button className="pos-cart-close" onClick={() => setCartOpen(false)}>
                                <ChevronDown size={20} />
                            </button>
                        </div>

                        {/* Customer Name (optional indicator) */}
                        {selectedCustomer && (
                            <div className="pos-cart-customer">
                                <Users size={14} />
                                <span>{selectedCustomer.name}</span>
                            </div>
                        )}

                        {/* Cart Items */}
                        <div className="pos-cart-items">
                            {cart.map(item => (
                                <div key={item.id} className="pos-cart-item">
                                    <div className="pos-cart-item-avatar">
                                        {item.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="pos-cart-item-details">
                                        <div className="pos-cart-item-name">{item.name}</div>
                                        <div className="pos-cart-item-price">{formatCurrency(item.selling_price)}</div>
                                    </div>
                                    <div className="pos-cart-qty-controls">
                                        <button className="pos-qty-btn" onClick={() => updateQuantity(item.id, -1)}>
                                            <Minus size={14} />
                                        </button>
                                        <span
                                            className="pos-qty-value"
                                            onClick={() => { setQtyPadItem(item); setQtyPadValue(item.quantity.toString()); }}
                                        >
                                            {item.quantity}
                                        </span>
                                        <button className="pos-qty-btn plus" onClick={() => updateQuantity(item.id, 1)}>
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <button className="pos-cart-remove" onClick={() => removeFromCart(item.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Discount Section */}
                        {!showDiscount ? (
                            <button
                                className="pos-discount-trigger"
                                onClick={() => setShowDiscount(true)}
                            >
                                <Tag size={16} />
                                Add Discount
                            </button>
                        ) : (
                            <div className="pos-discount-section">
                                <div className="pos-discount-header">
                                    <div className="pos-discount-label">
                                        <Tag size={14} />
                                        Discount
                                    </div>
                                    <button
                                        className="pos-discount-close"
                                        onClick={() => { setShowDiscount(false); setDiscountValue(''); }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="pos-discount-controls">
                                    <div className="pos-discount-toggle">
                                        <button
                                            className={`pos-discount-type-btn ${discountType === 'flat' ? 'active' : ''}`}
                                            onClick={() => setDiscountType('flat')}
                                        >
                                            {currency}
                                        </button>
                                        <button
                                            className={`pos-discount-type-btn ${discountType === 'percent' ? 'active' : ''}`}
                                            onClick={() => setDiscountType('percent')}
                                        >
                                            <Percent size={14} />
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder={discountType === 'flat' ? 'Amount' : 'Percentage'}
                                        value={discountValue}
                                        onChange={(e) => {
                                            let val = e.target.value;
                                            if (discountType === 'percent' && parseFloat(val) > 100) val = '100';
                                            setDiscountValue(val);
                                        }}
                                        className="pos-discount-input"
                                        id="discount-input"
                                    />
                                </div>
                                {discountAmount > 0 && (
                                    <div className="pos-discount-preview">
                                        <span>Saving</span>
                                        <span>-{currency}{discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Summary */}
                        <div className="pos-cart-summary">
                            <div className="pos-summary-row">
                                <span>Subtotal</span>
                                <span>{formatCurrency(cartSubtotal)}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="pos-summary-row discount">
                                    <span>Discount</span>
                                    <span>-{formatCurrency(discountAmount)}</span>
                                </div>
                            )}
                            <div className="pos-summary-divider" />
                            <div className="pos-summary-row total">
                                <span>TOTAL</span>
                                <span>{formatCurrency(cartTotal)}</span>
                            </div>
                        </div>

                        {/* Checkout Button */}
                        <button
                            className="pos-checkout-btn"
                            onClick={() => { setCartOpen(false); setShowCheckout(true); }}
                            id="checkout-button"
                        >
                            Continue to Checkout
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* Checkout Modal */}
            {showCheckout && (
                <div className="modal-overlay" onClick={() => setShowCheckout(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">Checkout</div>

                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            {discountAmount > 0 ? (
                                <>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Subtotal</div>
                                    <div style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', textDecoration: 'line-through', marginBottom: 2 }}>
                                        {formatCurrency(cartSubtotal)}
                                    </div>
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '4px 12px',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        borderRadius: 20,
                                        marginBottom: 8
                                    }}>
                                        <Tag size={12} style={{ color: 'var(--accent-400)' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--accent-400)', fontWeight: 700 }}>
                                            {discountType === 'percent' ? `${parsedDiscount}% off` : `${formatCurrency(discountAmount)} off`}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Final Amount</div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--accent-400)', letterSpacing: '-0.03em' }}>
                                        {formatCurrency(cartTotal)}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Amount</div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--accent-400)', letterSpacing: '-0.03em' }}>
                                        {formatCurrency(cartTotal)}
                                    </div>
                                </>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cartCount} items</div>
                            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Powered by BillMate
                            </div>
                        </div>

                        {/* Customer Selection */}
                        <div className="form-group">
                            <label className="form-label">Customer (Optional)</label>
                            <div style={{ position: 'relative' }}>
                                <select
                                    className="form-input"
                                    value={selectedCustomer?.id || ''}
                                    onChange={(e) => {
                                        const c = customers.find(c => c.id === parseInt(e.target.value));
                                        setSelectedCustomer(c || null);
                                        if (e.target.value === '') setPaymentMethod('Cash');
                                    }}
                                    style={{ appearance: 'none' }}
                                >
                                    <option value="">Guest Customer</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} {c.balance > 0 ? `(Due: ${currency}${c.balance})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <Users size={16} style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            </div>
                        </div>

                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
                            Payment Method
                        </div>
                        <div className="payment-methods">
                            {[
                                { method: 'Cash', icon: Banknote },
                                { method: 'UPI', icon: Smartphone },
                                { method: 'Card', icon: CreditCard },
                                { method: 'Credit', icon: Users, disabled: !selectedCustomer }
                                // eslint-disable-next-line no-unused-vars
                            ].map(({ method, icon: Icon, disabled }) => (
                                <button
                                    key={method}
                                    className={`payment-method-btn ${paymentMethod === method ? 'selected' : ''}`}
                                    onClick={() => !disabled && setPaymentMethod(method)}
                                    disabled={disabled}
                                    style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                >
                                    <Icon size={24} />
                                    {method}
                                </button>
                            ))}
                        </div>

                        <button
                            className="btn btn-success btn-lg btn-block"
                            onClick={handleCheckout}
                            id="confirm-checkout"
                        >
                            Complete Sale
                        </button>
                    </div>
                </div >
            )
            }

            {/* Barcode Scanner Modal */}
            {
                showScanner && (
                    <BarcodeScanner
                        onScan={handleScan}
                        onClose={() => setShowScanner(false)}
                    />
                )
            }

            {/* Receipt Modal */}
            {
                showReceipt && (
                    <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-handle" />
                            <div className="modal-title">Receipt</div>

                            <div className="receipt-preview">
                                {receiptText}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Customer Phone (for WhatsApp)</label>
                                <div className="phone-input-group">
                                    <input
                                        className="form-input"
                                        type="tel"
                                        placeholder="e.g. 919876543210"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        id="customer-phone"
                                    />
                                    <button
                                        className="btn btn-success"
                                        onClick={handleShareWhatsApp}
                                        disabled={!customerPhone.trim()}
                                    >
                                        <MessageCircle size={18} />
                                    </button>
                                </div>
                            </div>

                            <button
                                className="btn btn-primary btn-block"
                                onClick={() => { setShowReceipt(false); setCustomerPhone(''); }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Quick Add Product Modal */}
            {
                showQuickAdd && (
                    <div className="modal-overlay" onClick={() => setShowQuickAdd(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-handle" />
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Plus size={18} style={{ color: 'var(--primary-400)' }} />
                                Quick Add Product
                            </div>

                            <div className="form-group">
                                <label className="form-label">Product Name *</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. Maggi Noodles"
                                    value={quickAddForm.name}
                                    onChange={(e) => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                                    id="quick-add-name"
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Selling Price *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={quickAddForm.selling_price}
                                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, selling_price: e.target.value }))}
                                        id="quick-add-selling-price"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Cost Price *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={quickAddForm.cost_price}
                                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, cost_price: e.target.value }))}
                                        id="quick-add-cost-price"
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Stock Quantity *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="0"
                                        value={quickAddForm.stock_quantity}
                                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, stock_quantity: e.target.value }))}
                                        id="quick-add-stock"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Category</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            className="form-input"
                                            type="text"
                                            placeholder="General"
                                            value={quickAddForm.category}
                                            onChange={(e) => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                                            list="quick-add-categories"
                                            id="quick-add-category"
                                        />
                                        <datalist id="quick-add-categories">
                                            {categories.map(cat => (
                                                <option key={cat} value={cat} />
                                            ))}
                                        </datalist>
                                    </div>
                                </div>
                            </div>

                            <button
                                className="btn btn-success btn-lg btn-block"
                                disabled={quickAddLoading || !quickAddForm.name.trim() || !quickAddForm.selling_price || !quickAddForm.cost_price || !quickAddForm.stock_quantity}
                                onClick={async () => {
                                    setQuickAddLoading(true);
                                    try {
                                        const productId = await addProduct({
                                            name: quickAddForm.name.trim(),
                                            selling_price: quickAddForm.selling_price,
                                            cost_price: quickAddForm.cost_price,
                                            stock_quantity: quickAddForm.stock_quantity,
                                            category: quickAddForm.category || 'General'
                                        });
                                        // Add the newly created product to cart
                                        const newProduct = {
                                            id: productId,
                                            name: quickAddForm.name.trim(),
                                            selling_price: parseFloat(quickAddForm.selling_price),
                                            cost_price: parseFloat(quickAddForm.cost_price),
                                            stock_quantity: parseInt(quickAddForm.stock_quantity),
                                            category: quickAddForm.category || 'General'
                                        };
                                        addToCart(newProduct);
                                        setShowQuickAdd(false);
                                        setQuery('');
                                        setSearchResults([]);
                                        loadCategories();
                                        showToast(`${newProduct.name} created & added to cart`);
                                    } catch (err) {
                                        showToast(err.message || 'Failed to add product', 'error');
                                    } finally {
                                        setQuickAddLoading(false);
                                    }
                                }}
                                id="quick-add-submit"
                                style={{ marginTop: 8 }}
                            >
                                {quickAddLoading ? 'Adding...' : 'Add Product & Add to Cart'}
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
