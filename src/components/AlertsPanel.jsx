import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { generateAlerts } from '../backend/alerts';

const SEVERITY_STYLES = {
    critical: {
        border: 'rgba(239, 68, 68, 0.25)',
        bg: 'rgba(239, 68, 68, 0.06)',
        accent: 'var(--danger-400)',
        dot: '#ef4444'
    },
    warning: {
        border: 'rgba(245, 166, 35, 0.25)',
        bg: 'rgba(245, 166, 35, 0.06)',
        accent: 'var(--primary-400)',
        dot: '#f5a623'
    },
    info: {
        border: 'rgba(56, 189, 248, 0.2)',
        bg: 'rgba(56, 189, 248, 0.04)',
        accent: 'var(--info-400)',
        dot: '#38bdf8'
    },
    success: {
        border: 'rgba(16, 185, 129, 0.25)',
        bg: 'rgba(16, 185, 129, 0.06)',
        accent: 'var(--accent-400)',
        dot: '#10b981'
    }
};

export default function AlertsPanel({ isOpen, onClose, onNavigate }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('billmate_dismissed_alerts') || '[]');
        } catch {
            return [];
        }
    });

    const loadAlerts = async () => {
        setLoading(true);
        const data = await generateAlerts();
        setAlerts(data.filter(a => !dismissed.includes(a.id)));
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen) {
            loadAlerts();
        }
    }, [isOpen]);

    const dismissAlert = (alertId) => {
        const updated = [...dismissed, alertId];
        setDismissed(updated);
        localStorage.setItem('billmate_dismissed_alerts', JSON.stringify(updated));
        setAlerts(prev => prev.filter(a => a.id !== alertId));
    };

    const handleAction = (alert) => {
        if (onNavigate) {
            switch (alert.type) {
                case 'stock': onNavigate('products'); break;
                case 'credit': onNavigate('customers'); break;
                case 'performance': onNavigate('sales'); break;
                case 'expense': onNavigate('expenses'); break;
                default: break;
            }
        }
        onClose();
    };

    if (!isOpen) return null;

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content"
                onClick={e => e.stopPropagation()}
                style={{ maxHeight: '80vh' }}
            >
                <div className="modal-handle" />

                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20
                }}>
                    <div>
                        <h2 style={{
                            fontSize: '1.2rem',
                            fontWeight: 800,
                            letterSpacing: '-0.01em',
                            marginBottom: 4
                        }}>
                            🔔 Notifications
                        </h2>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {alerts.length === 0
                                ? 'All caught up!'
                                : `${alerts.length} alert${alerts.length > 1 ? 's' : ''}`
                            }
                            {criticalCount > 0 && (
                                <span style={{ color: 'var(--danger-400)', marginLeft: 8 }}>
                                    {criticalCount} critical
                                </span>
                            )}
                            {warningCount > 0 && (
                                <span style={{ color: 'var(--primary-400)', marginLeft: 8 }}>
                                    {warningCount} warning{warningCount > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        style={{ flexShrink: 0 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Alerts List */}
                {loading ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: 'var(--text-muted)',
                        fontSize: '0.88rem'
                    }}>
                        Checking your data...
                    </div>
                ) : alerts.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '48px 24px'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
                        <div style={{
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            marginBottom: 8
                        }}>
                            All Clear!
                        </div>
                        <div style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                            lineHeight: 1.5
                        }}>
                            No alerts right now. Your business is running smoothly!
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {alerts.map((alert) => {
                            const style = SEVERITY_STYLES[alert.severity];
                            return (
                                <div
                                    key={alert.id}
                                    style={{
                                        background: style.bg,
                                        border: `1px solid ${style.border}`,
                                        borderRadius: 'var(--radius-md)',
                                        padding: '14px 16px',
                                        animation: 'scaleIn 0.25s ease',
                                        position: 'relative'
                                    }}
                                >
                                    {/* Severity dot */}
                                    <div style={{
                                        position: 'absolute',
                                        top: 16,
                                        left: 16,
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: style.dot,
                                        boxShadow: `0 0 6px ${style.dot}40`
                                    }} />

                                    <div style={{ paddingLeft: 20 }}>
                                        {/* Title row */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: 6
                                        }}>
                                            <div style={{
                                                fontSize: '0.9rem',
                                                fontWeight: 700,
                                                color: 'var(--text-primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8
                                            }}>
                                                <span>{alert.icon}</span>
                                                {alert.title}
                                            </div>
                                            <button
                                                onClick={() => dismissAlert(alert.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer',
                                                    padding: 4,
                                                    fontSize: '0.75rem',
                                                    flexShrink: 0
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        {/* Message */}
                                        <div style={{
                                            fontSize: '0.82rem',
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.5,
                                            marginBottom: alert.type !== 'milestone' ? 10 : 0
                                        }}>
                                            {alert.message}
                                        </div>

                                        {/* Action button */}
                                        {alert.type !== 'milestone' && (
                                            <button
                                                onClick={() => handleAction(alert)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: style.accent,
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    fontFamily: 'Inter, sans-serif',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4
                                                }}
                                            >
                                                View Details <ChevronRight size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Clear All */}
                {alerts.length > 0 && (
                    <button
                        onClick={() => {
                            alerts.forEach(a => dismissAlert(a.id));
                        }}
                        style={{
                            width: '100%',
                            marginTop: 16,
                            padding: '12px',
                            background: 'none',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '0.82rem',
                            fontWeight: 600
                        }}
                    >
                        Dismiss All
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Hook to get alert count for badge display
 */
export function useAlertCount() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const checkAlerts = async () => {
            try {
                const dismissed = JSON.parse(localStorage.getItem('billmate_dismissed_alerts') || '[]');
                const alerts = await generateAlerts();
                setCount(alerts.filter(a => !dismissed.includes(a.id)).length);
            } catch {
                setCount(0);
            }
        };

        checkAlerts();
        // Re-check every 60 seconds
        const interval = setInterval(checkAlerts, 60000);
        return () => clearInterval(interval);
    }, []);

    return count;
}
