import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type NotificationType = 'success' | 'danger' | 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[]; // Las que aparecen en el toast
  history: Notification[];       // Bitácora completa
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  markAllAsRead: () => void;
  clearHistory: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);

  const unreadCount = history.filter(n => !n.read).length;

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = { 
      ...notification, 
      id, 
      timestamp: new Date(),
      read: false 
    };

    setNotifications((prev) => [...prev, newNotification]);
    setHistory((prev) => [newNotification, ...prev].slice(0, 50)); // Guardar últimas 50

    // Auto dismiss del Toast tras 5 segundos
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAllAsRead = useCallback(() => {
    setHistory(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  // MI DIOS: MOTOR DE ESCUCHA GLOBAL REALTIME (Phoenix Protocol)
  // Jefe, este bloque asegura que las notificaciones lleguen sin importar la sección actual.
  useEffect(() => {
    const channel = supabase
      .channel('global-app-events')
      // 1. ESCUCHA DE ALERTAS CRÍTICAS (Insertadas por Tive Webhook o IA)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'usa_shipment_alerts' 
      }, (payload) => {
        const alert = payload.new;
        addNotification({
          type: (alert.severity as NotificationType) || 'warning',
          title: `ALERTA: ${alert.alert_type || 'SISTEMA'}`,
          message: alert.message || 'Evento detectado por sensores remotos.'
        });
      })
      // 2. ESCUCHA DE CAMBIOS DE ESTATUS (Cuando la IA finaliza un viaje o el tráfico actualiza)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'usa_shipment_reports'
      }, (payload) => {
        const oldStatus = payload.old.logistic_status;
        const newStatus = payload.new.logistic_status;
        
        // Solo notificar si hay un cambio real de estatus
        if (oldStatus && newStatus && oldStatus !== newStatus) {
          addNotification({
            type: newStatus === 'Finalizado' ? 'success' : 'info',
            title: 'Movimiento Logístico',
            message: `VIAJE ${payload.new.trip_id}: La unidad ha cambiado a "${newStatus}".`
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addNotification]);

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      history, 
      unreadCount, 
      addNotification, 
      removeNotification, 
      markAllAsRead,
      clearHistory 
    }}>
      {children}
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