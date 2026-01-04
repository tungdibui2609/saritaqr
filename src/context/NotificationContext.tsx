import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast } from '../components/ui/Toast';
import { CustomAlert, AlertButton } from '../components/ui/CustomAlert';

interface NotificationContextType {
    showToast: (message: string, type?: 'success' | 'warning' | 'error' | 'info', duration?: number) => void;
    showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
    hideAlert: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    // Toast State
    const [toast, setToast] = useState({
        visible: false,
        message: '',
        type: 'info' as 'success' | 'warning' | 'error' | 'info',
        duration: 3000
    });

    // Alert State
    const [alert, setAlert] = useState<{
        visible: boolean;
        title: string;
        message?: string;
        buttons?: AlertButton[];
    }>({
        visible: false,
        title: '',
    });

    const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', duration = 3000) => {
        setToast({ visible: true, message, type, duration });
    }, []);

    const hideToast = useCallback(() => {
        setToast(prev => ({ ...prev, visible: false }));
    }, []);

    const showAlert = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
        setAlert({ visible: true, title, message, buttons });
    }, []);

    const hideAlert = useCallback(() => {
        setAlert(prev => ({ ...prev, visible: false }));
    }, []);

    return (
        <NotificationContext.Provider value={{ showToast, showAlert, hideAlert }}>
            {children}

            <Toast
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onHide={hideToast}
            />

            <CustomAlert
                visible={alert.visible}
                title={alert.title}
                message={alert.message}
                buttons={alert.buttons}
                onDismiss={hideAlert}
            />
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
