import React from 'react';
import { UsaShipmentReport, EstatusDB, ProductoDB, ClienteDB, LineaTransporteDB } from '../types';
import { EyeIcon, PencilIcon, TrashIcon, ExclamationIcon, TruckIcon, BoxIcon, ClockIcon } from './icons';
import { formatCarrierName } from '../utils/formatters';

interface ShipmentCardViewProps {
    data: UsaShipmentReport[];
    statuses: EstatusDB[];
    productSpecs: ProductoDB[];
    clientes: ClienteDB[];
    lineas: LineaTransporteDB[];
    latestTiveData: Record<string, any>;
    onCardClick: (report: UsaShipmentReport) => void;
    onIncidentClick: (report: UsaShipmentReport) => void;
    onEditClick: (report: UsaShipmentReport) => void;
    onDeleteClick: (id: string) => void;
    onRateClick: (report: UsaShipmentReport) => void;
}

const ShipmentCardView: React.FC<ShipmentCardViewProps> = ({
    data,
    statuses,
    productSpecs,
    clientes,
    lineas,
    latestTiveData,
    onCardClick,
    onIncidentClick,
    onEditClick,
    onDeleteClick,
    onRateClick
}) => {
    if (data.length === 0) {
        return (
            <div className="py-20 text-center opacity-40 italic text-sm uppercase tracking-widest">
                No hay registros para mostrar
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
            {data.map((report) => {
                const status = statuses.find(s => s.nombre === report.logisticStatus);
                const live = latestTiveData[report.id];
                const ideal = report.idealTemp || report.temperature || '--';
                const hasExcursion = live?.temp && ideal !== '--' && Math.abs(Number(live.temp) - Number(ideal)) > 4;
                const client = clientes.find(c => c.id === report.clientId)?.nombre || 'S/D';
                const carrier = formatCarrierName(lineas.find(l => l.id === report.lineaTransportistaId)?.nombre || 'S/D');
                const totalBoxes = Number(report.totalRealBoxes || report.products?.reduce((acc: number, p: any) => acc + (Number(p.quantity || p.cantidad || 0)), 0) || 0);

                return (
                    <div 
                        key={report.id} 
                        onClick={() => onCardClick(report)}
                        className="bg-white rounded-3xl border border-border shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden flex flex-col h-full"
                        style={{ borderTop: `6px solid ${status?.color || '#ddd'}` }}
                    >
                        <div className="p-5 flex flex-col flex-1 space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[12px] font-black text-primary uppercase tracking-tighter">{report.tripId}</span>
                                    <div className="flex flex-wrap gap-1 items-center">
                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block w-fit border ${
                                            report.logisticStatus === 'Finalizado' ? 'bg-success/10 text-success border-success/20' : 'bg-primary/10 text-primary border-primary/20'
                                        }`}>
                                            {report.logisticStatus}
                                        </span>
                                        {report.comments?.includes('[HOLD]') && (
                                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                                Hold
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {report.ratingPending && (
                                    <span className="animate-pulse bg-amber-100 text-amber-700 p-1.5 rounded-full">
                                        <ExclamationIcon className="w-4 h-4" />
                                    </span>
                                )}
                            </div>

                            <div className="space-y-2 flex-1">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Ruta Operativa</span>
                                    <div className="flex items-center gap-2 text-[11px] font-black text-text-primary uppercase">
                                        <span className="text-primary truncate max-w-[100px]">{report.project || 'S/D'}</span>
                                        <span className="text-text-muted">&rarr;</span>
                                        <span className="text-success truncate max-w-[100px]">{client}</span>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Transporte</span>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-text-primary uppercase">
                                        <TruckIcon className="w-4 h-4 text-primary" /> 
                                        <span className="truncate">{carrier}</span>
                                    </div>
                                    <span className="text-[9px] font-medium text-text-muted ml-6">{report.driverName || 'Sin Operador'}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/50">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Carga</span>
                                    <div className="flex items-center gap-1.5">
                                        <BoxIcon className="w-4 h-4 text-text-muted" />
                                        <span className="text-[12px] font-black text-primary">{totalBoxes.toLocaleString()} <span className="text-[8px] opacity-60">CJS</span></span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 text-right">
                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Temperatura</span>
                                    <div className={`flex items-center justify-end gap-1.5 px-2 py-1 rounded-xl border ${hasExcursion ? 'bg-danger/10 border-danger/20 text-danger animate-pulse' : 'bg-primary/5 border-primary/10 text-primary'}`}>
                                        <ClockIcon className="w-3 h-3" />
                                        <span className="text-[11px] font-black">{live ? `${live.temp?.toFixed(1)}°F` : '--°F'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                {report.ratingPending ? (
                                    <button 
                                        onClick={() => onRateClick(report)} 
                                        className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-600 shadow-lg transition-all active:scale-95"
                                    >
                                        Calificar
                                    </button>
                                ) : (
                                    <button onClick={() => onCardClick(report)} className="p-2.5 rounded-xl bg-surface-secondary hover:bg-primary/10 text-text-muted hover:text-primary transition-all border border-border/50"><EyeIcon className="w-5 h-5" /></button>
                                )}
                                <button onClick={() => onIncidentClick(report)} className="p-2.5 rounded-xl bg-surface-secondary hover:bg-danger/10 text-text-muted hover:text-danger transition-all border border-border/50"><ExclamationIcon className="w-5 h-5" /></button>
                                <button onClick={() => onEditClick(report)} className="p-2.5 rounded-xl bg-surface-secondary hover:bg-primary/10 text-text-muted hover:text-primary transition-all border border-border/50"><PencilIcon className="w-5 h-5" /></button>
                                <button onClick={() => onDeleteClick(report.id)} className="p-2.5 rounded-xl bg-surface-secondary hover:bg-danger/10 text-text-muted hover:text-danger transition-all border border-border/50"><TrashIcon className="w-5 h-5" /></button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ShipmentCardView;
