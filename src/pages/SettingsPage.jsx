import { useState, useEffect, useRef } from 'react';
import {
    Store, DollarSign, AlertTriangle, MessageSquare,
    Download, Upload, LogOut, ChevronRight, FileText
} from 'lucide-react';
import { getAllSettings, setSetting } from '../database';
import { exportAllData, importAllData, logout } from '../backend';
import { useToast } from '../components/Toast';

export default function SettingsPage({ onLogout }) {
    const [settings, setSettings] = useState({});
    const [showEditModal, setShowEditModal] = useState(null);
    const [editValue, setEditValue] = useState('');
    const fileInputRef = useRef(null);
    const showToast = useToast();

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const s = await getAllSettings();
        setSettings(s);
    };

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
            showToast('Data exported');
        } catch (err) {
            showToast('Export failed', 'error');
        }
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const result = await importAllData(event.target.result);
            if (result.success) {
                showToast('Data imported successfully');
                loadSettings();
            } else {
                showToast(result.message, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleLogout = () => {
        logout();
        onLogout();
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

    return (
        <div className="page-content">
            <div className="page-header">
                <h1>Settings</h1>
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

                <div className="settings-item" onClick={handleExport}>
                    <div className="settings-item-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-400)' }}>
                        <Download size={18} />
                    </div>
                    <div className="settings-item-info">
                        <div className="settings-item-label">Export Data</div>
                        <div className="settings-item-desc">Download all data as JSON backup</div>
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
        </div>
    );
}
