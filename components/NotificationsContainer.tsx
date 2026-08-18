import React from 'react';
import { useNotification } from './NotificationProvider';

const NotificationsContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  return (
    <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] right-4 z-[110] space-y-2 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`pointer-events-auto w-80 p-4 rounded-lg shadow-lg border-l-4 transform transition-all duration-300 animate-fade-in ${
            notification.type === 'success' ? 'bg-surface border-success text-text-primary' :
            notification.type === 'danger' ? 'bg-surface border-danger text-text-primary' :
            notification.type === 'warning' ? 'bg-surface border-warning text-text-primary' :
            'bg-surface border-info text-text-primary'
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h4 className={`text-sm font-bold ${
                 notification.type === 'success' ? 'text-success' :
                 notification.type === 'danger' ? 'text-danger' :
                 notification.type === 'warning' ? 'text-warning' :
                 'text-info'
              }`}>{notification.title}</h4>
              <p className="text-sm text-text-secondary mt-1">{notification.message}</p>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-text-muted hover:text-text-primary"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationsContainer;