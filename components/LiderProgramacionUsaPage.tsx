import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { LiderProgramacionUsaReport, ProductoDB, ProyectoDB, ClienteDB, User, UserRole } from '../types';
import LiderProgramacionUsaForm from './LiderProgramacionUsaForm';
import ConfirmModal from './ConfirmModal';
import DataTable, { Column } from './ui/DataTable';
import StaffOnDuty from './StaffOnDuty';
import { PlusIcon, PencilIcon, TrashIcon, TruckIcon, SwitchHorizontalIcon, MapPinIcon } from './icons';
import { useNotification } from './NotificationProvider';
import { toCamelCase, toSnakeCase } from '../utils/formatters';

// MI DIOS: COMPONENTE AGREGADO - Diagrama de Flujo Logístico (E1 -> E2 -> Cliente)
const DualFlowVisual: React.FC<{ report: any, clientes: ClienteDB[] }> = ({ report, clientes }) => {
    const isConsolidated = report.isMasterGroup;
    const clientName = clientes.find(c => c.id === report.clientId)?.nombre || 'CLIENTE';
    const projectInfo = report.combinedProjectInfo || [];

    return (
        <div className="flex items-center gap-2 py-2">
            <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm" title="Origen (E1)">
                    <MapPinIcon className="w-4 h-4" />
                </div>
                <span className="text-[7px] font-black text-primary mt-1 truncate max-w-[50px] uppercase">
                    {projectInfo[0]?.name?.split(' ')[0] || 'E1'}
                </span>
            </div>

            <div className="flex-1 flex items-center relative min-w-[40px]">
                <div className="h-[2px] w-full border-t border-dashed border-gray-300"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <TruckIcon className="w-3 h-3 text-primary animate-pulse" />
                </div>
            </div>

            {isConsolidated && (
                <>
                    <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-sm" title="Escala Técnica (E2)">
                            <SwitchHorizontalIcon className="w-4 h-4" />
                        </div>
                        <span className="text-[7px] font-black text-accent mt-1 truncate max-w-[50px] uppercase">
                            {projectInfo[1]?.name?.split(' ')[0] || 'E2'}
                        </span>
                    </div>
                    <div className="flex-1 flex items-center relative min-w-[40px]">
                        <div className="h-[2px] w-full border-t border-dashed border-gray-300"></div>
                    </div>
                </>
            )}

            <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center text-success shadow-sm" title="Destino Final">
                    <TruckIcon className="w-4 h-4" />
                </div>
                <span className="text-[7px] font-black text-success mt-1 truncate max-w-[60px] uppercase">
                    {clientName.split(' ')[0]}
                </span>
            </div>
        </div>
    );
};

interface LiderProgramacionUsaPageProps {
    user: User;
}

const LiderProgramacionUsaPage: React.FC<LiderProgramacionUsaPageProps> = ({ user }) => {
    const [reports, setReports] = useState<LiderProgramacionUsaReport[]>([]);
    const [productSpecs, setProductSpecs] = useState<ProductoDB[]>([]);
    const [proyectos, setProyectos] = useState<ProyectoDB[]>([]);
    const [clientes, setClientes] = useState<ClienteDB[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedReport, setSelectedReport] = useState<LiderProgramacionUsaReport | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<string | null>(null);
    const { addNotification } = useNotification();
    const canManagePlanning = [UserRole.LIDER_PROYECTO, UserRole.GERENCIA, UserRole.ADMINISTRADOR].includes(user.role);
    const [promoting, setPromoting] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [planningView, setPlanningView] = useState<'active' | 'history'>('active');
    const ensurePlanningWriteAccess = () => {
        if (canManagePlanning) return true;
        addNotification({
            type: 'warning',
            title: 'Acceso Restringido',
            message: 'Tu rol no puede modificar la programacion USA.'
        });
        return false;
    };

    // MI DIOS: ESTADO AGREGADO - Timeline Horizontal
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const getWeekNumber = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };
    const currentWeek = useMemo(() => getWeekNumber(new Date()), []);
    const todayKey = useMemo(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [reportsRes, specsRes, proyectosRes, clientesRes] = await Promise.all([
                supabase.from('lider_programacion_usa_reports').select('*').order('fecha_salida', { ascending: true }),
                supabase.from('usa_productos').select('*'),
                supabase.from('usa_proyectos').select('*'),
                supabase.from('usa_clientes').select('*'),
            ]);

            if (reportsRes.error) throw reportsRes.error;
            if (specsRes.error) throw specsRes.error;
            if (proyectosRes.error) throw proyectosRes.error;
            if (clientesRes.error) throw clientesRes.error;

            setReports(toCamelCase(reportsRes.data || []) as LiderProgramacionUsaReport[]);
            setProductSpecs(toCamelCase(specsRes.data || []) as ProductoDB[]);
            setProyectos(toCamelCase(proyectosRes.data || []) as ProyectoDB[]);
            setClientes(toCamelCase(clientesRes.data || []) as ClienteDB[]);
        } catch (error) {
            console.error(error);
            addNotification({ type: 'danger', title: 'Error', message: 'Fallo crítico al sincronizar la base de datos.' });
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setSelectedDate(null);
    }, [planningView, projectFilter]);

    const sectionReports = useMemo(() => {
        return reports.filter(r => {
            if (r.usaLogisticsStatus === 'Cancelado') return false;
            const reportDate = String(r.fechaSalida || '').split('T')[0];
            const dateWeek = reportDate ? getWeekNumber(new Date(`${reportDate}T12:00:00`)) : null;
            const fiscalWeek = Number(r.semanaFiscal) || dateWeek;
            const isHistory = !!reportDate && reportDate < todayKey;
            return planningView === 'history'
                ? isHistory
                : fiscalWeek === currentWeek;
        });
    }, [reports, planningView, todayKey, currentWeek]);

    const availableProjects = useMemo(() => {
        const projectMap = new Map<string, string>();
        sectionReports.forEach(r => {
            const label = Array.isArray(r.proyecto) ? r.proyecto.join(' / ') : String(r.proyecto || '').trim();
            const value = r.projectId || label;
            if (label && value && !projectMap.has(value)) projectMap.set(value, label);
        });
        return Array.from(projectMap.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [sectionReports]);

    // MI DIOS: FUNCIÓN AGREGADA - Generador de Timeline (Próximos 10 días)
    const timelineDays = useMemo(() => {
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));

        const timelineBase = planningView === 'history' ? today : weekStart;
        const range = planningView === 'history' ? { start: -10, end: 2 } : { start: 0, end: 7 };
        for (let i = range.start; i < range.end; i++) {
            const d = new Date(timelineBase);
            d.setDate(timelineBase.getDate() + i);

            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const dayNum = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayNum}`;

            const dayReports = sectionReports.filter(r => r.fechaSalida && String(r.fechaSalida).split('T')[0] === dateStr);
            const totalPallets = dayReports.reduce((acc, curr) => acc + (Number(curr.pallets) || 0), 0);

            days.push({
                date: dateStr,
                label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
                dayNum: d.getDate(),
                isToday: i === 0,
                load: totalPallets
            });
        }
        return days;
    }, [planningView, sectionReports]);

    // MI DIOS: MOTOR DE RECALCULO DINÁMICO DE VOLUMEN (v2.1 - RESILIENTE A VARIANTES)
    const getCalculatedPallets = (report: LiderProgramacionUsaReport) => {
        if (Number(report.pallets) > 0) return Number(report.pallets);
        return report.productos?.reduce((acc, p: any) => {
            const pid = p.productId || p.product_id;
            const qty = Number(p.quantity || p.cantidad || 0);
            const spec = productSpecs.find(s => s.id === pid);
            const cpp = spec?.cajasPalletUsa || 60;
            return acc + Math.ceil(qty / cpp);
        }, 0) || 0;
    };

    const getCalculatedCajas = (report: LiderProgramacionUsaReport) => {
        if (Number(report.cajas) > 0) return Number(report.cajas);
        return report.productos?.reduce((acc, p: any) => acc + (Number(p.quantity || p.cantidad || 0)), 0) || 0;
    };

    const groupedReports = useMemo(() => {
        if (!reports || reports.length === 0) return [];

        const processedIds = new Set<string>();
        const groups: any[] = [];

        let baseList = [...sectionReports];

        if (selectedDate) {
            baseList = baseList.filter(r => r.fechaSalida && String(r.fechaSalida).split('T')[0] === selectedDate);
        }

        if (projectFilter) {
            baseList = baseList.filter(r => {
                const value = r.projectId || (Array.isArray(r.proyecto) ? r.proyecto.join(' / ') : String(r.proyecto || '').trim());
                return value === projectFilter;
            });
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            baseList = baseList.filter(r =>
                (r.loteId || '').toLowerCase().includes(q) ||
                (Array.isArray(r.proyecto) ? r.proyecto.join(' ').toLowerCase().includes(q) : String(r.proyecto || '').toLowerCase().includes(q)) ||
                (r.productos || []).some((prod: any) => {
                    const label = productSpecs.find(s => s.id === (prod.productId || prod.product_id))?.nombreDelProducto || prod.manualProductName || prod.manual_product_name || '';
                    return label.toLowerCase().includes(q);
                })
            );
        }

        baseList.forEach(report => {
            if (processedIds.has(report.id)) return;

            if (report.isConsolidated && report.consolidationPartnerId) {
                const partner = reports.find(r => r.id === report.consolidationPartnerId);
                if (partner) {
                    const rPallets = getCalculatedPallets(report);
                    const pPallets = getCalculatedPallets(partner);
                    const rCajas = getCalculatedCajas(report);
                    const pCajas = getCalculatedCajas(partner);

                    groups.push({
                        ...report,
                        isMasterGroup: true,
                        partnerData: partner,
                        combinedLoteIds: [report.loteId, partner.loteId],
                        combinedProjectInfo: [
                            {
                                name: Array.isArray(report.proyecto) ? report.proyecto[0] : report.proyecto,
                                product: productSpecs.find(s => s.id === (report.productos?.[0]?.productId || (report.productos?.[0] as any)?.product_id))?.nombreDelProducto || report.productos?.[0]?.manualProductName || (report.productos?.[0] as any)?.manual_product_name || 'Carga 1'
                            },
                            {
                                name: Array.isArray(partner.proyecto) ? partner.proyecto[0] : partner.proyecto,
                                product: productSpecs.find(s => s.id === (partner.productos?.[0]?.productId || (partner.productos?.[0] as any)?.product_id))?.nombreDelProducto || partner.productos?.[0]?.manualProductName || (partner.productos?.[0] as any)?.manual_product_name || 'Carga 2'
                            }
                        ],
                        combinedCajas: rCajas + pCajas,
                        combinedPallets: rPallets + pPallets,
                        combinedProductos: [...(report.productos || []), ...(partner.productos || [])]
                    });
                    processedIds.add(report.id);
                    processedIds.add(partner.id);
                    return;
                }
            }

            groups.push({
                ...report,
                combinedLoteIds: [report.loteId],
                combinedProjectInfo: [{
                    name: Array.isArray(report.proyecto) ? report.proyecto[0] : report.proyecto,
                    product: productSpecs.find(s => s.id === (report.productos?.[0]?.productId || (report.productos?.[0] as any)?.product_id))?.nombreDelProducto || report.productos?.[0]?.manualProductName || (report.productos?.[0] as any)?.manual_product_name || 'Producto'
                }],
                combinedCajas: getCalculatedCajas(report),
                combinedPallets: getCalculatedPallets(report),
                combinedProductos: report.productos || []
            });
            processedIds.add(report.id);
        });

        return groups;
    }, [sectionReports, selectedDate, projectFilter, searchQuery, productSpecs]);

    const handleSubmit = async (reportData: any) => {
        if (!ensurePlanningWriteAccess()) return;
        try {
            const isEditing = !!reportData.id;
            // JEFE: Limpiamos el payload de campos calculados que no existen en la DB para evitar error de Supabase
            const {
                id, created_at, createdAt,
                combinedLoteIds, combinedProjectInfo, combinedCajas,
                combinedPallets, combinedProductos, partnerData, isMasterGroup,
                ...rawFields
            } = reportData;

            const dataToSave = toSnakeCase({ ...rawFields });

            let error;
            if (isEditing) {
                const result = await supabase.from('lider_programacion_usa_reports').update(dataToSave).eq('id', id);
                error = result.error;
            } else {
                const result = await supabase.from('lider_programacion_usa_reports').insert(dataToSave);
                error = result.error;
            }
            if (error) throw new Error(error.message);

            addNotification({ type: 'success', title: 'Operación Exitosa', message: 'Programación guardada correctamente.' });
            fetchData();
            setIsFormOpen(false);
        } catch (error: any) {
            addNotification({ type: 'danger', title: 'Error', message: error.message });
        }
    };

    const confirmDelete = async () => {
        if (!ensurePlanningWriteAccess()) return;
        if (!reportToDelete) return;
        try {
            const report = reports.find(r => r.id === reportToDelete);

            // JEFE: Si ya está cargado, no permitimos borrar sin borrar el embarque primero
            if (report?.usaLogisticsStatus === 'Cargado') {
                addNotification({
                    type: 'warning',
                    title: 'Acción Bloqueada',
                    message: 'Este lote ya tiene un embarque generado. Debe eliminar el embarque en "Reporte USA" primero.'
                });
                return;
            }

            let idsToDelete = [reportToDelete];
            if (report?.isConsolidated && report?.consolidationPartnerId) {
                idsToDelete.push(report.consolidationPartnerId);
            }

            const { error } = await supabase.from('lider_programacion_usa_reports').delete().in('id', idsToDelete);
            if (error) throw error;

            setReports(prev => prev.filter(r => !idsToDelete.includes(r.id)));
            addNotification({ type: 'success', title: 'Registro Eliminado', message: idsToDelete.length > 1 ? 'Lotes consolidados borrados.' : 'Lote borrado.' });
        } catch (err: any) {
            console.error("Error al borrar:", err);
            addNotification({ type: 'danger', title: 'Error', message: err.message || 'No se pudo eliminar el registro.' });
        } finally {
            setReportToDelete(null);
            setIsModalOpen(false);
        }
    };

    const handlePromoteToShipment = async (report: any) => {
        if (!ensurePlanningWriteAccess()) return;
        setPromoting(report.id);
        try {
            const projects = report.combinedProjectInfo.map((p: any) => p.name).join(' / ');
            // JEFE: Sanitización de fecha para evitar duplicar 'T' en el timestamp
            const finalDeparture = report.fechaSalida ? new Date(report.fechaSalida).toISOString() : new Date().toISOString();

            const { error } = await supabase.from('usa_shipment_reports').insert(toSnakeCase({
                tripId: report.combinedLoteIds.join(' / '),
                project: projects,
                projectId: report.projectId,
                clientId: report.clientId,
                isConsolidated: !!report.partnerData,
                products: report.combinedProductos,
                logisticStatus: 'Pendiente',
                departureDateTime: finalDeparture,
                loteOriginalId: report.id,
                loteSecundarioId: report.partnerData?.id || null
            }));
            if (error) throw error;

            await supabase.from('lider_programacion_usa_reports').update({ usa_logistics_status: 'Cargado' }).eq('id', report.id);
            if (report.partnerData) {
                await supabase.from('lider_programacion_usa_reports').update({ usa_logistics_status: 'Cargado' }).eq('id', report.partnerData.id);
            }

            addNotification({ type: 'success', title: 'Envío Generado', message: 'Promovido a embarque.' });
            fetchData();
        } finally {
            setPromoting(null);
        }
    };

    const columns: Column<any>[] = [
        {
            header: "Ruta Logística",
            accessor: (r) => <DualFlowVisual report={r} clientes={clientes} />
        },
        {
            header: "Detalle Carga",
            accessor: (r) => (
                <div className="space-y-1">
                    {r.combinedLoteIds?.map((lid: string, idx: number) => (
                        <div key={idx} className={`font-black uppercase text-[10px] ${idx === 0 ? 'text-primary' : 'text-accent border-t border-accent/5 pt-0.5 mt-0.5'}`}>
                            {lid}
                        </div>
                    ))}
                    <div className="text-[8px] text-text-muted font-bold tracking-widest uppercase">
                        SALIDA: {r.fechaSalida ? new Date(r.fechaSalida).toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'S/A'}
                    </div>
                    {r.fechaLlegada && (
                        <div className="text-[8px] text-primary font-black tracking-widest uppercase mt-0.5">
                            ETA: {new Date(r.fechaLlegada).toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </div>
            )
        },
        {
            header: "Calendario (S/L)",
            accessor: (r) => (
                <div className="flex flex-col gap-0.5 min-w-[120px]">
                    <div className="text-[10px] font-black text-primary uppercase flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/30"></div>
                        {r.fechaSalida ? new Date(r.fechaSalida).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---'}
                    </div>
                    <div className="text-[10px] font-black text-success uppercase flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success/30"></div>
                        {r.fechaLlegada ? new Date(r.fechaLlegada).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---'}
                    </div>
                </div>
            )
        },
        {
            header: "Volumen Global",
            headerClassName: "text-center",
            className: "text-center",
            accessor: (r) => (
                <div className="flex flex-col items-center bg-gray-50 p-2 rounded-xl border border-border/50">
                    <span className="font-black text-sm text-primary leading-tight">{r.combinedCajas?.toLocaleString() || '0'}</span>
                    <span className="text-[8px] font-black text-text-muted uppercase tracking-tighter">{r.combinedPallets || '0'} PLTS</span>
                </div>
            )
        },
        {
            header: "Estatus",
            accessor: (r) => (
                <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${r.usaLogisticsStatus === 'Programado' ? 'bg-info/10 text-info' : 'bg-success/10 text-success'}`}>
                    {r.usaLogisticsStatus}
                </span>
            )
        },
        {
            header: "Acciones",
            headerClassName: "text-center",
            className: "text-center",
            accessor: (r) => (
                <div className="flex items-center justify-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handlePromoteToShipment(r); }} className="p-2 rounded-lg hover:bg-success/10 text-text-muted hover:text-success" title="Despachar">
                        {promoting === r.id ? <div className="w-4 h-4 border-2 border-success border-t-transparent rounded-full animate-spin"></div> : <TruckIcon className="w-5 h-5" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedReport(r); setIsFormOpen(true); }} className="p-2 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary"><PencilIcon className="w-5 h-5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setReportToDelete(r.id); setIsModalOpen(true); }} className="p-2 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger"><TrashIcon className="w-5 h-5" /></button>
                </div>
            )
        }
    ];

    return (
        <div className="animate-fade-in pb-12 h-full flex flex-col space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Consola del Líder</h1>
                            <p className="text-sm text-text-secondary mt-1 italic font-medium leading-none">Gestión técnica de lotes semanales. Semana activa: {currentWeek}.</p>
                        </div>
                        <button onClick={() => { setSelectedReport(null); setIsFormOpen(true); }} className="bg-primary text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:bg-primary-focus transition-all active:scale-95 text-xs flex items-center gap-2 uppercase tracking-widest">
                            <PlusIcon className="w-5 h-5" /> Nueva Carga
                        </button>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                            <div className="flex bg-surface-secondary rounded-xl p-1 border border-border w-full lg:w-auto">
                                <button
                                    onClick={() => setPlanningView('active')}
                                    className={`flex-1 px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${planningView === 'active' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-white/70'}`}
                                >
                                    Semana Activa
                                </button>
                                <button
                                    onClick={() => setPlanningView('history')}
                                    className={`flex-1 px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${planningView === 'history' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-white/70'}`}
                                >
                                    Historial
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:max-w-2xl">
                                <select
                                    value={projectFilter}
                                    onChange={(e) => setProjectFilter(e.target.value)}
                                    className="bg-surface border border-border rounded-xl px-4 py-2 text-xs font-bold outline-none"
                                >
                                    <option value="">Filtrar proyecto...</option>
                                    {availableProjects.map(project => (
                                        <option key={project.value} value={project.value}>{project.label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-surface border border-border rounded-xl px-4 py-2 text-xs font-bold outline-none"
                                    placeholder="Buscar lote o producto..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* MI DIOS: UI AGREGADA - Agenda de Salidas Horizontal */}
                    <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <div className="flex items-center gap-3 mb-4 border-b border-border/50 pb-2">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                            <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{planningView === 'history' ? 'Historial de Salidas' : 'Agenda de Salidas'}</h4>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                            <button
                                onClick={() => setSelectedDate(null)}
                                className={`flex flex-col items-center justify-center min-w-[70px] h-20 rounded-2xl border-2 transition-all ${!selectedDate ? 'bg-primary border-primary text-white shadow-md scale-105' : 'bg-surface-secondary border-transparent text-text-muted hover:bg-gray-200'}`}
                            >
                                <span className="text-[9px] font-black uppercase mb-1">Todo</span>
                                <span className="text-lg font-black">{sectionReports.length}</span>
                            </button>
                            {timelineDays.map((day, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedDate(day.date)}
                                    className={`flex flex-col items-center justify-center min-w-[70px] h-20 rounded-2xl border-2 transition-all relative ${selectedDate === day.date ? 'bg-primary border-primary text-white shadow-md scale-105' : 'bg-white border-border text-text-primary hover:border-primary/30'}`}
                                >
                                    <span className={`text-[8px] font-black uppercase mb-0.5 ${selectedDate === day.date ? 'text-white/70' : 'text-text-muted'}`}>{day.label}</span>
                                    <span className="text-xl font-black">{day.dayNum}</span>
                                    {day.load > 0 && (
                                        <div className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[7px] font-black border shadow-sm ${selectedDate === day.date ? 'bg-white text-primary border-white' : 'bg-primary text-white border-primary'}`}>
                                            {day.load} P
                                        </div>
                                    )}
                                    {day.isToday && <div className="absolute -bottom-1 w-1 h-1 bg-accent rounded-full"></div>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <StaffOnDuty />
            </div>

            <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-xl flex-1">
                <DataTable
                    data={groupedReports}
                    columns={columns}
                    pageSize={12}
                    isLoading={loading}
                    onRowClick={(r) => { setSelectedReport(r); setIsFormOpen(true); }}
                    emptyMessage={loading ? "Sincronizando..." : planningView === 'history' ? "Sin registros en historial para ese filtro." : "Sin registros para la semana activa con ese filtro."}
                />
            </div>

            {isFormOpen && <LiderProgramacionUsaForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSubmit={handleSubmit} initialData={selectedReport} productSpecs={productSpecs} proyectos={proyectos} clientes={clientes} />}
            <ConfirmModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={confirmDelete} title="Confirmación" message="¿Eliminar este lote de la agenda?" />
        </div>
    );
};

export default LiderProgramacionUsaPage;
