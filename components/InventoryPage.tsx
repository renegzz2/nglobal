
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ProyectoDB, ProductoDB } from '../types';
import Card from './ui/Card';
import { useNotification } from './NotificationProvider';
import { PlusIcon, SwitchHorizontalIcon, BoxIcon, FilterIcon } from './icons';
import { toCamelCase } from '../utils/formatters';

const InventoryPage: React.FC = () => {
    const [inventory, setInventory] = useState<any[]>([]);
    const [transfers, setTransfers] = useState<any[]>([]);
    const [proyectos, setProyectos] = useState<ProyectoDB[]>([]);
    const [productos, setProductos] = useState<ProductoDB[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProject, setFilterProject] = useState('');
    const [transferTab, setTransferTab] = useState<'recibir' | 'enviadas'>('recibir');
    const { addNotification } = useNotification();

    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [invRes, transRes, projRes, prodRes] = await Promise.all([
                supabase.from('inventario_proyectos').select('*'),
                supabase.from('transferencias_stock').select('*').order('fecha_solicitud', { ascending: false }),
                supabase.from('usa_proyectos').select('*'),
                supabase.from('usa_productos').select('*')
            ]);

            if (invRes.error) throw invRes.error;
            
            setInventory(toCamelCase(invRes.data || []));
            setTransfers(toCamelCase(transRes.data || []));
            setProyectos(toCamelCase(projRes.data || []));
            setProductos(toCamelCase(prodRes.data || []));
        } catch (error) {
            console.error("Error fetching inventory:", error);
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo cargar el inventario.' });
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchData();
        
        // Suscripción en tiempo real
        const invChannel = supabase.channel('realtime-inventory')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_proyectos' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_stock' }, () => fetchData())
            .subscribe();

        return () => {
            supabase.removeChannel(invChannel);
        };
    }, [fetchData]);

    const handleAcceptTransfer = async (transfer: any) => {
        try {
            // 1. Restar stock en origen
            const { data: originInv } = await supabase.from('inventario_proyectos')
                .select('*')
                .eq('proyecto_id', transfer.proyectoOrigenId)
                .eq('producto_id', transfer.productoId)
                .single();
            
            if (!originInv || originInv.stock_disponible < transfer.cantidad) {
                addNotification({ type: 'danger', title: 'Error', message: 'No hay suficiente stock en origen para completar esta transferencia.' });
                return;
            }

            // 2. Sumar stock en destino
            const { data: destInv } = await supabase.from('inventario_proyectos')
                .select('*')
                .eq('proyecto_id', transfer.proyectoDestinoId)
                .eq('producto_id', transfer.productoId)
                .maybeSingle();

            // Ejecutar transacción lógica
            await supabase.from('inventario_proyectos')
                .update({ stock_disponible: originInv.stock_disponible - transfer.cantidad })
                .eq('id', originInv.id);

            if (destInv) {
                await supabase.from('inventario_proyectos')
                    .update({ stock_disponible: destInv.stock_disponible + transfer.cantidad })
                    .eq('id', destInv.id);
            } else {
                await supabase.from('inventario_proyectos')
                    .insert({ 
                        proyecto_id: transfer.proyectoDestinoId, 
                        producto_id: transfer.productoId, 
                        stock_disponible: transfer.cantidad 
                    });
            }

            // 3. Actualizar estatus transferencia
            await supabase.from('transferencias_stock')
                .update({ estatus: 'Completado', fecha_resolucion: new Date().toISOString() })
                .eq('id', transfer.id);

            addNotification({ type: 'success', title: 'Transferencia Completada', message: 'El stock ha sido movido exitosamente.' });
            fetchData();
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'Error procesando la transferencia.' });
        }
    };

    const handleRejectTransfer = async (id: string) => {
        try {
            await supabase.from('transferencias_stock')
                .update({ estatus: 'Rechazado', fecha_resolucion: new Date().toISOString() })
                .eq('id', id);
            addNotification({ type: 'info', title: 'Transferencia Rechazada', message: 'Se ha cancelado el movimiento.' });
            fetchData();
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'Error al rechazar.' });
        }
    };

    const getProjectName = (id: string) => proyectos.find(p => p.id === id)?.nombre || 'Sede Desconocida';
    const getProductName = (id: string) => productos.find(p => p.id === id)?.nombreDelProducto || 'Producto';

    const filteredInventory = useMemo(() => {
        return inventory.filter(inv => {
            const prodName = getProductName(inv.productoId).toLowerCase();
            const projName = getProjectName(inv.proyectoId).toLowerCase();
            const matchesSearch = prodName.includes(searchQuery.toLowerCase()) || projName.includes(searchQuery.toLowerCase());
            const matchesProject = filterProject ? inv.proyectoId === filterProject : true;
            return matchesSearch && matchesProject;
        });
    }, [inventory, searchQuery, filterProject, productos, proyectos]);

    const filteredTransfers = useMemo(() => {
        return transfers.filter(t => t.estatus === 'Pendiente');
    }, [transfers]);

    return (
        <div className="animate-fade-in space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Ecosistema de Stock</h2>
                    <p className="text-sm text-text-secondary">Balance real de productos por proyecto y transferencias internas.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button 
                        onClick={() => setIsTransferModalOpen(true)}
                        className="flex-1 md:flex-none bg-secondary text-primary border border-primary/20 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white transition-all shadow-sm"
                    >
                        <SwitchHorizontalIcon className="w-5 h-5" />
                        Transferencia
                    </button>
                    <button 
                        onClick={() => setIsStockModalOpen(true)}
                        className="flex-1 md:flex-none bg-primary text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary-focus transition-all shadow-md active:scale-95"
                    >
                        <BoxIcon className="w-5 h-5" />
                        Cargar Cosecha
                    </button>
                </div>
            </div>

            {/* BARRA DE HERRAMIENTAS / FILTROS */}
            <div className="bg-surface p-3 rounded-xl border border-border flex flex-col md:flex-row gap-4 items-center shadow-sm">
                <div className="relative flex-1 w-full">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input 
                        type="text" 
                        placeholder="Buscar por producto o sede..." 
                        className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <FilterIcon className="w-4 h-4 text-text-muted shrink-0" />
                    <select 
                        className="flex-1 md:w-48 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        value={filterProject}
                        onChange={e => setFilterProject(e.target.value)}
                    >
                        <option value="">Todas las Sedes</option>
                        {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LISTA DE INVENTARIO */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-xs font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                        <BoxIcon className="w-4 h-4" />
                        Balance de Existencias Actual
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {loading ? (
                            <div className="col-span-2 py-20 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                        ) : filteredInventory.length === 0 ? (
                            <div className="col-span-2 p-12 bg-surface rounded-xl border border-dashed border-border text-center text-text-muted italic">
                                No se encontraron registros con los filtros actuales.
                            </div>
                        ) : filteredInventory.map((inv) => (
                            <Card key={inv.id} className="relative overflow-hidden group border-l-4 border-l-primary">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider">{getProjectName(inv.proyectoId)}</p>
                                        <h4 className="text-lg font-black text-text-primary mt-1">{getProductName(inv.productoId)}</h4>
                                    </div>
                                    <div className={`p-2 rounded-lg ${inv.stockDisponible < 50 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                                        <BoxIcon className="w-5 h-5" />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-end justify-between">
                                    <div>
                                        <span className="text-3xl font-black text-text-primary leading-none">{inv.stockDisponible}</span>
                                        <span className="text-xs text-text-muted ml-1 font-bold uppercase">cajas</span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-text-muted font-bold uppercase">Reservado</p>
                                        <p className="text-sm font-bold text-amber-500">{inv.stockReservado || 0} cjs</p>
                                    </div>
                                </div>
                                <div className="absolute bottom-0 left-0 h-1 bg-primary/10 w-full">
                                    <div className="bg-primary h-full transition-all duration-1000" style={{ width: `${Math.min(100, (inv.stockDisponible / 1000) * 100)}%` }}></div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* TRANSFERENCIAS RECIENTES */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                            <SwitchHorizontalIcon className="w-4 h-4" />
                            Transferencias Pendientes
                        </h3>
                        <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">
                            {filteredTransfers.length}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {loading ? (
                             <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>
                        ) : filteredTransfers.length === 0 ? (
                            <div className="p-8 bg-surface rounded-xl border border-border text-center text-xs text-text-muted border-dashed italic">
                                Sin movimientos pendientes de aprobación.
                            </div>
                        ) : filteredTransfers.map((trans) => (
                            <div key={trans.id} className="bg-white p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                <div className="flex justify-between items-start mb-2 pl-2">
                                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
                                        Pendiente
                                    </span>
                                    <span className="text-[10px] text-text-muted">{new Date(trans.fechaSolicitud).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-3 text-xs mb-3 pl-2">
                                    <div className="font-bold text-text-primary truncate w-24 text-right">{getProjectName(trans.proyectoOrigenId)}</div>
                                    <SwitchHorizontalIcon className="w-3 h-3 text-text-muted shrink-0" />
                                    <div className="font-bold text-primary truncate w-24">{getProjectName(trans.proyectoDestinoId)}</div>
                                </div>
                                <div className="mt-3 flex justify-between items-center pt-3 border-t border-border/30 pl-2">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-text-muted font-bold uppercase">Producto</span>
                                        <span className="text-xs font-bold">{getProductName(trans.productoId)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-black text-primary">{trans.cantidad} cjs</span>
                                    </div>
                                </div>
                                <div className="mt-4 flex gap-2 pl-2">
                                    <button 
                                        onClick={() => handleRejectTransfer(trans.id)}
                                        className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg hover:bg-danger/5 hover:text-danger transition-colors"
                                    >
                                        Rechazar
                                    </button>
                                    <button 
                                        onClick={() => handleAcceptTransfer(trans)}
                                        className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest bg-success text-white rounded-lg hover:bg-green-700 shadow-sm transition-colors"
                                    >
                                        Aceptar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Botón para ver historial de transferencias */}
                    <button className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-primary transition-colors">
                        Ver Historial Completo &rarr;
                    </button>
                </div>
            </div>

            {isStockModalOpen && (
                <InventoryForm proyectos={proyectos} productos={productos} onClose={() => setIsStockModalOpen(false)} onSave={fetchData} />
            )}
            {isTransferModalOpen && (
                <TransferForm proyectos={proyectos} productos={productos} onClose={() => setIsTransferModalOpen(false)} onSave={fetchData} />
            )}
        </div>
    );
};

// Componente Interno para Carga de Cosecha
const InventoryForm = ({ proyectos, productos, onClose, onSave }: any) => {
    const [form, setForm] = useState({ proyecto_id: '', producto_id: '', cantidad: 0 });
    const { addNotification } = useNotification();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { data: current } = await supabase.from('inventario_proyectos').select('*').eq('proyecto_id', form.proyecto_id).eq('producto_id', form.producto_id).maybeSingle();
            
            if (current) {
                await supabase.from('inventario_proyectos').update({ stock_disponible: current.stock_disponible + form.cantidad, ultima_actualizacion: new Date().toISOString() }).eq('id', current.id);
            } else {
                await supabase.from('inventario_proyectos').insert({ proyecto_id: form.proyecto_id, producto_id: form.producto_id, stock_disponible: form.cantidad });
            }
            addNotification({ type: 'success', title: 'Stock Actualizado', message: 'Ingreso de cosecha registrado.' });
            onSave();
            onClose();
        } catch (e) { addNotification({ type: 'danger', title: 'Error', message: 'Fallo al actualizar stock.' }); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in overflow-hidden">
            <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-border flex flex-col max-h-[90vh]">
                <div className="bg-primary p-5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-lg text-white">
                            <BoxIcon className="w-5 h-5" />
                        </div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Carga de Cosecha</h3>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Sede / Origen</label>
                            <select 
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" 
                                value={form.proyecto_id} 
                                onChange={e => setForm({...form, proyecto_id: e.target.value})} 
                                required
                            >
                                <option value="">Seleccione Sede...</option>
                                {proyectos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Producto</label>
                            <select 
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" 
                                value={form.producto_id} 
                                onChange={e => setForm({...form, producto_id: e.target.value})} 
                                required
                            >
                                <option value="">Seleccione Producto...</option>
                                {productos.map((p: any) => <option key={p.id} value={p.id}>{p.nombreDelProducto}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Cajas Cosechadas</label>
                            <input 
                                type="number" 
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-black text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                                value={form.cantidad} 
                                onChange={e => setForm({...form, cantidad: parseInt(e.target.value) || 0})} 
                                required 
                            />
                            <p className="text-[10px] text-text-muted mt-2 italic">Este valor se sumará al stock disponible del proyecto seleccionado.</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-4 pt-4 shrink-0">
                        <button type="button" onClick={onClose} className="flex-1 py-3.5 border border-border rounded-xl text-sm font-bold text-text-secondary hover:bg-hover transition-all">Cancelar</button>
                        <button type="submit" className="flex-1 py-3.5 bg-primary text-white rounded-xl text-sm font-bold shadow-lg hover:bg-primary-focus transition-all active:scale-95">Registrar Entrada</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Componente Interno para Transferencias (CON VALIDACIÓN DE STOCK REALTIME)
const TransferForm = ({ proyectos, productos, onClose, onSave }: any) => {
    const [form, setForm] = useState({ origen: '', destino: '', producto: '', cantidad: 0, consolidado: '' });
    const [lotes, setLotes] = useState<any[]>([]);
    const [availableStock, setAvailableStock] = useState<number | null>(null);
    const [checkingStock, setCheckingStock] = useState(false);
    const { addNotification } = useNotification();

    useEffect(() => {
        supabase.from('lider_programacion_usa_reports').select('*').eq('usa_logistics_status', 'Programado').then(res => setLotes(res.data || []));
    }, []);

    // Efecto para verificar stock disponible en tiempo real
    useEffect(() => {
        if (form.origen && form.producto) {
            setCheckingStock(true);
            supabase.from('inventario_proyectos')
                .select('stock_disponible')
                .eq('proyecto_id', form.origen)
                .eq('producto_id', form.producto)
                .maybeSingle()
                .then(({ data }) => {
                    setAvailableStock(data ? data.stock_disponible : 0);
                    setCheckingStock(false);
                });
        } else {
            setAvailableStock(null);
        }
    }, [form.origen, form.producto]);

    const isOverLimit = availableStock !== null && form.cantidad > availableStock;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isOverLimit) {
            addNotification({ type: 'danger', title: 'Fondos Insuficientes', message: 'La cantidad solicitada supera el stock disponible en origen.' });
            return;
        }

        try {
            await supabase.from('transferencias_stock').insert({
                proyecto_origen_id: form.origen,
                proyecto_destino_id: form.destino,
                producto_id: form.producto,
                cantidad: form.cantidad,
                lote_vinculado_id: form.consolidado || null,
                estatus: 'Pendiente'
            });
            addNotification({ type: 'success', title: 'Solicitud Enviada', message: 'Transferencia registrada en el sistema.' });
            onSave();
            onClose();
        } catch (e) { addNotification({ type: 'danger', title: 'Error', message: 'Error al solicitar transferencia.' }); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in overflow-hidden">
            <div className="bg-surface rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-border flex flex-col max-h-[90vh]">
                <div className="bg-primary p-5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-lg text-white">
                            <SwitchHorizontalIcon className="w-5 h-5" />
                        </div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Solicitud de Transferencia</h3>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Sede Origen</label>
                            <select 
                                className={`w-full bg-background border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none ${availableStock !== null ? 'border-primary/20 bg-primary/5' : 'border-border'}`} 
                                value={form.origen} 
                                onChange={e => setForm({...form, origen: e.target.value})} 
                                required
                            >
                                <option value="">Sede Origen...</option>
                                {proyectos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Sede Destino</label>
                            <select 
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" 
                                value={form.destino} 
                                onChange={e => setForm({...form, destino: e.target.value})} 
                                required
                            >
                                <option value="">Sede Destino...</option>
                                {proyectos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Producto Solicitado</label>
                        <select 
                            className={`w-full bg-background border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none ${availableStock !== null ? 'border-primary/20 bg-primary/5' : 'border-border'}`} 
                            value={form.producto} 
                            onChange={e => setForm({...form, producto: e.target.value})} 
                            required
                        >
                            <option value="">Seleccione Producto...</option>
                            {productos.map((p: any) => <option key={p.id} value={p.id}>{p.nombreDelProducto}</option>)}
                        </select>
                        
                        {/* VALIDACIÓN DE STOCK EN TIEMPO REAL */}
                        {checkingStock && <p className="text-[10px] text-primary animate-pulse mt-1">Consultando existencias...</p>}
                        {availableStock !== null && !checkingStock && (
                            <div className={`mt-2 p-2 rounded-lg text-xs font-bold flex justify-between items-center ${availableStock > 0 ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
                                <span>Existencias en sede de origen:</span>
                                <span>{availableStock} cajas</span>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 block">Cantidad de Cajas</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                className={`w-full bg-background border rounded-xl px-4 py-3 text-lg font-black focus:ring-2 focus:ring-primary/20 outline-none transition-all ${isOverLimit ? 'border-danger text-danger' : 'border-border text-primary'}`} 
                                value={form.cantidad} 
                                onChange={e => setForm({...form, cantidad: parseInt(e.target.value) || 0})} 
                                required 
                            />
                            {isOverLimit && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-danger flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    <span className="text-[10px] font-black uppercase tracking-tighter">Excede Límite</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10 shadow-inner">
                         <div className="flex items-center gap-2 mb-3">
                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <label className="text-[10px] font-black uppercase text-primary tracking-widest block">Vincular a Logística Existente</label>
                         </div>
                         <select 
                            className="w-full bg-white border border-primary/20 rounded-xl px-4 py-3 text-xs font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" 
                            value={form.consolidado} 
                            onChange={e => setForm({...form, consolidado: e.target.value})}
                        >
                            <option value="">No consolidar (Movimiento Independiente)</option>
                            {lotes.map((l: any) => <option key={l.id} value={l.id}>{l.lote_id} - {l.proyecto}</option>)}
                        </select>
                        <p className="text-[10px] text-text-muted mt-2 italic">Ahorre costos de flete vinculando este movimiento a una carga programada.</p>
                    </div>

                    <div className="flex gap-4 pt-4 shrink-0">
                        <button type="button" onClick={onClose} className="flex-1 py-3.5 border border-border rounded-xl text-sm font-bold text-text-secondary hover:bg-hover transition-all">Cancelar</button>
                        <button 
                            type="submit" 
                            disabled={isOverLimit || checkingStock}
                            className={`flex-1 py-3.5 rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 text-white ${isOverLimit ? 'bg-text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-focus'}`}
                        >
                            Solicitar Stock
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default InventoryPage;
