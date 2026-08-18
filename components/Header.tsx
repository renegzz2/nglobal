import React, { useState } from 'react';
import { useNotification } from './NotificationProvider';
import NotificationHistoryPanel from './NotificationHistoryPanel';

interface HeaderProps {
  onMenuClick: () => void;
  onChatClick: () => void;
  title: string;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onChatClick, title }) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { unreadCount } = useNotification();

  return (
    <>
      <header className="bg-surface border-b border-border flex items-center justify-between px-6 shadow-sm z-10 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onMenuClick}
            className="p-2 rounded-xl hover:bg-primary/10 text-primary transition-all active:scale-90 border border-transparent hover:border-primary/20"
            aria-label="Toggle Sidebar"
            title="Alternar Barra Lateral"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <h1 className="text-xl font-bold text-text-primary truncate">{title}</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={onChatClick}
            className="p-2 rounded-xl hover:bg-hover text-text-muted transition-all active:scale-90 group"
            title="Abrir Mensajería"
          >
            <svg className="w-5 h-5 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 rounded-xl hover:bg-hover text-text-muted relative transition-all active:scale-90 group"
            title="Ver Historial de Notificaciones"
          >
            <svg className="w-5 h-5 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-danger text-white text-[8px] font-black rounded-full border-2 border-surface flex items-center justify-center px-1 shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
          </button>
        </div>
      </header>

      <NotificationHistoryPanel 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
      />
    </>
  );
};

export default Header;