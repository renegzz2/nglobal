import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, Incident } from '../types';
import { PlusIcon, ExclamationIcon } from './icons';
import { useNotification } from './NotificationProvider';
import { incidentsChanged, listIncidents, queueIncident, syncIncidents, type ListedIncident } from '../features/shipments/incidents';

interface IncidentModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: UsaShipmentReport;
    canWrite: boolean;
}

const INCIDENT_TYPES = [
    'Retraso en Carga',
    'Falla Mecánica',
    'Retén / Inspección',
    'Accidente Vial',
    'Desvío de Ruta',
    'Problema de Temperatura',
    'Otro'
];

const IncidentModal: React.FC<IncidentModalProps> = ({ isOpen, onClose, report, canWrite }) => {
    const { addNotification } = useNotification();
    const [incidents, setIncidents] = useState<ListedIncident[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [ownerId, setOwnerId] = useState<string>();
    const [newIncident, setNewIncident] = useState<Incident>({
        type: '',
        location: '',
        timestamp: new Date().toISOString(),
        description: ''
    });
    const [saving, setSaving] = useState(false);

    const loadIncidents = async (account: string) => {
        const recent = await listIncidents(account, report.id);
        const legacy = Array.isArray(report.incidents) ? report.incidents : [];
        return [...legacy, ...recent].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    };

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        setIsAdding(false);
        setOwnerId(undefined);
        setIncidents(Array.isArray(report.incidents) ? report.incidents : []);
        const refresh = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!active || !session?.user.id) return;
                setOwnerId(session.user.id);
                const list = await loadIncidents(session.user.id);
                if (active) {
                    setIncidents(list);
                }
            } catch {
                if (active) addNotification({ type: 'danger', title: 'Incidencias', message: 'No se pudo cargar la bitácora.' });
            }
        };
        void refresh();
        window.addEventListener(incidentsChanged, refresh);
        return () => {
            active = false;
            window.removeEventListener(incidentsChanged, refresh);
        };
    }, [isOpen, report]);

    const handleAddIncident = async () => {
        if (!ownerId || !canWrite || saving) return;
        if (!newIncident.type || !newIncident.description.trim()) {
            addNotification({ type: 'warning', title: 'Datos faltantes', message: 'Tipo y descripción son obligatorios.' });
            return;
        }
        setSaving(true);
        try {
            const incident = { ...newIncident, timestamp: new Date().toISOString() };
            const id = await queueIncident(ownerId, report.id, incident);
            setIncidents(previous => [{ ...incident, id, pending: true }, ...previous]);
            setIsAdding(false);
            setNewIncident({ type: '', location: '', timestamp: '', description: '' });
            void syncIncidents(ownerId).catch(console.error);
        } catch {
            addNotification({ type: 'danger', title: 'Incidencias', message: 'No se pudo guardar la incidencia en el dispositivo.' });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[150] flex justify-center items-center p-4">
            <div className="bg-surface rounded-2xl shadow-2xl w-[92vw] md:max-w-2xl flex flex-col border border-border max-h-[75vh] md:max-h-[85vh] animate-fade-in overflow-hidden">
                <div className="p-6 bg-danger text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <ExclamationIcon className="w-5 h-5 md:w-6 md:h-6" />
                        <div>
                            <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">Incidencias</h3>
                            <p className="text-white/80 text-[10px] uppercase truncate max-w-[120px]">{report.tripId}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background/30 custom-scrollbar">
                    {isAdding ? (
                        <div className="bg-white p-4 md:p-6 rounded-2xl border border-border shadow-sm space-y-4 animate-fade-in">
                            <h4 className="text-[10px] font-black text-danger uppercase tracking-widest border-b border-border pb-2">Nuevo Reporte</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Tipo *</label>
                                    <select 
                                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
                                        value={newIncident.type}
                                        onChange={e => setNewIncident({...newIncident, type: e.target.value})}
                                    >
                                        <option value="">Seleccione...</option>
                                        {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Descripción *</label>
                                    <textarea 
                                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-bold outline-none h-20"
                                        placeholder="Detalles..."
                                        maxLength={3000}
                                        value={newIncident.description}
                                        onChange={e => setNewIncident({...newIncident, description: e.target.value})}
                                    ></textarea>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setIsAdding(false)} className="flex-1 py-2 rounded-lg font-bold text-[10px] text-text-muted hover:bg-hover transition-all">Atrás</button>
                                <button 
                                    onClick={handleAddIncident} 
                                    disabled={saving}
                                    className="flex-1 py-2 bg-danger text-white rounded-lg font-black text-[10px] uppercase tracking-widest"
                                >
                                    {saving ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {canWrite && ownerId && <button
                                onClick={() => setIsAdding(true)}
                                className="w-full bg-danger text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" /> Reportar Incidencia
                            </button>}

                            {incidents.length === 0 ? (
                                <div className="py-10 text-center opacity-40 italic text-xs">Sin registros críticos.</div>
                            ) : (
                                <div className="space-y-3">
                                    {incidents.map((inc, i) => (
                                        <div key={inc.id || i} className="bg-white p-3 rounded-xl border border-border shadow-sm border-l-4 border-l-danger">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[9px] font-black text-danger uppercase">{inc.type}{inc.rejected ? ' · Requiere revisión' : inc.pending ? ' · Pendiente de sincronizar' : ''}</span>
                                                <span className="text-[8px] font-bold text-text-muted">{new Date(inc.timestamp).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-[10px] text-text-secondary leading-tight">{inc.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-white flex justify-end shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
                    <button onClick={onClose} className="w-full md:w-auto px-6 py-2 rounded-xl font-bold text-xs text-text-secondary hover:bg-hover transition-all">Cerrar</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default IncidentModal;