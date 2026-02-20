import { useState, useEffect, useCallback } from 'react';
import {
    Search, Plus, Minus, Trash2, ShoppingBag,
    CreditCard, Smartphone, Banknote, ChevronRight,
    X, Send, MessageCircle, Package, AlertTriangle, Users, Scan,
    Percent, Tag
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import {
    searchProducts, getFrequentProducts, createSale,
    getSaleById, getAllSettings, getAllCustomers
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
    }, []);

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

    return (
        <div className="page-content">
            <div className="page-header">
                <h1>Billing</h1>
                {cart.length > 0 && (
                    <button className="btn btn-ghost" onClick={clearCart} style={{ color: 'var(--danger-400)', fontSize: '0.8rem' }}>
                        Clear Cart
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="search-bar">
                <Search />
                <input
                    type="text"
                    placeholder="Search products..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    id="product-search"
                />
                <button
                    onClick={() => setShowScanner(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: '0 8px' }}
                >
                    <Scan size={20} />
                </button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    {searchResults.map(product => {
                        const isOutOfStock = product.stock_quantity <= 0;
                        const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= lowStockThreshold;
                        return (
                            <div
                                key={product.id}
                                className={`product-list-item ${isOutOfStock ? 'out-of-stock' : ''}`}
                                onClick={() => !isOutOfStock && addToCart(product)}
                            >
                                <div className="product-avatar">
                                    {product.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="product-list-info">
                                    <div className="product-list-name">{product.name}</div>
                                    <div className="product-list-meta">
                                        <span>Stock: {product.stock_quantity}</span>
                                    </div>
                                    {isOutOfStock && (
                                        <div className="stock-warning out-of-stock">
                                            <AlertTriangle size={12} /> Out of stock
                                        </div>
                                    )}
                                    {isLowStock && (
                                        <div className="stock-warning">
                                            <AlertTriangle size={12} /> Only {product.stock_quantity} left in stock
                                        </div>
                                    )}
                                </div>
                                <div className="product-list-price">
                                    {currency}{Number(product.selling_price).toFixed(2)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Quick Access Grid */}
            {query === '' && frequentProducts.length > 0 && (
                <>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Quick Add
                    </div>
                    <div className="quick-grid">
                        {frequentProducts.map(product => {
                            const isOutOfStock = product.stock_quantity <= 0;
                            return (
                                <div
                                    key={product.id}
                                    className={`quick-item ${isOutOfStock ? 'out-of-stock' : ''}`}
                                    onClick={() => !isOutOfStock && addToCart(product)}
                                >
                                    <div className="quick-name">{product.name}</div>
                                    <div className="quick-price">{currency}{product.selling_price}</div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {/* Cart */}
            {cart.length > 0 ? (
                <div className="cart-container">
                    <div className="cart-header">
                        <h3>
                            <ShoppingBag size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                            Cart
                        </h3>
                        <span className="cart-badge">{cartCount} items</span>
                    </div>

                    {cart.map(item => (
                        <div key={item.id} className="cart-item">
                            <div className="cart-item-info">
                                <div className="cart-item-name">{item.name}</div>
                                <div className="cart-item-price">{currency}{item.selling_price} each</div>
                            </div>
                            <div className="qty-controls">
                                <button className="qty-btn" onClick={() => updateQuantity(item.id, -1)}>
                                    <Minus size={14} />
                                </button>
                                <span className="qty-value">{item.quantity}</span>
                                <button className="qty-btn" onClick={() => updateQuantity(item.id, 1)}>
                                    <Plus size={14} />
                                </button>
                            </div>
                            <div className="cart-item-subtotal">
                                {currency}{(Number(item.selling_price) * item.quantity).toFixed(2)}
                            </div>
                            <button className="btn btn-ghost" onClick={() => removeFromCart(item.id)} style={{ padding: 4, color: 'var(--danger-400)' }}>
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}

                    {/* Discount Section */}
                    {!showDiscount ? (
                        <button
                            onClick={() => setShowDiscount(true)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                background: 'rgba(245, 166, 35, 0.06)',
                                border: '1px dashed rgba(245, 166, 35, 0.3)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--primary-400)',
                                cursor: 'pointer',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                fontFamily: 'Inter, sans-serif',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                marginTop: 8
                            }}
                        >
                            <Tag size={16} />
                            Add Discount
                        </button>
                    ) : (
                        <div style={{
                            marginTop: 8,
                            padding: '12px 14px',
                            background: 'rgba(245, 166, 35, 0.06)',
                            border: '1px solid rgba(245, 166, 35, 0.2)',
                            borderRadius: 'var(--radius-md)',
                            animation: 'scaleIn 0.2s ease'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 10
                            }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-400)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Tag size={14} />
                                    Discount
                                </div>
                                <button
                                    onClick={() => { setShowDiscount(false); setDiscountValue(''); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                {/* Type Toggle */}
                                <div style={{
                                    display: 'flex',
                                    background: 'var(--bg-primary)',
                                    borderRadius: 'var(--radius-sm)',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-color)',
                                    flexShrink: 0
                                }}>
                                    <button
                                        onClick={() => setDiscountType('flat')}
                                        style={{
                                            padding: '8px 14px',
                                            background: discountType === 'flat' ? 'var(--primary-500)' : 'transparent',
                                            color: discountType === 'flat' ? '#000' : 'var(--text-muted)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            fontFamily: 'Inter, sans-serif',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {currency}
                                    </button>
                                    <button
                                        onClick={() => setDiscountType('percent')}
                                        style={{
                                            padding: '8px 14px',
                                            background: discountType === 'percent' ? 'var(--primary-500)' : 'transparent',
                                            color: discountType === 'percent' ? '#000' : 'var(--text-muted)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            fontFamily: 'Inter, sans-serif',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <Percent size={14} />
                                    </button>
                                </div>

                                {/* Value Input */}
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
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        fontFamily: 'Inter, sans-serif',
                                        outline: 'none'
                                    }}
                                    id="discount-input"
                                />
                            </div>

                            {/* Discount Preview */}
                            {discountAmount > 0 && (
                                <div style={{
                                    marginTop: 8,
                                    fontSize: '0.78rem',
                                    color: 'var(--accent-400)',
                                    fontWeight: 600,
                                    display: 'flex',
                                    justifyContent: 'space-between'
                                }}>
                                    <span>Saving</span>
                                    <span>-{currency}{discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Checkout Bar */}
                    <div className="cart-total-bar" onClick={() => setShowCheckout(true)} id="checkout-button">
                        <div>
                            <div className="cart-total-label">
                                {discountAmount > 0
                                    ? `Total (${cartCount} items, discount applied)`
                                    : `Total (${cartCount} items)`
                                }
                            </div>
                            <div className="cart-total-amount">
                                {discountAmount > 0 && (
                                    <span style={{
                                        fontSize: '0.85rem',
                                        textDecoration: 'line-through',
                                        opacity: 0.6,
                                        marginRight: 8,
                                        fontWeight: 500
                                    }}>
                                        {currency}{cartSubtotal.toFixed(2)}
                                    </span>
                                )}
                                {currency}{cartTotal.toFixed(2)}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Checkout</span>
                            <ChevronRight size={20} />
                        </div>
                    </div>
                </div>
            ) : (
                query === '' && frequentProducts.length === 0 && (
                    <div className="empty-state">
                        <Package size={48} />
                        <h3>Start Billing</h3>
                        <p>Search products or add frequently used items for quick access</p>
                    </div>
                )
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
                                        {currency}{cartSubtotal.toFixed(2)}
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
                                            {discountType === 'percent' ? `${parsedDiscount}% off` : `${currency}${discountAmount.toFixed(2)} off`}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Final Amount</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-300)' }}>
                                        {currency}{cartTotal.toFixed(2)}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Amount</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-300)' }}>
                                        {currency}{cartTotal.toFixed(2)}
                                    </div>
                                </>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cartCount} items</div>
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
                </div>
            )}

            {/* Barcode Scanner Modal */}
            {showScanner && (
                <BarcodeScanner
                    onScan={handleScan}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {/* Receipt Modal */}
            {showReceipt && (
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
            )}
        </div>
    );
}
