import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '../lib/supabase';
import { User, UserRole, StrategicProjection, ProyectoDB, ProductoDB, TipoUnidad, LiderProgramacionUsaReport, ClienteDB, LineaTransporteDB, UnidadTransporteDB } from '../types';
import { BoxIcon, TruckIcon, PencilIcon, PlusIcon, TrashIcon, DownloadIcon, ExclamationIcon, SwitchHorizontalIcon, MenuIcon } from './icons';
import { formatCarrierName, getTipoUnidadCapacity, getTipoUnidadName, toCamelCase, toSnakeCase } from '../utils/formatters';
import { useNotification } from './NotificationProvider';
import ConfirmModal from './ConfirmModal';
import StaffOnDuty from './StaffOnDuty';

interface StrategicPlanningPageProps {
    user: User;
    title?: string;
    subtitle?: string;
    hideViewSelector?: boolean;
    initialViewMode?: 'cajas' | 'camiones';
    showTabs?: boolean;
    showPallets?: boolean;
    defaultTab?: 'projection' | 'daily';
}

interface UnitWithCap {
    name: string;
    capacity: number;
}

const getWeekNumber = (d: Date): number => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

const StrategicPlanningPage: React.FC<StrategicPlanningPageProps> = ({
    user,
    title,
    subtitle,
    hideViewSelector = false,
    initialViewMode = 'cajas',
    showTabs = true,
    showPallets = true,
    defaultTab = 'projection'
}) => {
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState<'projection' | 'daily'>(defaultTab);
    const [activeWeek, setActiveWeek] = useState<number>(getCurrentWeek());
    const [viewMode, setViewMode] = useState<'cajas' | 'camiones'>(initialViewMode);
    const [isLogisticMode, setIsLogisticMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [projections, setProjections] = useState<StrategicProjection[]>([]);
    const [proyectos, setProyectos] = useState<ProyectoDB[]>([]);
    const [productos, setProductos] = useState<ProductoDB[]>([]);
    const [clientes, setClientes] = useState<ClienteDB[]>([]);
    const [unitTypes, setUnitTypes] = useState<UnitWithCap[]>([]);
    const [lineas, setLineas] = useState<LineaTransporteDB[]>([]);
    const [unidades, setUnidades] = useState<UnidadTransporteDB[]>([]);
    const [lotes, setLotes] = useState<LiderProgramacionUsaReport[]>([]);
    const [realStats, setRealStats] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedProjection, setSelectedProjection] = useState<StrategicProjection | null>(null);

    const [isNewGoalModalOpen, setIsNewGoalModalOpen] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
    const [newGoalData, setNewGoalData] = useState({
        proyectoId: '',
        productoId: '',
        ng2025: 0,
        presupuestoMonetario: 0,
        ss2025: 0
    });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [goalToDelete, setGoalToDelete] = useState<string | null>(null);

    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [projectionToReject, setProjectionToReject] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const [projectProductLinks, setProjectProductLinks] = useState<Record<string, string[]>>({});
    const [loadingLinks, setLoadingLinks] = useState(false);

    const [manualOrder, setManualOrder] = useState<Record<string, number>>({});

    useEffect(() => {
        const saved = localStorage.getItem(`strategic_order_w${activeWeek}`);
        if (saved) {
            try { setManualOrder(JSON.parse(saved)); } catch (e) { console.error("Error loading order", e); }
        } else { setManualOrder({}); }
    }, [activeWeek]);

    const isCoordinatorView = hideViewSelector === true;

    const permissions = useMemo(() => ({
        isLogistics: [UserRole.GERENCIA, UserRole.SUBGERENCIA, UserRole.COORDINADOR, UserRole.DIRECCION, UserRole.SUBDIRECCION, UserRole.ADMINISTRADOR].includes(user.role),
        canApprove: [UserRole.SUBDIRECCION, UserRole.DIRECCION, UserRole.ADMINISTRADOR].includes(user.role),
        canEditGoals: [UserRole.SUBDIRECCION, UserRole.DIRECCION, UserRole.ADMINISTRADOR].includes(user.role) && !isCoordinatorView,
        canRegisterRealSales: [UserRole.LIDER_PROYECTO, UserRole.SUBDIRECCION, UserRole.COORDINADOR, UserRole.ADMINISTRADOR].includes(user.role)
    }), [user.role, isCoordinatorView]);

    const planningYear = useMemo(() => new Date().getFullYear(), []);

    const weekStartDate = useMemo(() => {
        const d = new Date(planningYear, 0, 1 + (activeWeek - 1) * 7);
        const dow = d.getDay();
        const ISOweekStart = new Date(d);
        if (dow <= 4)
            ISOweekStart.setDate(d.getDate() - d.getDay() + 1);
        else
            ISOweekStart.setDate(d.getDate() + 8 - d.getDay());
        
        const saturday = new Date(ISOweekStart);
        saturday.setDate(saturday.getDate() - 2);
        return saturday;
    }, [activeWeek, planningYear]);

    const weekDays = useMemo(() => {
        const days = [];
        const names = ['Sab', 'Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
        for (let i = 0; i < 9; i++) {
            const date = new Date(weekStartDate);
            date.setDate(date.getDate() + i);
            const d = date.getDate().toString().padStart(2, '0');
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const y = date.getFullYear();
            days.push({
                name: names[i],
                formatted: `${d}/${m}`,
                dateString: `${y}-${m}-${d}`
            });
        }
        return days;
    }, [weekStartDate]);

    const handleDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;

        const items = [...filteredProjections];
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        const newOrder: Record<string, number> = {};
        items.forEach((p, idx) => {
            newOrder[p.id] = idx;
        });

        setManualOrder(prev => ({ ...prev, ...newOrder }));
        localStorage.setItem(`strategic_order_w${activeWeek}`, JSON.stringify({ ...manualOrder, ...newOrder }));
        
        addNotification({ type: 'info', title: 'Orden Actualizado', message: 'Se ha guardado la nueva posición de las filas.' });
    };

    useEffect(() => {
        if (initialViewMode) setViewMode(initialViewMode);
    }, [initialViewMode]);

    useEffect(() => {
        if (defaultTab) setActiveTab(defaultTab);
    }, [defaultTab]);

    useEffect(() => {
        const fetchLinks = async () => {
            setLoadingLinks(true);
            try {
                const { data, error } = await supabase.from('usa_proyecto_producto').select('proyecto_id, producto_id');
                if (!error && data) {
                    const mapping: Record<string, string[]> = {};
                    data.forEach(link => {
                        if (!mapping[link.proyecto_id]) mapping[link.proyecto_id] = [];
                        mapping[link.proyecto_id].push(link.producto_id);
                    });
                    setProjectProductLinks(mapping);
                }
            } finally {
                setLoadingLinks(false);
            }
        };
        fetchLinks();
    }, [isNewGoalModalOpen]);

    const filteredProductsForModal = useMemo(() => {
        if (!newGoalData.proyectoId) return [];
        const allowedIds = projectProductLinks[newGoalData.proyectoId] || [];
        return productos.filter(p => allowedIds.includes(p.id));
    }, [newGoalData.proyectoId, projectProductLinks, productos]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const year = planningYear;
            const simpleStart = new Date(year, 0, 1 + (activeWeek - 2) * 7);
            const simpleEnd = new Date(year, 0, 1 + (activeWeek + 1) * 7);

            const [projRes, prodRes, cliRes, dataRes, unitsRes, lotesRes, shipmentRes, lineasRes, unidadesRes] = await Promise.all([
                supabase.from('usa_proyectos').select('*'),
                supabase.from('usa_productos').select('*'),
                supabase.from('usa_clientes').select('*'),
                supabase.from('proyecciones_estrategicas').select('*').eq('semana_fiscal', activeWeek),
                supabase.from('tipo_unidad').select('*'),
                supabase.from('lider_programacion_usa_reports').select('*').eq('semana_fiscal', activeWeek),
                supabase.from('usa_shipment_reports').select('project_id, products, logistic_status, real_departure_date, departure_date_time')
                    .or(`departure_date_time.gte.${simpleStart.toISOString()},real_departure_date.gte.${simpleStart.toISOString()}`)
                    .or(`departure_date_time.lte.${simpleEnd.toISOString()},real_departure_date.lte.${simpleEnd.toISOString()}`),
                supabase.from('usa_lineas_transporte').select('*').order('nombre'),
                supabase.from('usa_unidades_transporte').select('*')
            ]);

            if (projRes.data) setProyectos(toCamelCase(projRes.data));
            if (prodRes.data) setProductos(toCamelCase(prodRes.data));
            if (cliRes.data) setClientes(toCamelCase(cliRes.data));
            if (lotesRes.data) setLotes(toCamelCase(lotesRes.data));
            if (lineasRes.data) setLineas(toCamelCase(lineasRes.data));
            if (unidadesRes.data) setUnidades(toCamelCase(unidadesRes.data));

            const stats: Record<string, number> = {};
            if (shipmentRes.data) {
                shipmentRes.data.forEach((report: any) => {
                    const departureDate = report.real_departure_date || report.departure_date_time;
                    if (!departureDate) return;
                    
                    const d = new Date(departureDate);
                    const weekOfDeparture = getWeekNumber(d);
                    
                    if (weekOfDeparture !== activeWeek) return;

                    const prods = Array.isArray(report.products) ? report.products : [];
                    prods.forEach((p: any) => {
                        const pid = p.product_id || p.productId;
                        const key = `${report.project_id}_${pid}`;
                        const realQty = Number(p.real_qty || p.realQty || p.quantity || 0);
                        stats[key] = (stats[key] || 0) + realQty;
                    });
                });
            }
            setRealStats(stats);

            if (unitsRes.data) {
                const rawUnits = toCamelCase(unitsRes.data) as TipoUnidad[];
                const processedUnits: UnitWithCap[] = rawUnits.map(u => {
                    const match = u.capacidad.match(/\d+/);
                    return {
                        name: u.focused || u.unidad,
                        capacity: match ? parseInt(match[0]) : 0
                    };
                }).sort((a, b) => b.capacity - a.capacity);
                setUnitTypes(processedUnits);
            }

            if (dataRes.data) {
                const rawData = toCamelCase(dataRes.data) as any[];
                const cleanData = rawData.map(item => ({
                    ...item,
                    ng2025: item.ng2025 || item.ng_2025 || 0,
                    ss2025: item.ss2025 || item.ss_2025 || 0,
                    camionesCalculados: item.camionesCalculados || 0
                }));
                setProjections(cleanData);
            }
        } catch (error) {
            console.error("Error loading data", error);
        } finally {
            setLoading(false);
        }
    }, [activeWeek]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const getPalletCount = (boxes: number, productoId: string) => {
        if (!boxes || boxes === 0) return 0;
        const product = productos.find(p => p.id === productoId);
        const boxesPerPallet = product?.cajasPalletUsa || 60;
        return Math.ceil(boxes / boxesPerPallet);
    };

    const getUnitTypeLabel = (boxes: number, productoId: string, short = false) => {
        const numericBoxes = Number(boxes) || 0;
        if (numericBoxes === 0) return short ? "-" : "0 Total";
        if (unitTypes.length === 0) return "...";

        const totalPallets = getPalletCount(numericBoxes, productoId);
        const largestUnit = unitTypes[0];

        if (totalPallets > largestUnit.capacity) {
            const countFull = Math.floor(totalPallets / largestUnit.capacity);
            const remainder = totalPallets % largestUnit.capacity;
            if (remainder === 0) return `${countFull} ${short ? largestUnit.name.split(' ')[0] : largestUnit.name}`;
            const suitableUnitForRemainder = [...unitTypes].reverse().find(u => u.capacity >= remainder);
            if (suitableUnitForRemainder && suitableUnitForRemainder.name !== largestUnit.name) {
                return `${countFull} ${short ? largestUnit.name.split(' ')[0] : largestUnit.name} + 1 ${short ? suitableUnitForRemainder.name.split(' ')[0] : suitableUnitForRemainder.name}`;
            } else {
                return `${countFull + 1} ${short ? largestUnit.name.split(' ')[0] : largestUnit.name}`;
            }
        }

        const suitableUnit = [...unitTypes].reverse().find(u => u.capacity >= totalPallets);
        const unitName = suitableUnit ? suitableUnit.name : largestUnit.name;

        return short ? `1 ${unitName.split(' ')[0]}` : `1 ${unitName}`;
    };

    const handleAuthorize = async (id: string) => {
        try {
            const { error } = await supabase.from('proyecciones_estrategicas').update({ autorizado: true, comentarios_rechazo: null }).eq('id', id);
            if (error) throw error;
            setProjections(prev => prev.map(p => p.id === id ? { ...p, autorizado: true, comentariosRechazo: undefined } : p));
            addNotification({ type: 'success', title: 'Autorizado', message: 'Proyección autorizada correctamente.' });
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error al autorizar', message: 'No se pudo procesar la solicitud.' });
        }
    };

    const handleReject = async () => {
        if (!projectionToReject || !rejectionReason.trim()) return;
        try {
            const { error } = await supabase.from('proyecciones_estrategicas').update({
                autorizado: false,
                comentarios_rechazo: rejectionReason
            }).eq('id', projectionToReject);

            if (error) throw error;

            setProjections(prev => prev.map(p => p.id === projectionToReject ? { ...p, autorizado: false, comentariosRechazo: rejectionReason } : p));
            addNotification({ type: 'warning', title: 'Rechazado', message: 'La proyección ha sido enviada a revisión con comentarios.' });
            setIsRejectModalOpen(false);
            setProjectionToReject(null);
            setRejectionReason('');
        } catch (e) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo procesar el rechazo.' });
        }
    };

    const handleOpenForm = (p: StrategicProjection) => {
        if (!p.fechaSalida || p.fechaSalida === '') {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const formattedNow = `${year}-${month}-${day}T${hours}:${minutes}`;

            let arrival = p.fechaLlegada;
            const project = proyectos.find(pj => pj.id === p.proyectoId);
            if (project?.tiempoOptimo) {
                const a = new Date(now.getTime() + (project.tiempoOptimo * 60 * 60 * 1000));
                arrival = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}T${String(a.getHours()).padStart(2, '0')}:${String(a.getMinutes()).padStart(2, '0')}`;
            }

            setSelectedProjection({ ...p, fechaSalida: formattedNow, fechaLlegada: arrival });
        } else {
            setSelectedProjection(p);
        }
        setIsFormOpen(true);
    };

    const handleCloseForm = () => { setIsFormOpen(false); setSelectedProjection(null); };

    const handleOpenNewGoal = () => {
        setNewGoalData({ proyectoId: '', productoId: '', ng2025: 0, presupuestoMonetario: 0, ss2025: 0 });
        setEditingGoalId(null);
        setIsNewGoalModalOpen(true);
    };

    const handleOpenEditGoal = (p: StrategicProjection) => {
        setNewGoalData({
            proyectoId: p.proyectoId,
            productoId: p.productoId,
            ng2025: (p as any).ng2025 || p.venta2025Referencia || 0,
            presupuestoMonetario: p.presupuestoMonetario,
            ss2025: (p as any).ss2025 || p.precioCompra2025 || 0
        });
        setEditingGoalId(p.id);
        setIsNewGoalModalOpen(true);
    };

    const handleDeleteGoal = async () => {
        if (!goalToDelete) return;
        try {
            const { error } = await supabase.from('proyecciones_estrategicas').delete().eq('id', goalToDelete);
            if (error) throw error;
            setProjections(prev => prev.filter(p => p.id !== goalToDelete));
            addNotification({ type: 'success', title: 'Eliminado', message: 'Meta eliminada correctamente.' });
        } catch (error: any) {
            console.error("Error al borrar:", error);
            addNotification({ type: 'danger', title: 'Error', message: error.message || 'No se pudo eliminar el registro.' });
        } finally {
            setIsDeleteModalOpen(false);
            setGoalToDelete(null);
        }
    };

    const handleCreateGoal = async () => {
        if (!newGoalData.proyectoId || !newGoalData.productoId) {
            addNotification({ type: 'warning', title: 'Campos incompletos', message: 'Seleccione Proyecto y Producto.' });
            return;
        }
        try {
            const payload = {
                semana_fiscal: activeWeek,
                canal_venta: 'USA',
                proyecto_id: newGoalData.proyectoId,
                producto_id: newGoalData.productoId,
                ng_2025: newGoalData.ng2025,
                presupuesto_monetario: newGoalData.presupuestoMonetario,
                ss_2025: newGoalData.ss2025,
                comentarios_rechazo: null
            };
            if (editingGoalId) {
                const { error } = await supabase.from('proyecciones_estrategicas').update(payload).eq('id', editingGoalId);
                if (error) throw error;
                setProjections(prev => prev.map(p => p.id === editingGoalId ? { ...p, ...newGoalData, comentariosRechazo: undefined } : p));
                addNotification({ type: 'success', title: 'Meta Actualizada', message: 'Los cambios han sido guardados.' });
            } else {
                const insertPayload = { ...payload, proyeccion_cajas: 0, autorizado: false };
                const { data, error } = await supabase.from('proyecciones_estrategicas').insert(insertPayload).select();
                if (error) throw error;
                if (data) {
                    const rawCreated = toCamelCase(data[0]) as any;
                    const created: StrategicProjection = { ...rawCreated, ng2025: rawCreated.ng2025 || 0, ss2025: rawCreated.ss2025 || 0 };
                    setProjections(prev => [...prev, created]);
                    addNotification({ type: 'success', title: 'Meta Creada', message: 'La proyección ha sido inicializada.' });
                }
            }
            setIsNewGoalModalOpen(false);
        } catch (error: any) {
            addNotification({ type: 'danger', title: 'Error', message: 'Operación fallida. Verifique conexión.' });
        }
    };

    const exportToCSV = () => {
        if (filteredProjections.length === 0) return;
        const headers = ["Proyecto", "Producto", "NG 2025", "SS 2025", "Presupuesto CJS", "Proyección Actual", "Real Enviado", "Estatus"];
        const rows = filteredProjections.map(p => {
            const real = realStats[`${p.proyectoId}_${p.productoId}`] || 0;
            return [
                proyectos.find(pj => pj.id === p.proyectoId)?.nombre || '',
                productos.find(pd => pd.id === p.productoId)?.nombreDelProducto || '',
                (p as any).ng2025 || p.venta2025Referencia || 0,
                (p as any).ss2025 || p.precioCompra2025 || 0,
                p.presupuestoMonetario,
                p.proyeccionCajas,
                real,
                p.autorizado ? 'AUTORIZADO' : p.comentariosRechazo ? 'RECHAZADO' : 'PENDIENTE'
            ]
        });
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Metas_W${activeWeek}_nglobal.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addNotification({ type: 'info', title: 'Exportación Exitosa', message: 'Archivo CSV generado.' });
    };

    const handleExportPDF = () => {
        addNotification({ type: 'info', title: 'Generando Reporte', message: 'Preparando matriz estratégica para móviles...' });

        let rowsHtml = '';
        filteredProjections.forEach(p => {
            const projName = proyectos.find(pj => pj.id === p.proyectoId)?.nombre || 'S/D';
            const prodName = productos.find(pd => pd.id === p.productoId)?.nombreDelProducto || 'S/D';
            const real = realStats[`${p.proyectoId}_${p.productoId}`] || 0;
            rowsHtml += `
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${projName} / ${prodName}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: #002D62; font-weight: bold;">$${((p as any).ng2025 || p.venta2025Referencia || 0).toLocaleString()}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">$${((p as any).ss2025 || p.precioCompra2025 || 0).toLocaleString()}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${p.presupuestoMonetario.toLocaleString()}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: 900; background-color: #f1f5f9;">${p.proyeccionCajas.toLocaleString()}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: 900; background-color: #f0fdf4; color: #16a34a;">${real.toLocaleString()}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${p.autorizado ? 'AUTORIZADO' : p.comentariosRechazo ? 'RECHAZADO' : 'PENDIENTE'}</td>
                </tr>
            `;
        });

        const html = `
            <html>
                <head>
                    <title>Strategic_Plan_W${activeWeek}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; }
                        .header { border-bottom: 3px solid #002D62; margin-bottom: 30px; padding-bottom: 10px; }
                        h1 { color: #002D62; margin: 0; font-size: 20px; text-transform: uppercase; font-weight: 900; }
                        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 20px; }
                        th { background-color: #002D62; color: white; padding: 10px; text-align: left; text-transform: uppercase; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>MATRIZ ESTRATÉGICA - SEMANA FISCAL ${activeWeek}</h1>
                        <p>nglobal Logistics | Planificación y Objetivos de Exportación</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Proyecto / Producto</th>
                                <th>NG 2025</th>
                                <th>SS 2025</th>
                                <th>Presupuesto</th>
                                <th>Proyección</th>
                                <th>Real Enviado</th>
                                <th>Estatus</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </body>
            </html>
        `;

        const printIframe = document.createElement('iframe');
        printIframe.style.position = 'fixed';
        printIframe.style.right = '0';
        printIframe.style.bottom = '0';
        printIframe.style.width = '1px';
        printIframe.style.height = '1px';
        printIframe.style.opacity = '0.01';
        printIframe.style.border = '0';
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
                }, 2000);
            }, 1000);
        }
    };

    const availableProjectsForFilter = useMemo(() => {
        const projectIds = new Set(projections.filter(p => p.semanaFiscal === activeWeek).map(p => p.proyectoId));
        return proyectos.filter(p => projectIds.has(p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [projections, activeWeek, proyectos]);

    const filteredProjections = useMemo(() => {
        let base = projections.filter(p => p.semanaFiscal === activeWeek);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            base = base.filter(p => {
                const projName = proyectos.find(pj => pj.id === p.proyectoId)?.nombre.toLowerCase() || '';
                const prodName = productos.find(pd => pd.id === p.productoId)?.nombreDelProducto.toLowerCase() || '';
                return projName.includes(q) || prodName.includes(q);
            });
        }
        if (isCoordinatorView) return base.filter(p => p.autorizado === true && p.proyeccionCajas > 0);

        base.sort((a, b) => {
            const orderA = manualOrder[a.id] ?? 999999;
            const orderB = manualOrder[b.id] ?? 999999;
            if (orderA !== orderB) return orderA - orderB;
            return a.id.localeCompare(b.id);
        });

        return base;
    }, [projections, activeWeek, isCoordinatorView, searchQuery, proyectos, productos, manualOrder]);

    const getDailyBreakdownTotal = (projection: Partial<StrategicProjection>) =>
        (projection.desgloseDiario || []).reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);

    const getLegacyDailyValues = (projection: Partial<StrategicProjection>) => [
        Number(projection.lunes) || 0,
        Number(projection.martes) || 0,
        Number(projection.miercoles) || 0,
        Number(projection.jueves) || 0,
        Number(projection.viernes) || 0,
        Number(projection.sabado) || 0,
        Number(projection.domingo) || 0
    ];

    const getProjectionBaseTotal = (projection: StrategicProjection) => {
        const breakdownTotal = getDailyBreakdownTotal(projection);
        if (breakdownTotal > 0) return breakdownTotal;

        const legacyDailyTotal = getLegacyDailyValues(projection).reduce((sum, value) => sum + value, 0);
        if (legacyDailyTotal > 0) return legacyDailyTotal;

        return Number(projection.proyeccionCajas) || 0;
    };

    const programacionUsa = useMemo(() => {
        const map: Record<string, { sal: Record<string, number>, eta: Record<string, number> }> = {};
        
        lotes.forEach(l => {
            const pId = l.projectId;
            if (!pId) return;

            const salDate = l.fechaSalida ? l.fechaSalida.split('T')[0] : null;
            let etaDate = l.fechaLlegada ? l.fechaLlegada.split('T')[0] : null;

            if (!etaDate && salDate) {
                const project = proyectos.find(p => p.id === pId);
                let transitHours = project?.tiempoOptimo || 72;
                const d = new Date(salDate + 'T12:00:00Z');
                d.setTime(d.getTime() + (transitHours * 60 * 60 * 1000));
                etaDate = d.toISOString().split('T')[0];
            }

            (l.productos || []).forEach(prod => {
                const prId = prod.productId || prod.product_id;
                const key = `${pId}_${prId}`;
                if (!map[key]) map[key] = { sal: {}, eta: {} };

                const qty = Number(prod.quantity) || 0;
                if (salDate) map[key].sal[salDate] = (map[key].sal[salDate] || 0) + qty;
                if (etaDate) map[key].eta[etaDate] = (map[key].eta[etaDate] || 0) + qty;
            });
        });
        
        return map;
    }, [lotes, proyectos]);

    return (
        <div className="p-4 md:p-6 animate-fade-in space-y-6 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary uppercase tracking-tight">
                            {title || 'Planeación Estratégica'}
                        </h1>
                        <p className="text-sm text-text-secondary">
                            {subtitle || 'Visualización de objetivos, proyecciones y cumplimiento.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-2">
                            <div className="relative">
                                {activeTab === 'daily' ? (
                                    <select
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-surface border border-border rounded-lg px-4 py-1.5 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none w-40 md:w-56 appearance-none cursor-pointer pr-10"
                                    >
                                        <option value="">Filtrar Proyecto...</option>
                                        {availableProjectsForFilter.map(p => (
                                            <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="Filtrar..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-surface border border-border rounded-lg px-4 py-1.5 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none w-40 md:w-56"
                                    />
                                )}
                                <svg className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {activeTab === 'daily' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    )}
                                </svg>
                            </div>

                            {showTabs && (
                                <div className="flex bg-surface-secondary rounded-lg p-1 border border-border w-full">
                                    <button onClick={() => setActiveTab('projection')} className={`flex-1 px-4 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${activeTab === 'projection' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-white/50'}`}>ALCANCE</button>
                                    <button onClick={() => setActiveTab('daily')} className={`flex-1 px-4 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${activeTab === 'daily' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-white/50'}`}>DIARIO</button>
                                </div>
                            )}
                        </div>

                        {permissions.isLogistics && !hideViewSelector && activeTab === 'daily' && (
                            <div className="flex bg-surface-secondary rounded-lg p-1 border border-border">
                                <button onClick={() => setViewMode('cajas')} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${viewMode === 'cajas' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary'}`}>Cajas</button>
                                <button onClick={() => setViewMode('camiones')} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${viewMode === 'camiones' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary'}`}>Unidades</button>
                            </div>
                        )}

                        {activeTab === 'daily' && (
                            <button
                                onClick={() => setIsLogisticMode(!isLogisticMode)}
                                className={`px-4 py-1.5 text-xs font-black uppercase rounded-lg border transition-all flex items-center gap-2 shadow-sm ${isLogisticMode ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-text-muted border-border hover:bg-gray-50'}`}
                            >
                                <SwitchHorizontalIcon className="w-4 h-4" />
                                Sweet Seasons
                            </button>
                        )}

                        <div className="flex items-center bg-surface border border-border rounded-lg px-2">
                            <span className="text-xs font-bold text-text-muted px-2 uppercase tracking-tighter">Semana</span>
                            <input type="number" min={1} max={52} value={activeWeek} onChange={(e) => setActiveWeek(parseInt(e.target.value) || 1)} className="w-16 py-1.5 bg-transparent text-sm font-black text-center outline-none text-primary" />
                        </div>
                    </div>
                </div>
                <StaffOnDuty />
            </div>

            {activeTab === 'projection' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="bg-primary/5 px-4 py-2 rounded-lg border border-primary/10 flex items-center gap-4">
                            <h3 className="text-xs font-black text-primary uppercase tracking-widest">Matriz de Objetivos</h3>
                            <button onClick={exportToCSV} className="text-[10px] font-black text-primary flex items-center gap-1.5 hover:underline uppercase tracking-tighter">
                                <DownloadIcon className="w-3.5 h-3.5" /> CSV
                            </button>
                            <button onClick={handleExportPDF} className="text-[10px] font-black text-primary flex items-center gap-1.5 hover:underline uppercase tracking-tighter">
                                <DownloadIcon className="w-3.5 h-3.5" /> PDF
                            </button>
                        </div>
                        {permissions.canEditGoals && (
                            <button onClick={handleOpenNewGoal} className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg active:scale-95 transition-all"><PlusIcon className="w-4 h-4" /> Nueva Meta</button>
                        )}
                    </div>
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId="projections-table">
                                    {(provided) => (
                                        <table className="w-full text-xs text-left border-collapse" ref={provided.innerRef} {...provided.droppableProps}>
                                            <thead className={`${hideViewSelector ? 'bg-emerald-900' : 'bg-[#002D62]'} text-white`}>
                                                <tr className="divide-x divide-white/10">
                                                    <th className="w-8 px-2 bg-black/10"></th>
                                                    <th className={`px-4 py-1 sticky left-0 ${hideViewSelector ? 'bg-emerald-900' : 'bg-[#002D62]'} font-black uppercase w-48`}>Proyecto / Producto</th>
                                                    <th className="px-4 py-1 text-center font-black uppercase">NG 2025</th>
                                                    <th className="px-4 py-1 text-center font-black uppercase">SS 2025</th>
                                                    <th className="px-4 py-1 text-center font-black uppercase">Presupuesto</th>
                                                    <th className="px-4 py-1 text-center font-black uppercase bg-blue-700 text-white border-b-2 border-white/20">Proyección</th>
                                                    <th className="px-4 py-1 text-center font-black uppercase bg-emerald-700 text-white border-b-2 border-white/20">Real Enviado</th>
                                                    <th className="px-4 py-1 text-center font-black uppercase">Estatus</th>
                                                </tr>
                                            </thead>
                                            {loading ? (
                                                <tbody><tr><td colSpan={8} className="p-10 text-center">...</td></tr></tbody>
                                            ) : filteredProjections.length === 0 ? (
                                                <tbody><tr><td colSpan={8} className="p-8 text-center text-text-muted italic">...</td></tr></tbody>
                                            ) : (
                                                <>
                                                    {filteredProjections.map((p, index) => {
                                                        const canjeProductos = (p.canjeProductos || []) as { productId: string; quantity: number }[];
                                                        const tieneCanjes = canjeProductos.length > 0 && canjeProductos.some(c => c.productId);
                                                        const real = tieneCanjes ? 0 : (realStats[`${p.proyectoId}_${p.productoId}`] || p.ventaRealManual || 0);
                                                        const proyectoNombre = proyectos.find(pj => pj.id === p.proyectoId)?.nombre || 'Sede Desconocida';
                                                        const productoNombre = productos.find(pd => pd.id === p.productoId)?.nombreDelProducto || 'Producto';

                                                        return (
                                                            // @ts-ignore
                                                            <Draggable key={p.id} draggableId={p.id} index={index} isDragDisabled={!!searchQuery}>
                                                                {(providedDraggable) => (
                                                                    <tbody 
                                                                        ref={providedDraggable.innerRef} 
                                                                        {...providedDraggable.draggableProps} 
                                                                        className="divide-y divide-border border-b border-border last:border-0"
                                                                    >
                                                                        <tr className="hover:bg-hover transition-colors divide-x divide-border">
                                                                            <td className="w-8 px-2 text-center bg-gray-50/50 cursor-grab active:cursor-grabbing hover:bg-gray-100" {...providedDraggable.dragHandleProps}>
                                                                                <MenuIcon className="w-3.5 h-3.5 text-text-muted/40 mx-auto" />
                                                                            </td>
                                                                            <td className="px-4 py-0.5 sticky left-0 bg-white font-bold text-primary border-r border-border">
                                                                                {proyectoNombre}
                                                                                <div className="text-[10px] font-black text-text-muted italic tracking-tighter uppercase flex items-center gap-1">
                                                                                    {tieneCanjes && (
                                                                                        <span className="text-[7px] font-black text-amber-500 not-italic bg-amber-50 border border-amber-200 px-1 rounded leading-tight">⇌</span>
                                                                                    )}
                                                                                    <span className={tieneCanjes ? 'opacity-50' : ''}>{productoNombre}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-0.5 text-center font-black text-primary">${((p as any).ng2025 || p.venta2025Referencia || 0).toLocaleString()}</td>
                                                                            <td className="px-4 py-0.5 text-center font-black text-text-secondary">${((p as any).ss2025 || p.precioCompra2025 || 0).toLocaleString()}</td>
                                                                            <td className="px-4 py-0.5 text-center font-black text-primary">{p.presupuestoMonetario?.toLocaleString() || '0'}</td>
                                                                            <td className="px-4 py-0.5 text-center bg-accent/5">
                                                                                {tieneCanjes ? (
                                                                                    <span className="font-black text-xs text-text-muted/25">—</span>
                                                                                ) : (
                                                                                    <div className="flex flex-col items-center w-full max-w-[100px] mx-auto">
                                                                                        <span className={`font-black text-xs mb-0.5 ${user.role === UserRole.LIDER_PROYECTO ? 'text-blue-600' : 'text-text-primary'}`}>{p.proyeccionCajas?.toLocaleString() || '0'}</span>
                                                                                        <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden shadow-inner">
                                                                                            <div className="bg-orange-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, (p.proyeccionCajas / (p.presupuestoMonetario || 1)) * 100)}%` }} />
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-0.5 text-center bg-success/5">
                                                                                <div className="flex flex-col items-center">
                                                                                    <span className="font-black text-xs text-emerald-700">{real.toLocaleString()}</span>
                                                                                    <span className="text-[8px] font-black text-emerald-600/60 uppercase tracking-tighter">Confirmado</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-0.5 text-center">
                                                                                {p.autorizado ? (
                                                                                    <div className="flex items-center justify-center gap-2">
                                                                                        <span className="px-2 py-0.5 bg-success/10 text-success rounded-full text-[8px] font-black uppercase tracking-widest border border-success/20">Autorizado</span>
                                                                                        {(user.role === UserRole.SUBDIRECCION || user.role === UserRole.DIRECCION || user.role === UserRole.ADMINISTRADOR) && (
                                                                                            <div className="flex gap-1 ml-2 border-l border-border pl-2">
                                                                                                <button onClick={() => handleOpenEditGoal(p)} className="p-1 bg-gray-100 text-text-muted hover:text-primary rounded shadow-sm transition-colors" title="Editar Meta Autorizada"><PencilIcon className="w-3 h-3" /></button>
                                                                                                <button onClick={() => { setGoalToDelete(p.id); setIsDeleteModalOpen(true); }} className="p-1 bg-gray-100 text-text-muted hover:text-danger rounded shadow-sm transition-colors" title="Borrar Meta Autorizada"><TrashIcon className="w-3 h-3" /></button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ) : p.comentariosRechazo ? (
                                                                                    <div className="flex flex-col items-center gap-1 group relative">
                                                                                        <span className="px-2 py-0.5 bg-danger/10 text-danger rounded-full text-[8px] font-black uppercase tracking-widest border border-danger/20 flex items-center gap-1">
                                                                                            <ExclamationIcon className="w-2.5 h-2.5" /> Rechazado
                                                                                        </span>
                                                                                        {(user.role === UserRole.SUBDIRECCION || user.role === UserRole.DIRECCION || user.role === UserRole.ADMINISTRADOR) && (
                                                                                            <div className="flex gap-1 mt-1">
                                                                                                <button onClick={() => handleOpenEditGoal(p)} className="p-1 bg-gray-100 text-text-muted hover:text-primary rounded shadow-sm transition-colors" title="Corregir Meta"><PencilIcon className="w-3 h-3" /></button>
                                                                                                <button onClick={() => { setGoalToDelete(p.id); setIsDeleteModalOpen(true); }} className="p-1 bg-gray-100 text-text-muted hover:text-danger rounded shadow-sm transition-colors" title="Borrar Meta"><TrashIcon className="w-3 h-3" /></button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="flex items-center justify-center gap-2">
                                                                                        {permissions.canApprove ? (
                                                                                            <div className="flex flex-col items-center gap-1.5">
                                                                                                {p.proyeccionCajas > 0 ? (
                                                                                                    <div className="flex gap-1.5">
                                                                                                        <button onClick={() => handleAuthorize(p.id)} className="bg-success text-white px-2 py-1 rounded shadow-md text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all">Validar</button>
                                                                                                        <button onClick={() => { setProjectionToReject(p.id); setIsRejectModalOpen(true); }} className="bg-danger text-white px-2 py-1 rounded shadow-md text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all">Rechazar</button>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <span className="px-2 py-1 bg-gray-100 text-text-muted rounded-full text-[7px] font-black uppercase tracking-tighter border border-border italic">Esperando Carga</span>
                                                                                                )}
                                                                                                <div className="flex gap-1">
                                                                                                    <button onClick={() => handleOpenEditGoal(p)} className="p-1 bg-gray-100 text-text-muted hover:text-primary rounded shadow-sm transition-colors" title="Editar Meta"><PencilIcon className="w-3 h-3" /></button>
                                                                                                    <button onClick={() => { setGoalToDelete(p.id); setIsDeleteModalOpen(true); }} className="p-1 bg-gray-100 text-text-muted hover:text-danger rounded shadow-sm transition-colors" title="Borrar Meta"><TrashIcon className="w-3 h-3" /></button>
                                                                                                </div>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="flex flex-col items-center gap-1">
                                                                                                <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black uppercase tracking-widest border border-amber-200">Pendiente</span>
                                                                                                {(user.role === UserRole.SUBDIRECCION || user.role === UserRole.DIRECCION || user.role === UserRole.ADMINISTRADOR) && (
                                                                                                     <div className="flex gap-1">
                                                                                                         <button onClick={() => handleOpenEditGoal(p)} className="p-1 bg-gray-100 text-text-muted hover:text-primary rounded shadow-sm transition-colors" title="Editar Meta"><PencilIcon className="w-3 h-3" /></button>
                                                                                                         <button onClick={() => { setGoalToDelete(p.id); setIsDeleteModalOpen(true); }} className="p-1 bg-gray-100 text-text-muted hover:text-danger rounded shadow-sm transition-colors" title="Borrar Meta"><TrashIcon className="w-3 h-3" /></button>
                                                                                                     </div>
                                                                                                 )}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                        {tieneCanjes && canjeProductos.filter(c => c.productId).map((canje, ci) => {
                                                                            const canjeNombre = productos.find(pd => pd.id === canje.productId)?.nombreDelProducto || 'Canje';
                                                                            const canjeReal = Number(canje.quantity) || 0;
                                                                            return (
                                                                                <tr key={`${p.id}_canje_${ci}`} className="divide-x divide-border border-l-2 border-l-amber-300/60">
                                                                                    <td className="w-8 px-2 bg-amber-50/20"></td>
                                                                                    <td className="py-0.5 px-4 sticky left-0 bg-amber-50/40 border-r border-amber-100">
                                                                                        <div className="flex items-center gap-1.5 pl-3">
                                                                                            <span className="text-amber-400 text-[9px] leading-none">⇌</span>
                                                                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-tighter">{canjeNombre}</span>
                                                                                            <span className="text-[7px] text-amber-400/70 font-semibold">(canje)</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="py-0.5 px-4 text-center text-text-muted/20 text-[10px]">—</td>
                                                                                    <td className="py-0.5 px-4 text-center text-text-muted/20 text-[10px]">—</td>
                                                                                    <td className="py-0.5 px-4 text-center text-text-muted/20 text-[10px]">—</td>
                                                                                    <td className="py-0.5 px-4 text-center bg-accent/5 text-text-muted/20 text-[10px]">—</td>
                                                                                    <td className="py-0.5 px-4 text-center bg-amber-50/30">
                                                                                        <span className="font-black text-[11px] text-amber-600">{canjeReal.toLocaleString()}</span>
                                                                                    </td>
                                                                                    <td className="py-0.5 px-4 text-center">
                                                                                        <span className="text-[7px] font-black text-amber-400 uppercase tracking-wider">⇌ canje</span>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                )}
                                                            </Draggable>
                                                        );
                                                    })}
                                                    {provided.placeholder}
                                                </>
                                            )}
                                        </table>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'daily' && (
                <div className="space-y-4">
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px] text-left border-collapse">
                                <thead className={`${isLogisticMode ? 'bg-amber-700' : (hideViewSelector ? 'bg-emerald-900' : 'bg-[#002D62]')} text-white sticky top-0 z-10`}>
                                    <tr className="divide-x divide-white/10">
                                        <th className={`px-4 py-1 sticky left-0 ${isLogisticMode ? 'bg-amber-700' : (hideViewSelector ? 'bg-emerald-900' : 'bg-[#002D62]')} font-black uppercase w-48 z-20`}>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] tracking-widest">{isLogisticMode ? 'SWEET SEASONS' : 'DIARIO'}</span>
                                                <span className="text-[7px] opacity-70">Proyecto / Producto</span>
                                            </div>
                                        </th>

                                        {weekDays.map((wd, idx) => (
                                            <th key={`${wd.dateString}_${idx}`} className={`px-1 py-1 text-center font-black uppercase w-14 ${isLogisticMode ? 'bg-white/5' : ''}`}>
                                                <div className="flex flex-col items-center leading-none">
                                                    <span className="text-[7px] opacity-70 mb-0.5">{isLogisticMode ? 'ETA' : 'SAL'} {wd.name}</span>
                                                    <span className="text-[10px] text-white font-black">{wd.formatted}</span>
                                                </div>
                                            </th>
                                        ))}

                                        {(isLogisticMode || showPallets) && <th className="px-4 py-1 text-center font-black uppercase tracking-tighter">PALLETS</th>}
                                        <th className="px-4 py-1 text-center font-black uppercase tracking-tighter">
                                            {isLogisticMode ? 'TOTAL CAJAS' : (viewMode === 'cajas' ? (isCoordinatorView ? 'CARGA' : 'TOTAL CAJAS') : 'UNIDADES')}
                                        </th>
                                        {(permissions.canApprove || permissions.canRegisterRealSales) && <th className="px-4 py-1 text-center font-black uppercase w-10"></th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filteredProjections.map((p, i) => {
                                        const key = `${p.proyectoId}_${p.productoId}`;
                                        const prog = programacionUsa[key] || { sal: {}, eta: {} };
                                        
                                        const totalSalida = Object.values(prog.sal).reduce((a: number, b: number) => a + b, 0) as number;
                                        const totalLlegada = Object.values(prog.eta).reduce((a: number, b: number) => a + b, 0) as number;
                                        const totalProgramado = Math.max(totalSalida, totalLlegada);

                                        const legacyDailyValues = getLegacyDailyValues(p);
                                        const hasDailyBreakdown = legacyDailyValues.some(v => v > 0) || (p.desgloseDiario && p.desgloseDiario.length > 0);
                                        const isUnitAssigned = (p.ventaRealManual || 0) > 0;
                                        
                                        const extraProds = (p as any).canjeProductos as { productId: string; quantity: number; type?: 'normal' | 'canje' }[] | undefined;
                                        const canjeTotal = (extraProds || []).filter(c => !c.type || c.type === 'canje').reduce((sum: number, c) => sum + (Number(c.quantity) || 0), 0);
                                        const extraTotal = (extraProds || []).filter(c => c.type === 'normal').reduce((sum: number, c) => sum + (Number(c.quantity) || 0), 0);
                                        
                                        const displayTotal = totalProgramado > 0 ? totalProgramado : (getProjectionBaseTotal(p) + canjeTotal + extraTotal);

                                        return (
                                            <tr key={i} className={`divide-x divide-border hover:bg-hover ${!p.autorizado ? 'opacity-60 bg-gray-50' : ''}`}>
                                                <td className="px-4 py-0.5 sticky left-0 bg-white font-bold text-primary border-r border-border">
                                                    {(() => {
                                                        const extraItems = (p as any).canjeProductos as { productId: string; quantity: number; type?: 'normal' | 'canje' }[] | undefined;
                                                        const hasSwap = extraItems && extraItems.length > 0 && extraItems.some(c => c.productId && (!c.type || c.type === 'canje'));
                                                        const hasExtra = extraItems && extraItems.some(c => c.type === 'normal');
                                                        const proyectoNombre = proyectos.find(pj => pj.id === p.proyectoId)?.nombre || '';
                                                        const productoOriginal = productos.find(pd => pd.id === p.productoId)?.nombreDelProducto || '';

                                                        if (hasSwap) {
                                                            const firstSwap = extraItems!.find(c => c.productId && (!c.type || c.type === 'canje'));
                                                            const infoItem = productos.find(pd => pd.id === firstSwap?.productId);
                                                            const label = (infoItem as any)?.nombre_del_producto || infoItem?.nombreDelProducto || 'Producto';
                                                            return (
                                                                <>
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-[8px] font-black text-warning uppercase bg-warning/10 px-1 py-0.5 rounded">⇌ Canje</span>
                                                                        <span className="text-xs font-black text-warning leading-tight uppercase">{label}</span>
                                                                    </div>
                                                                    <div className="text-[8px] font-black text-text-muted italic uppercase tracking-tighter mt-0.5">
                                                                        {proyectoNombre} {hasExtra && <span className="text-blue-500">(+Extra)</span>}
                                                                    </div>
                                                                    <div className="text-[7px] font-bold text-text-muted/70 uppercase tracking-tighter line-through">
                                                                        {productoOriginal}
                                                                    </div>
                                                                </>
                                                            );
                                                        }
                                                        return (
                                                            <>
                                                                <div className="text-xs font-black text-primary leading-tight uppercase">
                                                                    {productoOriginal} {hasExtra && <span className="text-[8px] text-blue-600 font-black bg-blue-50 px-1 rounded ml-1">+EXTRA</span>}
                                                                </div>
                                                                <div className="text-[8px] font-black text-text-muted italic uppercase tracking-tighter mt-0.5">
                                                                    {proyectoNombre}
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </td>

                                                {weekDays.map((wd, dayIdx) => {
                                                    let boxesForThisDay = 0;
                                                    const project = proyectos.find(pj => pj.id === p.proyectoId);
                                                    
                                                    const valFromProgramacion = isLogisticMode ? (prog.eta[wd.dateString] || 0) : (prog.sal[wd.dateString] || 0);
                                                    
                                                    if (valFromProgramacion > 0) {
                                                        boxesForThisDay = valFromProgramacion;
                                                    } else {
                                                        let transitHours = project?.tiempoOptimo || 72;
                                                        let transitMs = transitHours * 60 * 60 * 1000;
                                                        
                                                        if (project?.tiempoOptimo === 0 && p.fechaSalida && p.fechaLlegada) {
                                                            const d1 = new Date(p.fechaSalida.split('T')[0] + 'T12:00:00Z');
                                                            const d2 = new Date(p.fechaLlegada.split('T')[0] + 'T12:00:00Z');
                                                            transitMs = Math.max(0, d2.getTime() - d1.getTime());
                                                        }

                                                        if (p.desgloseDiario && p.desgloseDiario.length > 0) {
                                                            p.desgloseDiario.forEach(d => {
                                                                if (!d.fecha) return;
                                                                const baseDate = new Date(d.fecha.split('T')[0] + 'T12:00:00Z');
                                                                if (isNaN(baseDate.getTime())) return;

                                                                let targetDateStr;
                                                                if (isLogisticMode) {
                                                                    const arrivalDate = new Date(baseDate.getTime() + transitMs);
                                                                    targetDateStr = arrivalDate.toISOString().split('T')[0];
                                                                } else {
                                                                    targetDateStr = d.fecha.split('T')[0];
                                                                }
                                                                
                                                                if (targetDateStr === wd.dateString) {
                                                                    boxesForThisDay += (Number(d.cantidad) || 0);
                                                                }
                                                            });
                                                        } else if (dayIdx >= 2 && dayIdx <= 8) {
                                                            boxesForThisDay = legacyDailyValues[dayIdx - 2] || 0;
                                                        }
                                                        
                                                        if (boxesForThisDay === 0 && !hasDailyBreakdown) {
                                                            let targetDateRaw = isLogisticMode ? p.fechaLlegada : p.fechaSalida;
                                                            
                                                            if (isLogisticMode && !targetDateRaw && p.fechaSalida) {
                                                                const sDate = new Date(p.fechaSalida.split('T')[0] + 'T12:00:00Z');
                                                                sDate.setTime(sDate.getTime() + transitMs);
                                                                targetDateRaw = sDate.toISOString().split('T')[0];
                                                            }

                                                            if (targetDateRaw && targetDateRaw.split('T')[0] === wd.dateString) {
                                                                boxesForThisDay = getProjectionBaseTotal(p) + canjeTotal + extraTotal;
                                                            }
                                                        }
                                                    }

                                                    return (
                                                        <td key={dayIdx} className={`px-1 py-0.5 text-center border-r border-border/30 ${isLogisticMode && boxesForThisDay > 0 ? 'bg-amber-50/50 transition-colors' : ''}`}>
                                                            <div className="flex flex-col items-center">
                                                                <span className={`font-black text-[10px] ${boxesForThisDay === 0 ? 'text-gray-200' : (isLogisticMode && boxesForThisDay > 0 ? 'text-amber-700' : 'text-primary')}`}>
                                                                    {boxesForThisDay > 0
                                                                        ? (viewMode === 'cajas' || isLogisticMode ? boxesForThisDay.toLocaleString() : getUnitTypeLabel(boxesForThisDay, p.productoId, true))
                                                                        : '-'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}

                                                {(isLogisticMode || showPallets) && (
                                                    <td className={`px-4 py-0.5 text-center font-black text-primary text-[10px] ${isLogisticMode ? 'bg-amber-50/50' : 'bg-gray-50/50'}`}>
                                                        {getPalletCount(displayTotal, p.productoId)}
                                                    </td>
                                                )}

                                                <td className={`px-4 py-0.5 text-center ${isLogisticMode ? 'bg-amber-600/10' : 'bg-primary/5'}`}>
                                                    {isCoordinatorView && !isLogisticMode ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm ${isUnitAssigned ? 'bg-success text-white' : 'bg-amber-400 text-white animate-pulse'}`}>
                                                                {isUnitAssigned ? 'Programado' : 'Pendiente'}
                                                            </span>
                                                            <div className="flex items-center gap-1 mt-0.5 font-black text-primary text-[9px]">
                                                                <TruckIcon className="w-2.5 h-2.5" />
                                                                <span>{getUnitTypeLabel(p.proyeccionCajas, p.productoId, true)}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center">
                                                            <span className={`font-black text-[10px] ${isLogisticMode ? 'text-amber-800' : 'text-text-primary'}`}>
                                                                {isLogisticMode || viewMode === 'cajas' ? displayTotal.toLocaleString() : getUnitTypeLabel(displayTotal, p.productoId)}
                                                            </span>
                                                            {(canjeTotal > 0 || extraTotal > 0) && !isLogisticMode && (
                                                                <div className="flex flex-col gap-0.5">
                                                                    {canjeTotal > 0 && (
                                                                        <span className="text-[7px] font-bold text-warning uppercase tracking-tighter">
                                                                            +{canjeTotal.toLocaleString()} canje
                                                                        </span>
                                                                    )}
                                                                    {extraTotal > 0 && (
                                                                        <span className="text-[7px] font-bold text-blue-600 uppercase tracking-tighter">
                                                                            +{extraTotal.toLocaleString()} extra
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                {(permissions.canApprove || permissions.canRegisterRealSales) && (
                                                    <td className="px-2 py-0.5 text-center">
                                                        <button onClick={() => handleOpenForm(p)} className="p-1 text-text-muted hover:text-primary rounded hover:bg-gray-100 transition-all">
                                                            <PencilIcon className="w-3 h-3" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {isFormOpen && selectedProjection && createPortal(
                <div className="fixed inset-0 bg-black/70 z-[160] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full border border-border animate-fade-in overflow-hidden flex flex-col max-h-[95vh]">
                        <div className={`p-6 border-b border-border font-black text-white uppercase tracking-widest shrink-0 ${isCoordinatorView ? 'bg-emerald-800' : 'bg-primary'}`}>
                            {isCoordinatorView ? 'Despacho de Unidad' : 'Actualizar Programación'}
                        </div>
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                            <div className="bg-gray-100 p-4 rounded-xl border border-border space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-text-muted uppercase">Sede de Origen</span>
                                    <span className="text-xs font-black text-primary">{proyectos.find(pj => pj.id === selectedProjection.proyectoId)?.nombre}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-text-muted uppercase">Producto Oficial</span>
                                    <span className="text-xs font-black text-primary">{productos.find(pd => pd.id === selectedProjection.productoId)?.nombreDelProducto}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-border/50">
                                    <span className="text-[10px] font-black text-blue-600 uppercase">Meta de Proyección</span>
                                    <span className="text-sm font-black text-blue-700">{selectedProjection.proyeccionCajas?.toLocaleString()} cjs</span>
                                </div>
                            </div>

                            {isCoordinatorView ? (
                                <div className="animate-fade-in space-y-5">
                                    <div>
                                        <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">Salida (Fecha y Hora)</label>
                                        <input
                                            type="datetime-local"
                                            className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold text-emerald-900 outline-none"
                                            value={selectedProjection.fechaSalida || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const project = proyectos.find(pj => pj.id === selectedProjection.proyectoId);
                                                let arrival = selectedProjection.fechaLlegada;

                                                if (val && project?.tiempoOptimo) {
                                                    const d = new Date(val);
                                                    if (!isNaN(d.getTime())) {
                                                        const a = new Date(d.getTime() + project.tiempoOptimo * 60 * 60 * 1000);
                                                        arrival = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}T${String(a.getHours()).padStart(2, '0')}:${String(a.getMinutes()).padStart(2, '0')}`;
                                                    }
                                                }
                                                setSelectedProjection({ ...selectedProjection, fechaSalida: val, fechaLlegada: arrival });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">Llegada Estimada</label>
                                        <input
                                            type="datetime-local"
                                            className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold text-emerald-900 outline-none bg-emerald-50/50"
                                            value={selectedProjection.fechaLlegada || ''}
                                            onChange={(e) => setSelectedProjection({ ...selectedProjection, fechaLlegada: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">Validar Cliente Destino</label>
                                        <select
                                            className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold text-emerald-900 outline-none"
                                            value={selectedProjection.clientId || ''}
                                            onChange={(e) => setSelectedProjection({ ...selectedProjection, clientId: e.target.value })}
                                        >
                                            <option value="">Seleccione Cliente...</option>
                                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">Línea Transportista</label>
                                            <select
                                                className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold text-emerald-900 outline-none"
                                                value={selectedProjection.lineaTransportistaId || ''}
                                                onChange={(e) => setSelectedProjection({ ...selectedProjection, lineaTransportistaId: e.target.value, unidadTransporteId: '' })}
                                            >
                                                <option value="">Seleccione Línea...</option>
                                                {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">Unidad (Tractor)</label>
                                            <select
                                                className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold text-emerald-900 outline-none"
                                                value={selectedProjection.unidadTransporteId || ''}
                                                onChange={(e) => setSelectedProjection({ ...selectedProjection, unidadTransporteId: e.target.value })}
                                                disabled={!selectedProjection.lineaTransportistaId}
                                            >
                                                <option value="">Seleccione Unidad...</option>
                                                {unidades.filter(u => u.lineaId === selectedProjection.lineaTransportistaId).map(u => (
                                                    <option key={u.id} value={u.id}>{u.numeroEconomico ? `${u.numeroEconomico} - ${u.placasTractor || 'SIN PLACAS'}` : u.placasTractor}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">NÃºmero EconÃ³mico</label>
                                        <input
                                            type="text"
                                            className="w-full bg-emerald-50/50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold text-emerald-900 outline-none"
                                            value={unidades.find(u => u.id === selectedProjection.unidadTransporteId)?.numeroEconomico || ''}
                                            placeholder="Se completa al seleccionar la unidad"
                                            readOnly
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-emerald-800 uppercase mb-2 tracking-widest">Cajas Finales para Unidad</label>
                                        <input
                                            type="number"
                                            className="w-full bg-emerald-50/50 border-2 border-emerald-200 rounded-xl px-4 py-4 text-2xl font-black text-emerald-900 outline-none shadow-inner"
                                            value={selectedProjection.ventaRealManual !== undefined ? selectedProjection.ventaRealManual : selectedProjection.proyeccionCajas}
                                            onChange={(e) => setSelectedProjection({ ...selectedProjection, ventaRealManual: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="flex justify-between items-center">
                                        <label className="block text-[10px] font-black text-text-muted uppercase tracking-wider">Desglose de Salidas</label>
                                        <button
                                            onClick={() => {
                                                const current = selectedProjection.desgloseDiario || [];
                                                setSelectedProjection({
                                                    ...selectedProjection,
                                                    desgloseDiario: [...current, { fecha: '', cantidad: 0 }]
                                                });
                                            }}
                                            className="text-[9px] font-black text-primary hover:underline uppercase"
                                        >
                                            + Agregar Fecha
                                        </button>
                                    </div>

                                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 no-scrollbar">
                                        {(selectedProjection.desgloseDiario || [{ fecha: selectedProjection.fechaSalida || '', cantidad: getProjectionBaseTotal(selectedProjection as StrategicProjection) }]).map((item, idx) => (
                                            <div key={idx} className="flex gap-2 items-end bg-surface-secondary p-3 rounded-xl border border-border/50 relative group">
                                                <div className="flex-1">
                                                    <label className="block text-[8px] font-black text-text-muted uppercase mb-1">Fecha de Salida</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-xs font-black text-primary outline-none"
                                                        value={item.fecha}
                                                        onChange={(e) => {
                                                            const newDesglose = [...(selectedProjection.desgloseDiario || [])];
                                                            if (newDesglose.length === 0) {
                                                                newDesglose.push({ fecha: e.target.value, cantidad: getProjectionBaseTotal(selectedProjection as StrategicProjection) });
                                                            } else {
                                                                newDesglose[idx].fecha = e.target.value;
                                                            }
                                                            setSelectedProjection({ ...selectedProjection, desgloseDiario: newDesglose });
                                                        }}
                                                    />
                                                </div>
                                                <div className="w-24">
                                                    <label className="block text-[8px] font-black text-text-muted uppercase mb-1">Cajas</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-xs font-black text-primary outline-none"
                                                        value={item.cantidad}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            const newDesglose = [...(selectedProjection.desgloseDiario || [])];
                                                            if (newDesglose.length === 0) {
                                                                newDesglose.push({ fecha: selectedProjection.fechaSalida || '', cantidad: val });
                                                            } else {
                                                                newDesglose[idx].cantidad = val;
                                                            }
                                                            const total = newDesglose.reduce((sum, d) => sum + d.cantidad, 0);
                                                            setSelectedProjection({ ...selectedProjection, desgloseDiario: newDesglose, proyeccionCajas: total });
                                                        }}
                                                    />
                                                </div>
                                                {(selectedProjection.desgloseDiario?.length || 0) > 1 && (
                                                    <button
                                                        onClick={() => {
                                                            const newDesglose = selectedProjection.desgloseDiario?.filter((_, i) => i !== idx) || [];
                                                            const total = newDesglose.reduce((sum, d) => sum + d.cantidad, 0);
                                                            setSelectedProjection({ ...selectedProjection, desgloseDiario: newDesglose, proyeccionCajas: total });
                                                        }}
                                                        className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border border-primary/20 rounded-xl overflow-hidden">
                                        <div className="flex justify-between items-center px-4 py-2.5 bg-primary/5">
                                            <div className="flex items-center gap-2">
                                                <PlusIcon className="w-3.5 h-3.5 text-primary" />
                                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Carga Extra / Sustitución</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const current = selectedProjection.canjeProductos || [];
                                                    setSelectedProjection({
                                                        ...selectedProjection,
                                                        canjeProductos: [...current, { productId: '', quantity: 0, type: 'normal' }]
                                                    });
                                                }}
                                                className="text-[9px] font-black text-primary hover:underline uppercase flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-3 h-3" /> Agregar Item
                                            </button>
                                        </div>

                                        {(selectedProjection.canjeProductos || []).length === 0 ? (
                                            <p className="text-[9px] text-text-muted italic text-center py-3 px-4">
                                                Sin carga adicional. Use esta sección para agregar productos que completen la caja o sustitutos.
                                            </p>
                                        ) : (
                                            <div className="p-3 space-y-3">
                                                {(selectedProjection.canjeProductos || []).map((item, ci) => (
                                                    <div key={ci} className="space-y-1.5 p-2 bg-gray-50 rounded-lg border border-border/50 animate-fade-in">
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <select
                                                                    value={item.productId}
                                                                    onChange={(e) => {
                                                                        const updated = [...(selectedProjection.canjeProductos || [])];
                                                                        updated[ci] = { ...updated[ci], productId: e.target.value };
                                                                        setSelectedProjection({ ...selectedProjection, canjeProductos: updated });
                                                                    }}
                                                                    className="w-full bg-white border border-border rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none"
                                                                >
                                                                    <option value="">Seleccionar producto...</option>
                                                                    {productos.map(p => (
                                                                        <option key={p.id} value={p.id}>
                                                                            {(p as any).nombre_del_producto || p.nombreDelProducto || 'Producto'}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="w-20">
                                                                <input
                                                                    type="number"
                                                                    placeholder="CJS"
                                                                    value={item.quantity}
                                                                    onChange={(e) => {
                                                                        const updated = [...(selectedProjection.canjeProductos || [])];
                                                                        updated[ci] = { ...updated[ci], quantity: parseInt(e.target.value) || 0 };
                                                                        setSelectedProjection({ ...selectedProjection, canjeProductos: updated });
                                                                    }}
                                                                    className="w-full bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-center font-black outline-none"
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const updated = (selectedProjection.canjeProductos || []).filter((_, i) => i !== ci);
                                                                    setSelectedProjection({ ...selectedProjection, canjeProductos: updated });
                                                                }}
                                                                className="p-1.5 text-danger/50 hover:text-danger"
                                                            >
                                                                <TrashIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <label className="text-[8px] font-black text-text-muted uppercase tracking-tighter">Modo de adición:</label>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = [...(selectedProjection.canjeProductos || [])];
                                                                        updated[ci] = { ...updated[ci], type: 'normal' };
                                                                        setSelectedProjection({ ...selectedProjection, canjeProductos: updated });
                                                                    }}
                                                                    className={`px-2 py-0.5 text-[8px] font-black rounded uppercase tracking-tighter transition-all ${item.type === 'normal' ? 'bg-primary text-white' : 'bg-gray-200 text-text-muted hover:bg-gray-300'}`}
                                                                >
                                                                    Normal
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = [...(selectedProjection.canjeProductos || [])];
                                                                        updated[ci] = { ...updated[ci], type: 'canje' };
                                                                        setSelectedProjection({ ...selectedProjection, canjeProductos: updated });
                                                                    }}
                                                                    className={`px-2 py-0.5 text-[8px] font-black rounded uppercase tracking-tighter transition-all ${item.type === 'canje' || !item.type ? 'bg-warning text-white' : 'bg-gray-200 text-text-muted hover:bg-gray-300'}`}
                                                                >
                                                                    Canje (Sustituto)
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                                        <div>
                                            <label className="block text-[10px] font-black text-text-muted uppercase mb-2 tracking-wider">Cliente Destino</label>
                                            <select
                                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-black text-primary outline-none"
                                                value={selectedProjection.clientId || ''}
                                                onChange={(e) => setSelectedProjection({ ...selectedProjection, clientId: e.target.value })}
                                            >
                                                <option value="">Seleccione Cliente...</option>
                                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-text-muted uppercase mb-2 tracking-wider">Total Venta Real</label>
                                            <div className="w-full bg-gray-50 border border-border rounded-xl px-4 py-3 text-sm font-black text-primary outline-none flex items-center justify-between">
                                                <span>{getDailyBreakdownTotal(selectedProjection) || getProjectionBaseTotal(selectedProjection as StrategicProjection)}</span>
                                                <span className="text-[8px] text-text-muted uppercase">cjs</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-surface-secondary/30 border-t border-border flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseForm} className="px-5 py-2.5 text-xs font-black uppercase text-text-secondary hover:bg-hover rounded-xl transition-all">Cancelar</button>
                            <button
                                onClick={async () => {
                                    if (selectedProjection) {
                                        const dias = [0, 0, 0, 0, 0, 0, 0];
                                        if (selectedProjection.desgloseDiario && selectedProjection.desgloseDiario.length > 0) {
                                            selectedProjection.desgloseDiario.forEach(d => {
                                                if (d.fecha) {
                                                    const datePart = d.fecha.includes('T') ? d.fecha.split('T')[0] : d.fecha;
                                                    const parts = datePart.split('-');
                                                    if (parts.length === 3) {
                                                        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                                                        const dayNum = date.getDay();
                                                        const idx = dayNum === 0 ? 6 : dayNum - 1;
                                                        if (idx >= 0 && idx <= 6) dias[idx] += d.cantidad;
                                                    }
                                                }
                                            });
                                        }

                                        const updatePayload: any = {
                                            lunes: dias[0],
                                            martes: dias[1],
                                            miercoles: dias[2],
                                            jueves: dias[3],
                                            viernes: dias[4],
                                            sabado: dias[5],
                                            domingo: dias[6],
                                            fecha_salida: (selectedProjection.desgloseDiario && selectedProjection.desgloseDiario.length > 0) 
                                                ? selectedProjection.desgloseDiario[0].fecha 
                                                : selectedProjection.fechaSalida,
                                            fecha_llegada: selectedProjection.fechaLlegada,
                                            desglose_diario: selectedProjection.desgloseDiario,
                                            canje_productos: selectedProjection.canjeProductos || []
                                        };

                                        if (isCoordinatorView) {
                                            updatePayload.client_id = selectedProjection.clientId || null;
                                            updatePayload.linea_transportista_id = selectedProjection.lineaTransportistaId;
                                            updatePayload.unidad_transporte_id = selectedProjection.unidadTransporteId;
                                            updatePayload.venta_real_manual = selectedProjection.ventaRealManual;
                                        } else {
                                            updatePayload.proyeccion_cajas = selectedProjection.proyeccionCajas;
                                            updatePayload.client_id = selectedProjection.clientId || null;
                                        }

                                        setSaving(selectedProjection.id);
                                        const { error } = await supabase.from('proyecciones_estrategicas').update(updatePayload).eq('id', selectedProjection.id);
                                        setSaving(null);

                                        if (error) {
                                            addNotification({ type: 'danger', title: 'Fallo de Sincronizacion', message: 'No se pudieron guardar los cambios en la base de datos.' });
                                        } else {
                                            handleCloseForm();
                                            addNotification({ type: 'success', title: 'DB Sincronizada', message: 'Configuración guardada exitosamente.' });
                                            fetchData();
                                        }
                                    }
                                }}
                                className={`px-8 py-2.5 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all ${isCoordinatorView ? 'bg-emerald-600' : 'bg-primary'}`}
                            >
                                {isCoordinatorView ? 'Confirmar Salida' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {isNewGoalModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[160] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full border border-border animate-fade-in overflow-hidden">
                        <div className="p-6 border-b border-border bg-primary text-white font-black uppercase tracking-widest">Establecer Nueva Meta Estratégica</div>
                        <div className="p-8 space-y-6 bg-background/30">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-text-muted uppercase">Sede Origen</label>
                                    <select className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-primary outline-none" value={newGoalData.proyectoId} onChange={(e) => setNewGoalData({ ...newGoalData, proyectoId: e.target.value, productoId: '' })}>
                                        <option value="">Seleccione Sede...</option>
                                        {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-text-muted uppercase">Producto Autorizado</label>
                                    <select className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-primary outline-none" value={newGoalData.productoId} onChange={(e) => setNewGoalData({ ...newGoalData, productoId: e.target.value })} disabled={!newGoalData.proyectoId}>
                                        <option value="">Seleccione Producto...</option>
                                        {filteredProductsForModal.map(p => <option key={p.id} value={p.id}>{p.nombreDelProducto}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t border-border pt-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-text-muted uppercase">NG 2025</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-xs"></span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full bg-white border border-border rounded-xl pl-8 pr-4 py-2 text-sm font-bold"
                                            value={newGoalData.ng2025}
                                            onChange={e => setNewGoalData({ ...newGoalData, ng2025: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-text-muted uppercase">Presupuesto</label><input type="number" className="w-full bg-white border border-border rounded-xl px-4 py-2 text-sm font-black text-primary" value={newGoalData.presupuestoMonetario} onChange={e => setNewGoalData({ ...newGoalData, presupuestoMonetario: parseFloat(e.target.value) || 0 })} /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-t border-border pt-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-text-muted uppercase">SS 2025</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-xs"></span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full bg-white border border-border rounded-xl pl-8 pr-4 py-2 text-sm font-bold"
                                            value={newGoalData.ss2025}
                                            onChange={e => setNewGoalData({ ...newGoalData, ss2025: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-surface border-t border-border flex justify-end gap-3 shrink-0">
                            <button onClick={() => setIsNewGoalModalOpen(false)} className="px-5 py-3 text-xs font-black uppercase text-text-secondary hover:bg-hover rounded-xl transition-all">Cancelar</button>
                            <button onClick={handleCreateGoal} className="px-8 py-3 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all">Guardar Meta</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {isRejectModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full border border-border animate-fade-in overflow-hidden">
                        <div className="p-6 border-b border-border bg-danger text-white font-black uppercase tracking-widest">Rechazar Proyección</div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-text-secondary font-bold">Por favor, proporcione la razón técnica del rechazo para que el líder pueda ajustar su programación.</p>
                            <textarea
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-text-primary outline-none h-32 focus:ring-2 focus:ring-danger/20"
                                placeholder="Ej: No hay presupuesto suficiente para este flete..."
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                            />
                        </div>
                        <div className="p-4 bg-surface-secondary/30 border-t border-border flex justify-end gap-3">
                            <button onClick={() => { setIsRejectModalOpen(false); setProjectionToReject(null); }} className="px-5 py-2.5 text-xs font-black uppercase text-text-secondary hover:bg-hover rounded-xl">Cancelar</button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectionReason.trim()}
                                className="px-8 py-2.5 bg-danger text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg disabled:opacity-50"
                            >
                                Confirmar Rechazo
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            <ConfirmModal isOpen={goalToDelete !== null} onClose={() => { setGoalToDelete(null); setIsDeleteModalOpen(false); }} onConfirm={handleDeleteGoal} title="Borrado Crítico" message="¿Eliminar esta meta permanentemente de la base de datos?" />
        </div>
    );
};

function getCurrentWeek(): number {
    return getWeekNumber(new Date());
}

export default StrategicPlanningPage;