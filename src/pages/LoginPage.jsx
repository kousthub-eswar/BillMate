import { useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, Eye, EyeOff, CheckCircle, RotateCcw } from 'lucide-react';
import { signIn, signUp } from '../backend/auth';
import { useToast } from '../components/Toast';

export default function LoginPage({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [confirmationSent, setConfirmationSent] = useState(false);
    const showToast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            showToast('Please enter email and password', 'error');
            return;
        }
        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        setLoading(true);
        try {
            if (isSignUp) {
                const result = await signUp(email.trim(), password);
                // If email confirmation is required, user won't have a session yet
                if (result?.user && !result?.session) {
                    setConfirmationSent(true);
                } else if (result?.session) {
                    showToast('Account created! Welcome!');
                    onLogin();
                } else {
                    setConfirmationSent(true);
                }
            } else {
                await signIn(email.trim(), password);
                showToast('Welcome back!');
                onLogin();
            }
        } catch (err) {
            const msg = err.message || 'Authentication failed';
            if (msg.includes('Email not confirmed')) {
                setConfirmationSent(true);
            } else {
                showToast(msg, 'error');
            }
        }
        setLoading(false);
    };

    const handleResend = async () => {
        setLoading(true);
        try {
            await signUp(email.trim(), password);
            showToast('Confirmation email re-sent!');
        } catch (err) {
            showToast('Could not resend. Try again later.', 'error');
        }
        setLoading(false);
    };

    if (confirmationSent) {
        return (
            <div className="login-container">
                <div className="login-card">
                    <div className="login-logo">
                        <div style={{
                            width: 72, height: 72,
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            borderRadius: 20,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px',
                            boxShadow: '0 8px 32px rgba(34,197,94,0.25)'
                        }}>
                            <CheckCircle size={36} color="#fff" />
                        </div>
                        <h1 className="login-title" style={{ fontSize: '1.4rem' }}>Check Your Email</h1>
                        <p className="login-subtitle" style={{ fontSize: '0.9rem', lineHeight: 1.5, marginTop: 8 }}>
                            We sent a confirmation link to<br />
                            <strong style={{ color: 'var(--primary-400)' }}>{email}</strong>
                        </p>
                    </div>

                    <div style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        padding: '16px 20px',
                        marginTop: 16,
                        width: '100%',
                        boxSizing: 'border-box'
                    }}>
                        <p style={{
                            margin: 0,
                            fontSize: '0.82rem',
                            color: 'var(--text-muted)',
                            lineHeight: 1.5,
                            textAlign: 'center'
                        }}>
                            Click the link in your email to verify your account, then come back and sign in.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 20, width: '100%' }}>
                        <button
                            onClick={handleResend}
                            disabled={loading}
                            className="btn"
                            style={{
                                flex: 1, padding: '12px',
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: 10,
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                            }}
                        >
                            <RotateCcw size={14} /> Resend
                        </button>
                        <button
                            onClick={() => { setConfirmationSent(false); setIsSignUp(false); }}
                            className="btn btn-primary"
                            style={{
                                flex: 2, padding: '12px',
                                borderRadius: 10,
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                            }}
                        >
                            <LogIn size={16} /> Go to Sign In
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <div className="login-logo-icon">🧾</div>
                    <h1 className="login-title">BillMate</h1>
                    <p className="login-subtitle">
                        {isSignUp ? 'Create your account' : 'Sign in to your POS'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                    <div className="form-group">
                        <label className="form-label">
                            <Mail size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                            Email
                        </label>
                        <input
                            className="form-input"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoFocus
                            autoComplete="email"
                            id="login-email"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                            Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="form-input"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Min 6 characters"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                id="login-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: 12,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 4
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={loading}
                        style={{
                            marginTop: 8,
                            padding: '14px',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            opacity: loading ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8
                        }}
                        id="login-submit"
                    >
                        {loading ? (
                            'Please wait...'
                        ) : isSignUp ? (
                            <><UserPlus size={18} /> Create Account</>
                        ) : (
                            <><LogIn size={18} /> Sign In</>
                        )}
                    </button>
                </form>

                <div style={{ marginTop: 20, textAlign: 'center' }}>
                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary-400)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            fontFamily: 'Inter, sans-serif'
                        }}
                    >
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}
