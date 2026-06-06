import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search, Plus, Minus, Trash2, ShoppingBag,
    CreditCard, Smartphone, Banknote, ChevronRight,
    X, MessageCircle, Package, AlertTriangle, Users, Scan,
    Percent, Tag, ChevronDown, ChevronUp, Terminal
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import BarcodeScanner from '../components/BarcodeScanner';
import {
    searchProducts, getFrequentProducts, createSale,
    getSaleById, getAllSettings, getAllCustomers,
    addProduct, getCategories, getCustomerHistory,
    addCustomer
} from '../database';
import { generateReceipt, shareOnWhatsApp } from '../backend/receipt';
import { useToast } from '../components/Toast';

function generateEscPosStream(sale, items, settings) {
    const stream = [];
    const addCmd = (cmd, desc, hex) => stream.push({ cmd, desc, hex });

    addCmd('ESC @', 'Initialize printer', '1B 40');
    addCmd('ESC a 01', 'Align Center', '1B 61 01');
    addCmd('GS ! 11', 'Double Font Size (Header)', '1D 21 11');
    addCmd('TEXT', `${settings.shop_name || 'BillMate'}`, Array.from(new TextEncoder().encode(settings.shop_name || 'BillMate')).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
    addCmd('LF', 'Line feed', '0A');
    addCmd('GS ! 00', 'Reset Font Size', '1D 21 00');
    addCmd('LF', 'Line feed', '0A');
    addCmd('ESC a 00', 'Align Left', '1B 61 00');
    addCmd('TEXT', '--------------------------------', '2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D');
    addCmd('LF', 'Line feed', '0A');

    items.forEach(item => {
        const text = `${item.product_name || item.name} x${item.quantity} = ${settings.currency || '₹'}${Number(item.subtotal || item.selling_price * item.quantity).toFixed(2)}`;
        addCmd('TEXT', text, Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
        addCmd('LF', 'Line feed', '0A');
    });

    addCmd('TEXT', '--------------------------------', '2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D');
    addCmd('LF', 'Line feed', '0A');

    if (sale.discount_amount > 0) {
        const subtext = `Subtotal: ${settings.currency || '₹'}${Number(sale.subtotal || (sale.total + sale.discount_amount)).toFixed(2)}`;
        addCmd('TEXT', subtext, Array.from(new TextEncoder().encode(subtext)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
        addCmd('LF', 'Line feed', '0A');
        
        const discText = `Discount: -${settings.currency || '₹'}${Number(sale.discount_amount).toFixed(2)}`;
        addCmd('TEXT', discText, Array.from(new TextEncoder().encode(discText)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
        addCmd('LF', 'Line feed', '0A');
        addCmd('TEXT', '--------------------------------', '2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D');
        addCmd('LF', 'Line feed', '0A');
    }

    addCmd('GS ! 01', 'Double Width Font (Total)', '1D 21 01');
    const totalText = `TOTAL: ${settings.currency || '₹'}${Number(sale.total).toFixed(2)}`;
    addCmd('TEXT', totalText, Array.from(new TextEncoder().encode(totalText)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
    addCmd('LF', 'Line feed', '0A');
    addCmd('GS ! 00', 'Reset Font Size', '1D 21 00');
    addCmd('LF', 'Line feed', '0A');

    const paymentText = `Payment: ${sale.payment_method}`;
    addCmd('TEXT', paymentText, Array.from(new TextEncoder().encode(paymentText)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
    addCmd('LF', 'Line feed', '0A');

    const dateText = `Date: ${new Date(sale.date).toLocaleString()}`;
    addCmd('TEXT', dateText, Array.from(new TextEncoder().encode(dateText)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
    addCmd('LF', 'Line feed', '0A');

    addCmd('LF', 'Line feed', '0A');
    addCmd('ESC a 01', 'Align Center', '1B 61 01');
    addCmd('TEXT', 'Thank you! Please visit again.', '54 68 61 6E 6B 20 79 6F 75 21 20 50 6C 65 61 73 65 20 76 69 73 69 74 20 61 67 61 69 6E 2E');
    addCmd('LF', 'Line feed', '0A');

    addCmd('GS V 41 03', 'Cut paper (Full Cut)', '1D 56 41 03');

    return stream;
}

export default function BillingPage() {
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [frequentProducts, setFrequentProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [receiptText, setReceiptText] = useState('');
    const [showTelemetry, setShowTelemetry] = useState(false);
    const [activeSaleRecord, setActiveSaleRecord] = useState(null);
    const [customerPhone, setCustomerPhone] = useState('');
    const [settings, setSettings] = useState({});
    const [lowStockThreshold, setLowStockThreshold] = useState(5);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showScanner, setShowScanner] = useState(false);
    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
    const showToast = useToast();
    const [errors, setErrors] = useState({});

    // Loyalty points states
    const [customerLoyaltyPoints, setCustomerLoyaltyPoints] = useState(0);
    const [customerLoyaltyTier, setCustomerLoyaltyTier] = useState('Bronze');
    const [redeemPoints, setRedeemPoints] = useState(false);

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

    const loadCustomerLoyalty = async (customer) => {
        if (!customer) {
            setCustomerLoyaltyPoints(0);
            setCustomerLoyaltyTier('Bronze');
            setRedeemPoints(false);
            return;
        }
        try {
            const history = await getCustomerHistory(customer.id);
            
            // Accrued points = 1% of total spent
            const accrued = history.reduce((sum, sale) => {
                if (sale.refunded || sale.payment_method === 'Settle') return sum;
                return sum + Math.floor(Number(sale.total) * 0.01);
            }, 0);

            // Redeemed points = sum of discounts where type is 'Loyalty'
            const redeemed = history.reduce((sum, sale) => {
                if (sale.refunded || sale.payment_method === 'Settle') return sum;
                if (sale.discount_type === 'Loyalty') return sum + Number(sale.discount_value);
                return sum;
            }, 0);

            const netPoints = Math.max(0, accrued - redeemed);
            setCustomerLoyaltyPoints(netPoints);

            let tier = 'Bronze';
            if (netPoints >= 1500) tier = 'Platinum';
            else if (netPoints >= 500) tier = 'Gold';
            else if (netPoints >= 100) tier = 'Silver';

            setCustomerLoyaltyTier(tier);
        } catch (err) {
            console.error('Failed to load customer loyalty points:', err);
        }
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
    let discountError = '';
    if (discountValue !== '') {
        if (isNaN(parsedDiscount) || parsedDiscount < 0) {
            discountError = 'Discount cannot be negative';
        } else if (discountType === 'flat' && parsedDiscount > cartSubtotal) {
            discountError = 'Discount cannot exceed subtotal';
        } else if (discountType === 'percent' && parsedDiscount > 100) {
            discountError = 'Discount percentage cannot exceed 100%';
        }
    }

    if (parsedDiscount > 0 && !discountError) {
        if (discountType === 'percent') {
            discountAmount = Math.min((cartSubtotal * parsedDiscount) / 100, cartSubtotal);
        } else {
            discountAmount = Math.min(parsedDiscount, cartSubtotal);
        }
    }

    // Loyalty points redemption discount
    const loyaltyDiscountAmount = redeemPoints ? Math.min(customerLoyaltyPoints, cartSubtotal - discountAmount) : 0;

    const cartTotal = Math.max(0, cartSubtotal - discountAmount - loyaltyDiscountAmount);

    const handleCheckout = async () => {
        if (cart.length === 0) return;

        if (paymentMethod === 'Credit' && !selectedCustomer) {
            showToast('A customer is required for credit sales', 'error');
            setShowAddCustomer(true);
            return;
        }

        try {
            let finalDiscountObj = null;
            if (discountAmount > 0) {
                finalDiscountObj = { type: discountType, value: parsedDiscount, amount: discountAmount };
            }

            if (redeemPoints && loyaltyDiscountAmount > 0) {
                finalDiscountObj = {
                    type: 'Loyalty',
                    value: (finalDiscountObj?.amount || 0) + loyaltyDiscountAmount,
                    amount: (finalDiscountObj?.amount || 0) + loyaltyDiscountAmount
                };
            }

            const result = await createSale(cart, paymentMethod, selectedCustomer?.id, finalDiscountObj);
            const sale = await getSaleById(result.saleId);
            const receipt = generateReceipt(sale, sale.items, settings);

            setActiveSaleRecord(sale);
            setReceiptText(receipt);
            setShowCheckout(false);
            setShowReceipt(true);
            setCart([]);
            setSelectedCustomer(null);
            setPaymentMethod('Cash');
            setDiscountValue('');
            setShowDiscount(false);
            setCartOpen(false);
            setRedeemPoints(false);
            setCustomerLoyaltyPoints(0);
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

    const handleCreateCustomer = async () => {
        const newErrors = {};
        const trimmedName = newCustomer.name.trim();
        const trimmedPhone = (newCustomer.phone || '').trim();

        if (!trimmedName) {
            newErrors.customerName = 'Customer name is required';
        } else if (trimmedName.length > 100) {
            newErrors.customerName = 'Customer name cannot exceed 100 characters';
        }

        if (trimmedPhone && !/^[+\d\s]+$/.test(trimmedPhone)) {
            newErrors.customerPhone = 'Phone number can only contain digits, spaces, and +';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            showToast('Please correct the validation errors', 'error');
            return;
        }

        try {
            const customerId = await addCustomer({
                name: trimmedName,
                phone: trimmedPhone,
                email: (newCustomer.email || '').trim()
            });
            const updatedCustomers = await getAllCustomers();
            setCustomers(updatedCustomers);
            const newlyCreated = updatedCustomers.find(c => c.id === customerId);
            setSelectedCustomer(newlyCreated || null);
            setNewCustomer({ name: '', phone: '', email: '' });
            setShowAddCustomer(false);
            setErrors({});
            showToast('Customer created successfully');
            if (paymentMethod === 'Credit') {
                // Keep credit if it was selected
            } else {
                setPaymentMethod('Cash');
            }
        } catch (err) {
            showToast(err.message || 'Failed to create customer', 'error');
        }
    };

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
                                setErrors({});
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
                                            setDiscountValue(val);
                                        }}
                                        className="pos-discount-input"
                                        id="discount-input"
                                    />
                                </div>
                                {discountError && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{discountError}</p>}
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
                            onClick={() => {
                                if (discountError) {
                                    showToast('Please correct the discount error', 'error');
                                    return;
                                }
                                setCartOpen(false);
                                setShowCheckout(true);
                            }}
                            id="checkout-button"
                            disabled={!!discountError}
                            style={{ opacity: discountError ? 0.5 : 1 }}
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
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <label className="form-label" style={{ margin: 0 }}>Customer (Optional)</label>
                                {!showAddCustomer && (
                                    <button
                                        className="btn btn-sm"
                                        style={{ padding: '2px 8px', fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-400)' }}
                                        onClick={() => { setErrors({}); setShowAddCustomer(true); }}
                                    >
                                        + New
                                    </button>
                                )}
                            </div>
                            
                            {showAddCustomer ? (
                                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 12, border: '1px solid var(--border-color)', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Create New Customer</div>
                                        <button className="btn-icon" onClick={() => setShowAddCustomer(false)}><X size={16} /></button>
                                    </div>
                                    <input
                                        className="form-input"
                                        type="text"
                                        placeholder="Customer Name *"
                                        value={newCustomer.name}
                                        onChange={e => {
                                            setNewCustomer({...newCustomer, name: e.target.value});
                                            if (errors.customerName) setErrors(prev => ({ ...prev, customerName: null }));
                                        }}
                                        style={{ marginBottom: 8 }}
                                    />
                                    {errors.customerName && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: -4, marginBottom: 8, fontWeight: 500 }}>{errors.customerName}</p>}
                                    <input
                                        className="form-input"
                                        type="tel"
                                        placeholder="Phone Number (Optional)"
                                        value={newCustomer.phone}
                                        onChange={e => {
                                            setNewCustomer({...newCustomer, phone: e.target.value});
                                            if (errors.customerPhone) setErrors(prev => ({ ...prev, customerPhone: null }));
                                        }}
                                        style={{ marginBottom: 12 }}
                                    />
                                    {errors.customerPhone && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: -8, marginBottom: 12, fontWeight: 500 }}>{errors.customerPhone}</p>}
                                    <button className="btn btn-primary btn-block btn-sm" onClick={handleCreateCustomer}>
                                        Save & Select
                                    </button>
                                </div>
                            ) : (
                                <div style={{ position: 'relative' }}>
                                    <select
                                        className="form-input"
                                        value={selectedCustomer?.id || ''}
                                        onChange={(e) => {
                                            const c = customers.find(c => String(c.id) === e.target.value);
                                            setSelectedCustomer(c || null);
                                            loadCustomerLoyalty(c || null);
                                            if (e.target.value === '' && paymentMethod === 'Credit') {
                                                setPaymentMethod('Cash');
                                            }
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
                            )}
                        </div>

                        {/* Customer Loyalty Points Engine UI */}
                        {selectedCustomer && (
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 12,
                                padding: 12,
                                marginBottom: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                        Loyalty Rewards
                                    </span>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        padding: '2px 8px',
                                        borderRadius: 12,
                                        background: customerLoyaltyTier === 'Platinum' ? 'linear-gradient(135deg, #e2e8f0, #94a3b8)' : 
                                                    customerLoyaltyTier === 'Gold' ? 'linear-gradient(135deg, #fbbf24, #d97706)' : 
                                                    customerLoyaltyTier === 'Silver' ? 'linear-gradient(135deg, #cbd5e1, #64748b)' : 
                                                    'linear-gradient(135deg, #b45309, #78350f)',
                                        color: '#000',
                                        textTransform: 'uppercase'
                                    }}>
                                        {customerLoyaltyTier} Tier
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Available Balance:
                                    </span>
                                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary-400)' }}>
                                        {customerLoyaltyPoints} points
                                    </span>
                                </div>
                                {customerLoyaltyPoints > 0 && (
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        marginTop: 4,
                                        padding: '8px 10px',
                                        background: redeemPoints ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                        borderRadius: 8,
                                        border: redeemPoints ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={redeemPoints}
                                            onChange={(e) => setRedeemPoints(e.target.checked)}
                                            style={{
                                                width: 16,
                                                height: 16,
                                                accentColor: 'var(--primary-500)',
                                                cursor: 'pointer'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Redeem {Math.min(customerLoyaltyPoints, Math.floor(cartSubtotal - discountAmount))} points (Save {formatCurrency(Math.min(customerLoyaltyPoints, Math.floor(cartSubtotal - discountAmount)))})
                                        </span>
                                    </label>
                                )}
                            </div>
                        )}

                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
                            Payment Method
                        </div>
                        <div className="payment-methods" style={{ marginBottom: paymentMethod === 'UPI' ? 12 : 24 }}>
                            {[
                                { method: 'Cash', icon: Banknote },
                                { method: 'UPI', icon: Smartphone },
                                { method: 'Card', icon: CreditCard },
                                { method: 'Credit', icon: Users }
                            ].map(({ method, icon: Icon }) => (
                                <button
                                    key={method}
                                    className={`payment-method-btn ${paymentMethod === method ? 'selected' : ''}`}
                                    onClick={() => {
                                        setPaymentMethod(method);
                                        if (method === 'Credit' && !selectedCustomer) {
                                            showToast('Select or create a customer for credit sales', 'warning');
                                            setShowAddCustomer(true);
                                        }
                                    }}
                                >
                                    <Icon size={24} />
                                    {method}
                                </button>
                            ))}
                        </div>

                        {/* Dynamic UPI QR Code during Checkout */}
                        {paymentMethod === 'UPI' && (
                            <div style={{
                                textAlign: 'center',
                                margin: '0 0 20px 0',
                                padding: '16px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: 16,
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 10
                            }}>
                                <div style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    color: 'var(--primary-400)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    Scan & Pay {formatCurrency(cartTotal)}
                                </div>
                                <div style={{
                                    background: '#fff',
                                    padding: 10,
                                    display: 'inline-block',
                                    borderRadius: 12,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
                                }}>
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${settings.upi_id || 'merchant@upi'}&pn=${encodeURIComponent(settings.shop_name || 'BillMate')}&am=${cartTotal.toFixed(2)}&tn=Sale_${Date.now()}`)}`}
                                        alt="UPI QR Code"
                                        style={{ width: 140, height: 140, display: 'block' }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    VPA: {settings.upi_id || 'merchant@upi'}
                                </div>
                            </div>
                        )}

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
                                {/* Dynamic UPI QR Code */}
                                {paymentMethod === 'UPI' && activeSaleRecord && (
                                    <div style={{ 
                                        textAlign: 'center', 
                                        margin: '16px 0', 
                                        padding: '16px 12px', 
                                        background: 'rgba(255, 255, 255, 0.02)', 
                                        borderRadius: 12, 
                                        border: '1px solid var(--border-color)' 
                                    }}>
                                        <div style={{ 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700, 
                                            color: 'var(--primary-400)', 
                                            textTransform: 'uppercase', 
                                            letterSpacing: '0.5px', 
                                            marginBottom: 10 
                                        }}>
                                            Scan to Pay via UPI
                                        </div>
                                        <div style={{ 
                                            background: '#fff', 
                                            padding: 8, 
                                            display: 'inline-block', 
                                            borderRadius: 8, 
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                                        }}>
                                            <img 
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${settings.upi_id || 'merchant@upi'}&pn=${encodeURIComponent(settings.shop_name || 'BillMate')}&am=${Number(activeSaleRecord.total).toFixed(2)}&tn=Invoice_${activeSaleRecord.id}`)}`} 
                                                alt="UPI QR Code" 
                                                style={{ width: 150, height: 150, display: 'block' }}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                                            Amount: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatCurrency(activeSaleRecord.total)}</span>
                                        </div>
                                    </div>
                                )}

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
                                    className="btn btn-secondary btn-block"
                                    onClick={() => {
                                        window.print();
                                    }}
                                    style={{ marginBottom: 8 }}
                                    id="print-receipt-btn"
                                >
                                    Print Receipt
                                </button>



                                <button
                                    className="btn btn-primary btn-block"
                                    onClick={() => { setShowReceipt(false); setCustomerPhone(''); setShowTelemetry(false); setActiveSaleRecord(null); }}
                                >
                                    Done
                                </button>
                            </div>
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
                                    onChange={(e) => {
                                        setQuickAddForm(prev => ({ ...prev, name: e.target.value }));
                                        if (errors.quickAddName) setErrors(prev => ({ ...prev, quickAddName: null }));
                                    }}
                                    id="quick-add-name"
                                />
                                {errors.quickAddName && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.quickAddName}</p>}
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
                                        onChange={(e) => {
                                            setQuickAddForm(prev => ({ ...prev, selling_price: e.target.value }));
                                            if (errors.quickAddSellingPrice) setErrors(prev => ({ ...prev, quickAddSellingPrice: null }));
                                        }}
                                        id="quick-add-selling-price"
                                    />
                                    {errors.quickAddSellingPrice && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.quickAddSellingPrice}</p>}
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Cost Price *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={quickAddForm.cost_price}
                                        onChange={(e) => {
                                            setQuickAddForm(prev => ({ ...prev, cost_price: e.target.value }));
                                            if (errors.quickAddCostPrice) setErrors(prev => ({ ...prev, quickAddCostPrice: null }));
                                        }}
                                        id="quick-add-cost-price"
                                    />
                                    {errors.quickAddCostPrice && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.quickAddCostPrice}</p>}
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
                                        onChange={(e) => {
                                            setQuickAddForm(prev => ({ ...prev, stock_quantity: e.target.value }));
                                            if (errors.quickAddStock) setErrors(prev => ({ ...prev, quickAddStock: null }));
                                        }}
                                        id="quick-add-stock"
                                    />
                                    {errors.quickAddStock && <p style={{ color: 'var(--danger-400)', fontSize: '0.78rem', marginTop: 4, fontWeight: 500 }}>{errors.quickAddStock}</p>}
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
                                disabled={quickAddLoading}
                                onClick={async () => {
                                    const newErrors = {};
                                    const trimmedName = quickAddForm.name.trim();
                                    const sellingPrice = parseFloat(quickAddForm.selling_price);
                                    const costPrice = parseFloat(quickAddForm.cost_price);
                                    const stockQuantity = parseInt(quickAddForm.stock_quantity);

                                    if (!trimmedName) {
                                        newErrors.quickAddName = 'Product name is required';
                                    }
                                    if (isNaN(sellingPrice) || sellingPrice <= 0) {
                                        newErrors.quickAddSellingPrice = 'Selling price must be greater than zero';
                                    }
                                    if (isNaN(costPrice) || costPrice < 0) {
                                        newErrors.quickAddCostPrice = 'Cost price cannot be negative';
                                    }
                                    if (isNaN(stockQuantity) || stockQuantity < 0) {
                                        newErrors.quickAddStock = 'Stock quantity cannot be negative';
                                    }

                                    if (Object.keys(newErrors).length > 0) {
                                        setErrors(newErrors);
                                        showToast('Please correct the validation errors', 'error');
                                        return;
                                    }

                                    setQuickAddLoading(true);
                                    try {
                                        const payload = {
                                            name: trimmedName,
                                            selling_price: sellingPrice,
                                            cost_price: costPrice,
                                            stock_quantity: stockQuantity,
                                            category: (quickAddForm.category || 'General').trim()
                                        };
                                        const productId = await addProduct(payload);
                                        // Add the newly created product to cart
                                        const newProduct = {
                                            id: productId,
                                            ...payload
                                        };
                                        addToCart(newProduct);
                                        setShowQuickAdd(false);
                                        setQuery('');
                                        setSearchResults([]);
                                        loadCategories();
                                        setErrors({});
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

            {activeSaleRecord && (
                <div className="print-receipt-window">
                    <div className="receipt-header">
                        <h2>{settings.shop_name || 'BillMate'}</h2>
                        {settings.shop_phone && <p>Phone: {settings.shop_phone}</p>}
                        {settings.shop_address && <p>{settings.shop_address}</p>}
                        <div className="receipt-divider" />
                        <p style={{ fontWeight: 'bold' }}>INVOICE #{activeSaleRecord.id}</p>
                        <p>Date: {new Date(activeSaleRecord.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                    
                    <div className="receipt-divider" />
                    
                    <table className="receipt-items">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style={{ textAlign: 'center' }}>Qty</th>
                                <th style={{ textAlign: 'right' }}>Price</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(activeSaleRecord.items || []).map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.product_name || item.name}</td>
                                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                    <td style={{ textAlign: 'right' }}>{settings.currency || '₹'}{Number(item.selling_price || 0).toFixed(2)}</td>
                                    <td style={{ textAlign: 'right' }}>{settings.currency || '₹'}{Number(item.subtotal || (item.selling_price * item.quantity)).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    <div className="receipt-divider" />
                    
                    <div className="receipt-totals">
                        <div className="total-row">
                            <span>Subtotal</span>
                            <span>{settings.currency || '₹'}{Number(activeSaleRecord.subtotal || (activeSaleRecord.total + (activeSaleRecord.discount_amount || 0))).toFixed(2)}</span>
                        </div>
                        {activeSaleRecord.discount_amount > 0 && (
                            <div className="total-row discount">
                                <span>Discount ({activeSaleRecord.discount_type === 'percent' ? `${activeSaleRecord.discount_value}%` : 'Flat'})</span>
                                <span>-{settings.currency || '₹'}{Number(activeSaleRecord.discount_amount).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="total-row grand-total">
                            <span>GRAND TOTAL</span>
                            <span>{settings.currency || '₹'}{Number(activeSaleRecord.total).toFixed(2)}</span>
                        </div>
                        <div className="total-row">
                            <span>Payment Method</span>
                            <span style={{ fontWeight: 'bold' }}>{activeSaleRecord.payment_method}</span>
                        </div>
                    </div>
                    
                    <div className="receipt-divider" />
                    
                    <div className="receipt-footer">
                        <p>Powered by BillMate POS</p>
                        <div className="thank-you">Thank you! Visit again.</div>
                    </div>
                </div>
            )}
        </div >
    );
}
