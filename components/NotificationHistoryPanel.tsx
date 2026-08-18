import React from 'react';
import { createPortal } from 'react-dom';
import { useNotification } from './NotificationProvider';
import { ExclamationIcon, TrashIcon, ClockIcon } from './icons';

interface NotificationHistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const NotificationHistoryPanel: React.FC<NotificationHistoryPanelProps> = ({ isOpen, onClose }) => {
    const { history, clearHistory, markAllAsRead } = useNotification();

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[200] overflow-hidden">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            
            <div className="absolute inset-y-0 right-0 max-w-full flex">
                <div className="w-screen max-w-md animate-fade-in">
                    <div className="h-full flex flex-col bg-surface shadow-2xl border-l border-border">
                        {/* Header del Panel */}
                        <div className="p-6 bg-primary text-white shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-black uppercase tracking-tighter">Bitácora de Sistema</h2>
                                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mt-0.5">Historial de Eventos Recientes</p>
                                </div>
                                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="flex gap-4 mt-6">
                                <button 
                                    onClick={markAllAsRead}
                                    className="flex-1 bg-white/10 hover:bg-white/20 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-white/10"
                                >
                                    Marcar Leídos
                                </button>
                                <button 
                                    onClick={() => { if(confirm('¿Vaciar bitácora?')) clearHistory(); }}
                                    className="flex-1 bg-danger/20 hover:bg-danger/40 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-danger/20 text-white"
                                >
                                    Limpiar Todo
                                </button>
                            </div>
                        </div>

                        {/* Lista de Mensajes */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-background/30">
                            {history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full opacity-30">
                                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                                        <ClockIcon className="w-8 h-8 text-primary" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-widest">Sin notificaciones registradas</p>
                                </div>
                            ) : (
                                history.map((item) => (
                                    <div 
                                        key={item.id} 
                                        className={`p-4 rounded-2xl border bg-white shadow-sm transition-all relative overflow-hidden group ${
                                            !item.read ? 'border-primary/30 ring-1 ring-primary/5' : 'border-border'
                                        }`}
                                    >
                                        {!item.read && (
                                            <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-bl-lg" />
                                        )}
                                        <div className="flex gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                item.type === 'success' ? 'bg-success/10 text-success' :
                                                item.type === 'danger' ? 'bg-danger/10 text-danger' :
                                                item.type === 'warning' ? 'bg-warning/10 text-warning' :
                                                'bg-info/10 text-info'
                                            }`}>
                                                <ExclamationIcon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-0.5">
                                                    <h4 className="text-[11px] font-black text-primary uppercase truncate pr-2">{item.title}</h4>
                                                    <span className="text-[8px] font-bold text-text-muted whitespace-nowrap bg-surface-secondary px-1.5 py-0.5 rounded uppercase">
                                                        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-text-secondary font-medium leading-tight">{item.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-border bg-surface shrink-0 text-center">
                             <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">nglobal Logistics Intelligence Center v3.0</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default NotificationHistoryPanel;