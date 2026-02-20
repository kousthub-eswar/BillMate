import { useState } from 'react';
import { login, register } from '../backend/auth';
import { initializeSettings } from '../database';
import { Receipt, Phone, Lock, User } from 'lucide-react';

export default function LoginPage({ onLogin }) {
    const [isRegister, setIsRegister] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let result;
            if (isRegister) {
                if (!name.trim()) {
                    setError('Name is required');
                    setLoading(false);
                    return;
                }
                result = register(name, phone, pin);
            } else {
                result = login(phone, pin);
            }

            if (result.success) {
                await initializeSettings();
                onLogin(result.user);
            } else {
                setError(result.error);
            }
        } catch (_err) {
            setError('Something went wrong');
        }

        setLoading(false);
    };

    return (
        <div className="login-container">
            <div className="login-logo">
                <div className="logo-icon" style={{ padding: 0, overflow: 'hidden' }}>
                    <img src="/icons/icon-192.svg" alt="BillMate" width={72} height={72} style={{ borderRadius: '24px' }} />
                </div>
                <h1>BillMate</h1>
                <p>Simple billing for smart vendors</p>
            </div>

            <div className="login-card">
                <div className="login-tabs">
                    <button
                        className={`login-tab ${!isRegister ? 'active' : ''}`}
                        onClick={() => { setIsRegister(false); setError(''); }}
                    >
                        Login
                    </button>
                    <button
                        className={`login-tab ${isRegister ? 'active' : ''}`}
                        onClick={() => { setIsRegister(true); setError(''); }}
                    >
                        Register
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {isRegister && (
                        <div className="form-group">
                            <label className="form-label">Your Name</label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    className="form-input"
                                    style={{ paddingLeft: 44 }}
                                    type="text"
                                    placeholder="Enter your name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    id="register-name"
                                />
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Phone Number</label>
                        <div style={{ position: 'relative' }}>
                            <Phone size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 44 }}
                                type="tel"
                                placeholder="Enter phone number"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                id="login-phone"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">PIN</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 44 }}
                                type="password"
                                placeholder="Enter 4-digit PIN"
                                maxLength={4}
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                id="login-pin"
                            />
                        </div>
                    </div>

                    {error && (
                        <p style={{ color: 'var(--danger-400)', fontSize: '0.8rem', marginBottom: 16, textAlign: 'center' }}>
                            {error}
                        </p>
                    )}

                    <button
                        className="btn btn-primary btn-lg btn-block"
                        type="submit"
                        disabled={loading || !phone || pin.length < 4}
                        id="login-submit"
                    >
                        {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
}
