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

const COST_TYPES = [
    'Estadía / Demora',
    'Maniobras',
    'Multa de Tránsito',
    'Insumos / Refacciones',
    'Pensión / Resguardo',
    'Otro Costo Extra'
];

const IncidentModal: React.FC<IncidentModalProps> = ({ isOpen, onClose, report, logisticStatuses, onUpdate }) => {
    const { addNotification } = useNotification();
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    
    const [newIncident, setNewIncident] = useState<Incident>({
        type: '',
        location: '',
        timestamp: new Date().toISOString(),
        description: '',
        reportedBy: ''
    });
    
    // NUEVO: Estado para costos adicionales de la incidencia
    const [hasExtraCost, setHasExtraCost] = useState(false);
    const [costDetails, setCostDetails] = useState({
        costType: '',
        amount: 0
    });

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && report) {
            setIncidents(Array.isArray(report.incidents) ? report.incidents : []);
            setIsAdding(false);
            
            // Tratamos de obtener el nombre del usuario logueado desde localStorage
            const savedUser = localStorage.getItem('ng_auth_profile');
            if (savedUser) {
                try {
                    const parsedUser = JSON.parse(savedUser);
                    setNewIncident(prev => ({ ...prev, reportedBy: parsedUser.name || 'USUARIO' }));
                } catch (e) {
                    setNewIncident(prev => ({ ...prev, reportedBy: 'USUARIO' }));
                }
            } else {
                setNewIncident(prev => ({ ...prev, reportedBy: 'USUARIO' }));
            }
        }
    }, [isOpen, report]);

    const handleAddIncident = async () => {
        if (!newIncident.type || !newIncident.description) {
            addNotification({ type: 'warning', title: 'Datos faltantes', message: 'Tipo y descripción son obligatorios.' });
            return;
        }

        if (hasExtraCost && (!costDetails.costType || costDetails.amount <= 0)) {
            addNotification({ type: 'warning', title: 'Costo Incompleto', message: 'Debe especificar el tipo y un monto válido mayor a 0.' });
            return;
        }

        setSaving(true);
        
        // Empaquetamos el costo dentro del objeto de incidencia si fue activado
        const incidentToSave: Incident = { 
            ...newIncident, 
            timestamp: new Date().toISOString()
        };
        
        if (hasExtraCost) {
            incidentToSave.extraCost = {
                type: costDetails.costType,
                amount: costDetails.amount
            };
        }

        const updatedIncidents = [...incidents, incidentToSave];
        
        try {
            // Intentar guardado normal
            const { error } = await supabase
                .from('usa_shipment_reports')
                .update({ incidents: updatedIncidents })
                .eq('id', report.id);

            if (error) throw error;

            setIncidents(updatedIncidents);
            setIsAdding(false);
            setNewIncident(prev => ({ type: '', location: '', timestamp: '', description: '', reportedBy: prev.reportedBy }));
            setHasExtraCost(false);
            setCostDetails({ costType: '', amount: 0 });
            
            addNotification({ type: 'success', title: 'Bitácora Actualizada', message: 'La incidencia se ha registrado correctamente.' });
            
            // WHATSAPP_NOTIFICATION_TRIGGER
            try {
                // Number should be the coordinator's or a fallback
                const coordinatorPhone = "523312345678"; // Example placeholder
                let costMsg = "";
                if (hasExtraCost) {
                    costMsg = `\n💰 *Posible Costo Extra:* ${costDetails.costType} ($${costDetails.amount})`;
                }
                await sendWhatsAppText(coordinatorPhone, `🚨 *INCIDENCIA DETECTADA* \n🚢 *Viaje:* ${report.tripId}\n⚠️ *Tipo:* ${incidentToSave.type}\n📍 *Ubicación:* ${incidentToSave.location || 'No especificada'}\n📝 *Detalle:* ${incidentToSave.description}\n👤 *Reportó:* ${incidentToSave.reportedBy}${costMsg}`);
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
            setHasExtraCost(false);
            setCostDetails({ costType: '', amount: 0 });
            
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
                                    <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Ubicación (Opcional)</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
                                        placeholder="Ej. Caseta de cobro..."
                                        value={newIncident.location || ''}
                                        onChange={e => setNewIncident({...newIncident, location: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Descripción *</label>
                                    <textarea 
                                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-bold outline-none h-20"
                                        placeholder="Detalles de lo sucedido..."
                                        value={newIncident.description}
                                        onChange={e => setNewIncident({...newIncident, description: e.target.value})}
                                    ></textarea>
                                </div>

                                {/* SECCIÓN DE COBROS EXTRA */}
                                <div className="p-3 bg-red-50/50 rounded-xl border border-red-100">
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-danger rounded border-red-200 focus:ring-danger"
                                            checked={hasExtraCost}
                                            onChange={(e) => setHasExtraCost(e.target.checked)}
                                        />
                                        <span className="text-[10px] font-black text-danger uppercase tracking-widest">¿Genera Cargo Extra / Estadía?</span>
                                    </label>

                                    {hasExtraCost && (
                                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-red-100 animate-slide-up">
                                            <div>
                                                <label className="text-[9px] font-black text-red-900 uppercase mb-1 block">Tipo de Cargo</label>
                                                <select 
                                                    className="w-full bg-white border border-red-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-red-100"
                                                    value={costDetails.costType}
                                                    onChange={e => setCostDetails({...costDetails, costType: e.target.value})}
                                                >
                                                    <option value="">Seleccione...</option>
                                                    {COST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-red-900 uppercase mb-1 block">Monto Solicitado ($)</label>
                                                <input 
                                                    type="number"
                                                    className="w-full bg-white border border-red-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-red-100"
                                                    placeholder="0.00"
                                                    min="0"
                                                    value={costDetails.amount || ''}
                                                    onChange={e => setCostDetails({...costDetails, amount: parseFloat(e.target.value) || 0})}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => { setIsAdding(false); setHasExtraCost(false); }} className="flex-1 py-2 rounded-lg font-bold text-[10px] text-text-muted hover:bg-hover transition-all">Atrás</button>
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
                        <div className="space-y-6">
                            <button 
                                onClick={() => setIsAdding(true)}
                                className="w-full bg-danger text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm hover:bg-red-700 transition-colors"
                            >
                                <PlusIcon className="w-4 h-4" /> Reportar Incidencia
                            </button>

                            <div>
                                <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3 px-2 border-b border-border pb-2">Historial de Reportes</h4>
                                {incidents.length === 0 ? (
                                    <div className="py-8 text-center opacity-40 italic text-xs">Sin registros críticos.</div>
                                ) : (
                                    <div className="space-y-3">
                                        {[...incidents].reverse().map((inc, i) => (
                                            <div key={i} className="bg-white p-4 rounded-xl border border-border shadow-sm border-l-4 border-l-danger">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className="text-[10px] font-black text-danger uppercase block">{inc.type}</span>
                                                        <span className="text-[8px] font-bold text-text-muted uppercase">Reportó: {inc.reportedBy || 'USUARIO'}</span>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-text-muted bg-surface-secondary px-2 py-0.5 rounded">
                                                        {new Date(inc.timestamp).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </span>
                                                </div>
                                                {inc.location && (
                                                    <p className="text-[9px] font-bold text-amber-700 mb-1 flex items-center gap-1">
                                                        <MapPinIcon className="w-3 h-3" /> {inc.location}
                                                    </p>
                                                )}
                                                <p className="text-xs text-text-primary leading-tight mt-1 bg-surface-secondary/50 p-2 rounded-lg">{inc.description}</p>
                                                
                                                {/* Mostrar etiqueta de Costo Extra si existe en la incidencia */}
                                                {inc.extraCost && (
                                                    <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded text-[9px] font-black text-red-700 uppercase tracking-widest">
                                                        <span>💰 Petición de Cobro:</span>
                                                        <span>{inc.extraCost.type} (${inc.extraCost.amount?.toLocaleString()})</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-white flex justify-end shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
                    <button onClick={onClose} className="w-full md:w-auto px-6 py-2 rounded-xl font-bold text-xs text-text-secondary hover:bg-hover transition-all border border-border">Cerrar</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default IncidentModal;