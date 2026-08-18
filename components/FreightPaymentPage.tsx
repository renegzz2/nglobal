import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, LineaTransporteDB, ProyectoDB, ClienteDB, ProductoDB } from '../types';
import DataTable, { Column } from './ui/DataTable';
import { EyeIcon, DownloadIcon, BoxIcon, TruckIcon, ClockIcon } from './icons';
import { formatCarrierName, toCamelCase, toSnakeCase } from '../utils/formatters';
import { useNotification } from './NotificationProvider';
import FreightPaymentDetailsModal from './FreightPaymentDetailsModal';

// Función para calcular la semana fiscal desde la fecha de salida (Regla 2: Lógica de Frontend)
const getWeekFromDate = (dateStr: string) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const FreightPaymentPage: React.FC = () => {
    const [reports, setReports] = useState<UsaShipmentReport[]>([]);
    const [lineas, setLineas] = useState<LineaTransporteDB[]>([]);
    const [proyectos, setProyectos] = useState<ProyectoDB[]>([]);
    const [clientes, setClientes] = useState<ClienteDB[]>([]);
    const [productos, setProductos] = useState<ProductoDB[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const { addNotification } = useNotification();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [reportsRes, lineasRes, proyectosRes, clientesRes, productosRes] = await Promise.all([
                supabase.from('usa_shipment_reports')
                    .select('*')
                    .or('logistic_status.ilike.En Tránsito,logistic_status.ilike.Finalizado,logistic_status.ilike.Entregado')
                    .order('departure_date_time', { ascending: false }),
                supabase.from('usa_lineas_transporte').select('*'),
                supabase.from('usa_proyectos').select('*'),
                supabase.from('usa_clientes').select('*'),
                supabase.from('usa_productos').select('*')
            ]);

            if (reportsRes.error) throw reportsRes.error;
            setReports(toCamelCase(reportsRes.data));
            setLineas(toCamelCase(lineasRes.data || []));
            setProyectos(toCamelCase(proyectosRes.data || []));
            setClientes(toCamelCase(clientesRes.data || []));
            setProductos(toCamelCase(productosRes.data || []));
        } catch (error) {
            console.error("Error fetching freight data:", error);
            addNotification({ type: 'danger', title: 'Error', message: 'Fallo al cargar datos de pagos.' });
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredData = useMemo(() => {
        if (!searchQuery.trim()) return reports;
        const q = searchQuery.toLowerCase();
        return reports.filter(r => 
            (r.tripId || '').toLowerCase().includes(q) || 
            (r.driverName || '').toLowerCase().includes(q) ||
            formatCarrierName(lineas.find(l => l.id === r.lineaTransportistaId)?.nombre).toLowerCase().includes(q)
        );
    }, [reports, searchQuery, lineas]);

    const handleOpenDetails = (id: string) => {
        setSelectedReportId(id);
        setIsDetailsModalOpen(true);
    };

    const columns: Column<UsaShipmentReport>[] = [
        {
            header: "SEMANA",
            accessor: (r) => <span className="font-black text-primary bg-primary/5 px-2 py-1 rounded-lg">W{getWeekFromDate(r.departureDateTime)}</span>
        },
        {
            header: "REMISIÓN",
            accessor: (r) => <span className="font-black text-primary uppercase">{r.tripId}</span>
        },
        {
            header: "RUTA OPERATIVA",
            accessor: (r) => (
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-text-primary uppercase">{r.project || 'S/D'}</span>
                    <span className="text-[9px] text-text-muted font-bold uppercase">{clientes.find(c => c.id === r.clientId)?.nombre || 'DESTINO'}</span>
                </div>
            )
        },
        {
            header: "TRANSPORTISTA",
            accessor: (r) => (
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-primary uppercase">{formatCarrierName(lineas.find(l => l.id === r.lineaTransportistaId)?.nombre || 'S/A')}</span>
                    <span className="text-[9px] text-text-muted font-bold uppercase">{r.driverName || 'N/A'}</span>
                </div>
            )
        },
        {
            header: "FLETE FINAL",
            accessor: (r) => {
                const final = (Number(r.freightCost) || 0) + (Number(r.extraCosts) || 0) - (Number(r.fines) || 0);
                return <span className="font-black text-emerald-600 text-xs">${final.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            }
        },
        {
            header: "ESTATUS PAGO",
            accessor: (r) => (
                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                    r.paymentStatus === 'Pagado' ? 'bg-success text-white' : 
                    r.passedToPayment ? 'bg-info text-white' : 'bg-amber-400 text-white'
                }`}>
                    {r.paymentStatus || (r.passedToPayment ? 'En Tesorería' : 'Pendiente')}
                </span>
            )
        },
        {
            header: "ACCIONES",
            className: "text-center",
            accessor: (r) => (
                <button onClick={() => handleOpenDetails(r.id)} className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors">
                    <EyeIcon className="w-5 h-5" />
                </button>
            )
        }
    ];

    return (
        <div className="animate-fade-in space-y-6 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-primary uppercase tracking-tighter">PAGO DE FLETES</h1>
                    <p className="text-sm text-text-secondary font-bold uppercase tracking-widest opacity-60 italic">Control Financiero y Liquidación de Unidades</p>
                </div>
                <div className="relative w-80 group">
                    <input type="text" placeholder="Buscar remisión, línea..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm font-bold pl-12 focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm" />
                    <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
            </div>

            <div className="bg-surface rounded-3xl border border-border overflow-hidden shadow-2xl">
                <DataTable 
                    data={filteredData} 
                    columns={columns} 
                    pageSize={20} 
                    isLoading={loading} 
                    onRowClick={(r) => handleOpenDetails(r.id)}
                    emptyMessage="No hay viajes listos para liquidación."
                />
            </div>

            {isDetailsModalOpen && selectedReportId && (
                <FreightPaymentDetailsModal 
                    isOpen={isDetailsModalOpen} 
                    onClose={() => setIsDetailsModalOpen(false)} 
                    report={reports.find(r => r.id === selectedReportId)!}
                    clientes={clientes}
                    lineas={lineas}
                    productos={productos}
                    onUpdate={fetchData}
                />
            )}
        </div>
    );
};

export default FreightPaymentPage;
