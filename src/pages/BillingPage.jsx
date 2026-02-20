import { useState, useEffect, useCallback } from 'react';
import {
    Search, Plus, Minus, Trash2, ShoppingBag,
    CreditCard, Smartphone, Banknote, ChevronRight,
    X, Send, MessageCircle, Package, AlertTriangle, Users, Scan
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

        // Check if barcode product is already in cart to respect stock limit
        // Logic handled inside setCheck

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

        // Clear search if it was a search add
        if (query) {
            setQuery('');
            setSearchResults([]);
        }
        showToast(`${product.name} added`);
    };

    const handleScan = async (code) => {
        setShowScanner(false);
        const results = await searchProducts(code);
        const product = results.find(p => p.barcode === code); // Exact match preferred

        if (product) {
            addToCart(product);
        } else if (results.length > 0) {
            // If strictly no barcode match but found by name/partial (less likely for barcode scan)
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
    };

    const cartTotal = cart.reduce((sum, item) => sum + Number(item.selling_price) * item.quantity, 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    const handleCheckout = async () => {
        if (cart.length === 0) return;

        try {
            const result = await createSale(cart, paymentMethod, selectedCustomer?.id);
            const sale = await getSaleById(result.saleId);
            const receipt = generateReceipt(sale, sale.items, settings);

            setReceiptText(receipt);
            setShowCheckout(false);
            setShowReceipt(true);
            setCart([]);
            setSelectedCustomer(null);
            setPaymentMethod('Cash');
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

                    {/* Checkout Bar */}
                    <div className="cart-total-bar" onClick={() => setShowCheckout(true)} id="checkout-button">
                        <div>
                            <div className="cart-total-label">Total ({cartCount} items)</div>
                            <div className="cart-total-amount">{currency}{cartTotal.toFixed(2)}</div>
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
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Amount</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-300)' }}>
                                {currency}{cartTotal.toFixed(2)}
                            </div>
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
