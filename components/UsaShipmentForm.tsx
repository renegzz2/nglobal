import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { UsaShipmentReport, ProductoDB, EstatusDB, ClienteDB, TipoUnidad, EscalaDB, ResponsableDB, ProductQuantity, ProyectoDB, Incident, LiderProgramacionUsaReport, SucursalDB, LineaTransporteDB, UnidadTransporteDB } from '../types';
import { TrashIcon, PlusIcon, TruckIcon, MapPinIcon, BoxIcon, SwitchHorizontalIcon, ExclamationIcon, DatabaseIcon, XIcon } from './icons';
import { useNotification } from './NotificationProvider';
import { formatCarrierName, getTipoUnidadName, toCamelCase, toSnakeCase } from '../utils/formatters';

const MANUAL_PROJECT_OPTION = '__MANUAL_PROJECT__';
const MANUAL_PRODUCT_OPTION = '__MANUAL_PRODUCT__';

const toInputDateTime = (dateStr: string | undefined | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

interface TransportUnit {
    id: string;
    lineaId: string;
    unidadId: string;
    driverName: string;
    unitType: string;
    tractorPlates: string;
    boxNumber: string;
    sealNumber: string;
    temperature: string;
    totalRealBoxes: string;
    tiveTrackerId: string;
    hasTiveTracker: boolean;
    palletsAsigned: number;
    logisticStatus: string;
    caat: string;
    alpha: string;
    transferAgent: string;
    transferPhone: string;
    freightCost: string;
    freightCostMxn: string;
    isNew?: boolean;
}

interface AuditProduct extends ProductQuantity {
    id: string;
    sourceLotId?: string;
}

interface UsaShipmentFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any, status: string) => void;
    initialData: UsaShipmentReport | null;
    liderData?: any | null;
    productSpecs: ProductoDB[];
    proyectos: ProyectoDB[];
    logisticStatuses: EstatusDB[];
    clientes: ClienteDB[];
    tiposUnidad: TipoUnidad[];
    escalas: EscalaDB[];
    responsables: ResponsableDB[];
}

const QuickAddUnitModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (unit: any) => Promise<void>;
    lineas: LineaTransporteDB[];
    tiposUnidad: TipoUnidad[];
    initialLineaId?: string;
}> = ({ isOpen, onClose, onSave, lineas, tiposUnidad, initialLineaId }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        numeroEconomico: '',
        placasTractor: '',
        placasCaja: '',
        tipoUnidadId: '',
        lineaId: initialLineaId || ''
    });

    useEffect(() => {
        if (!isOpen) return;
        setFormData({
            numeroEconomico: '',
            placasTractor: '',
            placasCaja: '',
            tipoUnidadId: '',
            lineaId: initialLineaId || ''
        });
    }, [isOpen, initialLineaId]);

    const handleSave = async () => {
        if (!formData.numeroEconomico || !formData.lineaId) return;
        setLoading(true);
        try {
            const tipo = getTipoUnidadName(tiposUnidad.find(t => String(t.id) === formData.tipoUnidadId)) || 'Thermo 53 pies';
            await onSave({
                ...formData,
                tipoUnidad: tipo
            });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-border animate-slide-up overflow-hidden">
                <div className="p-6 border-b border-border bg-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2">
                        <TruckIcon className="w-5 h-5" /> Registrar Nueva Unidad
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><XIcon className="w-5 h-5 text-text-muted"/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[9px] font-black text-text-muted mb-1 uppercase tracking-widest">Número Económico *</label>
                            <input type="text" value={formData.numeroEconomico} onChange={e => setFormData({...formData, numeroEconomico: e.target.value.toUpperCase()})} className="w-full bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none"/>
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-text-muted mb-1 uppercase tracking-widest">Línea *</label>
                            <select value={formData.lineaId} onChange={e => setFormData({...formData, lineaId: e.target.value})} className="w-full bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs font-bold outline-none">
                                <option value="">Seleccionar...</option>
                                {lineas.map(l => <option key={l.id} value={l.id}>{formatCarrierName(l.nombre)}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[9px] font-black text-text-muted mb-1 uppercase tracking-widest">Placas Tractor</label>
                            <input type="text" value={formData.placasTractor} onChange={e => setFormData({...formData, placasTractor: e.target.value.toUpperCase()})} className="w-full bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs font-bold outline-none"/>
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-text-muted mb-1 uppercase tracking-widest">Placas Caja</label>
                            <input type="text" value={formData.placasCaja} onChange={e => setFormData({...formData, placasCaja: e.target.value.toUpperCase()})} className="w-full bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs font-bold outline-none"/>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-text-muted mb-1 uppercase tracking-widest">Tipo de Unidad</label>
                        <select value={formData.tipoUnidadId} onChange={e => setFormData({...formData, tipoUnidadId: e.target.value})} className="w-full bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs font-bold outline-none">
                            <option value="">Seleccionar tipo...</option>
                            {tiposUnidad.map(t => <option key={t.id} value={String(t.id)}>{getTipoUnidadName(t)}</option>)}
                        </select>
                    </div>
                </div>
                <div className="p-6 bg-gray-50 border-t border-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase text-text-muted">Cancelar</button>
                    <button onClick={handleSave} disabled={loading || !formData.numeroEconomico || !formData.lineaId} className="px-6 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-focus transition-all flex items-center gap-2">
                        {loading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Guardar Unidad'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const UsaShipmentForm: React.FC<UsaShipmentFormProps> = ({
    isOpen, onClose, onSubmit, initialData, liderData, productSpecs, proyectos, logisticStatuses, clientes, tiposUnidad, escalas, responsables
}) => {
    const { addNotification } = useNotification();
    const [baseData, setBaseData] = useState({
        tripId: '',
        project: '',
        projectId: '',
        stopOverProjectId: '',
        sucursalId: '',
        clientId: '',
        lotesAsociados: [] as string[],
        products: [] as AuditProduct[],
        departureDateTime: '',
        realDepartureDate: '',
        arrivalDateTime: '',
        temperatureIdeal: null as number | string | null,
        secondaryStatus: '' as string 
    });

    const [lineas, setLineas] = useState<LineaTransporteDB[]>([]);
    const [unidades, setUnidades] = useState<UnidadTransporteDB[]>([]);
    const [pendingLots, setPendingLots] = useState<LiderProgramacionUsaReport[]>([]);
    const [loadingResources, setLoadingResources] = useState(false);

    const [units, setUnits] = useState<TransportUnit[]>([
        { id: Math.random().toString(), lineaId: '', unidadId: '', driverName: '', unitType: '', tractorPlates: '', boxNumber: '', sealNumber: '', temperature: '48.2', totalRealBoxes: '', tiveTrackerId: '', hasTiveTracker: true, palletsAsigned: 0, logisticStatus: 'Confirmado', caat: '', alpha: '', transferAgent: '', transferPhone: '', freightCost: '', freightCostMxn: '', isNew: true }
    ]);
    const [isQuickUnitModalOpen, setIsQuickUnitModalOpen] = useState(false);
    const [activeUnitIdForQuickAdd, setActiveUnitIdForQuickAdd] = useState<string | null>(null);

    useEffect(() => {
        const fetchResources = async () => {
            setLoadingResources(true);
            
            let initialLotes: string[] = [];
            if (initialData?.lotesAsociados && Array.isArray(initialData.lotesAsociados)) {
                initialLotes = initialData.lotesAsociados;
            } else {
                if (initialData?.loteOriginalId) initialLotes.push(initialData.loteOriginalId);
                if (initialData?.loteSecundarioId) initialLotes.push(initialData.loteSecundarioId);
            }

            const lotsQuery = supabase.from('lider_programacion_usa_reports').select('*');
            if (initialLotes.length > 0) {
                const inFilter = `(${initialLotes.join(',')})`;
                lotsQuery.or(`usa_logistics_status.eq.Programado,id.in.${inFilter}`);
            } else {
                lotsQuery.eq('usa_logistics_status', 'Programado');
            }
            
            const [lineRes, unitRes, lotsRes] = await Promise.all([
                supabase.from('usa_lineas_transporte').select('*'),
                supabase.from('usa_unidades_transporte').select('*'),
                lotsQuery
            ]);
            if (lineRes.data) setLineas(toCamelCase(lineRes.data));
            if (unitRes.data) setUnidades(toCamelCase(unitRes.data));
            if (lotsRes.data) setPendingLots(toCamelCase(lotsRes.data));
            setLoadingResources(false);
        };
        if (isOpen) fetchResources();
    }, [isOpen, initialData]);

    useEffect(() => {
        if (initialData) {
            const initialProjectId = initialData.projectId || (initialData.project ? MANUAL_PROJECT_OPTION : '');
            
            let initialLotes: string[] = [];
            if (initialData.lotesAsociados && Array.isArray(initialData.lotesAsociados)) {
                initialLotes = initialData.lotesAsociados;
            } else {
                if (initialData.loteOriginalId) initialLotes.push(initialData.loteOriginalId);
                if (initialData.loteSecundarioId) initialLotes.push(initialData.loteSecundarioId);
            }

            setBaseData({
                tripId: initialData.tripId,
                project: initialData.project,
                projectId: initialProjectId,
                stopOverProjectId: initialData.stopOverProjectId || '',
                sucursalId: initialData.sucursalId || '',
                clientId: initialData.clientId || '',
                lotesAsociados: initialLotes,
                products: (initialData.products || []).map(p => ({
                    ...p,
                    id: Math.random().toString(),
                    productId: p.productId || p.product_id || (p.manualProductName || p.manual_product_name ? MANUAL_PRODUCT_OPTION : ''),
                    manualProductName: p.manualProductName || p.manual_product_name || '',
                    projectedQty: p.projectedQty || p.quantity,
                    realQty: p.realQty || p.quantity,
                    invoiceNumber: p.invoiceNumber || '',
                    invoiceUrl: p.invoiceUrl || '',
                    mid: p.mid || '',
                    sourceLotId: p.sourceLotId || p.source_lot_id || null
                })) as AuditProduct[],
                departureDateTime: toInputDateTime(initialData.departureDateTime),
                realDepartureDate: toInputDateTime(initialData.realDepartureDate),
                arrivalDateTime: toInputDateTime(initialData.arrivalDateTime),
                temperatureIdeal: initialData.idealTemp || initialData.temperature || null,
                secondaryStatus: initialData.comments?.includes('[HOLD]') ? 'Hold' : ''
            });
            
            const isUsingTripIdAsTive = initialData.tiveTrackerId === initialData.tripId;

            setUnits([{
                id: initialData.id,
                lineaId: initialData.lineaTransportistaId || '',
                unidadId: initialData.unidadTransporteId || '',
                driverName: initialData.driverName || '',
                unitType: initialData.unitType || '',
                tractorPlates: initialData.tractorPlates || '',
                boxNumber: initialData.boxNumber || '',
                sealNumber: initialData.sealNumber || '',
                temperature: String(initialData.temperature || initialData.idealTemp || '48.2'),
                totalRealBoxes: String(initialData.totalRealBoxes || ''),
                tiveTrackerId: isUsingTripIdAsTive ? '' : (initialData.tiveTrackerId || ''),
                hasTiveTracker: !isUsingTripIdAsTive,
                palletsAsigned: 0,
                logisticStatus: initialData.logisticStatus || 'Confirmado',
                caat: initialData.caat || '',
                alpha: initialData.alpha || '',
                transferAgent: initialData.transferAgent || '',
                transferPhone: initialData.transferPhone || '',
                freightCost: String(initialData.freightCost || ''),
                freightCostMxn: initialData.comments?.match(/\[MXN:([\d.]+)\]/)?.[1] || '',
                isNew: false
            }]);
        }
    }, [initialData]);

    const handleAddLot = (loteId: string) => {
        if (!loteId || baseData.lotesAsociados.includes(loteId)) return;
        const lote = pendingLots.find(l => l.id === loteId);
        if (!lote) return;

        const newProducts = (lote.productos || []).map((p: any) => ({
            ...p,
            id: Math.random().toString(),
            productId: p.productId || p.product_id || (p.manualProductName || p.manual_product_name ? MANUAL_PRODUCT_OPTION : ''),
            manualProductName: p.manualProductName || p.manual_product_name || '',
            projectedQty: p.quantity || p.cantidad || 0,
            realQty: p.quantity || p.cantidad || 0,
            invoiceNumber: '',
            invoiceUrl: '',
            sourceLotId: lote.id 
        })) as AuditProduct[];

        const newLotes = [...baseData.lotesAsociados, lote.id];
        const activeLots = pendingLots.filter(l => newLotes.includes(l.id));
        const newProjectName = activeLots.map(l => l.proyecto).join(' / ');

        setBaseData(prev => ({
            ...prev,
            lotesAsociados: newLotes,
            project: newProjectName,
            products: [...prev.products, ...newProducts],
            departureDateTime: prev.lotesAsociados.length === 0 ? toInputDateTime(`${String(lote.fechaSalida || '').split('T')[0] || new Date().toISOString().split('T')[0]}T08:00:00`) : prev.departureDateTime,
            temperatureIdeal: prev.lotesAsociados.length === 0 ? (lote.temperaturaIdeal || null) : prev.temperatureIdeal,
        }));

        const newTotal = [...baseData.products, ...newProducts].reduce((acc, p) => acc + Number(p.realQty), 0);
        setUnits(prev => prev.map(u => ({ 
            ...u, 
            totalRealBoxes: String(newTotal),
            temperature: baseData.lotesAsociados.length === 0 ? String(lote.temperaturaIdeal || '48.2') : u.temperature 
        })));
        addNotification({ type: 'success', title: 'Lote Añadido', message: `Carga de ${lote.proyecto} integrada al viaje.` });
    };

    const handleRemoveLot = (loteId: string) => {
        const newLotes = baseData.lotesAsociados.filter(id => id !== loteId);
        const activeLots = pendingLots.filter(l => newLotes.includes(l.id));
        const newProjectName = activeLots.map(l => l.proyecto).join(' / ');
        const newProducts = baseData.products.filter(p => p.sourceLotId !== loteId);

        setBaseData(prev => ({
            ...prev,
            lotesAsociados: newLotes,
            project: newProjectName,
            products: newProducts
        }));

        const newTotal = newProducts.reduce((acc, p) => acc + Number(p.realQty), 0);
        setUnits(prev => prev.map(u => ({ ...u, totalRealBoxes: String(newTotal) })));
        addNotification({ type: 'warning', title: 'Lote Removido', message: 'Se ha desvinculado la carga y sus productos correspondientes.' });
    };

    const handleUnitChange = (id: string, field: keyof TransportUnit, value: any) => {
        if (field === 'unidadId') {
            if (value === 'NEW') {
                setActiveUnitIdForQuickAdd(id);
                setIsQuickUnitModalOpen(true);
                return;
            }
            const unitObj = unidades.find(u => u.id === value);
            setUnits(prev => prev.map(u => u.id === id ? {
                ...u,
                unidadId: String(value),
                tractorPlates: unitObj?.placasTractor || u.tractorPlates,
                boxNumber: unitObj?.placasCaja || u.boxNumber,
                unitType: unitObj?.tipoUnidad || u.unitType
            } : u));
        } else if (field === 'lineaId') {
            setUnits(prev => prev.map(u => u.id === id ? {
                ...u,
                lineaId: String(value),
                unidadId: '',
                tractorPlates: '',
                boxNumber: '',
                unitType: ''
            } : u));
        } else {
            setUnits(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
        }
    };

    const handleSaveQuickUnit = async (newUnitData: any) => {
        try {
            const dataToSave = toSnakeCase(newUnitData);
            const { data, error } = await supabase.from('usa_unidades_transporte').insert(dataToSave).select();
            if (error) throw error;
            
            if (data) {
                const created = toCamelCase(data[0]) as UnidadTransporteDB;
                setUnidades(prev => [...prev, created]);
                
                if (activeUnitIdForQuickAdd) {
                    handleUnitChange(activeUnitIdForQuickAdd, 'unidadId', created.id);
                }
                addNotification({ type: 'success', title: 'Unidad Registrada', message: `Económico ${created.numeroEconomico} guardado en servidor.` });
            }
        } catch (e: any) {
            addNotification({ type: 'danger', title: 'Error', message: e.message || 'No se pudo guardar la unidad.' });
        }
    };

    const handleProductAuditChange = (id: string, field: keyof AuditProduct, value: any) => {
        const updatedProducts = baseData.products.map(p => {
            if (p.id !== id) return p;
            const updated = { ...p, [field]: value };
            if (field === 'productId') {
                updated.manualProductName = value === MANUAL_PRODUCT_OPTION ? (updated.manualProductName || '') : '';
            }
            return updated;
        });
        setBaseData(prev => ({ ...prev, products: updatedProducts }));
        if (field === 'realQty') {
            const newTotal = updatedProducts.reduce((acc, curr) => acc + (Number(curr.realQty) || 0), 0);
            setUnits(units.map(u => ({ ...u, totalRealBoxes: String(newTotal) })));
        }
    };

    const handleAddManualProduct = () => {
        setBaseData(prev => ({
            ...prev,
            products: [...prev.products, {
                id: Math.random().toString(),
                productId: MANUAL_PRODUCT_OPTION,
                manualProductName: '',
                projectedQty: 0,
                realQty: 0,
                invoiceNumber: '',
                invoiceUrl: '',
                mid: ''
            } as AuditProduct]
        }));
    };

    const handleRemoveProduct = (id: string) => {
        const updatedProducts = baseData.products.filter(p => (p as any).id !== id);
        setBaseData(prev => ({ ...prev, products: updatedProducts }));
        const newTotal = updatedProducts.reduce((acc, curr) => acc + (Number(curr.realQty) || 0), 0);
        setUnits(units.map(u => ({ ...u, totalRealBoxes: String(newTotal) })));
    };

    const handleAction = async (forcedStatus: string | null) => {
        if (!baseData.tripId.trim()) {
            addNotification({ type: 'danger', title: 'Atención', message: 'Debe definir el Folio de Viaje oficial.' });
            return;
        }
        if (baseData.projectId === MANUAL_PROJECT_OPTION && !baseData.project.trim()) {
            addNotification({ type: 'danger', title: 'Atención', message: 'Debe capturar el nombre del proyecto manual.' });
            return;
        }
        const targetStatus = forcedStatus || units[0].logisticStatus || 'Confirmado';

        const payloads = units.map((u) => ({
            id: u.isNew ? undefined : u.id,
            tripId: baseData.tripId,
            project: baseData.projectId === MANUAL_PROJECT_OPTION ? baseData.project.trim() : baseData.project,
            projectId: baseData.projectId === MANUAL_PROJECT_OPTION ? '' : baseData.projectId,
            stopOverProjectId: baseData.stopOverProjectId || null,
            sucursalId: baseData.sucursalId,
            clientId: baseData.clientId,
            lineaTransportistaId: u.lineaId || null,
            unidadTransporteId: u.unidadId || null,
            isConsolidated: baseData.lotesAsociados.length > 1,
            lotesAsociados: baseData.lotesAsociados,
            products: baseData.products.map(({ id, ...p }) => ({
                ...p,
                productId: p.productId === MANUAL_PRODUCT_OPTION ? '' : p.productId,
                manualProductName: p.productId === MANUAL_PRODUCT_OPTION ? (p.manualProductName || '').trim() : p.manualProductName
            })),
            logisticStatus: targetStatus,
            departureDateTime: (targetStatus === 'Unidad en Empaque' && !baseData.departureDateTime) 
                ? new Date().toISOString() 
                : (baseData.departureDateTime ? new Date(baseData.departureDateTime).toISOString() : null),
            driverName: u.driverName,
            unitType: u.unitType,
            tractorPlates: u.tractorPlates,
            boxNumber: u.boxNumber,
            sealNumber: u.sealNumber,
            temperature: parseFloat(u.temperature) || null,
            totalRealBoxes: parseInt(u.totalRealBoxes) || null,
            idealTemp: baseData.temperatureIdeal,
            tiveTrackerId: u.hasTiveTracker ? (u.tiveTrackerId?.trim() ? u.tiveTrackerId.trim() : null) : baseData.tripId.trim(),
            caat: u.caat, alpha: u.alpha, transferAgent: u.transferAgent, transferPhone: u.transferPhone, freightCost: parseFloat(u.freightCost) || null,
            realDepartureDate: baseData.realDepartureDate ? new Date(baseData.realDepartureDate).toISOString() : null,
            arrivalDateTime: baseData.arrivalDateTime ? new Date(baseData.arrivalDateTime).toISOString() : null,
            comments: (() => {
                let comm = initialData?.comments || '';
                comm = comm.replace(/\[HOLD\]\s*/g, '').replace(/\[MXN:[\d.]+\s*\]\s*/g, '').trim();
                let tags = '';
                if (baseData.secondaryStatus === 'Hold') tags += '[HOLD] ';
                if (u.freightCostMxn) tags += `[MXN:${u.freightCostMxn}] `;
                return `${tags}${comm}`.trim();
            })()
        }));
        onSubmit(payloads, targetStatus);
    };

    const handleSaveOnly = async () => {
        const preservedStatus = initialData?.logisticStatus || units[0]?.logisticStatus || 'Confirmado';
        await handleAction(preservedStatus);
    };

    const labelClasses = "block text-[10px] font-black text-text-muted mb-1.5 uppercase tracking-widest";
    const inputClasses = "w-full bg-white border border-border rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all shadow-sm placeholder:text-text-muted/30";

    return createPortal(
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-md z-[100] flex justify-center items-center p-4">
            <div className="bg-surface rounded-[2rem] shadow-2xl w-[95vw] md:max-w-7xl flex flex-col border border-white/50 max-h-[85vh] md:max-h-[95vh] animate-slide-up overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-5">
                        <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20">
                            <TruckIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Gestión de Despacho Internacional</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                <p className="text-text-muted text-[10px] font-bold uppercase tracking-[0.1em]">Configuración de Activos y Consolidación Dinámica</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-background transition-colors border border-transparent hover:border-border"><XIcon className="w-6 h-6 text-text-muted" /></button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-background/30">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                        <div className="lg:col-span-5 space-y-8">
                            <div className="bg-white p-6 rounded-3xl border border-border shadow-sm">
                                <h4 className="text-[11px] font-black text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <div className="w-1 h-3 bg-primary rounded-full"></div>
                                    Identificación de Viaje
                                </h4>
                                <div className="space-y-6">
                                    <div className="bg-primary/[0.02] p-5 rounded-2xl border-2 border-primary/10 group focus-within:border-primary/30 transition-colors">
                                        <label className={`${labelClasses} text-primary/70`}>Folio de Operación USA *</label>
                                        <input
                                            type="text"
                                            value={baseData.tripId}
                                            onChange={(e) => setBaseData({ ...baseData, tripId: e.target.value.toUpperCase() })}
                                            className="w-full bg-white border border-border rounded-xl px-4 py-3.5 text-xl font-black text-primary uppercase outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                                            placeholder="NG-2025-XXXX"
                                            required
                                        />
                                    </div>

                                    <div className="bg-accent/[0.03] p-5 rounded-2xl border border-dashed border-accent/20">
                                        <div className="flex items-center gap-2 mb-3">
                                            <SwitchHorizontalIcon className="w-4 h-4 text-accent" />
                                            <span className="text-[10px] font-black text-accent uppercase tracking-wider">Añadir Lotes Programados</span>
                                        </div>
                                        <select
                                            className="w-full bg-white border border-accent/20 rounded-xl px-4 py-2 text-xs font-bold text-primary outline-none focus:ring-4 focus:ring-accent/5 transition-all"
                                            onChange={(e) => { handleAddLot(e.target.value); e.target.value = ''; }}
                                            value=""
                                        >
                                            <option value="" disabled>+ Seleccionar lote para integrar al viaje...</option>
                                            {pendingLots.filter(l => !baseData.lotesAsociados.includes(l.id)).map(l => (
                                                <option key={l.id} value={l.id}>{l.loteId} — {l.proyecto}</option>
                                            ))}
                                        </select>

                                        {baseData.lotesAsociados.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-4">
                                                {baseData.lotesAsociados.map(loteId => {
                                                    const lote = pendingLots.find(l => l.id === loteId) || { loteId: 'Desconocido', proyecto: 'Histórico' };
                                                    return (
                                                        <div key={loteId} className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-xl shadow-sm">
                                                            <span className="text-[10px] font-black uppercase tracking-widest">{lote.loteId}</span>
                                                            <span className="text-[10px] font-bold opacity-80">{lote.proyecto}</span>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleRemoveLot(loteId)} 
                                                                className="ml-1 p-0.5 hover:bg-primary/20 hover:text-danger rounded-full transition-colors"
                                                                title="Remover lote y sus productos"
                                                            >
                                                                <XIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className={labelClasses}>Sede de Origen / Proyecto</label>
                                            <input
                                                type="text"
                                                value={baseData.project}
                                                onChange={(e) => setBaseData({ ...baseData, project: e.target.value.toUpperCase(), projectId: MANUAL_PROJECT_OPTION })}
                                                className={inputClasses}
                                                placeholder="Nombre consolidado del proyecto"
                                                required
                                            />
                                        </div>
                                        <div><label className={labelClasses}>Consignatario *</label><select value={baseData.clientId} onChange={(e) => setBaseData({ ...baseData, clientId: e.target.value })} className={inputClasses}><option value="">Seleccionar...</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelClasses}>Salida Real</label>
                                            <input 
                                                type="datetime-local" 
                                                value={baseData.realDepartureDate} 
                                                onChange={(e) => setBaseData({ ...baseData, realDepartureDate: e.target.value })} 
                                                className={inputClasses} 
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Llegada Real</label>
                                            <input 
                                                type="datetime-local" 
                                                value={baseData.arrivalDateTime} 
                                                onChange={(e) => setBaseData({ ...baseData, arrivalDateTime: e.target.value })} 
                                                className={inputClasses} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden">
                                <div className="bg-surface-secondary/50 px-6 py-4 border-b border-border flex justify-between items-center">
                                    <h4 className="text-[11px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                        <BoxIcon className="w-4 h-4" />
                                        Manifiesto de Artículos
                                    </h4>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            type="button" 
                                            onClick={handleAddManualProduct}
                                            className="text-[9px] font-black text-primary hover:bg-primary/5 px-2 py-1 rounded-lg border border-primary/20 uppercase tracking-tighter flex items-center gap-1.5 transition-all active:scale-95"
                                        >
                                            <PlusIcon className="w-3 h-3" />
                                            Añadir Producto
                                        </button>
                                        <span className="bg-primary/10 text-primary text-[9px] font-black px-2.5 py-1 rounded-full">{baseData.products.length} SKU</span>
                                    </div>
                                </div>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-[11px] text-left border-collapse">
                                        <thead className="bg-background sticky top-0 z-10">
                                            <tr className="text-text-muted uppercase font-black border-b border-border">
                                                <th className="px-6 py-3">Descripción</th>
                                                <th className="px-2 py-3 text-center">Cant.</th>
                                                <th className="px-6 py-3">Folio Fiscal</th>
                                                <th className="px-2 py-3 text-center w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {baseData.products.map((p) => {
                                                const spec = productSpecs.find(s => s.id === p.productId);
                                                const isManualProduct = p.productId === MANUAL_PRODUCT_OPTION;
                                                return (
                                                    <tr key={p.id} className={`group transition-colors ${isManualProduct ? 'bg-orange-50 hover:bg-orange-100/70' : 'hover:bg-primary/[0.02]'}`}>
                                                        <td className={`px-6 py-3 font-bold uppercase truncate max-w-[180px] ${isManualProduct ? 'text-orange-700' : 'text-text-primary'}`}>
                                                            {p.productId && !isManualProduct ? (
                                                                spec?.nombreDelProducto || 'SIN DESCRIPCIÓN'
                                                            ) : (
                                                                <>
                                                                <select
                                                                    value={p.productId}
                                                                    onChange={(e) => handleProductAuditChange(p.id, 'productId', e.target.value)}
                                                                    className={`w-full bg-background border rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:ring-2 ${isManualProduct ? 'border-orange-300 text-orange-700 focus:ring-orange-100' : 'border-border focus:ring-primary/10'}`}
                                                                >
                                                                    <option value="">Seleccionar...</option>
                                                                    <option value={MANUAL_PRODUCT_OPTION}>+ Producto no registrado</option>
                                                                    {productSpecs.map(s => (
                                                                        <option key={s.id} value={s.id}>{s.nombreDelProducto}</option>
                                                                    ))}
                                                                </select>
                                                                {isManualProduct && (
                                                                    <input
                                                                        type="text"
                                                                        value={p.manualProductName || ''}
                                                                        onChange={(e) => handleProductAuditChange(p.id, 'manualProductName', e.target.value.toUpperCase())}
                                                                        className="w-full mt-2 bg-white border border-orange-300 rounded-lg px-2 py-1 text-[10px] font-bold text-orange-700 outline-none focus:ring-2 focus:ring-orange-100"
                                                                        placeholder="Nombre del producto manual"
                                                                    />
                                                                )}
                                                                {isManualProduct && <p className="mt-2 text-[8px] font-black text-orange-600 uppercase tracking-widest">Manual / fuera del presupuesto</p>}
                                                                </>
                                                            )}
                                                            <div className="mt-2 flex items-center gap-1.5 bg-primary/[0.03] p-1.5 rounded-lg border border-primary/10">
                                                                <span className="text-[8px] font-black text-primary/60 uppercase tracking-widest px-1">MID</span>
                                                                <input
                                                                    type="text"
                                                                    value={p.mid || ''}
                                                                    onChange={(e) => handleProductAuditChange(p.id, 'mid', e.target.value.toUpperCase())}
                                                                    className="flex-1 bg-white border border-primary/10 rounded px-2 py-0.5 text-[10px] font-black text-primary placeholder:text-text-muted/30 outline-none focus:border-primary/30 transition-all"
                                                                    placeholder="MID-0000"
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-3 text-center">
                                                            <input
                                                                type="number"
                                                                value={p.realQty}
                                                                onChange={(e) => handleProductAuditChange(p.id, 'realQty', parseInt(e.target.value) || 0)}
                                                                className={`w-16 bg-background border rounded-lg px-2 py-1 text-center font-black outline-none focus:ring-2 ${isManualProduct ? 'border-orange-300 text-orange-700 focus:ring-orange-100' : 'border-border text-primary focus:ring-primary/10'}`}
                                                            />
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <input
                                                                type="text"
                                                                value={p.invoiceNumber}
                                                                onChange={(e) => handleProductAuditChange(p.id, 'invoiceNumber', e.target.value.toUpperCase())}
                                                                className="w-full bg-background border border-border rounded-lg px-3 py-1 text-[10px] font-mono focus:ring-2 focus:ring-primary/10 outline-none"
                                                                placeholder="F-000"
                                                            />
                                                        </td>
                                                        <td className="px-2 py-3 text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveProduct(p.id)}
                                                                className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                title="Eliminar producto"
                                                            >
                                                                <TrashIcon className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-7 space-y-8">
                            {units.map((unit) => (
                                <div key={unit.id} className="bg-white p-8 rounded-3xl border border-border shadow-md border-t-8 border-t-primary space-y-8 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                                        <TruckIcon className="w-40 h-40" />
                                    </div>
                                    <h4 className="text-[11px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1 h-3 bg-primary rounded-full"></div>
                                        Logística de Transporte
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                        <div className="space-y-6">
                                            <div className="space-y-4">
                                                <div><label className={labelClasses}>Línea Transportista *</label><select value={unit.lineaId} onChange={(e) => handleUnitChange(unit.id, 'lineaId', e.target.value)} className={inputClasses}><option value="">Seleccionar...</option>{lineas.map(l => <option key={l.id} value={l.id}>{formatCarrierName(l.nombre)}</option>)}</select></div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={labelClasses}>Flete Unitario (USD) *</label>
                                                        <input 
                                                            type="text" 
                                                            value={unit.freightCost} 
                                                            onChange={(e) => handleUnitChange(unit.id, 'freightCost', e.target.value)} 
                                                            className={`${inputClasses} font-black text-primary border-primary/20 bg-primary/[0.01]`} 
                                                            placeholder="USD 0.00" 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelClasses}>Equivalente (MXN)</label>
                                                        <input 
                                                            type="text" 
                                                            value={unit.freightCostMxn} 
                                                            onChange={(e) => handleUnitChange(unit.id, 'freightCostMxn', e.target.value)} 
                                                            className={`${inputClasses} font-black text-emerald-700 border-emerald-200 bg-emerald-50/50`} 
                                                            placeholder="MXN 0.00" 
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className={labelClasses}>Unidad Asignada *</label>
                                                <div className="flex gap-2">
                                                    <select value={unit.unidadId} onChange={(e) => handleUnitChange(unit.id, 'unidadId', e.target.value)} className={`${inputClasses} flex-1`} disabled={!unit.lineaId}>
                                                        <option value="">{unit.lineaId ? 'Seleccionar eco...' : 'Primero elija línea'}</option>
                                                        {unidades.filter(u => u.lineaId === unit.lineaId).map(u => (<option key={u.id} value={u.id}>{u.numeroEconomico} — {u.placasTractor}</option>))}
                                                        {unit.lineaId && <option value="NEW" className="text-primary font-black">+ AÑADIR NUEVA UNIDAD</option>}
                                                    </select>
                                                   {unit.lineaId && (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => { setActiveUnitIdForQuickAdd(unit.id); setIsQuickUnitModalOpen(true); }}
                                                            className="p-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all border border-primary/20"
                                                            title="Nueva Unidad"
                                                        >
                                                            <PlusIcon className="w-5 h-5" />
                                                        </button>
                                                   )}
                                                </div>
                                            </div>
                                            <div><label className={labelClasses}>Nombre del Operador *</label><input type="text" value={unit.driverName} onChange={(e) => handleUnitChange(unit.id, 'driverName', e.target.value.toUpperCase())} className={inputClasses} placeholder="NOMBRE COMPLETO" /></div>
                                        </div>
                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest">Identificador Tive</label>
                                                    <div 
                                                        className="flex items-center gap-2 cursor-pointer" 
                                                        onClick={() => handleUnitChange(unit.id, 'hasTiveTracker', !unit.hasTiveTracker)}
                                                        title="¿El embarque incluye un equipo físico de Tive?"
                                                    >
                                                        <span className={`text-[9px] font-black uppercase transition-colors ${unit.hasTiveTracker ? 'text-primary' : 'text-text-muted'}`}>
                                                            {unit.hasTiveTracker ? 'SÍ (Físico)' : 'NO'}
                                                        </span>
                                                        <div className={`w-7 h-4 rounded-full relative transition-colors duration-200 ${unit.hasTiveTracker ? 'bg-primary' : 'bg-gray-300'}`}>
                                                            <div className={`absolute top-[2px] w-3 h-3 rounded-full bg-white transition-all duration-200 ${unit.hasTiveTracker ? 'left-[14px]' : 'left-0.5'}`}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {unit.hasTiveTracker ? (
                                                    <input 
                                                        type="text" 
                                                        value={unit.tiveTrackerId} 
                                                        onChange={(e) => handleUnitChange(unit.id, 'tiveTrackerId', e.target.value.toUpperCase())} 
                                                        className={`${inputClasses} font-mono`} 
                                                        placeholder="K123456" 
                                                    />
                                                ) : (
                                                    <div className={`${inputClasses} bg-gray-50 text-text-muted font-mono flex items-center cursor-not-allowed opacity-80 border-dashed`}>
                                                        {baseData.tripId || 'ESPERANDO FOLIO...'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div><label className={labelClasses}>Set Point (°F)</label><input type="text" value={unit.temperature} onChange={(e) => handleUnitChange(unit.id, 'temperature', e.target.value)} className={inputClasses} placeholder="35.0" /></div>
                                                <div><label className={labelClasses}>Total de Cajas</label><input type="number" value={unit.totalRealBoxes} onChange={(e) => handleUnitChange(unit.id, 'totalRealBoxes', e.target.value)} className={inputClasses} /></div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div><label className={labelClasses}>Sello Fiscal</label><input type="text" value={unit.sealNumber} onChange={(e) => handleUnitChange(unit.id, 'sealNumber', e.target.value)} className={inputClasses} placeholder="999999" /></div>
                                                <div><label className={labelClasses}>Tipo Remolque</label><input type="text" value={unit.unitType} onChange={(e) => handleUnitChange(unit.id, 'unitType', e.target.value)} className={inputClasses} disabled /></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
                                        <div><label className={labelClasses}>Matrícula T</label><input type="text" value={unit.tractorPlates} onChange={(e) => handleUnitChange(unit.id, 'tractorPlates', e.target.value.toUpperCase())} className={`${inputClasses} bg-surface-secondary/50 border-dashed`} /></div>
                                        <div><label className={labelClasses}>Matrícula C</label><input type="text" value={unit.boxNumber} onChange={(e) => handleUnitChange(unit.id, 'boxNumber', e.target.value.toUpperCase())} className={`${inputClasses} bg-surface-secondary/50 border-dashed`} /></div>
                                        <div><label className={labelClasses}>CAAT</label><input type="text" value={unit.caat} onChange={(e) => handleUnitChange(unit.id, 'caat', e.target.value.toUpperCase())} className={inputClasses} /></div>
                                        <div><label className={labelClasses}>ALPHA Code</label><input type="text" value={unit.alpha} onChange={(e) => handleUnitChange(unit.id, 'alpha', e.target.value.toUpperCase())} className={inputClasses} /></div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 relative z-10">
                                        <div><label className={labelClasses}>Agente Transfer</label><input type="text" value={unit.transferAgent} onChange={(e) => handleUnitChange(unit.id, 'transferAgent', e.target.value.toUpperCase())} className={inputClasses} /></div>
                                        <div><label className={labelClasses}>Contacto Agente</label><input type="text" value={unit.transferPhone} onChange={(e) => handleUnitChange(unit.id, 'transferPhone', e.target.value)} className={inputClasses} /></div>
                                    </div>

                                    <div className="pt-6 border-t border-border/50 bg-purple-50/30 -mx-8 px-8 py-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg"><ExclamationIcon className="w-5 h-5" /></div>
                                            <div>
                                                <h5 className="text-[10px] font-black text-purple-800 uppercase tracking-widest leading-none">Status Secundario / Etiqueta Operativa</h5>
                                                <p className="text-[9px] text-purple-600 font-bold mt-1">Permite marcar un embarque como [Hold] sin alterar su estatus logístico real.</p>
                                            </div>
                                        </div>
                                        <select 
                                            value={baseData.secondaryStatus} 
                                            onChange={e => setBaseData({...baseData, secondaryStatus: e.target.value})}
                                            className="bg-white border-2 border-purple-200 rounded-xl px-4 py-2 text-xs font-black text-purple-700 outline-none focus:ring-4 focus:ring-purple-100 transition-all cursor-pointer"
                                        >
                                            <option value="">Ninguno</option>
                                            <option value="Hold" className="font-black">⚠️ EN HOLD</option>
                                            <option value="Revision" disabled>En Revisión (Próximamente)</option>
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-border flex justify-end items-center gap-4 bg-white shrink-0">
                    <button onClick={onClose} className="px-8 py-3 rounded-2xl border border-border font-bold text-text-secondary text-xs uppercase hover:bg-background transition-all">Descartar Cambios</button>
                    <button onClick={handleSaveOnly} className="group px-8 py-3 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-black text-xs uppercase tracking-widest hover:bg-emerald-600 hover:border-emerald-600 hover:text-white transition-all active:scale-95 shadow-lg shadow-emerald-100">
                        <span className="flex items-center gap-2">
                            <DatabaseIcon className="w-4 h-4" />
                            Guardar Solamente
                        </span>
                    </button>
                    <button onClick={() => handleAction('Confirmado')} className="group px-8 py-3 rounded-2xl bg-white border-2 border-primary text-primary font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all active:scale-95 shadow-lg shadow-primary/5">
                        <span className="flex items-center gap-2">
                            <DatabaseIcon className="w-4 h-4" />
                            Archivar Borrador
                        </span>
                    </button>
                    <button onClick={() => handleAction('Unidad en Empaque')} className="px-12 py-3.5 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-[0.15em] shadow-xl shadow-primary/30 hover:bg-primary-focus transition-all flex items-center justify-center gap-3 active:scale-95">
                        <TruckIcon className="w-5 h-5 shadow-sm" />
                        Ejecutar Despacho
                    </button>
                </div>
            </div>
            <QuickAddUnitModal 
                isOpen={isQuickUnitModalOpen} 
                onClose={() => setIsQuickUnitModalOpen(false)} 
                onSave={handleSaveQuickUnit}
                lineas={lineas}
                tiposUnidad={tiposUnidad}
                initialLineaId={units.find(u => u.id === activeUnitIdForQuickAdd)?.lineaId}
            />
        </div>,
        document.body
    );
};

export default UsaShipmentForm;