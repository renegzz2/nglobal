import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { LiderProgramacionUsaReport, ProductoDB, ProyectoDB, ProductQuantity, StrategicProjection, TipoUnidad } from '../types';
import { PlusIcon, TrashIcon, BoxIcon, SwitchHorizontalIcon } from './icons';
import { getTipoUnidadCapacity, getTipoUnidadName, toCamelCase } from '../utils/formatters';

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

const GoalHealthRing: React.FC<{ current: number, goal: number }> = ({ current, goal }) => {
    if (!goal || goal === 0) return null;
    const percentage = Math.min(100, (current / goal) * 100);
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const getColor = () => {
        if (percentage >= 100) return '#16A34A';
        if (percentage >= 70) return '#D97706';
        return '#DC2626';
    };

    return (
        <div className="relative flex items-center justify-center w-10 h-10 group" title={`Avance Meta: ${Math.round(percentage)}%`}>
            <svg className="w-10 h-10 transform -rotate-90">
                <circle cx="20" cy="20" r={radius} stroke="#e2e8f0" strokeWidth="3" fill="transparent" />
                <circle
                    cx="20" cy="20" r={radius}
                    stroke={getColor()}
                    strokeWidth="3"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-700 ease-out"
                    strokeLinecap="round"
                />
            </svg>
            <span className="absolute text-[8px] font-black text-primary">{Math.round(percentage)}%</span>
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-primary text-white text-[8px] px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg">
                Meta: {goal.toLocaleString()} CJS
            </div>
        </div>
    );
};

interface LiderProgramacionUsaFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: LiderProgramacionUsaReport | Omit<LiderProgramacionUsaReport, 'id'>) => void;
    initialData: LiderProgramacionUsaReport | null;
    productSpecs: ProductoDB[];
    proyectos: ProyectoDB[];
    clientes?: any;
}

const LiderProgramacionUsaForm: React.FC<LiderProgramacionUsaFormProps> = ({
    isOpen, onClose, onSubmit, initialData, productSpecs, proyectos, clientes
}) => {
    const getLocalISOString = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const [formData, setFormData] = useState<Partial<LiderProgramacionUsaReport> & { semanaFiscal?: number }>({
        loteId: '', proyecto: '', projectId: '', isConsolidated: false, consolidationPartnerId: '',
        secondaryProject: '', area: 'Estados Unidos', fechaSalida: getLocalISOString(), fechaLlegada: '',
        pallets: 0, cajas: 0, productos: [], temperaturaIdeal: '',
        usaLogisticsStatus: 'Programado', comentarios: '', semanaFiscal: getCurrentWeek()
    });

    const [weeklyGoals, setWeeklyGoals] = useState<any[]>([]);
    const [tipoUnidadCatalog, setTipoUnidadCatalog] = useState<TipoUnidad[]>([]);
    const [calculatedStats, setCalculatedStats] = useState({
        totalPallets: 0, totalCajas: 0, recommendedUnit: 'Pendiente', avgTemp: 0
    });

    function getCurrentWeek(): number {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    }

    const toFahrenheit = (celsius: number) => parseFloat(((celsius * 1.8) + 32).toFixed(1));
    const toCelsius = (fahrenheit: number) => parseFloat(((fahrenheit - 32) / 1.8).toFixed(1));

    const getTempInCelsius = (tempStr: string | undefined): number | null => {
        if (!tempStr) return null;
        const normalized = tempStr.toUpperCase();
        const match = tempStr.match(/(-?\d+(\.\d+)?)/);
        if (!match) return null;
        const value = parseFloat(match[0]);
        if (normalized.includes('F') || (value > 30 && !normalized.includes('C'))) return toCelsius(value);
        return value;
    };

    useEffect(() => {
        supabase.from('tipo_unidad').select('*').order('id', { ascending: true }).then(({ data, error }) => {
            if (!error && data) {
                setTipoUnidadCatalog(toCamelCase(data) as TipoUnidad[]);
            }
        });
    }, []);

    useEffect(() => {
        if (formData.semanaFiscal) {
            // Opción B: Bolsa Global de Cajas.
            // Ignoramos de qué sede (proyecto) es el lider, traemos todas las metas autorizadas de la semana.
            supabase.from('proyecciones_estrategicas')
                .select('producto_id, proyeccion_cajas')
                .eq('semana_fiscal', formData.semanaFiscal)
                .eq('autorizado', true)
                .then(({ data, error }) => {
                    if (!error && data) {
                        // Agrupar por producto para sumar las proyecciones de todos los empaques
                        const aggregated: Record<string, number> = {};
                        data.forEach((d: any) => {
                            aggregated[d.producto_id] = (aggregated[d.producto_id] || 0) + (d.proyeccion_cajas || 0);
                        });

                        const goals = Object.keys(aggregated).map(prodId => {
                            const spec = productSpecs.find(p => p.id === prodId);
                            const total = aggregated[prodId];
                            return {
                                productoId: prodId,
                                nombreProducto: spec ? spec.nombreDelProducto : 'Producto',
                                metaTotal: total,
                                cantidadRestante: total // Cajas disponibles en la pool global
                            };
                        });
                        setWeeklyGoals(goals);
                    }
                });
        }
    }, [formData.semanaFiscal, productSpecs]);

    useEffect(() => {
        if (initialData) {
            const initialProjectId = initialData.projectId || (initialData.proyecto ? MANUAL_PROJECT_OPTION : '');
            setFormData({ 
                ...initialData, 
                projectId: initialProjectId,
                productos: (initialData.productos || []).map((prod: any) => ({
                    ...prod,
                    productId: prod.productId || prod.product_id || (prod.manualProductName || prod.manual_product_name ? MANUAL_PRODUCT_OPTION : ''),
                    manualProductName: prod.manualProductName || prod.manual_product_name || ''
                })),
                fechaSalida: toInputDateTime(initialData.fechaSalida),
                fechaLlegada: toInputDateTime(initialData.fechaLlegada),
                semanaFiscal: (initialData as any).semanaFiscal || getCurrentWeek() 
            });
        }
    }, [initialData]);

    useEffect(() => {
        if (formData.fechaSalida && formData.projectId) {
            const project = proyectos.find(p => p.id === formData.projectId);
            if (project && project.tiempoOptimo) {
                const departureDate = new Date(formData.fechaSalida);
                if (!isNaN(departureDate.getTime())) {
                    const arrivalDate = new Date(departureDate.getTime() + project.tiempoOptimo * 60 * 60 * 1000);
                    // Ajustar a zona horaria local para el input datetime-local
                    const year = arrivalDate.getFullYear();
                    const month = String(arrivalDate.getMonth() + 1).padStart(2, '0');
                    const day = String(arrivalDate.getDate()).padStart(2, '0');
                    const hours = String(arrivalDate.getHours()).padStart(2, '0');
                    const minutes = String(arrivalDate.getMinutes()).padStart(2, '0');
                    const formattedArrival = `${year}-${month}-${day}T${hours}:${minutes}`;

                    setFormData(prev => ({ ...prev, fechaLlegada: formattedArrival }));
                }
            }
        }
    }, [formData.fechaSalida, formData.projectId, proyectos]);

    useEffect(() => {
        let totalCajas = 0, totalPallets = 0, tempSum = 0, tempCount = 0;
        const allProducts = formData.productos || [];
        allProducts.forEach(prod => {
            const qty = Number(prod.quantity) || 0;
            totalCajas += qty;
            if (!prod.productId || prod.productId === MANUAL_PRODUCT_OPTION) {
                totalPallets += qty > 0 ? Math.ceil(qty / 50) : 0;
                return;
            }
            const spec = productSpecs.find(p => p.id === prod.productId);
            if (spec) {
                let cajasPorPallet = 50;
                if (spec.cajasPalletUsa) {
                    const match = String(spec.cajasPalletUsa).match(/\d+/);
                    if (match) cajasPorPallet = parseInt(match[0]);
                }
                totalPallets += Math.ceil(qty / cajasPorPallet);
                const tempC = getTempInCelsius(spec.tempOptima !== undefined ? String(spec.tempOptima) : undefined);
                if (tempC !== null) {
                    tempSum += tempC;
                    tempCount++;
                }
            } else {
                totalPallets += qty > 0 ? Math.ceil(qty / 50) : 0;
            }
        });

        let recommendedUnit = 'Pendiente';
        if (totalPallets > 0) {
            const normalizedUnits = tipoUnidadCatalog
                .map(item => ({ name: getTipoUnidadName(item), capacity: getTipoUnidadCapacity(item) }))
                .filter(item => item.name && item.capacity > 0)
                .sort((a, b) => a.capacity - b.capacity);

            if (normalizedUnits.length > 0) {
                const exactFit = normalizedUnits.find(item => totalPallets <= item.capacity);
                if (exactFit) {
                    recommendedUnit = exactFit.name;
                } else {
                    const largest = normalizedUnits[normalizedUnits.length - 1];
                    recommendedUnit = `${Math.ceil(totalPallets / largest.capacity)} x ${largest.name}`;
                }
            }
        }

        setCalculatedStats({
            totalCajas,
            totalPallets,
            recommendedUnit,
            avgTemp: tempCount > 0 ? parseFloat((tempSum / tempCount).toFixed(1)) : 0
        });
    }, [formData.productos, productSpecs, tipoUnidadCatalog]);

    const handleProductChange = (index: number, field: keyof ProductQuantity, value: string | number) => {
        const newProducts = [...(formData.productos || [])];
        newProducts[index] = { ...newProducts[index], [field]: value };
        if (field === 'productId') {
            newProducts[index].manualProductName = value === MANUAL_PRODUCT_OPTION ? (newProducts[index].manualProductName || '') : '';
        }
        setFormData(prev => ({ ...prev, productos: newProducts }));
    };

    const handleAddCanje = (parentIndex: number) => {
        const parent = (formData.productos || [])[parentIndex];
        const goal = weeklyGoals.find(g => g.productoId === parent.productId);
        // Calculamos cuántas cajas faltan para la meta; si no hay meta, iniciamos en 0
        const faltante = goal ? Math.max(0, goal.metaTotal - (parent.quantity || 0)) : 0;
        const newProducts = [...(formData.productos || [])];
        // Insertar el canje justo después del producto padre
        newProducts.splice(parentIndex + 1, 0, {
            productId: '',
            quantity: faltante,
            esCanje: true,
            canjeDeProductId: parent.productId
        });
        setFormData(prev => ({ ...prev, productos: newProducts }));
    };

    const handleUseRemainder = (goal: any) => {
        const exists = formData.productos?.some(p => p.productId === goal.productoId);
        if (exists) return;
        setFormData(prev => ({
            ...prev,
            productos: [...(prev.productos || []), { productId: goal.productoId, quantity: goal.cantidadRestante }]
        }));
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-5xl flex flex-col border border-border max-h-[95vh] animate-fade-in overflow-hidden">
                <div className="p-5 border-b border-border flex justify-between items-center bg-primary text-white shrink-0">
                    <div><h3 className="text-xl font-bold uppercase">Programación de Lote Semanal</h3><p className="text-primary-content/80 text-xs italic">Registre el volumen estimado para que Tráfico asigne transporte.</p></div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                <form id="programacion-form" onSubmit={(e) => {
                    e.preventDefault();
                    const submissionData = {
                        ...formData,
                        projectId: formData.projectId === MANUAL_PROJECT_OPTION ? '' : formData.projectId,
                        proyecto: formData.projectId === MANUAL_PROJECT_OPTION ? (formData.proyecto || '').trim() : formData.proyecto,
                        productos: (formData.productos || []).map((prod) => ({
                            ...prod,
                            productId: prod.productId === MANUAL_PRODUCT_OPTION ? '' : prod.productId,
                            manualProductName: prod.productId === MANUAL_PRODUCT_OPTION ? (prod.manualProductName || '').trim() : prod.manualProductName
                        })),
                        fechaSalida: formData.fechaSalida ? new Date(formData.fechaSalida).toISOString() : null,
                        fechaLlegada: formData.fechaLlegada ? new Date(formData.fechaLlegada).toISOString() : null,
                        pallets: calculatedStats.totalPallets,
                        cajas: calculatedStats.totalCajas,
                        usaLogisticsStatus: 'Programado' // Jefe: Siempre inicia como programado libre
                    };
                    onSubmit(submissionData as any);
                }} className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-background/30 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-6">
                            <div className="bg-surface p-5 rounded-xl border border-border shadow-sm space-y-4">
                                <h4 className="text-[10px] font-black text-primary uppercase tracking-widest border-b border-primary/5 pb-2">Datos Maestros</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                                        <label className="text-[10px] font-black text-primary mb-1 block uppercase tracking-tighter">Semana Fiscal *</label>
                                        <input type="number" value={formData.semanaFiscal} onChange={e => setFormData({ ...formData, semanaFiscal: parseInt(e.target.value) })} className="w-full bg-white border border-primary/30 rounded-lg px-3 py-2 text-sm font-black text-primary outline-none" required />
                                    </div>
                                    <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                                        <label className="text-[10px] font-black text-primary mb-1 block uppercase tracking-tighter">ID Lote / Control</label>
                                        <input type="text" value={formData.loteId} onChange={e => setFormData({ ...formData, loteId: e.target.value.toUpperCase() })} className="w-full bg-white border border-primary/30 rounded-lg px-3 py-2 text-sm font-black text-primary outline-none" placeholder="Opcional..." />
                                    </div>
                                </div>
                                <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                                    <label className="text-[10px] font-black text-primary mb-1 block uppercase tracking-tighter">Proyecto Origen *</label>
                                    <select value={formData.projectId} onChange={(e) => {
                                        if (e.target.value === MANUAL_PROJECT_OPTION) {
                                            setFormData({ ...formData, projectId: MANUAL_PROJECT_OPTION, proyecto: formData.proyecto || '' });
                                            return;
                                        }
                                        const s = proyectos.find(p => p.id === e.target.value);
                                        setFormData({ ...formData, projectId: e.target.value, proyecto: s?.nombre || '' });
                                    }} className="w-full bg-white border border-primary/30 rounded-lg px-3 py-2 text-sm font-bold text-primary outline-none" required>
                                        <option value="">Seleccione su sede...</option>
                                        <option value={MANUAL_PROJECT_OPTION}>+ Proyecto no registrado</option>
                                        {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                    </select>
                                    {formData.projectId === MANUAL_PROJECT_OPTION && (
                                        <input
                                            type="text"
                                            value={formData.proyecto || ''}
                                            onChange={e => setFormData({ ...formData, proyecto: e.target.value.toUpperCase() })}
                                            className="w-full mt-3 bg-white border border-primary/30 rounded-lg px-3 py-2 text-sm font-black text-primary outline-none"
                                            placeholder="Nombre del proyecto manual"
                                            required
                                        />
                                    )}
                                </div>



                                {formData.projectId && formData.projectId !== MANUAL_PROJECT_OPTION && (
                                    <div className="space-y-3 animate-fade-in pt-2">
                                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest border-b border-primary/5 pb-2">Metas Autorizadas (Semana {formData.semanaFiscal})</h4>
                                        <div className="space-y-2">
                                            {weeklyGoals.map((goal, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-white border border-border rounded-xl shadow-sm group hover:border-primary/30 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-1.5 bg-primary/5 rounded-lg text-primary"><BoxIcon className="w-3.5 h-3.5" /></div>
                                                        <div>
                                                            <p className="text-[11px] font-black text-primary uppercase leading-none">{goal.nombreProducto}</p>
                                                            <p className="text-[9px] text-text-muted font-bold mt-1">Por programar: {goal.cantidadRestante.toLocaleString()} cjs</p>
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => handleUseRemainder(goal)} className="px-3 py-1 border border-primary/30 text-[9px] font-black text-primary rounded-lg uppercase hover:bg-primary hover:text-white transition-all">Programar</button>
                                                </div>
                                            ))}
                                            {weeklyGoals.length === 0 && <p className="text-[9px] text-text-muted italic text-center py-4 bg-gray-50 rounded-xl border border-dashed">No hay metas pendientes para esta semana.</p>}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div>
                                        <label className="text-[10px] font-black text-text-muted mb-1 block uppercase tracking-tighter">Fecha y Hora de Salida *</label>
                                        <input
                                            type="datetime-local"
                                            value={formData.fechaSalida}
                                            onChange={e => setFormData({ ...formData, fechaSalida: e.target.value })}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none font-bold"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-text-muted mb-1 block uppercase tracking-tighter">Estimada de Llegada</label>
                                        <input
                                            type="datetime-local"
                                            value={formData.fechaLlegada}
                                            onChange={e => setFormData({ ...formData, fechaLlegada: e.target.value })}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none font-bold bg-primary/5 border-primary/20"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col h-full">
                                <div className="flex justify-between items-center mb-4 border-b border-border/50 pb-2">
                                    <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest">Manifiesto Programado</h4>
                                    <div className="flex gap-4">
                                        <button type="button" onClick={() => setFormData({ ...formData, productos: [] })} className="text-[10px] font-black text-danger hover:underline uppercase tracking-tighter">Limpiar</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, productos: [...(formData.productos || []), { productId: MANUAL_PRODUCT_OPTION, manualProductName: '', quantity: 0 }] })} className="text-[10px] font-black text-primary hover:underline uppercase tracking-tighter">+ Manual</button>
                                    </div>
                                </div>
                                <div className="space-y-2 mb-6 min-h-[300px] max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                                    {formData.productos?.map((prod, idx) => {
                                        const goal = weeklyGoals.find(g => g.productoId === prod.productId);
                                        const parentProductName = prod.canjeDeProductId
                                            ? productSpecs.find(p => p.id === prod.canjeDeProductId)?.nombreDelProducto || 'Anterior'
                                            : null;

                                        if (prod.esCanje) {
                                            // ─── Fila CANJE (hija / sustituto) ───
                                            return (
                                                <div key={idx} className="flex gap-2 items-center animate-fade-in group ml-6 relative">
                                                    {/* Línea visual de conexión */}
                                                    <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex items-center">
                                                        <div className="w-3 h-px border-t-2 border-dashed border-warning/60" />
                                                    </div>
                                                    <div className="flex-1 flex gap-2 items-center bg-warning/5 border border-warning/30 p-2 rounded-xl shadow-sm">
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <SwitchHorizontalIcon className="w-3 h-3 text-warning" />
                                                            <span className="text-[8px] font-black text-warning uppercase tracking-widest whitespace-nowrap">Canje</span>
                                                        </div>
                                                        {parentProductName && (
                                                            <span className="text-[8px] text-warning/70 font-bold italic truncate max-w-[80px]" title={`Complemento de: ${parentProductName}`}>
                                                                ↳ {parentProductName}
                                                            </span>
                                                        )}
                                                        <select
                                                            value={prod.productId}
                                                            onChange={(e) => handleProductChange(idx, 'productId', e.target.value)}
                                                            className="flex-1 bg-white border border-warning/30 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none focus:border-warning"
                                                            required
                                                        >
                                                            <option value="">Seleccionar sustituto...</option>
                                                            <option value={MANUAL_PRODUCT_OPTION}>+ Producto no registrado</option>
                                                            {productSpecs.map(p => <option key={p.id} value={p.id}>{p.nombreDelProducto}</option>)}
                                                        </select>
                                                        {prod.productId === MANUAL_PRODUCT_OPTION && (
                                                            <input
                                                                type="text"
                                                                value={prod.manualProductName || ''}
                                                                onChange={(e) => handleProductChange(idx, 'manualProductName', e.target.value.toUpperCase())}
                                                                className="flex-1 bg-white border border-warning/30 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none focus:border-warning"
                                                                placeholder="Producto manual"
                                                                required
                                                            />
                                                        )}
                                                        <input
                                                            type="number"
                                                            value={prod.quantity}
                                                            onChange={(e) => handleProductChange(idx, 'quantity', parseInt(e.target.value) || 0)}
                                                            className="w-20 bg-white border border-warning/30 rounded-lg px-2 py-1.5 text-xs text-center font-black text-warning focus:border-warning outline-none"
                                                            placeholder="CJS"
                                                            required
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => { const n = [...(formData.productos || [])]; n.splice(idx, 1); setFormData({ ...formData, productos: n }); }}
                                                            className="p-1.5 text-warning/50 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                            title="Eliminar canje"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // ─── Fila NORMAL ───
                                        const isManualProduct = prod.productId === MANUAL_PRODUCT_OPTION;
                                        const faltante = goal ? Math.max(0, goal.metaTotal - (prod.quantity || 0)) : null;
                                        const yaHayCanje = formData.productos?.some((p, i) => i > idx && p.esCanje && p.canjeDeProductId === prod.productId);

                                        return (
                                            <div key={idx} className={`flex gap-2 items-center p-2.5 rounded-xl border shadow-sm animate-fade-in group ${isManualProduct ? 'bg-orange-50 border-orange-200' : 'bg-background/50 border-border/50'}`}>
                                                <div className="flex-1 space-y-2">
                                                    <select value={prod.productId} onChange={(e) => handleProductChange(idx, 'productId', e.target.value)} className={`w-full bg-white border rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none ${isManualProduct ? 'border-orange-300 text-orange-700' : 'border-border'}`} required>
                                                        <option value="">Producto...</option>
                                                        <option value={MANUAL_PRODUCT_OPTION}>+ Producto no registrado</option>
                                                        {productSpecs.map(p => <option key={p.id} value={p.id}>{p.nombreDelProducto}</option>)}
                                                    </select>
                                                    {prod.productId === MANUAL_PRODUCT_OPTION && (
                                                        <div className="space-y-1">
                                                            <input
                                                                type="text"
                                                                value={prod.manualProductName || ''}
                                                                onChange={(e) => handleProductChange(idx, 'manualProductName', e.target.value.toUpperCase())}
                                                                className="w-full bg-white border border-orange-300 rounded-lg px-2 py-1.5 text-[11px] font-bold text-orange-700 outline-none"
                                                                placeholder="Nombre del producto manual"
                                                                required
                                                            />
                                                            <p className="text-[8px] font-black text-orange-600 uppercase tracking-widest">Manual / fuera del presupuesto</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <input type="number" value={prod.quantity} onChange={(e) => handleProductChange(idx, 'quantity', parseInt(e.target.value) || 0)} className={`w-20 bg-white border rounded-lg px-2 py-1.5 text-xs text-center font-black ${isManualProduct ? 'border-orange-300 text-orange-700' : 'border-border text-primary'}`} placeholder="CJS" required />
                                                {goal && <GoalHealthRing current={prod.quantity} goal={goal.metaTotal} />}
                                                {/* Botón Canje: aparece si hay volumen faltante y aún no tiene un canje asignado */}
                                                {prod.productId && !yaHayCanje && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddCanje(idx)}
                                                        title={faltante !== null && faltante > 0 ? `Faltan ${faltante.toLocaleString()} cjs — agregar sustituto` : 'Agregar producto canje'}
                                                        className="p-1.5 rounded-lg border border-warning/40 text-warning hover:bg-warning/10 hover:border-warning transition-all opacity-0 group-hover:opacity-100 shrink-0 flex items-center gap-0.5"
                                                    >
                                                        <SwitchHorizontalIcon className="w-3.5 h-3.5" />
                                                        {faltante !== null && faltante > 0 && (
                                                            <span className="text-[8px] font-black hidden group-hover:inline">{faltante.toLocaleString()}</span>
                                                        )}
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => { const n = [...(formData.productos || [])]; n.splice(idx, 1); setFormData({ ...formData, productos: n }); }} className="p-1.5 text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        );
                                    })}
                                    {(!formData.productos || formData.productos.length === 0) && <p className="text-center text-[10px] text-text-muted py-20 italic uppercase tracking-[0.2em]">Cargue productos para este lote...</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 text-center"><span className="block text-[8px] font-black text-primary uppercase mb-1">Volumen Calculado</span><span className="text-2xl font-black text-primary">{calculatedStats.totalPallets} <span className="text-[10px]">PLTS</span></span></div>
                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 text-center"><span className="block text-[8px] font-black text-primary uppercase mb-1">Set-Point Estimado</span><span className="text-2xl font-black text-primary">{calculatedStats.avgTemp !== 0 ? `${toFahrenheit(calculatedStats.avgTemp)}°F` : '--'}</span></div>
                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 text-center col-span-2 md:col-span-1"><span className="block text-[8px] font-black text-primary uppercase mb-1">Tipo de Transporte</span><span className="text-xs font-black text-primary truncate block uppercase tracking-tighter">{calculatedStats.recommendedUnit}</span></div>
                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 text-center"><span className="block text-[8px] font-black text-primary uppercase mb-1">Cajas Totales</span><span className="text-2xl font-black text-primary">{calculatedStats.totalCajas.toLocaleString()}</span></div>
                    </div>
                </form>

                <div className="p-5 border-t border-border bg-surface flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl border border-border font-bold text-xs uppercase text-text-secondary hover:bg-hover transition-all">Cancelar</button>
                    <button type="submit" form="programacion-form" className="px-10 py-2.5 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-primary-focus transition-all active:scale-95">Guardar en Agenda</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default LiderProgramacionUsaForm;
