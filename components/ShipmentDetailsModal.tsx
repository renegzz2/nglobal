import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, ProductoDB, EstatusDB, ProyectoDB, ClienteDB } from '../types';
import { TruckIcon, XIcon, ClockIcon, MapPinIcon, DownloadIcon, ShieldCheckIcon } from './icons';
import { useTiveMonitoring } from './TiveMonitoringProvider';
import { getTiveHistory } from '../services/tiveService';

interface ShipmentDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: UsaShipmentReport;
    productSpecs: ProductoDB[];
    proyectos: ProyectoDB[];
    clientes: ClienteDB[];
    logisticStatuses: EstatusDB[];
    onCompleteTrip?: (id: string) => void;
    onRefresh?: () => void;
}

const ShipmentDetailsModal: React.FC<ShipmentDetailsModalProps> = ({ isOpen, onClose, report, productSpecs, proyectos, clientes, logisticStatuses, onCompleteTrip, onRefresh }) => {
    const { latestTiveData } = useTiveMonitoring();
    const liveData = latestTiveData[report.id];
    const [activeTab, setActiveTab] = useState<'carga'|'termico'|'mapa'|'bitacora'>('carga');
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [historyData, setHistoryData] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen && activeTab === 'termico' && report.tiveTrackerId) {
            getTiveHistory(report.tiveTrackerId).then(data => setHistoryData(data || []));
        }
    }, [isOpen, activeTab, report.tiveTrackerId]);

    const handleStatusChange = async (newStatus: string) => {
        if(newStatus === report.logisticStatus) return;
        setStatusUpdating(true);
        try {
            await supabase.from('usa_shipment_reports').update({ logistic_status: newStatus }).eq('id', report.id);
            if(onRefresh) onRefresh();
            onClose();
        } catch(e) {
            console.error(e);
        } finally {
            setStatusUpdating(false);
        }
    };

    // CONSOLIDACIÓN DE CLIENTES PARA MOSTRAR
    const destClientsStr = useMemo(() => {
        let str = clientes.find(c => c.id === report.clientId)?.nombre || 'S/D';
        if (report.clientIds && report.clientIds.length > 0) {
            str = report.clientIds.map(cid => clientes.find(c => c.id === cid)?.nombre).filter(Boolean).join(' | ');
        }
        return str;
    }, [report, clientes]);

    const thermalAverages = useMemo(() => {
        const minTemp = Number(report.min_temp || 45.0);
        const maxTemp = Number(report.temperature || report.idealTemp || 51.0);
        return {
            min: minTemp.toFixed(1),
            max: maxTemp.toFixed(1),
            optima: ((minTemp + maxTemp) / 2).toFixed(1)
        };
    }, [report]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-background rounded-[2rem] shadow-2xl w-[95vw] md:max-w-6xl h-[85vh] flex flex-col border border-border overflow-hidden animate-slide-up">
                
                {/* CABECERA ROBUSTA */}
                <div className="bg-primary text-white p-6 shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none scale-150 transform translate-x-10 -translate-y-10">
                        <TruckIcon className="w-full h-full" />
                    </div>
                    
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-3xl font-black uppercase tracking-tight">{report.tripId}</h2>
                                {report.comments?.includes('[HOLD]') && <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest animate-pulse">EN HOLD</span>}
                            </div>
                            <div className="flex items-center gap-2 text-primary-light font-bold text-sm">
                                <span>&rarr;</span>
                                <span className="uppercase tracking-widest">{destClientsStr}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="bg-primary-focus/50 border border-white/10 rounded-xl p-2 flex items-center gap-3">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/70 ml-2">Control de Estatus</label>
                                <select 
                                    className="bg-transparent text-white font-black text-sm outline-none cursor-pointer pr-2"
                                    value={report.logisticStatus}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    disabled={statusUpdating || report.logisticStatus === 'Finalizado'}
                                >
                                    {logisticStatuses.map(s => <option key={s.id} value={s.nombre} className="text-primary">{s.nombre}</option>)}
                                </select>
                            </div>
                            <button className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                                <DownloadIcon className="w-4 h-4" /> PDF Reporte
                            </button>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-6 h-6" /></button>
                        </div>
                    </div>

                    <div className="flex gap-6 mt-8 border-b border-white/10">
                        {['carga', 'termico', 'mapa', 'bitacora'].map(tab => (
                            <button 
                                key={tab} 
                                onClick={() => setActiveTab(tab as any)}
                                className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === tab ? 'text-white' : 'text-white/50 hover:text-white/80'}`}
                            >
                                {tab}
                                {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-1 bg-white rounded-t-full"></div>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* CONTENIDO DEL MODAL */}
                <div className="flex-1 overflow-y-auto p-6 flex gap-6 bg-surface-secondary/30">
                    
                    {/* PANEL IZQUIERDO: DINÁMICO POR PESTAÑA */}
                    <div className="flex-1 flex flex-col gap-6">
                        {activeTab === 'carga' && (
                            <>
                                <div className="bg-white rounded-3xl p-6 border border-border shadow-sm">
                                    <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                                        Manifiesto Operativo NGLOBAL
                                    </h4>
                                    
                                    <div className="border border-border rounded-2xl overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-border flex justify-between items-center">
                                            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                                                <BoxIcon className="w-4 h-4" /> Detalles de la Carga
                                            </span>
                                            <span className="text-[10px] font-bold text-text-muted">{report.products?.length || 0} Partidas</span>
                                        </div>
                                        <table className="w-full text-xs text-left">
                                            <thead className="text-[9px] font-black text-text-muted uppercase bg-white border-b border-border">
                                                <tr>
                                                    <th className="px-4 py-3">Producto</th>
                                                    <th className="px-4 py-3">Factura</th>
                                                    <th className="px-4 py-3 text-center">Cajas</th>
                                                    <th className="px-4 py-3 text-center">MID / Lote</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border bg-white">
                                                {report.products?.map((p:any, i:number) => {
                                                    const spec = productSpecs.find(s => s.id === (p.productId || p.product_id));
                                                    return (
                                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-4 py-3 font-bold text-primary uppercase">{spec?.nombreDelProducto || p.manualProductName || p.manual_product_name || 'S/D'}</td>
                                                            <td className="px-4 py-3 text-text-secondary font-mono">{p.invoiceNumber || 'S/D'}</td>
                                                            <td className="px-4 py-3 font-black text-primary text-center bg-primary/5">{p.quantity || p.cantidad || p.realQty || 0}</td>
                                                            <td className="px-4 py-3 text-text-secondary text-center font-mono text-[10px]">{p.mid || p.sourceLotId || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                                <tr className="bg-gray-50 border-t-2 border-border font-black">
                                                    <td colSpan={2} className="px-4 py-3 text-text-muted uppercase text-[10px] tracking-widest">Totales Consolidados</td>
                                                    <td className="px-4 py-3 text-primary text-center text-sm">{report.totalRealBoxes || report.products?.reduce((acc:number, p:any) => acc + Number(p.quantity || p.cantidad || p.realQty || 0), 0) || 0}</td>
                                                    <td className="px-4 py-3"></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-white rounded-3xl p-6 border border-border shadow-sm">
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <ShieldCheckIcon className="w-4 h-4 text-emerald-500" /> Parámetros Térmicos DB
                                        </h4>
                                        <div className="flex justify-between items-center gap-4">
                                            <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                                                <span className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Óptima</span>
                                                <span className="text-2xl font-black text-emerald-600">{thermalAverages.optima}°F</span>
                                            </div>
                                            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                                                <span className="block text-[9px] font-black text-blue-700 uppercase tracking-widest mb-1">Mínima</span>
                                                <span className="text-xl font-black text-blue-600">{thermalAverages.min}°F</span>
                                            </div>
                                            <div className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
                                                <span className="block text-[9px] font-black text-red-700 uppercase tracking-widest mb-1">Máxima</span>
                                                <span className="text-xl font-black text-red-600">{thermalAverages.max}°F</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-3xl p-6 border border-border shadow-sm flex flex-col justify-center relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><MapPinIcon className="w-24 h-24" /></div>
                                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <MapPinIcon className="w-4 h-4" /> Trayectoria & Predictivo
                                        </h4>
                                        <div className="flex items-center justify-between mb-4 bg-gray-50 p-4 rounded-2xl border border-border">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><TruckIcon className="w-5 h-5"/></div>
                                                <div>
                                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest">Velocidad Actual</span>
                                                    <span className="text-sm font-black text-primary">{liveData?.speedKmh || 0} KM/H</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest">ETA Estimada</span>
                                                <span className="text-sm font-black text-primary uppercase">{liveData?.predictedEta ? new Date(liveData.predictedEta).toLocaleString('es-MX', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : 'Calculando...'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        {/* OTROS TABS (Térmico, Mapa, Bitácora) SE MANTIENEN IGUAL... */}
                        {activeTab !== 'carga' && (
                            <div className="bg-white rounded-3xl p-6 border border-border shadow-sm flex-1 flex items-center justify-center">
                                <p className="text-text-muted font-bold text-sm">Contenido de la pestaña {activeTab} en desarrollo.</p>
                            </div>
                        )}
                    </div>

                    {/* PANEL DERECHO: FICHA LOGÍSTICA FIJA */}
                    <div className="w-80 bg-white rounded-3xl border border-border shadow-sm p-6 overflow-y-auto custom-scrollbar shrink-0">
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
                            <TruckIcon className="w-4 h-4" /> Ficha de Transporte
                        </h4>

                        <div className="space-y-6">
                            <div>
                                <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Línea Transportista</span>
                                <span className="text-sm font-black text-primary uppercase">{formatCarrierName(report.lineaTransportistaId ? (lineas || []).find(l => l.id === report.lineaTransportistaId)?.nombre : 'Línea Externa')}</span>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-xl border border-border">
                                <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Operador a Cargo</span>
                                <span className="text-xs font-black text-primary uppercase block mb-1">{report.driverName || 'S/A'}</span>
                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><PhoneIcon className="w-3 h-3"/> {report.driverPhone || 'S/A'}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Placas Tractor</span>
                                    <span className="text-xs font-bold text-primary font-mono bg-primary/5 px-2 py-1 rounded inline-block">{report.tractorPlates || 'S/A'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Placas Caja</span>
                                    <span className="text-xs font-bold text-primary font-mono bg-primary/5 px-2 py-1 rounded inline-block">{report.boxNumber || 'S/A'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Tipo Unidad</span>
                                    <span className="text-[10px] font-bold text-text-secondary">{report.unitType || 'S/D'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Sello Seguridad</span>
                                    <span className="text-[10px] font-bold text-text-secondary">{report.sealNumber || '-'}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border space-y-4">
                                <div>
                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Punto de Origen (E1)</span>
                                    <span className="text-xs font-bold text-primary uppercase">{report.project || 'S/D'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Destino Final (Consignatarios)</span>
                                    <span className="text-xs font-bold text-success uppercase">{destClientsStr}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
};

export default ShipmentDetailsModal;