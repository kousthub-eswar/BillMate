import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

const ToastContext = createContext();

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2500);
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.type === 'success' ? (
                        <CheckCircle size={18} color="#34d399" />
                    ) : (
                        <AlertCircle size={18} color="#f87171" />
                    )}
                    {toast.message}
                </div>
            )}
        </ToastContext.Provider>
    );
}
