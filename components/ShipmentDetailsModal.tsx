import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { UsaShipmentReport, ProductoDB, ProyectoDB, ClienteDB, TiveEvent, Incident, EstatusDB, LineaTransporteDB, ProductQuantity } from '../types';
import { getTiveHistory, getAlertDictionary, TiveAlertTranslation } from '../services/tiveService';
import { TruckIcon, DownloadIcon, MapIcon, ExclamationIcon, MapPinIcon, BoxIcon, DatabaseIcon, SwitchHorizontalIcon, ClockIcon } from './icons';
import { useTiveMonitoring } from './TiveMonitoringProvider';
import { useNotification } from './NotificationProvider';
import { supabase } from '../lib/supabase';
import { formatCarrierName, toCamelCase } from '../utils/formatters';

interface ShipmentDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: UsaShipmentReport;
    productSpecs: ProductoDB[];
    proyectos: ProyectoDB[];
    clientes: ClienteDB[];
    logisticStatuses: EstatusDB[];
    onCompleteTrip: (id: string) => void;
    onRefresh?: () => void; 
}

const formatSafeDate = (dateStr: string | undefined | null, options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString([], options);
};

const formatFullSafeDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'Fecha desconocida';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'Fecha inválida' : date.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
};

const ShipmentDetailsModal: React.FC<ShipmentDetailsModalProps> = ({ isOpen, onClose, report, productSpecs, proyectos, clientes, logisticStatuses, onCompleteTrip, onRefresh }) => {
    const [tiveHistory, setTiveHistory] = useState<TiveEvent[]>([]);
    const [dbAlerts, setDbAlerts] = useState<any[]>([]);
    const [dictionary, setDictionary] = useState<Record<string, TiveAlertTranslation>>({});
    const [loadingTive, setLoadingTive] = useState(false);
    const [activeTab, setActiveTab] = useState<'logistics' | 'temperature' | 'location' | 'alerts' | 'location' | 'trajectory'>('logistics');
    const [currentStatus, setCurrentStatus] = useState(report.logisticStatus);
    const [lineas, setLineas] = useState<LineaTransporteDB[]>([]);
    const [projectProductMap, setProjectProductMap] = useState<Record<string, string[]>>({});

    const { latestTiveData } = useTiveMonitoring();
    const { addNotification } = useNotification();

    const cleanTrackerId = report?.tiveTrackerId?.trim();
    const liveData = latestTiveData[report.id];

    const mainProductSpec = useMemo(() => {
        if (!report.products || report.products.length === 0) return null;
        const pid = report.products[0].productId;
        return productSpecs.find(s => s.id === pid);
    }, [report.products, productSpecs]);

    const fetchData = useCallback(async () => {
        if (cleanTrackerId) {
            setLoadingTive(true);
            try {
                const [history, dict, lineasRes, mapRes, alertsRes] = await Promise.all([
                    getTiveHistory(cleanTrackerId),
                    getAlertDictionary(),
                    supabase.from('usa_lineas_transporte').select('*'),
                    supabase.from('usa_proyecto_producto').select('proyecto_id, producto_id'),
                    supabase.from('usa_shipment_alerts').select('*').eq('shipment_id', report.id).order('created_at', { ascending: false })
                ]);
                setTiveHistory(Array.isArray(history) ? history : []);
                setDictionary(dict || {});
                if (alertsRes.data) setDbAlerts(alertsRes.data);
                if (lineasRes.data) setLineas(toCamelCase(lineasRes.data));
                
                if (mapRes.data) {
                    const mapping: Record<string, string[]> = {};
                    mapRes.data.forEach((item: any) => {
                        if (!mapping[item.proyecto_id]) mapping[item.proyecto_id] = [];
                        mapping[item.proyecto_id].push(item.producto_id);
                    });
                    setProjectProductMap(mapping);
                }
            } catch (err) {
                console.error("Error Tive:", err);
            } finally {
                setLoadingTive(false);
            }
        }
    }, [cleanTrackerId]);

    useEffect(() => {
        if (isOpen) {
            fetchData();
            setActiveTab('logistics');
            setCurrentStatus(report.logisticStatus);
        }
    }, [isOpen, fetchData, report.logisticStatus]);

    const handleExportPDF = () => {
        addNotification({ type: 'info', title: 'Documento Logístico', message: 'Renderizando Ficha Técnica Oficial...' });
        
        const origin = proyectos.find(p => p.id === report.projectId)?.nombre || report.project || 'S/D';
        const stopOver = report.isConsolidated ? (proyectos.find(p => p.id === report.stopOverProjectId)?.nombre || 'Escala Técncia') : null;
        const dest = clientes.find(c => c.id === report.clientId)?.nombre || 'S/D';
        const line = formatCarrierName(lineas.find(l => l.id === report.lineaTransportistaId)?.nombre || 'S/A');
        const logoUrl = "https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg";

        let manifestHtml = '';
        let totalBoxes = 0;
        let totalWeight = 0;

        report.products?.forEach(p => {
            const spec = productSpecs.find(s => s.id === (p.productId || (p as any).product_id));
            const qty = Number(p.realQty || p.quantity || 0);
            const weight = qty * (spec?.pesoUsa || 0);
            totalBoxes += qty;
            totalWeight += weight;

            manifestHtml += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${spec?.nombreDelProducto || p.manualProductName || p.manual_product_name || 'S/D'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${p.invoiceNumber || '-'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${qty.toLocaleString()}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${weight.toLocaleString()} KG</td>
                </tr>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #1a1a1a; line-height: 1.4; font-size: 11px; }
                    .page { padding: 40px; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #002D62; padding-bottom: 20px; margin-bottom: 30px; }
                    .logo { height: 60px; }
                    .title-block { text-align: right; }
                    .title-block h1 { margin: 0; color: #002D62; font-size: 20px; font-weight: 900; text-transform: uppercase; }
                    .title-block p { margin: 5px 0 0; color: #666; font-weight: 700; letter-spacing: 1px; }
                    
                    .section-title { background: #f8f9fa; padding: 8px 12px; border-left: 4px solid #002D62; font-weight: 900; text-transform: uppercase; margin-bottom: 15px; font-size: 10px; color: #002D62; }
                    
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 25px; }
                    .data-box { border: 1px solid #eee; padding: 15px; border-radius: 8px; background: #fff; }
                    .label { color: #888; font-weight: 700; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; display: block; }
                    .value { font-weight: 700; font-size: 12px; color: #111; }
                    
                    .route-flow { display: flex; align-items: center; justify-content: space-between; margin: 20px 0 30px; padding: 15px; background: #f1f5f9; border-radius: 12px; text-align: center; }
                    .route-point { flex: 1; }
                    .route-arrow { color: #002D62; font-size: 20px; font-weight: 900; padding: 0 10px; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background: #002D62; color: white; text-align: left; padding: 12px 10px; font-weight: 900; text-transform: uppercase; font-size: 9px; }
                    tfoot { background: #f8f9fa; font-weight: 900; }
                    
                    .footer { margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-size: 9px; color: #aaa; }
                    @media print { .page { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="page">
                    <div class="header">
                        <img src="${logoUrl}" class="logo">
                        <div class="title-block">
                            <h1>Ficha Técnica de Despacho</h1>
                            <p>FOLIO: ${report.tripId}</p>
                        </div>
                    </div>

                    <div class="section-title">Información de Ruta Operativa</div>
                    <div class="route-flow">
                        <div class="route-point">
                            <span class="label">Punto de Origen (E1)</span>
                            <div class="value">${origin}</div>
                        </div>
                        ${stopOver ? `
                        <div class="route-arrow">→</div>
                        <div class="route-point">
                            <span class="label">Escala Técnica (E2)</span>
                            <div class="value" style="color: #2563eb;">${stopOver}</div>
                        </div>
                        ` : ''}
                        <div class="route-arrow">→</div>
                        <div class="route-point">
                            <span class="label">Destino Final</span>
                            <div class="value">${dest}</div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="section-title">Especificaciones de Transporte</div>
                            <div class="data-box">
                                <div style="margin-bottom: 12px;">
                                    <span class="label">Línea Transportista</span>
                                    <div class="value">${line}</div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                                    <div><span class="label">Placas Tractor</span><div class="value">${report.tractorPlates || 'S/D'}</div></div>
                                    <div><span class="label">Placas Caja</span><div class="value">${report.boxNumber || 'S/D'}</div></div>
                                </div>
                                <div style="margin-bottom: 12px;">
                                    <span class="label">Operador</span>
                                    <div class="value">${report.driverName || 'N/A'}</div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                    <div><span class="label">CAAT</span><div class="value">${report.caat || 'N/A'}</div></div>
                                    <div><span class="label">ALPHA CODE</span><div class="value">${report.alpha || 'N/A'}</div></div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div class="section-title">Control de Calidad y Sellos</div>
                            <div class="data-box">
                                <div style="margin-bottom: 12px;">
                                    <span class="label">Estatus Logístico Actual</span>
                                    <div class="value" style="color: #16a34a;">${report.logisticStatus}</div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                                    <div><span class="label">Set-Point Autorizado</span><div class="value">${mainProductSpec?.tempOptima || '--'} °F</div></div>
                                    <div><span class="label">Sello de Seguridad</span><div class="value">${report.sealNumber || 'S/D'}</div></div>
                                </div>
                                <div style="margin-bottom: 12px;">
                                    <span class="label">Tracker Tive ID</span>
                                    <div class="value">${report.tiveTrackerId || 'No asignado'}</div>
                                </div>
                                <div>
                                    <span class="label">Fecha y Hora de Despacho</span>
                                    <div class="value">${formatFullSafeDate(report.departureDateTime)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="section-title">Manifiesto de Carga (Detallado)</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Descripción del Producto</th>
                                <th style="text-align: center;">No. Factura</th>
                                <th style="text-align: center;">Cajas</th>
                                <th style="text-align: right;">Peso Neto Estimado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${manifestHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="2" style="padding: 12px 10px; border-top: 2px solid #002D62;">TOTALES CONSOLIDADOS</td>
                                <td style="padding: 12px 10px; border-top: 2px solid #002D62; text-align: center; font-size: 13px;">${totalBoxes.toLocaleString()}</td>
                                <td style="padding: 12px 10px; border-top: 2px solid #002D62; text-align: right; font-size: 13px;">${totalWeight.toLocaleString()} KG</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; text-align: center;">
                        <div style="border-top: 1px solid #333; padding-top: 10px;">
                            <span class="label" style="margin-bottom: 20px;">Firma de Responsable nglobal</span>
                        </div>
                        <div style="border-top: 1px solid #333; padding-top: 10px;">
                            <span class="label" style="margin-bottom: 20px;">Firma de Transportista</span>
                        </div>
                    </div>

                    <div class="footer">
                        Documento generado automáticamente por la Plataforma nglobal Logistics Center el ${new Date().toLocaleString()}<br>
                        Código de Verificación Operativa: ${report.id.substring(0, 8).toUpperCase()} | Enterprise Solution v3.0
                    </div>
                </div>
            </body>
            </html>
        `;

        const printIframe = document.createElement('iframe');
        printIframe.style.position = 'fixed';
        printIframe.style.right = '0';
        printIframe.style.bottom = '0';
        printIframe.style.width = '1px';
        printIframe.style.height = '1px';
        printIframe.style.opacity = '0';
        document.body.appendChild(printIframe);

        const doc = printIframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            setTimeout(() => {
                printIframe.contentWindow?.focus();
                printIframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(printIframe)) {
                        document.body.removeChild(printIframe);
                    }
                }, 1000);
            }, 800);
        }
    };

    const chartData = useMemo(() => {
        if (!Array.isArray(tiveHistory) || !tiveHistory.length) return [];
        return [...tiveHistory].reverse().filter(evt => evt.timestamp).map(evt => ({ time: formatSafeDate(evt.timestamp), temp: evt.temperature }));
    }, [tiveHistory]);

    const unifiedAlertsTimeline = useMemo(() => {
        const telemetryAlerts = Array.isArray(tiveHistory) 
            ? tiveHistory.filter(evt => evt.alert_type && evt.alert_type !== 'TEST_SIGNAL').map(a => ({ ...a, origin: 'SYSTEM' })) 
            : [];
        const manualIncidents = Array.isArray(report.incidents) 
            ? report.incidents.map(i => ({ ...i, origin: 'OPERATOR' })) 
            : [];
        const databaseAlerts = dbAlerts.map(a => ({ 
            ...a, 
            origin: 'DB_ALERT', 
            timestamp: a.created_at 
        }));
        
        return [...telemetryAlerts, ...manualIncidents, ...databaseAlerts].sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }, [tiveHistory, report.incidents, dbAlerts]);

    const handleStatusChange = async (newStatus: string) => {
        setCurrentStatus(newStatus);
        
        let updateData: any = { logistic_status: newStatus };
        
        if (newStatus === 'En Tránsito' && !report.realDepartureDate) {
            updateData.real_departure_date = new Date().toISOString();
        }
        if (newStatus === 'Entregado' && !report.arrivalDateTime) {
            updateData.arrival_date_time = new Date().toISOString();
        }

        try {
            const { error } = await supabase
                .from('usa_shipment_reports')
                .update(updateData)
                .eq('id', report.id);
            
            if (error) throw error;
            addNotification({ type: 'success', title: 'Estatus Sincronizado', message: `El embarque se ha movido a: ${newStatus}` });
            if (onRefresh) onRefresh();
        } catch (e: any) {
            addNotification({ type: 'danger', title: 'Fallo de Red', message: 'No se pudo actualizar el estatus en el servidor.' });
        }
    };

    const shipmentAnalytics = useMemo(() => {
        const totalWeight = report.products?.reduce((acc, p) => {
            const spec = productSpecs.find(s => s.id === (p.productId || p.product_id));
            return acc + (Number(p.realQty || p.quantity || 0) * (spec?.pesoUsa || 0));
        }, 0) || 0;

        const start = report.realDepartureDate ? new Date(report.realDepartureDate) : null;
        const end = report.arrivalDateTime ? new Date(report.arrivalDateTime) : (report.logisticStatus === 'Finalizado' ? null : new Date());
        
        let transitHours = 0;
        if (start && end) {
            transitHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        }

        let hoursOutOfRange = 0;
        if (tiveHistory.length > 1 && mainProductSpec) {
            const min = Number(mainProductSpec.tempOptima) - 3;
            const max = Number(mainProductSpec.limiteSuperior);
            
            for (let i = 0; i < tiveHistory.length - 1; i++) {
                const current = tiveHistory[i];
                const next = tiveHistory[i + 1];
                if (current.temperature && (current.temperature < min || current.temperature > max)) {
                    const duration = (new Date(current.timestamp).getTime() - new Date(next.timestamp).getTime()) / (1000 * 60 * 60);
                    hoursOutOfRange += Math.abs(duration);
                }
            }
        }

        const weightLimit = 21000; // KG
        const needsScale = totalWeight > weightLimit;
        
        const routeCompliance = transitHours > 0 ? (hoursOutOfRange / transitHours < 0.05) : true;

        return { totalWeight, transitHours, hoursOutOfRange, needsScale, routeCompliance };
    }, [report, productSpecs, tiveHistory, mainProductSpec]);

    const routeVisualInfo = useMemo(() => {
        const origin = proyectos.find(p => p.id === report.projectId);
        const stopOver = proyectos.find(p => p.id === report.stopOverProjectId);
        const destination = clientes.find(c => c.id === report.clientId);
        
        const e1Products: any[] = [];
        const e2Products: any[] = [];
        
        if (report.isConsolidated && report.stopOverProjectId) {
            const e2AllowedIds = projectProductMap[report.stopOverProjectId] || [];
            report.products?.forEach((p: any) => {
                const pid = p.productId || p.product_id;
                if (e2AllowedIds.includes(pid)) e2Products.push(p);
                else e1Products.push(p);
            });
        } else {
            e1Products.push(...(report.products || []));
        }

        return { origin, stopOver, destination, e1Products, e2Products };
    }, [report, proyectos, clientes, projectProductMap]);

    if (!isOpen) return null;

    const renderLoadTable = (products: any[], title?: string, colorClass = "text-primary") => (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden mb-4">
            <div className={`bg-surface-secondary/50 px-5 py-2 border-b border-border flex justify-between items-center`}>
                <h4 className={`text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${colorClass}`}>
                    <BoxIcon className="w-3 h-3" /> {title || "Detalles de la Carga"}
                </h4>
                <span className="text-[8px] font-bold text-text-muted">{products.length} Partidas</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-surface-secondary/20 text-[7px] font-black text-text-muted uppercase tracking-widest border-b border-border">
                            <th className="px-5 py-1">Producto</th>
                            <th className="px-3 py-1">Factura</th>
                            <th className="px-3 py-1">Categoría</th>
                            <th className="px-3 py-1 text-center">Cajas</th>
                            <th className="px-3 py-1 text-center">Pallets</th>
                            <th className="px-3 py-1 text-center">KG/Unidad</th>
                            <th className="px-5 py-1 text-right">Kilos Totales</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 text-[9px] font-bold text-text-primary">
                        {products.map((p, i) => {
                            const spec = productSpecs.find(s => s.id === (p.productId || p.product_id));
                            const kgPerUnit = spec?.pesoUsa || 0;
                            const cjsPallet = spec?.cajasPalletUsa || 1;
                            const totalQty = p.realQty || p.quantity || 0;
                            const totalKg = totalQty * kgPerUnit;
                            const totalPallets = Math.ceil(totalQty / cjsPallet);
                            return (
                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-0.5 text-primary font-black uppercase">{spec?.nombreDelProducto || p.manualProductName || p.manual_product_name || 'S/D'}</td>
                                    <td className="px-3 py-0.5 font-mono text-text-muted uppercase">{p.invoiceNumber || '-'}</td>
                                    <td className="px-3 py-0.5 uppercase text-text-muted">{spec?.categoria || '-'}</td>
                                    <td className="px-3 py-0.5 text-center">{totalQty.toLocaleString()}</td>
                                    <td className="px-3 py-0.5 text-center font-black text-accent">{totalPallets}</td>
                                    <td className="px-3 py-0.5 text-center">{kgPerUnit} kg</td>
                                    <td className="px-5 py-0.5 text-right font-black text-primary">{totalKg.toLocaleString()} KG</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {products.length > 0 && (
                        <tfoot className="bg-surface-secondary/10 font-black text-[9px]">
                            <tr>
                                <td colSpan={3} className="px-5 py-1 uppercase text-text-muted">Totales Consolidados</td>
                                <td className="px-3 py-1 text-center">{products.reduce((acc, p) => acc + (p.realQty || p.quantity || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-1 text-center text-accent">{products.reduce((acc, p) => { const s = productSpecs.find(spec => spec.id === (p.productId || p.product_id)); return acc + Math.ceil((p.realQty || p.quantity || 0) / (s?.cajasPalletUsa || 1)); }, 0)}</td>
                                <td className="px-3 py-1"></td>
                                <td className={`px-5 py-1 text-right font-black ${shipmentAnalytics.needsScale ? 'text-danger animate-pulse' : 'text-primary'}`}>
                                    {shipmentAnalytics.totalWeight.toLocaleString()} KG
                                    {shipmentAnalytics.needsScale && <span className="block text-[7px] uppercase tracking-tighter">⚠️ Sugerido: Pasar a Báscula</span>}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-7xl flex flex-col border border-border h-[92vh] animate-fade-in overflow-hidden">
                 <div className="p-6 bg-primary text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-6">
                        <div>
                            <h2 className="text-2xl font-bold uppercase tracking-tight">{report.tripId}</h2>
                            <p className="text-primary-content/80 text-[10px] font-black uppercase tracking-widest">{routeVisualInfo.origin?.nombre} &rarr; {routeVisualInfo.destination?.nombre}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-xl border border-white/20 flex flex-col gap-1">
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/70">Control de Estatus</span>
                            <select 
                                value={currentStatus} 
                                onChange={(e) => handleStatusChange(e.target.value)} 
                                className="bg-transparent text-white font-black text-[11px] border-none outline-none cursor-pointer uppercase"
                            >
                                {logisticStatuses.map(s => <option key={s.id} value={s.nombre} className="text-primary">{s.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleExportPDF} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 border border-white/20"><DownloadIcon className="w-4 h-4" /> PDF Reporte</button>
                        <button onClick={onClose} className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </div>

                <div className="flex border-b border-border bg-surface-secondary/30 shrink-0">
                    {['logistics', 'temperature', 'location', 'alerts'].map((tab) => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${activeTab === tab ? 'border-primary text-primary bg-white shadow-inner' : 'border-transparent text-text-muted hover:text-text-primary'}`}>
                            {tab === 'logistics' ? 'Carga' : tab === 'temperature' ? 'Histórico Térmico' : tab === 'location' ? 'Mapa' : 'Bitácora'}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-background/50 custom-scrollbar">
                    {activeTab === 'logistics' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
                            <div className="lg:col-span-8 space-y-6">
                                <div>
                                    <h3 className="text-[11px] font-black text-primary mb-4 uppercase tracking-[0.25em] flex items-center gap-2">
                                        <DatabaseIcon className="w-4 h-4" /> Manifiesto Operativo nglobal
                                    </h3>
                                    {report.isConsolidated ? (
                                        <>
                                            {renderLoadTable(routeVisualInfo.e1Products, `E1: ${routeVisualInfo.origin?.nombre || 'Origen'}`, "text-primary")}
                                            {renderLoadTable(routeVisualInfo.e2Products, `E2: ${routeVisualInfo.stopOver?.nombre || 'Escala'}`, "text-accent")}
                                        </>
                                    ) : (
                                        renderLoadTable(report.products || [])
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-5 rounded-2xl border border-border shadow-sm">
                                        <h3 className="text-[10px] font-black text-primary mb-5 uppercase tracking-widest flex items-center gap-2 border-b border-border pb-3">
                                            <ExclamationIcon className="w-4 h-4" /> Parámetros Térmicos DB
                                        </h3>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="text-center p-3 bg-success/5 rounded-xl border border-success/10">
                                                <span className="text-[8px] font-black text-success uppercase block mb-1">Óptima</span>
                                                <p className="text-xl font-black text-primary">{mainProductSpec?.tempOptima || '--'}°F</p>
                                            </div>
                                            <div className="text-center p-3 bg-info/5 rounded-xl border border-info/10">
                                                <span className="text-[8px] font-black text-info uppercase block mb-1">Mínima</span>
                                                <p className="text-xl font-black text-primary">{(Number(mainProductSpec?.tempOptima) - 3) || '--'}°F</p>
                                            </div>
                                            <div className="text-center p-3 bg-danger/5 rounded-xl border border-danger/10">
                                                <span className="text-[8px] font-black text-danger uppercase block mb-1">Máxima</span>
                                                <p className="text-xl font-black text-primary">{mainProductSpec?.limiteSuperior || '--'}°F</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-5 rounded-2xl border border-border shadow-sm">
                                        <h3 className="text-[10px] font-black text-primary mb-5 uppercase tracking-widest flex items-center gap-2 border-b border-border pb-3">
                                            <MapIcon className="w-4 h-4" /> Trayectoria & Predictivo
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><TruckIcon className="w-4 h-4" /></div>
                                                    <div>
                                                        <p className="text-[8px] font-black text-text-muted uppercase">Velocidad Actual</p>
                                                        <p className="text-sm font-black text-text-primary">{liveData?.speed?.toFixed(1) || '0.0'} KM/H</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[8px] font-black text-text-muted uppercase">ETA Estimada</p>
                                                    <p className="text-sm font-black text-primary uppercase">{liveData?.predictedEta ? formatSafeDate(liveData.predictedEta) : 'Calculando...'}</p>
                                                </div>
                                            </div>
                                            <div className="pt-3 border-t border-border/50 flex justify-between items-center">
                                                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Estatus de Arribo:</span>
                                                <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${liveData?.isDelayed ? 'bg-danger text-white' : 'bg-success text-white'}`}>
                                                    <ClockIcon className="w-3 h-3" /> {liveData?.isDelayed ? 'Retrasado' : 'En Tiempo'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex items-center gap-4">
                                    <div className="flex-1">
                                        <p className="text-[8px] font-black text-text-muted uppercase mb-1">Punto de Origen (E1)</p>
                                        <p className="text-[11px] font-black text-primary uppercase truncate">{routeVisualInfo.origin?.nombre || report.project || 'S/D'}</p>
                                    </div>
                                    
                                    {report.isConsolidated && routeVisualInfo.stopOver ? (
                                        <>
                                            <SwitchHorizontalIcon className="w-4 h-4 text-text-muted" />
                                            <div className="flex-1 text-center border-x border-primary/10 px-4">
                                                <p className="text-[8px] font-black text-accent uppercase mb-1">Escala Técnica (E2)</p>
                                                <p className="text-[11px] font-black text-accent uppercase truncate">{routeVisualInfo.stopOver?.nombre || 'S/D'}</p>
                                            </div>
                                            <SwitchHorizontalIcon className="w-4 h-4 text-text-muted" />
                                        </>
                                    ) : (
                                        <SwitchHorizontalIcon className="w-5 h-5 text-text-muted" />
                                    )}

                                    <div className="flex-1 text-right">
                                        <p className="text-[8px] font-black text-text-muted uppercase mb-1">Destino Final (Cliente)</p>
                                        <p className="text-[11px] font-black text-primary uppercase truncate">{routeVisualInfo.destination?.nombre || 'S/D'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-4">
                                <div className="bg-white p-6 rounded-2xl border border-border shadow-xl ring-1 ring-black/5 flex flex-col h-full">
                                    <h3 className="text-[12px] font-black text-primary mb-6 uppercase tracking-[0.25em] flex items-center gap-3 border-b border-border pb-4">
                                        <TruckIcon className="w-5 h-5" /> Ficha de Transporte
                                    </h3>
                                    <div className="space-y-6 flex-1">
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Línea Transportista</span>
                                            <p className="text-sm font-black text-primary uppercase">{formatCarrierName(lineas.find(l => l.id === report.lineaTransportistaId)?.nombre || 'S/A')}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Operador a Cargo</span>
                                            <p className="text-sm font-black text-text-primary uppercase">{report.driverName || 'No asignado'}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Placas Tractor</span>
                                                <p className="text-[11px] font-bold text-text-primary uppercase">{report.tractorPlates || '-'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Placas Caja</span>
                                                <p className="text-[11px] font-bold text-text-primary uppercase">{report.boxNumber || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Tipo Unidad</span>
                                                <p className="text-[11px] font-bold text-text-primary">{report.unitType || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Sello Seguridad</span>
                                                <p className="text-[11px] font-bold text-text-primary uppercase">{report.sealNumber || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-surface-secondary/50 p-4 rounded-xl border border-border">
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">CAAT</span>
                                                    <p className="text-[11px] font-mono font-black text-primary">{report.caat || 'N/A'}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">ALPHA CODE</span>
                                                    <p className="text-[11px] font-mono font-black text-primary">{report.alpha || 'N/A'}</p>
                                                </div>
                                            </div>
                                            <div className="pt-3 border-t border-border/50 mb-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="text-[8px] font-black text-text-muted uppercase tracking-widest block mb-1">Tiempo en Tránsito</span>
                                                        <p className="text-[11px] font-black text-primary uppercase">{shipmentAnalytics.transitHours.toFixed(1)} HORAS</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[8px] font-black text-text-muted uppercase tracking-widest block mb-1">Cumplimiento Ruta</span>
                                                        <p className={`text-[11px] font-black uppercase ${shipmentAnalytics.routeCompliance ? 'text-emerald-600' : 'text-danger'}`}>{shipmentAnalytics.routeCompliance ? 'DENTRO DE PARÁMETROS' : 'DESVIACIÓN DETECTADA'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pt-3 border-t border-border/50 mb-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="text-[8px] font-black text-text-muted uppercase tracking-widest block mb-1">Exposición Térmica</span>
                                                        <p className={`text-[11px] font-black uppercase ${shipmentAnalytics.hoursOutOfRange > 0 ? 'text-danger' : 'text-emerald-600'}`}>{shipmentAnalytics.hoursOutOfRange.toFixed(1)} HRS FUERA RANGO</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[8px] font-black text-text-muted uppercase tracking-widest block mb-1">Tracker Tive ID</span>
                                                        <p className="text-[11px] font-mono font-black text-text-primary">{report.tiveTrackerId || 'PENDIENTE'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pt-3 border-t border-border/50">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest block mb-1">Salida Real</span>
                                                        <p className="text-[9px] font-black text-primary uppercase">{report.realDepartureDate ? formatFullSafeDate(report.realDepartureDate) : 'Esperando Tránsito'}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest block mb-1">Llegada Real</span>
                                                        <p className="text-[9px] font-black text-primary uppercase">{report.arrivalDateTime ? formatFullSafeDate(report.arrivalDateTime) : 'En Ruta'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-primary p-4 rounded-xl text-white shadow-lg relative overflow-hidden mt-auto">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full -translate-y-8 translate-x-8"></div>
                                        <span className="text-[8px] font-black uppercase tracking-[0.3em] opacity-70">Set-Point Autorizado</span>
                                        <div className="flex items-baseline gap-2 mt-1">
                                            <p className="text-3xl font-black">{mainProductSpec?.tempOptima || '--'}</p>
                                            <span className="text-xs font-bold opacity-80">°F FAHRENHEIT</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'temperature' ? (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-2xl border border-border text-center shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                                    <span className="text-[10px] text-text-muted font-black uppercase tracking-widest">Temperatura Actual (°F)</span>
                                    <p className={`text-4xl font-black mt-2 ${(liveData?.temp != null && mainProductSpec?.tempOptima && Math.abs(liveData.temp - Number(mainProductSpec.tempOptima)) > 4) ? 'text-danger' : 'text-success'}`}>
                                        {liveData?.temp != null && !isNaN(Number(liveData.temp)) ? `${Number(liveData.temp).toFixed(1)}°F` : 'Sin telemetría'}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white p-8 rounded-2xl border border-border h-[400px] shadow-inner relative flex flex-col justify-center">
                                {chartData && chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700}} />
                                            <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700}} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                                            <Area type="monotone" dataKey="temp" stroke="#2563eb" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={4} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-full border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center px-4">
                                            Esperando primera lectura del sensor...
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'location' ? (
                        <div className="h-full flex flex-col space-y-4">
                            <div className="flex justify-between items-center px-2">
                                <span className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2"><MapIcon className="w-4 h-4" /> Seguimiento Satelital Activo</span>
                                <span className="text-[11px] font-black text-text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">Tracker: {cleanTrackerId || 'S/A'}</span>
                            </div>
                            <div className="flex-1 min-h-[400px] bg-surface rounded-2xl border border-border overflow-hidden relative">
                                <iframe title="Tive" src={`https://platform.tive.com/devicetracking/Nglobal?query=${cleanTrackerId}`} style={{ width: '100%', height: '100%', border: 'none' }} allow="geolocation"></iframe>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fade-in">
                            {unifiedAlertsTimeline.length === 0 ? (
                                <div className="py-20 text-center opacity-40 italic text-xs uppercase tracking-widest">Sin registros en bitácora</div>
                            ) : (
                                <div className="space-y-4">
                                    {unifiedAlertsTimeline.map((evt: any, idx) => { 
                                        const isSystem = evt.origin === 'SYSTEM'; 
                                        const isDbAlert = evt.origin === 'DB_ALERT';
                                        const isOperator = evt.origin === 'OPERATOR';
                                        
                                        return (
                                            <div key={idx} className={`bg-white p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md relative overflow-hidden ${isSystem ? 'border-l-4 border-l-danger border-border' : isDbAlert ? 'border-l-4 border-l-primary border-border' : 'border-l-4 border-l-amber-500 border-amber-100'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${isSystem ? 'bg-danger text-white' : isDbAlert ? 'bg-primary text-white' : 'bg-amber-500 text-white'}`}>
                                                            {isSystem ? 'SISTEMA' : isDbAlert ? 'OBSERVACIÓN' : 'OPERATIVO'}
                                                        </span>
                                                        <h4 className="font-black text-sm text-text-primary uppercase tracking-tight">
                                                            {isSystem ? (dictionary[evt.alert_type]?.display_name || evt.alert_type) : isDbAlert ? (evt.alert_type === 'COMENTARIO_OPERADOR' ? 'Comentario de Panel' : evt.alert_type) : evt.type}
                                                        </h4>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-text-muted bg-surface-secondary px-2 py-0.5 rounded shadow-inner">{formatFullSafeDate(evt.timestamp)}</span>
                                                </div>
                                                <p className={`text-xs font-medium leading-relaxed ${isSystem ? 'text-text-secondary' : 'text-text-primary'}`}>
                                                    {isSystem ? `${dictionary[evt.alert_type]?.display_name || evt.alert_type || 'Señal de Sensor'}: ${evt.temperature ? `Lectura Térmica ${evt.temperature}°F | ` : ''}${evt.location || 'Coordenadas en ruta'} | Batería Tracker: ${evt.battery || 'N/D'}%` : isDbAlert ? evt.comment || evt.message : evt.description}
                                                </p>
                                                {isDbAlert && evt.comment && evt.message && evt.alert_type !== 'COMENTARIO_OPERADOR' && (
                                                    <p className="mt-2 text-[10px] text-text-muted italic border-t border-border pt-2">Ref: {evt.message}</p>
                                                )}
                                            </div>
                                        ); 
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border bg-white flex justify-end gap-3 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
                    <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-border font-bold text-text-secondary hover:bg-hover transition-all text-sm">Cerrar</button>
                    {currentStatus !== 'Finalizado' && (
                        <button onClick={() => onCompleteTrip(report.id)} className="px-8 py-2.5 rounded-xl bg-success text-white font-black text-xs uppercase tracking-widest hover:bg-green-700 shadow-lg">Finalizar Viaje</button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ShipmentDetailsModal;