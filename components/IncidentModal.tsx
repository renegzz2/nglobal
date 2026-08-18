import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, Incident, EstatusDB } from '../types';
import { TrashIcon, PlusIcon, ExclamationIcon, MapPinIcon } from './icons';
import { useNotification } from './NotificationProvider';
import { saveToSyncQueue } from '../utils/offlineStorage';
import { sendWhatsAppText } from '../lib/whatsappService';

interface IncidentModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: UsaShipmentReport;
    logisticStatuses: EstatusDB[];
    onUpdate: () => void;
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

const IncidentModal: React.FC<IncidentModalProps> = ({ isOpen, onClose, report, logisticStatuses, onUpdate }) => {
    const { addNotification } = useNotification();
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [currentStatus, setCurrentStatus] = useState(report.logisticStatus);
    const [newIncident, setNewIncident] = useState<Incident>({
        type: '',
        location: '',
        timestamp: new Date().toISOString(),
        description: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && report) {
            setIncidents(Array.isArray(report.incidents) ? report.incidents : []);
            setIsAdding(false);
            setCurrentStatus(report.logisticStatus);
        }
    }, [isOpen, report]);

    const handleAddIncident = async () => {
        if (!newIncident.type || !newIncident.description) {
            addNotification({ type: 'warning', title: 'Datos faltantes', message: 'Tipo y descripción son obligatorios.' });
            return;
        }

        setSaving(true);
        const updatedIncidents = [...incidents, { ...newIncident, timestamp: new Date().toISOString() }];
        
        try {
            // Intentar guardado normal
            const { error } = await supabase
                .from('usa_shipment_reports')
                .update({ incidents: updatedIncidents })
                .eq('id', report.id);

            if (error) throw error;

            setIncidents(updatedIncidents);
            setIsAdding(false);
            setNewIncident({ type: '', location: '', timestamp: '', description: '' });
            addNotification({ type: 'success', title: 'Bitácora Actualizada', message: 'La incidencia se ha registrado correctamente.' });
            
            // WHATSAPP_NOTIFICATION_TRIGGER
            try {
                // Number should be the coordinator's or a fallback
                const coordinatorPhone = "523312345678"; // Example placeholder
                await sendWhatsAppText(coordinatorPhone, `🚨 *INCIDENCIA DETECTADA* \n🚢 *Viaje:* ${report.tripId}\n⚠️ *Tipo:* ${newIncident.type}\n📍 *Ubicación:* ${newIncident.location || 'No especificada'}\n📝 *Detalle:* ${newIncident.description}`);
                console.log("NOTIFICACIÓN_WS_ENVIADA");
            } catch (wsErr) {
                console.error("Fallo envío WhatsApp:", wsErr);
            }

            onUpdate();
        } catch (error) {
            // MI DIOS: MANEJO OFFLINE
            console.warn("Fallo de red detectado. Guardando en cola de sincronización.");
            await saveToSyncQueue('usa_shipment_reports_incidents', { id: report.id, incidents: updatedIncidents }, 'UPDATE');
            
            setIncidents(updatedIncidents);
            setIsAdding(false);
            addNotification({ 
                type: 'warning', 
                title: 'Modo Offline', 
                message: 'Sin conexión. La incidencia se guardó localmente y se enviará al recuperar señal.' 
            });
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
                            <button 
                                onClick={() => setIsAdding(true)}
                                className="w-full bg-danger text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" /> Reportar Incidencia
                            </button>

                            {incidents.length === 0 ? (
                                <div className="py-10 text-center opacity-40 italic text-xs">Sin registros críticos.</div>
                            ) : (
                                <div className="space-y-3">
                                    {[...incidents].reverse().map((inc, i) => (
                                        <div key={i} className="bg-white p-3 rounded-xl border border-border shadow-sm border-l-4 border-l-danger">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[9px] font-black text-danger uppercase">{inc.type}</span>
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