import { useState } from 'react';
import { Store, Package, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import { setSetting } from '../database/db';
import { addProduct } from '../database/productService';

const STEPS = [
    { title: 'Your Shop', icon: '🏪', description: 'Let\'s personalize BillMate for you' },
    { title: 'First Product', icon: '📦', description: 'Add something you sell' },
    { title: 'All Set!', icon: '🎉', description: 'You\'re ready to start billing' }
];

export default function OnboardingWizard({ onComplete }) {
    const [step, setStep] = useState(0);
    const [shopName, setShopName] = useState('');
    const [currency, setCurrency] = useState('₹');
    const [product, setProduct] = useState({
        name: '',
        selling_price: '',
        cost_price: '',
        stock_quantity: ''
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleNext = async () => {
        setError('');

        if (step === 0) {
            //  Shop setup
            if (!shopName.trim()) {
                setError('Please enter your shop name');
                return;
            }
            try {
                await setSetting('shop_name', shopName.trim());
                await setSetting('currency', currency);
                setStep(1);
            } catch {
                setError('Failed to save settings');
            }
        } else if (step === 1) {
            // Add product (optional - can skip)
            if (product.name.trim() && product.selling_price) {
                setSaving(true);
                try {
                    await addProduct({
                        name: product.name.trim(),
                        selling_price: parseFloat(product.selling_price) || 0,
                        cost_price: parseFloat(product.cost_price) || 0,
                        stock_quantity: parseInt(product.stock_quantity) || 10,
                        category: 'General',
                        frequently_used: 1
                    });
                } catch (err) {
                    setError(err.message);
                    setSaving(false);
                    return;
                }
                setSaving(false);
            }
            setStep(2);
        } else {
            // Complete
            localStorage.setItem('billmate_onboarding_done', 'true');
            onComplete();
        }
    };

    const handleSkip = () => {
        if (step === 1) {
            setStep(2);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            padding: '0 24px'
        }}>
            {/* Progress Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingTop: 48,
                marginBottom: 40
            }}>
                {STEPS.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: i <= step
                                ? 'linear-gradient(135deg, var(--primary-500), var(--primary-400))'
                                : 'var(--bg-card)',
                            color: i <= step ? '#000' : 'var(--text-muted)',
                            border: i <= step ? 'none' : '1px solid var(--border-color)',
                            transition: 'all 0.3s ease'
                        }}>
                            {i < step ? <Check size={14} /> : i + 1}
                        </div>
                        {i < STEPS.length - 1 && (
                            <div style={{
                                width: 40,
                                height: 2,
                                background: i < step
                                    ? 'var(--primary-500)'
                                    : 'var(--border-color)',
                                borderRadius: 1,
                                transition: 'all 0.3s ease'
                            }} />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Header */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>
                    {STEPS[step].icon}
                </div>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    marginBottom: 8,
                    letterSpacing: '-0.02em'
                }}>
                    {step === 0 ? `Welcome to BillMate!` : STEPS[step].title}
                </h1>
                <p style={{
                    fontSize: '0.88rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5
                }}>
                    {STEPS[step].description}
                </p>
            </div>

            {/* Step Content */}
            <div style={{
                flex: 1,
                maxWidth: 400,
                width: '100%',
                margin: '0 auto'
            }}>
                {/* Step 1: Shop Setup */}
                {step === 0 && (
                    <div style={{ animation: 'scaleIn 0.3s ease' }}>
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Store size={16} />
                                Shop Name
                            </label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="e.g. Sharma General Store"
                                value={shopName}
                                onChange={(e) => setShopName(e.target.value)}
                                autoFocus
                                style={{ fontSize: '1rem', padding: '14px 16px' }}
                                id="onboarding-shop-name"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Currency Symbol</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {['₹', '$', '€', '£'].map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setCurrency(c)}
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            background: currency === c
                                                ? 'linear-gradient(135deg, var(--primary-500), var(--primary-400))'
                                                : 'var(--bg-card)',
                                            color: currency === c ? '#000' : 'var(--text-secondary)',
                                            border: currency === c
                                                ? 'none'
                                                : '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '1.2rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Add First Product */}
                {step === 1 && (
                    <div style={{ animation: 'scaleIn 0.3s ease' }}>
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Package size={16} />
                                Product Name
                            </label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="e.g. Milk, Rice, Bread..."
                                value={product.name}
                                onChange={(e) => setProduct(p => ({ ...p, name: e.target.value }))}
                                autoFocus
                                style={{ fontSize: '1rem', padding: '14px 16px' }}
                                id="onboarding-product-name"
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label className="form-label">Selling Price ({currency})</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="e.g. 50"
                                    value={product.selling_price}
                                    onChange={(e) => setProduct(p => ({ ...p, selling_price: e.target.value }))}
                                    style={{ fontSize: '1rem', padding: '14px 16px' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Cost Price ({currency})</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="e.g. 40"
                                    value={product.cost_price}
                                    onChange={(e) => setProduct(p => ({ ...p, cost_price: e.target.value }))}
                                    style={{ fontSize: '1rem', padding: '14px 16px' }}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Stock Quantity</label>
                            <input
                                className="form-input"
                                type="number"
                                inputMode="numeric"
                                placeholder="e.g. 100"
                                value={product.stock_quantity}
                                onChange={(e) => setProduct(p => ({ ...p, stock_quantity: e.target.value }))}
                                style={{ fontSize: '1rem', padding: '14px 16px' }}
                            />
                        </div>
                    </div>
                )}

                {/* Step 3: All Set */}
                {step === 2 && (
                    <div style={{
                        textAlign: 'center',
                        animation: 'scaleIn 0.3s ease',
                        padding: '20px 0'
                    }}>
                        <div style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-400))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 24px',
                            animation: 'pulse 2s infinite',
                            boxShadow: '0 0 40px rgba(245, 166, 35, 0.3)'
                        }}>
                            <Sparkles size={36} color="#000" />
                        </div>

                        <div style={{
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '20px',
                            border: '1px solid var(--border-color)',
                            textAlign: 'left',
                            marginBottom: 16
                        }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                                Your Setup
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Shop</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.88rem' }}>{shopName}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Currency</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.88rem' }}>{currency}</span>
                            </div>
                            {product.name && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>First Product</span>
                                    <span style={{ color: 'var(--accent-400)', fontWeight: 700, fontSize: '0.88rem' }}>{product.name}</span>
                                </div>
                            )}
                        </div>

                        <p style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                            lineHeight: 1.6
                        }}>
                            You can add more products and customize settings anytime from the app.
                        </p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--danger-400)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        marginBottom: 16
                    }}>
                        {error}
                    </div>
                )}
            </div>

            {/* Footer Buttons */}
            <div style={{
                padding: '20px 0 40px',
                maxWidth: 400,
                width: '100%',
                margin: '0 auto'
            }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    {step > 0 && step < 2 && (
                        <button
                            className="btn btn-ghost"
                            onClick={() => setStep(s => s - 1)}
                            style={{
                                padding: '14px 20px',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            <ChevronLeft size={18} />
                            Back
                        </button>
                    )}

                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleNext}
                        disabled={saving}
                        style={{
                            flex: 1,
                            padding: '14px',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8
                        }}
                    >
                        {step === 2 ? 'Start Billing!' : 'Continue'}
                        <ChevronRight size={18} />
                    </button>
                </div>

                {step === 1 && (
                    <button
                        onClick={handleSkip}
                        style={{
                            width: '100%',
                            marginTop: 12,
                            padding: '10px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500
                        }}
                    >
                        Skip for now →
                    </button>
                )}
            </div>
        </div>
    );
}
