import { useState, useEffect, useRef } from 'react';
import {
    Store, DollarSign, AlertTriangle, MessageSquare,
    Download, Upload, LogOut, ChevronRight, FileText, Smartphone,
    Sun, Moon, ShieldAlert, ShieldCheck, RotateCcw
} from 'lucide-react';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { getAllSettings, setSetting, DEFAULT_SETTINGS } from '../database';
import { exportAllData, importAllData, logout } from '../backend';
import { useToast } from '../components/Toast';

export default function SettingsPage({ onLogout }) {
    const [settings, setSettings] = useState({});
    const [showEditModal, setShowEditModal] = useState(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [editValue, setEditValue] = useState('');
    const fileInputRef = useRef(null);
    const showToast = useToast();
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('billmate_theme') || 'dark';
    });

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
        }

        // Capture install prompt
        const handler = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // Apply theme on mount and whenever it changes
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('billmate_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const loadSettings = async () => {
        const s = await getAllSettings();
        setSettings(s);
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const openEdit = (key, value) => {
        setShowEditModal(key);
        setEditValue(value?.toString() || '');
    };

    const handleSave = async () => {
        if (showEditModal) {
            await setSetting(showEditModal, editValue);
            showToast('Setting updated');
            setShowEditModal(null);
            loadSettings();
        }
    };

    const handleExport = async () => {
        try {
            await exportAllData();
            await setSetting('last_backup', new Date().toISOString());
            loadSettings();
            showToast('Data exported');
        } catch (_err) {
            showToast('Export failed', 'error');
        }
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const result = await importAllData(event.target.result);
                if (result.success) {
                    showToast('Data imported successfully');
                    loadSettings();
                } else {
                    showToast(result.message || 'Import failed. File may be corrupted.', 'error');
                }
            } catch (e) {
                showToast('Invalid backup file or network error', 'error');
            }
        };
        reader.onerror = () => showToast('Failed to read backup file', 'error');
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleLogout = () => {
        logout();
        onLogout();
    };

    const handleResetSettings = async () => {
        for (const key in DEFAULT_SETTINGS) {
            await setSetting(key, DEFAULT_SETTINGS[key]);
        }
        await loadSettings();
        showToast('Settings restored to default');
        setShowResetConfirm(false);
    };

    const getSettingLabel = (key) => {
        const labels = {
            shop_name: 'Shop Name',
            currency: 'Currency Symbol',
            low_stock_threshold: 'Low Stock Threshold',
            receipt_template: 'Receipt Template'
        };
        return labels[key] || key;
    };

    const getSettingDescription = (key) => {
        const descs = {
            shop_name: 'Displayed on receipts and dashboard',
            currency: 'Currency symbol used throughout the app',
            low_stock_threshold: 'Alert when stock falls below this number',
            receipt_template: 'WhatsApp receipt message format'
        };
        return descs[key] || '';
    };

    const getSettingIcon = (key) => {
        const icons = {
            shop_name: Store,
            currency: DollarSign,
            low_stock_threshold: AlertTriangle,
            receipt_template: MessageSquare
        };
        const Icon = icons[key] || FileText;
        return <Icon size={18} />;
    };

    const getLastBackupText = () => {
        if (!settings.last_backup) return 'Never';
        const days = Math.floor((new Date() - new Date(settings.last_backup)) / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        return `${days} days ago`;
    };

    const backupDaysAgo = settings.last_backup ? Math.floor((new Date() - new Date(settings.last_backup)) / (1000 * 60 * 60 * 24)) : Infinity;
    const needsBackup = backupDaysAgo >= 7;

    return (
        <div className="page-content">
            <AppHeader title="Settings" />

            {/* Appearance */}
            <div className="settings-group">
                <div className="settings-group-title">Appearance</div>

                <div className="settings-item" onClick={toggleTheme} id="theme-toggle">
                    <div className="settings-item-icon" style={{ background: theme === 'dark' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 166, 35, 0.15)', color: theme === 'dark' ? 'var(--info-400)' : 'var(--primary-400)' }}>
                        <span className="theme-toggle-icon" style={{ display: 'flex' }}>
                            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        </span>
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</div>
                        <div className="settings-item-desc">Tap to switch to {theme === 'dark' ? 'light' : 'dark'} mode</div>
                    </div>
                    {/* Custom theme pill toggle */}
                    <div style={{
                        marginLeft: 'auto',
                        width: '60px',
                        height: '32px',
                        borderRadius: '16px',
                        background: theme === 'dark'
                            ? 'linear-gradient(135deg, #1e293b, #334155)'
                            : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                        border: theme === 'dark'
                            ? '1.5px solid rgba(56, 189, 248, 0.3)'
                            : '1.5px solid rgba(245, 166, 35, 0.3)',
                        position: 'relative',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: theme === 'dark'
                            ? 'inset 0 1px 3px rgba(0,0,0,0.3)'
                            : 'inset 0 1px 3px rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                    }}>
                        {/* Stars in dark mode background */}
                        {theme === 'dark' && (
                            <>
                                <div style={{ position: 'absolute', top: '6px', left: '10px', width: '2px', height: '2px', borderRadius: '50%', background: 'rgba(255,255,255,0.6)' }} />
                                <div style={{ position: 'absolute', top: '14px', left: '16px', width: '1.5px', height: '1.5px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                                <div style={{ position: 'absolute', top: '8px', left: '22px', width: '2px', height: '2px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
                            </>
                        )}
                        {/* Sliding knob */}
                        <div style={{
                            position: 'absolute',
                            top: '3px',
                            left: theme === 'dark' ? '31px' : '3px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: theme === 'dark'
                                ? 'linear-gradient(135deg, #38bdf8, #0ea5e9)'
                                : 'linear-gradient(135deg, #f59e0b, #f5a623)',
                            boxShadow: theme === 'dark'
                                ? '0 2px 8px rgba(56, 189, 248, 0.4)'
                                : '0 2px 8px rgba(245, 166, 35, 0.4)',
                            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {theme === 'dark'
                                ? <Moon size={13} color="white" strokeWidth={2.5} />
                                : <Sun size={13} color="white" strokeWidth={2.5} />
                            }
                        </div>
                    </div>
                </div>
            </div>

            {/* Shop Settings */}
            <div className="settings-group">
                <div className="settings-group-title">Shop Settings</div>

                {['shop_name', 'currency', 'low_stock_threshold'].map(key => (
                    <div key={key} className="settings-item" onClick={() => openEdit(key, settings[key])}>
                        <div className="settings-item-icon">
                            {getSettingIcon(key)}
                        </div>
                        <div className="settings-item-info">
                            <div className="settings-item-label">{getSettingLabel(key)}</div>
                            <div className="settings-item-desc">
                                {settings[key] || getSettingDescription(key)}
                            </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                ))}
            </div>

            {/* Receipt Settings */}
            <div className="settings-group">
                <div className="settings-group-title">Receipt</div>

                <div className="settings-item" onClick={() => openEdit('receipt_template', settings.receipt_template)}>
                    <div className="settings-item-icon">
                        <MessageSquare size={18} />
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label">Receipt Template</div>
                        <div className="settings-item-desc">Customize WhatsApp receipt format</div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </div>
            </div>

            {/* Data Tools */}
            <div className="settings-group">
                <div className="settings-group-title">Data Management</div>

                {needsBackup && (
                    <div style={{ background: 'rgba(245, 166, 35, 0.1)', padding: 12, borderRadius: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <AlertTriangle size={20} style={{ color: 'var(--warning-500)', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontWeight: 600, color: 'var(--warning-500)', fontSize: '0.85rem' }}>You have not backed up your data recently.</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Tap Export Backup to save your shop data.</div>
                        </div>
                    </div>
                )}

                <div className="settings-item" onClick={handleExport}>
                    <div className="settings-item-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-400)' }}>
                        <Download size={18} />
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label">Export Backup</div>
                        <div className="settings-item-desc">
                            Last Backup: {getLastBackupText()}
                            {needsBackup ? ' ⚠️' : ' ✅'}
                        </div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </div>

                <div className="settings-item" onClick={() => fileInputRef.current?.click()}>
                    <div className="settings-item-icon" style={{ background: 'rgba(251, 191, 36, 0.15)', color: 'var(--warning-400)' }}>
                        <Upload size={18} />
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label">Import Data</div>
                        <div className="settings-item-desc">Restore from JSON backup</div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </div>

                <div className="settings-item" onClick={() => setShowResetConfirm(true)}>
                    <div className="settings-item-icon" style={{ background: 'rgba(148, 163, 184, 0.15)', color: 'var(--text-secondary)' }}>
                        <RotateCcw size={18} />
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label">Reset Settings</div>
                        <div className="settings-item-desc">Restore default preferences</div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    style={{ display: 'none' }}
                />
            </div>

            {/* Logout */}
            <div className="settings-group">
                <div className="settings-item" onClick={handleLogout} style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                    <div className="settings-item-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger-400)' }}>
                        <LogOut size={18} />
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label" style={{ color: 'var(--danger-400)' }}>Logout</div>
                        <div className="settings-item-desc">Sign out of your account</div>
                    </div>
                </div>
            </div>

            {/* Install App */}
            {!isInstalled && (
                <div className="settings-group">
                    <div className="settings-group-title">App</div>
                    <div
                        className="settings-item"
                        onClick={async () => {
                            if (installPrompt) {
                                installPrompt.prompt();
                                const result = await installPrompt.userChoice;
                                if (result.outcome === 'accepted') {
                                    showToast('BillMate installed! 🎉');
                                    setIsInstalled(true);
                                }
                                setInstallPrompt(null);
                            } else {
                                showToast('Open in Chrome and use "Add to Home Screen"', 'info');
                            }
                        }}
                        style={{ borderColor: 'rgba(245, 166, 35, 0.2)' }}
                    >
                        <div className="settings-item-icon" style={{ background: 'rgba(245, 166, 35, 0.15)', color: 'var(--primary-400)' }}>
                            <Smartphone size={18} />
                        </div>
                        <div className="settings-item-info">
                            <div className="settings-item-label" style={{ color: 'var(--primary-400)' }}>Install App</div>
                            <div className="settings-item-desc">Add BillMate to your home screen</div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                </div>
            )}

            {/* App Info */}
            <div style={{
                textAlign: 'center',
                padding: '20px 0 30px',
                color: 'var(--text-muted)',
                fontSize: '0.75rem'
            }}>
                <div style={{ fontWeight: 700, color: 'var(--primary-400)', fontSize: '1rem', marginBottom: 4 }}>
                    BillMate POS
                </div>
                <div style={{ fontSize: '0.85rem' }}>Version 1.0</div>
                <div style={{ fontSize: '0.85rem', marginTop: 2 }}>Offline Retail Billing System</div>
                {isInstalled && (
                    <div style={{ marginTop: 8, color: 'var(--accent-400)' }}>✓ Installed as App</div>
                )}
            </div>

            {/* Edit Setting Modal */}
            {showEditModal && (
                <div className="modal-overlay" onClick={() => setShowEditModal(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <div className="modal-title">{getSettingLabel(showEditModal)}</div>

                        <div className="form-group">
                            <label className="form-label">{getSettingDescription(showEditModal)}</label>
                            {showEditModal === 'receipt_template' ? (
                                <textarea
                                    className="form-input"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={8}
                                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                                    id="receipt-template-input"
                                />
                            ) : (
                                <input
                                    className="form-input"
                                    type={showEditModal === 'low_stock_threshold' ? 'number' : 'text'}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    id="setting-value-input"
                                />
                            )}
                        </div>

                        {showEditModal === 'receipt_template' && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                                <strong>Placeholders:</strong> {'{shop_name}'}, {'{items}'}, {'{currency}'}, {'{total}'}, {'{payment_method}'}, {'{date}'}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary" onClick={() => setShowEditModal(null)} style={{ flex: 1 }}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1 }} id="save-setting">
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showResetConfirm && (
                <ConfirmDialog
                    title="Reset Settings?"
                    message="Are you sure you want to restore all settings to their defaults? Your shop data (products, sales) will not be deleted."
                    confirmText="Reset"
                    variant="danger"
                    onConfirm={handleResetSettings}
                    onCancel={() => setShowResetConfirm(false)}
                />
            )}
        </div>
    );
}
