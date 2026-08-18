import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, ClienteDB, LineaTransporteDB, ProductoDB } from '../types';
import { TruckIcon, BoxIcon, ClockIcon, ExclamationIcon } from './icons';
import { formatCarrierName, toSnakeCase } from '../utils/formatters';
import { useNotification } from './NotificationProvider';

interface FreightPaymentDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: UsaShipmentReport;
    clientes: ClienteDB[];
    lineas: LineaTransporteDB[];
    productos: ProductoDB[];
    onUpdate: () => void;
}

// Función auxiliar para obtener semana
const getWeekFromDate = (dateStr: string) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const FreightPaymentDetailsModal: React.FC<FreightPaymentDetailsModalProps> = ({ isOpen, onClose, report, clientes, lineas, productos, onUpdate }) => {
    const { addNotification } = useNotification();
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState<Partial<UsaShipmentReport>>({});

    useEffect(() => {
        if (report) {
            setFormData({
                freightCost: report.freightCost || 0,
                extraCosts: report.extraCosts || 0,
                fines: report.fines || 0,
                freightPayer: report.freightPayer || 'NGLOBAL',
                reviewerId: report.reviewerId || '',
                passedToPayment: report.passedToPayment || false,
                invoiceReceived: report.invoiceReceived || false,
                carrierInvoiceNumber: report.carrierInvoiceNumber || '',
                fiscalFolio: report.fiscalFolio || '',
                freightInPortfolio: report.freightInPortfolio || false,
                paymentStatus: report.paymentStatus || 'Pendiente',
                comments: report.comments || ''
            });
        }
    }, [report]);

    const finalFreight = useMemo(() => {
        return (Number(formData.freightCost) || 0) + (Number(formData.extraCosts) || 0) - (Number(formData.fines) || 0);
    }, [formData.freightCost, formData.extraCosts, formData.fines]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const dataToSave = toSnakeCase({
                ...formData,
                passedToPaymentDate: formData.passedToPayment && !report.passedToPayment ? new Date().toISOString() : report.passedToPaymentDate,
                invoiceReceivedDate: formData.invoiceReceived && !report.invoiceReceived ? new Date().toISOString() : report.invoiceReceivedDate,
            });

            const { error } = await supabase
                .from('usa_shipment_reports')
                .update(dataToSave)
                .eq('id', report.id);

            if (error) throw error;
            addNotification({ type: 'success', title: 'Auditoría Guardada', message: `Remisión ${report.tripId} actualizada exitosamente.` });
            onUpdate();
            onClose();
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'Fallo al sincronizar datos financieros.' });
        } finally {
            setSaving(false);
        }
    };

    const labelClass = "text-[10px] font-black text-text-muted uppercase tracking-widest mb-1 block";
    const inputClass = "w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all";

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-surface rounded-3xl shadow-2xl max-w-5xl w-full border border-border overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                <div className="p-6 bg-primary text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                            <TruckIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">Liquidación de Flete</h3>
                            <p className="text-[10px] font-bold text-white/70 uppercase tracking-[0.2em]">Semana Fiscal: W{getWeekFromDate(report.departureDateTime)} | Remisión: {report.tripId}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-background/20 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* COLUMNA 1: DATOS OPERATIVOS */}
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-primary uppercase border-b border-primary/10 pb-2 flex items-center gap-2"><BoxIcon className="w-3.5 h-3.5" /> Datos del Viaje</h4>
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                                <span className={labelClass}>Origen y Salida</span>
                                <p className="text-sm font-black text-primary uppercase">{report.project}</p>
                                <p className="text-xs font-bold text-text-primary mt-1">{new Date(report.departureDateTime).toLocaleString()}</p>
                                
                                <span className={labelClass + " mt-4"}>Destino y Arribo</span>
                                <p className="text-sm font-black text-emerald-600 uppercase">{clientes.find(c => c.id === report.clientId)?.nombre || 'S/D'}</p>
                                <p className="text-xs font-bold text-text-primary mt-1">{report.arrivalDateTime ? new Date(report.arrivalDateTime).toLocaleString() : 'Pendiente Arribo'}</p>
                            </div>
                            
                            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                                <span className={labelClass}>Línea y Operador</span>
                                <p className="text-sm font-black text-primary uppercase truncate">{formatCarrierName(lineas.find(l => l.id === report.lineaTransportistaId)?.nombre || 'Línea Externa')}</p>
                                <p className="text-xs font-bold text-text-secondary mt-1">{report.driverName || 'S/A'}</p>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                                <span className={labelClass}>Identificador de Carga</span>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded">LOTE: {report.loteOriginalId?.substring(0,8).toUpperCase() || 'S/A'}</span>
                                    <span className="text-[10px] font-black text-accent bg-accent/5 px-2 py-0.5 rounded">REMISIÓN: {report.tripId}</span>
                                </div>
                            </div>

                            <div>
                                <label className={labelClass}>Comentarios / Incidencias</label>
                                <textarea 
                                    className={`${inputClass} h-24 text-xs`}
                                    value={formData.comments}
                                    onChange={e => setFormData({...formData, comments: e.target.value})}
                                    placeholder="Bitácora de incidencias del viaje..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA 2: LIQUIDACIÓN FINANCIERA */}
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-primary uppercase border-b border-primary/10 pb-2">Cálculo de Liquidación</h4>
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass}>Monto Flete ($)</label>
                                <input type="number" step="0.01" className={inputClass} value={formData.freightCost} onChange={e => setFormData({...formData, freightCost: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className={labelClass}>Estadías / Insumos / Extras ($)</label>
                                <input type="number" step="0.01" className={inputClass} value={formData.extraCosts} onChange={e => setFormData({...formData, extraCosts: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className={labelClass}>Multas Aplicadas ($)</label>
                                <input type="number" step="0.01" className={`${inputClass} text-danger`} value={formData.fines} onChange={e => setFormData({...formData, fines: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-200 text-center shadow-inner">
                                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 block">Cálculo de Flete Final</span>
                                <p className="text-4xl font-black text-emerald-600">${finalFreight.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <label className={labelClass}>Paga flete (Empresa)</label>
                                <input type="text" className={inputClass} value={formData.freightPayer} onChange={e => setFormData({...formData, freightPayer: e.target.value.toUpperCase()})} />
                            </div>
                            <div>
                                <label className={labelClass}>Revisó Liquidación (ID)</label>
                                <input type="text" className={inputClass} value={formData.reviewerId} onChange={e => setFormData({...formData, reviewerId: e.target.value.toUpperCase()})} placeholder="Nombre de quien valida" />
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA 3: FACTURACIÓN Y PAGO */}
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-primary uppercase border-b border-primary/10 pb-2">Control Administrativo</h4>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`p-4 rounded-2xl border transition-all ${formData.invoiceReceived ? 'bg-success/10 border-success shadow-inner' : 'bg-gray-100 border-border'}`}>
                                    <label className="flex flex-col items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={formData.invoiceReceived} onChange={e => setFormData({...formData, invoiceReceived: e.target.checked})} className="w-5 h-5 rounded-lg text-success" />
                                        <span className="text-[9px] font-black uppercase text-center">Factura Recibida</span>
                                    </label>
                                </div>
                                <div className={`p-4 rounded-2xl border transition-all ${formData.passedToPayment ? 'bg-info/10 border-info shadow-inner' : 'bg-gray-100 border-border'}`}>
                                    <label className="flex flex-col items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={formData.passedToPayment} onChange={e => setFormData({...formData, passedToPayment: e.target.checked})} className="w-5 h-5 rounded-lg text-info" />
                                        <span className="text-[9px] font-black uppercase text-center">Pasar a Pago</span>
                                    </label>
                                </div>
                            </div>
                            
                            <div>
                                <label className={labelClass}>Factura Línea / Proveedor</label>
                                <input type="text" className={inputClass} value={formData.carrierInvoiceNumber} onChange={e => setFormData({...formData, carrierInvoiceNumber: e.target.value.toUpperCase()})} placeholder="Folio de Factura" />
                            </div>
                            <div>
                                <label className={labelClass}>Folio Fiscal (UUID)</label>
                                <input type="text" className={`${inputClass} font-mono text-[10px]`} value={formData.fiscalFolio} onChange={e => setFormData({...formData, fiscalFolio: e.target.value})} placeholder="00000000-0000..." />
                            </div>
                            <div>
                                <label className={labelClass}>Estatus de Pago</label>
                                <select className={inputClass} value={formData.paymentStatus} onChange={e => setFormData({...formData, paymentStatus: e.target.value})}>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Programado">Programado</option>
                                    <option value="Enviado">En Tesorería</option>
                                    <option value="Pagado">Liquidado / Pagado</option>
                                </select>
                            </div>
                            <div className={`p-4 rounded-2xl border transition-all ${formData.freightInPortfolio ? 'bg-amber-50 border-amber-200 shadow-inner' : 'bg-gray-100 border-border'}`}>
                                <label className="flex items-center gap-4 cursor-pointer">
                                    <input type="checkbox" checked={formData.freightInPortfolio} onChange={e => setFormData({...formData, freightInPortfolio: e.target.checked})} className="w-6 h-6 rounded-lg text-amber-500" />
                                    <div>
                                        <span className="text-[11px] font-black uppercase text-amber-900">Flete en Cartera</span>
                                        <p className="text-[8px] font-bold text-amber-700 leading-none mt-0.5">Vigilancia Administrativa</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </form>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface shrink-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    <button onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-xs text-text-secondary hover:bg-hover transition-all">Cancelar</button>
                    <button onClick={handleSubmit} disabled={saving} className="bg-primary text-white px-10 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-primary-focus transition-all active:scale-95 disabled:opacity-50">
                        {saving ? 'Guardando...' : 'Confirmar Auditoría'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FreightPaymentDetailsModal;
