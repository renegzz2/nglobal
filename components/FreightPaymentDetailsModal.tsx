import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, ClienteDB, LineaTransporteDB, ProductoDB } from '../types';
import { TruckIcon, BoxIcon, DocumentIcon, XIcon, PlusIcon } from './icons';
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

const getWeekFromDate = (dateStr: string) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const CurrencyInput = ({ value, onChange, className, readOnly = false, isNegative = false }: any) => {
    const [isFocused, setIsFocused] = useState(false);
    const numValue = Number(value) || 0;
    const displayValue = isFocused ? value : numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    return (
        <div className="relative">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isNegative ? 'text-danger' : 'text-text-muted'}`}>$</span>
            <input 
                type={isFocused ? "number" : "text"} 
                step="0.01" 
                className={`${className} pl-7`} 
                value={displayValue} 
                onChange={(e) => {
                    const val = e.target.value;
                    onChange(val === '' ? '' : parseFloat(val));
                }}
                onFocus={() => !readOnly && setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                readOnly={readOnly}
            />
        </div>
    );
};

const FreightPaymentDetailsModal: React.FC<FreightPaymentDetailsModalProps> = ({ isOpen, onClose, report, clientes, lineas, productos, onUpdate }) => {
    const { addNotification } = useNotification();
    const [saving, setSaving] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [incidentCostsLog, setIncidentCostsLog] = useState('');

    const isConsolidated = useMemo(() => report?.clientIds && report.clientIds.length > 1, [report]);
    const isOnlySweetSeasons = useMemo(() => {
        if (isConsolidated) return false;
        const clientName = clientes.find(c => c.id === (report.clientIds?.[0] || report.clientId))?.nombre || '';
        return clientName.toLowerCase().includes('sweet season');
    }, [report, clientes, isConsolidated]);

    useEffect(() => {
        if (report) {
            let rawFreight = report.freightCost || 0;
            if (report.comments) {
                const mxnMatch = report.comments.match(/\[MXN:([\d.]+)\]/);
                if (mxnMatch) rawFreight = parseFloat(mxnMatch[1]);
            }

            let extraCostsDetected = 0;
            let logText = '';
            
            if (report.incidents && Array.isArray(report.incidents)) {
                const costsIncidents = report.incidents.filter(inc => inc.extraCost && inc.extraCost.amount > 0);
                if (costsIncidents.length > 0) {
                    logText += "==== COSTOS REPORTADOS EN INCIDENCIAS ====\n";
                    costsIncidents.forEach(inc => {
                        const type = inc.extraCost?.type || 'Extra';
                        const amount = inc.extraCost?.amount || 0;
                        logText += `- ${type}: $${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}\n`;
                        extraCostsDetected += amount;
                    });
                    logText += `TOTAL EXTRAS SUGERIDOS: $${extraCostsDetected.toLocaleString('en-US', {minimumFractionDigits: 2})}\n====================================\n\n`;
                }
            }
            
            setIncidentCostsLog(logText);

            const defaultPayer = isOnlySweetSeasons ? 'CLIENTE (COBRO EN DESTINO)' : (report.freightPayer || 'NGLOBAL');

            setFormData({
                freightCost: rawFreight,
                extraCosts: report.extraCosts || 0,
                fines: report.fines || 0,
                freightPayer: defaultPayer,
                reviewerId: report.reviewerId || '',
                passedToPayment: report.passedToPayment || false,
                invoiceReceived: report.invoiceReceived || false,
                carrierInvoiceNumber: report.carrierInvoiceNumber || '',
                fiscalFolio: report.fiscalFolio || '',
                freightInPortfolio: report.freightInPortfolio || false,
                requiresCompServices: (report as any).requires_comp_services || false,
                requiresCustomsServices: (report as any).requires_customs_services || false,
                paymentStatus: report.paymentStatus || 'Pendiente',
                invoiceUrl: report.invoiceUrl || '',
                comments: (report.comments || '').replace(/\[MXN:[\d.]+\s*\]\s*/g, '').trim(),
                products: report.products ? JSON.parse(JSON.stringify(report.products)) : []
            });
        }
    }, [report, isOnlySweetSeasons]);

    const finalFreight = useMemo(() => {
        return (Number(formData.freightCost) || 0) + (Number(formData.extraCosts) || 0) - (Number(formData.fines) || 0);
    }, [formData.freightCost, formData.extraCosts, formData.fines]);

    const totalBoxes = useMemo(() => {
        if (!report) return 1;
        const sum = report.products?.reduce((acc: number, p: any) => acc + Number(p.realQty || p.quantity || 0), 0) || 0;
        return sum > 0 ? sum : (Number(report.totalRealBoxes) || 1);
    }, [report]);

    const costPerBox = useMemo(() => totalBoxes > 0 ? (finalFreight / totalBoxes) : 0, [finalFreight, totalBoxes]);

    const prorrateoSplits = useMemo(() => {
        let nglobal = 0;
        let cliente = 0;
        (formData.products || []).forEach((p: any) => {
            const qty = Number(p.realQty || p.quantity || 0);
            const share = qty * costPerBox;
            if (p.freightPayer === 'CLIENTE') cliente += share;
            else nglobal += share;
        });
        return { nglobal, cliente };
    }, [formData.products, costPerBox]);

    const montoPagarNglobal = useMemo(() => {
        if (isConsolidated) return prorrateoSplits.nglobal;
        if (formData.freightPayer?.includes('CLIENTE') || formData.freightPayer === 'OTRO') return 0;
        return finalFreight;
    }, [isConsolidated, prorrateoSplits.nglobal, formData.freightPayer, finalFreight]);

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            addNotification({ type: 'danger', title: 'Error', message: 'Solo se permiten archivos en formato PDF.' });
            return;
        }

        setUploadingPdf(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `factura_${report.tripId}_${Date.now()}.${fileExt}`;
            const filePath = `facturas_operadores/${fileName}`;

            const { error: uploadError } = await supabase.storage.from('documentos').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(filePath);
            setFormData(prev => ({ ...prev, invoiceUrl: publicUrl, invoiceReceived: true }));
            addNotification({ type: 'success', title: 'PDF Subido', message: 'Factura anexada.' });
        } catch (error: any) {
            addNotification({ type: 'danger', title: 'Error', message: error.message || 'No se pudo subir el archivo.' });
        } finally {
            setUploadingPdf(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { products, requiresCompServices, requiresCustomsServices, ...restFormData } = formData;
            
            if (isOnlySweetSeasons) {
                restFormData.carrierInvoiceNumber = '';
                restFormData.fiscalFolio = '';
                restFormData.invoiceUrl = '';
                restFormData.invoiceReceived = false;
            }
            
            const dataToSave = {
                ...toSnakeCase(restFormData),
                requires_comp_services: requiresCompServices,
                requires_customs_services: requiresCustomsServices,
                products: products,
                passed_to_payment_date: formData.passedToPayment && !report.passedToPayment ? new Date().toISOString() : report.passedToPaymentDate,
                invoice_received_date: formData.invoiceReceived && !report.invoiceReceived ? new Date().toISOString() : report.invoiceReceivedDate,
            };

            const { error } = await supabase.from('usa_shipment_reports').update(dataToSave).eq('id', report.id);
            if (error) throw error;
            
            addNotification({ type: 'success', title: 'Auditoría Guardada', message: `Remisión actualizada.` });
            onUpdate();
            onClose();
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'Fallo al guardar.' });
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
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-6 h-6" /></button>
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
                                <p className="text-sm font-black text-emerald-600 uppercase">{
                                    report.clientIds && report.clientIds.length > 0 
                                        ? report.clientIds.map(cid => clientes.find(c => c.id === cid)?.nombre).filter(Boolean).join(' | ')
                                        : (clientes.find(c => c.id === report.clientId)?.nombre || 'S/D')
                                }</p>
                            </div>
                            
                            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                                <span className={labelClass}>Línea y Operador</span>
                                <p className="text-sm font-black text-primary uppercase truncate">{formatCarrierName(lineas.find(l => l.id === report.lineaTransportistaId)?.nombre || 'Línea Externa')}</p>
                                <p className="text-xs font-bold text-text-secondary mt-1">{report.driverName || 'S/A'}</p>
                            </div>

                            <div>
                                <label className={labelClass}>Comentarios / Incidencias</label>
                                <textarea className={`${inputClass} h-40 text-xs font-mono`} value={incidentCostsLog + formData.comments} onChange={e => {
                                        const cleanVal = e.target.value.replace(incidentCostsLog, '');
                                        setFormData({...formData, comments: cleanVal});
                                    }} placeholder="Bitácora..." />
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA 2: LIQUIDACIÓN FINANCIERA */}
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-primary uppercase border-b border-primary/10 pb-2">Cálculo de Liquidación</h4>
                        <div className="space-y-4">
                            <div><label className={labelClass}>Costo Flete Total (Base)</label><CurrencyInput className={inputClass} value={formData.freightCost} onChange={(v: number) => setFormData({...formData, freightCost: v})} /></div>
                            <div><label className={labelClass}>Estadías / Insumos / Extras (+)</label><CurrencyInput className={`${inputClass} text-emerald-700 bg-emerald-50/30 border-emerald-100`} value={formData.extraCosts} onChange={(v: number) => setFormData({...formData, extraCosts: v})} /></div>
                            <div><label className={labelClass}>Multas Aplicadas (-)</label><CurrencyInput className={`${inputClass} text-danger bg-red-50/30 border-red-100`} value={formData.fines} onChange={(v: number) => setFormData({...formData, fines: v})} isNegative={true} /></div>
                            
                            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-200 text-center shadow-inner mt-6 relative overflow-hidden">
                                {montoPagarNglobal === 0 && <div className="absolute inset-0 bg-gray-100/80 backdrop-blur-[1px] z-10 flex items-center justify-center"><span className="text-lg font-black text-gray-400 uppercase tracking-widest rotate-[-10deg]">Absorbido por Cliente</span></div>}
                                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1 block">Total Neto a Pagar por NGLOBAL</span>
                                <p className="text-4xl font-black text-emerald-600">${montoPagarNglobal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className="text-[9px] font-bold text-emerald-800 mt-2 uppercase">Costo Total del Viaje: ${finalFreight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>

                            {isConsolidated && (
                                <div className="bg-blue-50 p-4 rounded-3xl border border-blue-200 shadow-sm mt-6">
                                    <div className="flex justify-between items-center mb-3 border-b border-blue-100 pb-2">
                                        <h5 className="text-[10px] font-black text-blue-900 uppercase flex items-center gap-1"><BoxIcon className="w-3.5 h-3.5" /> Prorrateo y Cobro</h5>
                                        <div className="text-right"><span className="block text-[8px] font-black text-blue-600 uppercase">Costo X Caja</span><span className="text-xs font-black text-blue-800">${costPerBox.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    </div>
                                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                        {formData.products?.map((p: any, i: number) => {
                                            const spec = productos.find(s => s.id === (p.productId || p.product_id));
                                            const prodName = spec?.nombreDelProducto || p.manualProductName || 'S/D';
                                            const qty = Number(p.realQty || p.quantity || 0);
                                            const share = qty * costPerBox;
                                            
                                            return (
                                                <div key={i} className="flex justify-between items-center bg-white p-2 rounded-xl border border-blue-100 shadow-sm text-[10px]">
                                                    <div className="flex flex-col flex-1 min-w-0 pr-2">
                                                        <span className="font-black text-primary uppercase truncate">{prodName}</span>
                                                        <span className="text-[8px] font-bold text-text-muted uppercase">Lote: {p.sourceLotId || p.mid || 'Manual'} | {qty} CJS</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <select className="bg-gray-50 border border-border text-primary font-black rounded px-1.5 py-1 text-[8px] outline-none tracking-widest" value={p.freightPayer || 'NGLOBAL'} onChange={(e) => {
                                                                const newProds = [...formData.products!];
                                                                newProds[i] = { ...newProds[i], freightPayer: e.target.value };
                                                                setFormData({ ...formData, products: newProds });
                                                            }}>
                                                            <option value="NGLOBAL">NGLOBAL</option><option value="CLIENTE">CLIENTE</option>
                                                        </select>
                                                        <span className="font-black text-emerald-600 w-16 text-right">${share.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 mt-6">
                                {!isConsolidated && (
                                    <div>
                                        <label className={labelClass}>¿Quién paga el flete?</label>
                                        <select className={inputClass} value={formData.freightPayer} onChange={e => setFormData({...formData, freightPayer: e.target.value.toUpperCase()})} disabled={isOnlySweetSeasons}>
                                            <option value="NGLOBAL">NGLOBAL</option><option value="CLIENTE (COBRO EN DESTINO)">CLIENTE</option><option value="OTRO">OTRO TERCERO</option>
                                        </select>
                                    </div>
                                )}
                                <div className={isConsolidated ? 'col-span-2' : ''}>
                                    <label className={labelClass}>Revisó (ID)</label>
                                    <input type="text" className={inputClass} value={formData.reviewerId} onChange={e => setFormData({...formData, reviewerId: e.target.value.toUpperCase()})} placeholder="Auditor" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA 3: FACTURACIÓN Y PAGO */}
                    <div className="space-y-6">
                        <h4 className="text-xs font-black text-primary uppercase border-b border-primary/10 pb-2">Control Administrativo</h4>
                        
                        {isOnlySweetSeasons ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center shadow-sm h-32 flex flex-col justify-center">
                                <h5 className="text-[11px] font-black text-amber-900 uppercase tracking-widest mb-1">Cliente Exclusivo: Sweet Seasons</h5>
                                <p className="text-[10px] font-bold text-amber-800 leading-relaxed">Flete pagado en destino. No requiere documentación fiscal del flete.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className={labelClass}>Factura PDF del Transportista</label>
                                    <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handlePdfUpload} />
                                    {formData.invoiceUrl ? (
                                        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><DocumentIcon className="w-5 h-5" /></div>
                                                <div>
                                                    <p className="text-[11px] font-black text-blue-800 uppercase tracking-widest">Factura Anexada</p>
                                                    <a href={formData.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-600 hover:underline">Ver documento PDF</a>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setFormData({...formData, invoiceUrl: '', invoiceReceived: false})} className="p-2 text-blue-400 hover:text-danger hover:bg-blue-100 rounded-full transition-colors" title="Quitar PDF"><XIcon className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPdf} className="w-full py-4 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 hover:border-primary/30 transition-all text-text-muted hover:text-primary">
                                            {uploadingPdf ? <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div> : <><PlusIcon className="w-6 h-6 opacity-50" /><span className="text-xs font-bold uppercase tracking-widest">Cargar PDF</span></>}
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`p-4 rounded-2xl border transition-all ${formData.invoiceReceived ? 'bg-success/10 border-success shadow-inner' : 'bg-gray-100 border-border'}`}>
                                        <label className="flex flex-col items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={formData.invoiceReceived} onChange={e => setFormData({...formData, invoiceReceived: e.target.checked})} className="w-5 h-5 rounded-lg text-success" disabled={!!formData.invoiceUrl} />
                                            <span className="text-[9px] font-black uppercase text-center">Físico / Recibida</span>
                                        </label>
                                    </div>
                                    <div className={`p-4 rounded-2xl border transition-all ${formData.passedToPayment ? 'bg-info/10 border-info shadow-inner' : 'bg-gray-100 border-border'}`}>
                                        <label className="flex flex-col items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={formData.passedToPayment} onChange={e => setFormData({...formData, passedToPayment: e.target.checked})} className="w-5 h-5 rounded-lg text-info" />
                                            <span className="text-[9px] font-black uppercase text-center">Pasar a Pago</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div><label className={labelClass}>Folio / Num. Factura</label><input type="text" className={inputClass} value={formData.carrierInvoiceNumber} onChange={e => setFormData({...formData, carrierInvoiceNumber: e.target.value.toUpperCase()})} placeholder="Ej. A-1020" /></div>
                                <div><label className={labelClass}>Folio Fiscal (UUID)</label><input type="text" className={`${inputClass} font-mono text-[10px]`} value={formData.fiscalFolio} onChange={e => setFormData({...formData, fiscalFolio: e.target.value})} placeholder="00000000-0000..." /></div>
                                <div>
                                    <label className={labelClass}>Estatus de Pago</label>
                                    <select className={inputClass} value={formData.paymentStatus} onChange={e => setFormData({...formData, paymentStatus: e.target.value})}>
                                        <option value="Pendiente">Pendiente</option><option value="Programado">Programado</option><option value="Enviado">En Tesorería</option><option value="Pagado">Liquidado / Pagado</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 mt-4">
                            {/* CHECKBOX: SERVICIOS COMPLEMENTARIOS */}
                            <div className={`p-4 rounded-2xl border transition-all ${formData.requiresCompServices ? 'bg-indigo-50 border-indigo-200 shadow-inner' : 'bg-gray-100 border-border'}`}>
                                <label className="flex items-center gap-4 cursor-pointer">
                                    <input type="checkbox" checked={formData.requiresCompServices} onChange={e => setFormData({...formData, requiresCompServices: e.target.checked})} className="w-6 h-6 rounded-lg text-indigo-500" />
                                    <div>
                                        <span className="text-[10px] font-black uppercase text-indigo-900">Requiere Serv. Complementarios</span>
                                        <p className="text-[8px] font-bold text-indigo-700 leading-none mt-0.5">Bodega, maniobras pagadas por NGLOBAL.</p>
                                    </div>
                                </label>
                            </div>
                            
                            {/* CHECKBOX: SERVICIOS ADUANALES */}
                            <div className={`p-4 rounded-2xl border transition-all ${formData.requiresCustomsServices ? 'bg-purple-50 border-purple-200 shadow-inner' : 'bg-gray-100 border-border'}`}>
                                <label className="flex items-center gap-4 cursor-pointer">
                                    <input type="checkbox" checked={formData.requiresCustomsServices} onChange={e => setFormData({...formData, requiresCustomsServices: e.target.checked})} className="w-6 h-6 rounded-lg text-purple-500" />
                                    <div>
                                        <span className="text-[10px] font-black uppercase text-purple-900">Requiere Serv. Aduanales</span>
                                        <p className="text-[8px] font-bold text-purple-700 leading-none mt-0.5">Cruces, pedimentos, gastos aduanales.</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                    </div>
                </form>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface shrink-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    <button onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-xs text-text-secondary hover:bg-hover transition-all">Cancelar</button>
                    <button onClick={handleSubmit} disabled={saving} className="bg-primary text-white px-10 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-primary-focus">
                        {saving ? 'Guardando...' : 'Confirmar Auditoría'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FreightPaymentDetailsModal;