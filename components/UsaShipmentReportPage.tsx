import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, ProductoDB, EstatusDB, ClienteDB, TipoUnidad, EscalaDB, ResponsableDB, ProyectoDB, LineaTransporteDB, ShipmentStatus, User, UserRole } from '../types';
import UsaShipmentForm from './UsaShipmentForm';
import ConfirmModal from './ConfirmModal';
import ShipmentDetailsModal from './ShipmentDetailsModal';
import IncidentModal from './IncidentModal';
import CarrierRatingModal from './CarrierRatingModal';
import Badge from './ui/Badge';
import DataTable, { Column } from './ui/DataTable';
import ShipmentCardView from './ShipmentCardView';
import StaffOnDuty from './StaffOnDuty';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, BoxIcon, TruckIcon, SwitchHorizontalIcon, ExclamationIcon, DatabaseIcon, ClockIcon, UserIcon, PhoneIcon, LayoutGridIcon, TableIcon } from './icons';
import { useNotification } from './NotificationProvider';
import { useTiveMonitoring } from './TiveMonitoringProvider';
import { formatCarrierName, toCamelCase, toSnakeCase } from '../utils/formatters';
import { TableSkeleton } from './ui/Skeleton';

interface UsaShipmentReportPageProps {
    initialView?: 'active' | 'completed';
    user: User;
}

const UsaShipmentReportPage: React.FC<UsaShipmentReportPageProps> = ({ initialView = 'active', user }) => {
    const [reports, setReports] = useState<UsaShipmentReport[]>([]);
    const [productSpecs, setProductSpecs] = useState<ProductoDB[]>([]);
    const [proyectos, setProyectos] = useState<ProyectoDB[]>([]);
    const [logisticStatuses, setLogisticStatuses] = useState<EstatusDB[]>([]);
    const [clientes, setClientes] = useState<ClienteDB[]>([]);
    const [tiposUnidad, setTiposUnidad] = useState<TipoUnidad[]>([]);
    const [escalas, setEscalas] = useState<EscalaDB[]>([]);
    const [responsables, setResponsables] = useState<ResponsableDB[]>([]);
    const [lineas, setLineas] = useState<LineaTransporteDB[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<string | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [reportIdForDetails, setReportIdForDetails] = useState<string | null>(null);
    const { latestTiveData } = useTiveMonitoring();
    const { addNotification } = useNotification();
    const [view, setView] = useState<'active' | 'completed'>(initialView || 'active');
    const [reportToComplete, setReportToComplete] = useState<string | null>(null);
    const [completionDate, setCompletionDate] = useState(new Date().toISOString().substring(0, 16));
    const [reportToRate, setReportToRate] = useState<UsaShipmentReport | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());

    const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
    const [reportForIncident, setReportForIncident] = useState<UsaShipmentReport | null>(null);
    const [displayMode, setDisplayMode] = useState<'table' | 'cards'>('table');

    const [pendingLoads, setPendingLoads] = useState<Record<string, number>>({});
    const ensureShipmentWriteAccess = () => {
        if (canManageShipments) return true;
        addNotification({
            type: 'warning',
            title: 'Acceso Restringido',
            message: 'Tu rol no puede modificar embarques desde esta vista.'
        });
        return false;
    };
    const canManageShipments = [UserRole.COORDINADOR, UserRole.SUBGERENCIA, UserRole.ADMINISTRATIVO, UserRole.GERENCIA, UserRole.ADMINISTRADOR].includes(user.role);

    const handleViewChange = (newView: 'active' | 'completed') => { setView(newView); };

    const fetchRadarData = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('lider_programacion_usa_reports')
                .select('fecha_salida')
                .eq('usa_logistics_status', 'Programado');

            if (error) throw error;

            const counts: Record<string, number> = {};
            data?.forEach(item => {
                const dateStr = String(item.fecha_salida || '').split('T')[0];
                if (dateStr) counts[dateStr] = (counts[dateStr] || 0) + 1;
            });
            setPendingLoads(counts);
        } catch (err) {
            console.error("Error en radar:", err);
        }
    }, []);

    useEffect(() => {
        fetchRadarData();
        const channel = supabase.channel('radar-usa-reports')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'lider_programacion_usa_reports' }, () => fetchRadarData())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchRadarData]);

    const radarDays = useMemo(() => {
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = -1; i < 9; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            days.push({
                date: dateStr,
                label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
                dayNum: d.getDate(),
                isToday: i === 0,
                hasCarga: (pendingLoads[dateStr] || 0) > 0,
                count: pendingLoads[dateStr] || 0
            });
        }
        return days;
    }, [pendingLoads]);

    const unifiedActiveData = useMemo(() => {
        return reports.filter(r => {
            const st = (r.logisticStatus || '').toLowerCase();
            return st !== 'finalizado' && st !== 'cancelado';
        });
    }, [reports]);

    const filteredData = useMemo(() => {
        let base = view === 'active' ? unifiedActiveData : reports.filter(r => {
            const st = (r.logisticStatus || '').toLowerCase();
            return st === 'finalizado' || st === 'cancelado';
        });
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            base = base.filter(r => (r.tripId || '').toLowerCase().includes(q) || (r.project || '').toLowerCase().includes(q) || (r.driverName || '').toLowerCase().includes(q));
        }
        return base;
    }, [unifiedActiveData, reports, view, searchQuery]);

    const pendingRatingsCount = useMemo(() => {
        return reports.filter(r => r.ratingPending === true).length;
    }, [reports]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const tables = [
                { name: 'usa_shipment_reports', order: { col: 'created_at', asc: false } },
                { name: 'usa_productos' },
                { name: 'usa_proyectos' },
                { name: 'usa_estatus' },
                { name: 'usa_clientes' },
                { name: 'tipo_unidad', order: { col: 'id', asc: true } },
                { name: 'usa_escalas', order: { col: 'nombre', asc: true } },
                { name: 'usa_responsables', order: { col: 'nombre', asc: true } },
                { name: 'usa_lineas_transporte', order: { col: 'nombre', asc: true } }
            ];

            const results = await Promise.all(tables.map(t => {
                let query = supabase.from(t.name).select('*');
                if (t.order) query = query.order(t.order.col, { ascending: t.order.asc });
                return query;
            }));

            // Check for errors in each table
            for (let i = 0; i < results.length; i++) {
                if (results[i].error) {
                    console.error(`Error en tabla ${tables[i].name}:`, results[i].error);
                    throw new Error(`Falló tabla: ${tables[i].name}`);
                }
            }

            const [reportsRes, specsRes, proyectosRes, statusesRes, clientesRes, tiposUnidadRes, escalasRes, responsablesRes, lineasRes] = results;

            setReports(toCamelCase(reportsRes.data) as UsaShipmentReport[]);
            setProductSpecs(toCamelCase(specsRes.data || []) as ProductoDB[]);
            setProyectos(toCamelCase(proyectosRes.data || []) as ProyectoDB[]);
            setLogisticStatuses(toCamelCase(statusesRes.data || []) as EstatusDB[]);
            setClientes(toCamelCase(clientesRes.data || []) as ClienteDB[]);
            setTiposUnidad(toCamelCase(tiposUnidadRes.data || []) as TipoUnidad[]);
            setEscalas(toCamelCase(escalasRes.data || []) as EscalaDB[]);
            setResponsables(toCamelCase(responsablesRes.data || []) as ResponsableDB[]);
            setLineas(toCamelCase(lineasRes.data || []) as LineaTransporteDB[]);
        } catch (error: any) {
            console.error("Fetch Error:", error);
            addNotification({ 
                type: 'danger', 
                title: 'Error de Datos', 
                message: error.message || 'Fallo al cargar datos operativos.' 
            });
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const isCurrentlyOnDuty = (horario?: string) => {
        if (!horario) return false;
        try {
            const [start, end] = horario.split('-').map(s => s.trim());
            const now = currentTime.getHours() * 60 + currentTime.getMinutes();
            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            if (startTotal <= endTotal) return now >= startTotal && now <= endTotal;
            return now >= startTotal || now <= endTotal;
        } catch (e) { return false; }
    };

    const onDutyResponsables = useMemo(() => {
        return responsables.filter(r => isCurrentlyOnDuty(r.horarioAtencion));
    }, [responsables, currentTime]);

    const handleOpenForm = (report: UsaShipmentReport | null = null) => {
        setSelectedReportId(report ? report.id : null);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => { setIsFormOpen(false); setSelectedReportId(null); };

    const handleOpenDetailsModal = (report: any) => {
        setReportIdForDetails(report.id);
        setIsDetailsModalOpen(true);
    };

    const handleSubmit = async (reportData: any, status: string | null) => {
        if (!ensureShipmentWriteAccess()) return;
        try {
            const items = Array.isArray(reportData) ? reportData : [reportData];
            for (const item of items) {
                const { id, createdAt, loteOriginalId, loteSecundarioId, ...data } = item as any;
                const finalStatus = status || data.logisticStatus || 'Confirmado';
                const payload = { ...data, logisticStatus: finalStatus, loteOriginalId: loteOriginalId || null, loteSecundarioId: loteSecundarioId || null };
                const dataToSave = toSnakeCase(payload);

                if (id && String(id).length > 15) {
                    await supabase.from('usa_shipment_reports').update(dataToSave).eq('id', id);
                } else {
                    await supabase.from('usa_shipment_reports').insert(dataToSave);
                }

                if (loteOriginalId) {
                    await supabase.from('lider_programacion_usa_reports').update({ usa_logistics_status: 'Cargado' }).eq('id', loteOriginalId);
                }
                if (loteSecundarioId) {
                    await supabase.from('lider_programacion_usa_reports').update({ usa_logistics_status: 'Cargado' }).eq('id', loteSecundarioId);
                }
            }
            addNotification({ type: 'success', title: 'Viaje Registrado', message: `Folio oficial ${items[0].tripId} sincronizado.` });
            await fetchData();
            handleCloseForm();
        } catch (error: any) {
            addNotification({ type: 'danger', title: 'Error Crítico', message: error.message || 'Fallo de integridad.' });
        }
    };

    const confirmDelete = async () => {
        if (!ensureShipmentWriteAccess()) return;
        if (!reportToDelete) return;
        try {
            const report = reports.find(r => r.id === reportToDelete);
            const { error } = await supabase.from('usa_shipment_reports').delete().eq('id', reportToDelete);
            if (error) throw error;

            // JEFE: Si borramos el embarque, debemos regresar los lotes originales a 'Programado'
            if (report?.loteOriginalId) {
                await supabase.from('lider_programacion_usa_reports').update({ usa_logistics_status: 'Programado' }).eq('id', report.loteOriginalId);
            }
            if (report?.loteSecundarioId) {
                await supabase.from('lider_programacion_usa_reports').update({ usa_logistics_status: 'Programado' }).eq('id', report.loteSecundarioId);
            }

            setReports(prev => prev.filter(r => r.id !== reportToDelete));
            addNotification({ type: 'success', title: 'Eliminado', message: 'Embarque eliminado y lotes liberados.' });
        } catch (err: any) {
            console.error("Error al borrar embarque:", err);
            addNotification({ type: 'danger', title: 'Error', message: err.message || 'No se pudo eliminar el registro.' });
        } finally {
            setReportToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    const confirmCompleteTrip = async () => {
        if (!ensureShipmentWriteAccess()) return;
        if (!reportToComplete) return;
        const report = reports.find(r => r.id === reportToComplete);
        
        // JEFE: Usamos la fecha seleccionada manualmente por el usuario
        const finalArrivalDate = new Date(completionDate).toISOString();

        await supabase.from('usa_shipment_reports').update({
            logistic_status: 'Finalizado',
            arrival_date_time: finalArrivalDate,
            rating_pending: true // JEFE: Marcamos para feedback obligatorio
        }).eq('id', reportToComplete);

        addNotification({ type: 'info', title: 'Viaje Concluido', message: 'Por favor califique el servicio de la línea.' });
        await fetchData();

        if (report) setReportToRate(report);
        setReportToComplete(null);
        handleViewChange('completed');
    };

    const handleConfirmRating = async (rating: number, comments: string) => {
        if (!ensureShipmentWriteAccess()) return;
        if (!reportToRate) return;
        try {
            await supabase.from('usa_shipment_reports').update({
                carrier_rating: rating,
                carrier_rating_comments: comments,
                rating_pending: false
            }).eq('id', reportToRate.id);

            addNotification({ type: 'success', title: 'Auditoría Guardada', message: 'Gracias por su retroalimentación sobre el servicio.' });
            setReportToRate(null);
            fetchData();
        } catch (e) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo guardar la calificación.' });
        }
    };

    const getRowStyle = (report: any): React.CSSProperties => {
        const status = logisticStatuses.find(s => s.nombre === report.logisticStatus);
        const color = status?.color || '#ddd';

        // JEFE: Aplicamos un fondo sumamente tenue (aprox 5% de opacidad) para identificar la fila
        let backgroundColor = undefined;
        if (color && color.startsWith('#') && color.length === 7) {
            backgroundColor = `${color}08`; // 08 es aprox 3% opacidad, muy tenue como pidió el usuario
        }

        return {
            borderLeftWidth: '4px',
            borderLeftColor: color,
            backgroundColor
        };
    };

    // JEFE: MOTOR DE REORDENACIÓN DE FILAS (SÓLO UI LOCAL PARA ESTA VERSIÓN)
    const handleReorder = (newData: UsaShipmentReport[]) => {
        setReports(newData);
    };

    // JEFE: COLUMNAS CONFIGURADAS CON PRECISIÓN QUIRÚRGICA
    const columns: Column<any>[] = [
        {
            header: "ID VIAJE",
            accessor: (r) => <span className="font-black text-primary uppercase">{r.tripId}</span>
        },
        {
            header: "LÍNEA",
            accessor: (r) => (
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-primary uppercase">{formatCarrierName(lineas.find(l => l.id === r.lineaTransportistaId)?.nombre)}</span>
                    <span className="text-[8px] font-bold text-text-muted uppercase">{r.driverName || 'Sin Operador'}</span>
                </div>
            )
        },
        {
            header: "ORIGEN-DESTINO",
            accessor: (r) => (
                <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="text-primary uppercase">{r.project || 'S/D'}</span>
                    <span className="text-text-muted">&rarr;</span>
                    <span className="text-success uppercase">{clientes.find(c => c.id === r.clientId)?.nombre || 'S/D'}</span>
                </div>
            )
        },
        {
            header: "Calendario (S/L)",
            sortKey: 'departureDateTime' as any,
            accessor: (r) => {
                const depDate = r.realDepartureDate || r.departureDateTime;
                const arrDate = r.arrivalDateTime;
                
                return (
                    <div className="flex flex-col gap-0.5 min-w-[120px]">
                        <div className="text-[10px] font-black text-primary uppercase flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/30"></div>
                            {depDate ? new Date(depDate).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---'}
                        </div>
                        <div className="text-[10px] font-black text-success uppercase flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-success/30"></div>
                            {arrDate ? new Date(arrDate).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---'}
                        </div>
                    </div>
                );
            }
        },
        {
            header: "PRODUCTO-VOLUMEN",
            accessor: (r) => {
                const total = Number(r.totalRealBoxes || r.products?.reduce((acc: number, p: any) => acc + (Number(p.quantity || p.cantidad || 0)), 0) || 0);
                const productNames = r.products?.map((p: any) => productSpecs.find(spec => spec.id === (p.productId || p.product_id))?.nombreDelProducto || p.manualProductName || p.manual_product_name).filter(Boolean).join(', ') || 'S/D';
                return (
                    <div className="space-y-0.5">
                        <div className="text-[9px] font-black text-text-muted truncate max-w-[150px] uppercase">{productNames}</div>
                        <div className="font-black text-primary text-xs">{total.toLocaleString()} <span className="text-[8px] opacity-60">CJS</span></div>
                    </div>
                );
            }
        },
        {
            header: "TEMP REAL-OPTIMA",
            accessor: (r) => {
                const live = latestTiveData[r.id];
                const ideal = r.idealTemp || r.temperature || '--';
                const hasExcursion = live?.temp && ideal !== '--' && Math.abs(Number(live.temp) - Number(ideal)) > 4;
                return (
                    <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-black ${hasExcursion ? 'text-danger animate-pulse' : 'text-primary'}`}>
                            {live ? `${live.temp?.toFixed(1)}°F` : '--°F'}
                        </span>
                        <span className="text-[9px] font-bold text-text-muted">/ {ideal}°F</span>
                    </div>
                );
            }
        },
        {
            header: "COSTO FLETE (USD/MXN)",
            accessor: (r) => {
                const usd = r.freightCost ? Number(r.freightCost) : 0;
                const mxnMatch = r.comments?.match(/\[MXN:([\d.]+)\]/);
                const mxn = mxnMatch ? Number(mxnMatch[1]) : 0;
                return (
                    <div className="flex flex-col gap-0.5">
                        <div className="text-[11px] font-black text-primary flex items-center gap-1">
                            <span className="text-[8px] opacity-70">USD</span> ${usd.toLocaleString()}
                        </div>
                        {mxn > 0 && (
                            <div className="text-[9px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100 w-fit">
                                <span className="text-[7px] opacity-70">MXN</span> ${mxn.toLocaleString()}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            header: "ESTATUS LOGISTICO",
            accessor: (r) => (
                <div className="flex flex-col gap-1.5 items-start">
                    <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm inline-block border ${r.logisticStatus === 'Finalizado' ? 'bg-success text-white border-success' : 'bg-primary text-white border-primary-focus'
                        }`}>
                        {r.logisticStatus}
                    </span>
                    {r.comments?.includes('[HOLD]') && (
                        <Badge status={ShipmentStatus.HOLD} />
                    )}
                    {r.ratingPending && (
                        <span className="text-[8px] font-black text-amber-600 uppercase flex items-center gap-1">
                            <ExclamationIcon className="w-2.5 h-2.5" /> Pendiente Auditoría
                        </span>
                    )}
                </div>
            )
        },
        {
            header: "ACCIONES",
            headerClassName: "text-center",
            className: "text-center min-w-[140px]",
            accessor: (r) => (
                <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {r.ratingPending ? (
                        <button onClick={() => setReportToRate(r)} className="px-3 py-1 bg-amber-500 text-white rounded-lg text-[9px] font-black uppercase tracking-tighter hover:bg-amber-600 shadow-sm animate-pulse">Calificar</button>
                    ) : (
                        <button onClick={() => handleOpenDetailsModal(r)} className="p-2 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"><EyeIcon className="w-5 h-5" /></button>
                    )}
                    <button onClick={() => { setReportForIncident(r); setIsIncidentModalOpen(true); }} className="p-2 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"><ExclamationIcon className="w-5 h-5" /></button>
                    <button onClick={() => handleOpenForm(r)} className="p-2 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"><PencilIcon className="w-5 h-5" /></button>
                    <button onClick={() => { setReportToDelete(r.id); setIsDeleteModalOpen(true); }} className="p-2 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"><TrashIcon className="w-5 h-5" /></button>
                </div>
            )
        }
    ];

    return (
        <div className="animate-fade-in pb-12 space-y-8 h-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-primary uppercase tracking-tight">Centro de Operaciones USA</h1>
                    <p className="text-sm text-text-secondary font-medium mt-1">Gestión avanzada de activos y despachos internacionales</p>
                </div>
                <div className="flex items-center gap-3">
                    {pendingRatingsCount > 0 && (
                        <button
                            onClick={() => setView('completed')}
                            className="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 text-[11px] uppercase tracking-wider animate-pulse hover:bg-amber-100 transition-colors shadow-sm"
                        >
                            <ExclamationIcon className="w-4 h-4" /> {pendingRatingsCount} Pendientes de Auditoría
                        </button>
                    )}
                    <button
                        onClick={() => handleOpenForm()}
                        className="bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-primary-focus hover:shadow-primary/20 transition-all flex items-center gap-2 text-xs uppercase tracking-widest active:scale-95"
                    >
                        <PlusIcon className="w-5 h-5" /> Nuevo Despacho
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-surface p-6 rounded-2xl border border-border shadow-sm overflow-hidden animate-slide-up">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/5 rounded-lg text-primary"><ClockIcon className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-[11px] font-black text-primary uppercase tracking-widest leading-none">Radar de Planificación</h4>
                                <p className="text-[10px] text-text-muted font-bold mt-1 uppercase">Sincronización con Liderazgo USA</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-[9px] font-black text-emerald-700 uppercase tracking-tighter">Telemetría en Vivo</span>
                        </div>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                        {radarDays.map((day, idx) => (
                            <div
                                key={idx}
                                className={`flex flex-col items-center justify-center min-w-[75px] h-20 rounded-2xl border transition-all relative ${day.isToday ? 'bg-primary/5 border-primary/20 shadow-md ring-1 ring-primary/5' : 'bg-surface-secondary/20 border-transparent hover:bg-surface-secondary/40'}`}
                            >
                                <span className={`text-[9px] font-black uppercase mb-1 ${day.isToday ? 'text-primary' : 'text-text-muted'}`}>{day.label}</span>
                                <span className={`text-xl font-black ${day.isToday ? 'text-primary' : 'text-text-primary'}`}>{day.dayNum}</span>

                                {day.hasCarga && (
                                    <div className="absolute -top-1.5 -right-1.5 flex flex-col items-center">
                                        <div className="relative">
                                            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white shadow-md flex items-center justify-center">
                                                <span className="text-[7px] text-white font-black">{day.count}</span>
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {day.isToday && <div className="absolute -bottom-1.5 w-6 h-1 bg-primary rounded-full"></div>}
                            </div>
                        ))}
                    </div>
                </div>

                <StaffOnDuty />
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface p-4 rounded-2xl border border-border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="inline-flex bg-background p-1.5 rounded-xl border border-border">
                        <button
                            onClick={() => setView('active')}
                            className={`px-6 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${view === 'active' ? 'bg-primary text-white shadow-lg' : 'text-text-secondary hover:bg-white/50'}`}
                        >
                            Flota Activa
                        </button>
                        <button
                            onClick={() => setView('completed')}
                            className={`px-6 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${view === 'completed' ? 'bg-primary text-white shadow-lg' : 'text-text-secondary hover:bg-white/50'}`}
                        >
                            Historial
                        </button>
                    </div>

                    <div className="h-8 w-px bg-border hidden md:block"></div>

                    <div className="inline-flex bg-background p-1.5 rounded-xl border border-border">
                        <button
                            onClick={() => setDisplayMode('table')}
                            className={`p-2 rounded-lg transition-all ${displayMode === 'table' ? 'bg-white text-primary shadow-sm border border-border/50' : 'text-text-muted hover:text-primary'}`}
                        >
                            <TableIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setDisplayMode('cards')}
                            className={`p-2 rounded-lg transition-all ${displayMode === 'cards' ? 'bg-white text-primary shadow-sm border border-border/50' : 'text-text-muted hover:text-primary'}`}
                        >
                            <LayoutGridIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="relative w-full md:w-96 group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Filtrar por ID, Sede u Operador..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-12 py-3.5 text-sm font-bold placeholder:text-text-muted/50 focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all shadow-inner"
                    />
                </div>
            </div>

            <div className={`bg-surface rounded-2xl border border-border overflow-hidden shadow-xl flex flex-col flex-1 ${displayMode === 'cards' ? 'bg-transparent border-none shadow-none' : ''}`}>
                {displayMode === 'table' ? (
                    <DataTable
                        data={filteredData}
                        columns={columns}
                        pageSize={25}
                        isLoading={loading}
                        onRowClick={handleOpenDetailsModal}
                        onReorder={handleReorder}
                        rowStyle={getRowStyle}
                        emptyMessage="Sin movimientos registrados en este segmento."
                    />
                ) : (
                    <ShipmentCardView
                        data={filteredData}
                        statuses={logisticStatuses}
                        productSpecs={productSpecs}
                        clientes={clientes}
                        lineas={lineas}
                        latestTiveData={latestTiveData}
                        onCardClick={handleOpenDetailsModal}
                        onIncidentClick={(r) => { setReportForIncident(r); setIsIncidentModalOpen(true); }}
                        onEditClick={handleOpenForm}
                        onDeleteClick={(id) => { setReportToDelete(id); setIsDeleteModalOpen(true); }}
                        onRateClick={setReportToRate}
                    />
                )}
            </div>

            {isFormOpen && <UsaShipmentForm isOpen={isFormOpen} onClose={handleCloseForm} onSubmit={handleSubmit} initialData={reports.find(r => r.id === selectedReportId) || null} productSpecs={productSpecs} proyectos={proyectos} logisticStatuses={logisticStatuses} clientes={clientes} tiposUnidad={tiposUnidad} escalas={escalas} responsables={responsables} />}
            {isDetailsModalOpen && <ShipmentDetailsModal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} report={reports.find(r => r.id === reportIdForDetails)!} productSpecs={productSpecs} proyectos={proyectos} clientes={clientes} logisticStatuses={logisticStatuses} onCompleteTrip={setReportToComplete} onRefresh={fetchData} />}
            {isIncidentModalOpen && reportForIncident && <IncidentModal isOpen={isIncidentModalOpen} onClose={() => setIsIncidentModalOpen(false)} report={reportForIncident} logisticStatuses={logisticStatuses} onUpdate={fetchData} />}
            {reportToRate && (
                <CarrierRatingModal
                    isOpen={!!reportToRate}
                    onClose={() => setReportToRate(null)}
                    onConfirm={handleConfirmRating}
                    tripId={reportToRate.tripId}
                    carrierName={formatCarrierName(lineas.find(l => l.id === reportToRate.lineaTransportistaId)?.nombre || 'Línea Externa')}
                />
            )}
            {reportToComplete && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-surface rounded-3xl shadow-2xl max-w-md w-full border border-border animate-slide-up overflow-hidden">
                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-success/10 text-success rounded-2xl">
                                    <ClockIcon className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-black text-primary uppercase tracking-tight">Finalizar Viaje</h3>
                            </div>
                            <p className="text-sm text-text-secondary font-medium mb-6">Confirme el arribo de la unidad y registre la fecha/hora real de llegada a Frontera.</p>
                            
                            <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-border">
                                <label className="block text-[10px] font-black text-primary uppercase tracking-widest">Fecha/Hora de Arribo Real</label>
                                <input 
                                    type="datetime-local" 
                                    className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm font-bold text-primary outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                                    value={completionDate}
                                    onChange={(e) => setCompletionDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 bg-surface-secondary/30 border-t border-border">
                            <button onClick={() => setReportToComplete(null)} className="px-6 py-2.5 rounded-xl text-xs font-black uppercase text-text-muted hover:bg-white transition-all">Cancelar</button>
                            <button onClick={confirmCompleteTrip} className="px-8 py-2.5 rounded-xl text-xs font-black uppercase bg-success text-white hover:bg-green-700 shadow-lg shadow-success/20 transition-all">Finalizar y Archivar</button>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} title="Confirmar Eliminación" message="Esta acción es irreversible y liberará los lotes asociados." />
        </div>
    );
};

export default UsaShipmentReportPage;
