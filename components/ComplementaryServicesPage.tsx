import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import DataTable, { Column } from './ui/DataTable';
import { PlusIcon, DocumentIcon, XIcon, BoxIcon } from './icons';
import { useNotification } from './NotificationProvider';

const ComplementaryServicesPage: React.FC = () => {
    const [services, setServices] = useState<any[]>([]);
    const [candidateTrips, setCandidateTrips] = useState<any[]>([]);
    const [productosCatalogo, setProductosCatalogo] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { addNotification } = useNotification();

    const [formData, setFormData] = useState({
        tripId: '',
        proveedor: '',
        concepto: '',
        monto: '',
        folioFactura: '',
        uuid: '',
        estatusPago: 'Pendiente'
    });

    const [isConsolidated, setIsConsolidated] = useState(false);
    const [desglose, setDesglose] = useState<{ id: string, descripcion: string, monto: string }[]>([
        { id: Date.now().toString(), descripcion: '', monto: '' }
    ]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Cargar servicios ya registrados
            const { data: servs, error: errServs } = await supabase
                .from('usa_servicios_complementarios')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (errServs) console.error("Error servicios:", errServs);
            setServices(servs || []);

            // Cargar viajes marcados (sin ordenar por created_at para evitar fallos de esquema)
            const { data: trips, error: errTrips } = await supabase
                .from('usa_shipment_reports')
                .select('*')
                .eq('requires_comp_services', true);
                
            if (errTrips) console.error("Error viajes candidatos:", errTrips);
            setCandidateTrips(trips || []);

            // Cargar catálogo de productos
            const { data: prods } = await supabase.from('usa_productos').select('id, nombre_del_producto');
            setProductosCatalogo(prods || []);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const totalDesglose = useMemo(() => {
        return desglose.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
    }, [desglose]);

    // Función inteligente que autocompleta al seleccionar un viaje
    const handleTripSelect = (selectedTripId: string) => {
        setFormData({ ...formData, tripId: selectedTripId });
        
        const trip = candidateTrips.find(t => t.trip_id === selectedTripId);
        if (trip) {
            const isConsolid = (trip.client_ids || trip.clientIds)?.length > 1;
            setIsConsolidated(isConsolid);

            if (trip.products && trip.products.length > 0) {
                const autoDesglose = trip.products.map((p: any) => {
                    const prodId = p.productId || p.product_id;
                    const spec = productosCatalogo.find(c => c.id === prodId);
                    const prodName = spec ? spec.nombre_del_producto : (p.manualProductName || 'Producto');
                    const desc = `${prodName} - Lote: ${p.sourceLotId || p.mid || 'S/D'} - ${p.realQty || p.quantity || 0} CJS`;
                    
                    return { id: Math.random().toString(), descripcion: desc, monto: '' };
                });
                setDesglose(autoDesglose);
            } else {
                setDesglose([{ id: Date.now().toString(), descripcion: '', monto: '' }]);
            }
        }
    };

    const handleAddDesgloseRow = () => setDesglose([...desglose, { id: Date.now().toString(), descripcion: '', monto: '' }]);
    const handleRemoveDesgloseRow = (id: string) => setDesglose(desglose.filter(d => d.id !== id));
    const handleUpdateDesglose = (id: string, field: string, value: string) => setDesglose(desglose.map(d => d.id === id ? { ...d, [field]: value } : d));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isConsolidated && Math.abs(totalDesglose - Number(formData.monto)) > 0.01) {
            addNotification({ type: 'warning', title: 'Diferencia en Montos', message: 'La suma del desglose no coincide con el total de la factura.' });
            return;
        }

        try {
            const cleanDesglose = isConsolidated 
                ? desglose.map(d => ({ descripcion: d.descripcion.toUpperCase(), monto: Number(d.monto) })).filter(d => d.descripcion && d.monto > 0)
                : null;

            const dataToInsert = {
                trip_id: formData.tripId.toUpperCase(),
                proveedor: formData.proveedor.toUpperCase(),
                concepto: formData.concepto,
                monto: Number(formData.monto),
                folio_factura: formData.folioFactura.toUpperCase(),
                uuid: formData.uuid,
                estatus_pago: formData.estatusPago,
                responsable_pago: 'NGLOBAL',
                is_consolidated: isConsolidated,
                desglose: cleanDesglose
            };

            const { error } = await supabase.from('usa_servicios_complementarios').insert([dataToInsert]);
            if (error) throw error;

            addNotification({ type: 'success', title: 'Servicio Registrado', message: 'Factura complementaria guardada exitosamente.' });
            setIsModalOpen(false);
            resetForm();
            fetchData();
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo guardar el servicio.' });
        }
    };

    const resetForm = () => {
        setFormData({ tripId: '', proveedor: '', concepto: '', monto: '', folioFactura: '', uuid: '', estatusPago: 'Pendiente' });
        setIsConsolidated(false);
        setDesglose([{ id: Date.now().toString(), descripcion: '', monto: '' }]);
    };

    const columns: Column<any>[] = [
        { header: "REMISIÓN", accessor: (r) => <span className="font-black text-primary uppercase">{r.trip_id}</span> },
        { header: "PROVEEDOR", accessor: (r) => <span className="text-xs font-bold text-text-primary uppercase">{r.proveedor}</span> },
        { header: "CONCEPTO", accessor: (r) => (
            <div className="flex flex-col">
                <span className="text-[10px] text-text-muted font-bold truncate max-w-[200px]" title={r.concepto}>{r.concepto}</span>
                {r.is_consolidated && <span className="text-[8px] font-black text-blue-600 uppercase">Viaje Consolidado ({r.desglose?.length || 0} Partidas)</span>}
            </div>
        )},
        { header: "FACTURA", accessor: (r) => (
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-primary uppercase">{r.folio_factura}</span>
                <span className="text-[8px] font-mono text-text-muted truncate max-w-[120px]">{r.uuid}</span>
            </div>
        )},
        { header: "TOTAL", accessor: (r) => <span className="font-black text-emerald-600 text-xs">${Number(r.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> },
        { header: "RESPONSABLE", accessor: () => <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-2 py-1 rounded">NGLOBAL</span> },
        { header: "ESTATUS", accessor: (r) => (
            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${r.estatus_pago === 'Pagado' ? 'bg-success text-white' : 'bg-amber-400 text-white'}`}>
                {r.estatus_pago}
            </span>
        )}
    ];

    const inputClass = "w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all";
    const labelClass = "text-[10px] font-black text-text-muted uppercase tracking-widest mb-1 block";

    return (
        <div className="animate-fade-in space-y-6 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-primary uppercase tracking-tighter">SERVICIOS COMPLEMENTARIOS</h1>
                    <p className="text-sm text-text-secondary font-bold uppercase tracking-widest opacity-60 italic">Maniobras, resguardos y costos extra</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg hover:bg-primary-focus">
                    <PlusIcon className="w-4 h-4" /> Capturar Factura
                </button>
            </div>

            <div className="bg-surface rounded-3xl border border-border overflow-hidden shadow-2xl">
                <DataTable data={services} columns={columns} pageSize={20} isLoading={loading} emptyMessage="No hay servicios registrados." />
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-surface rounded-3xl shadow-2xl max-w-3xl w-full border border-border overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                        <div className="p-6 bg-primary text-white flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><BoxIcon className="w-5 h-5"/> Capturar Servicio</h3>
                            <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-6 h-6" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>ID de Viaje (Remisión Autorizada)</label>
                                    <select 
                                        required 
                                        className={inputClass} 
                                        value={formData.tripId} 
                                        onChange={(e) => handleTripSelect(e.target.value)}
                                    >
                                        <option value="">-- Seleccionar Viaje --</option>
                                        {candidateTrips.map(trip => {
                                            const tripName = trip.trip_id || trip.tripId || `SIN-FOLIO-${trip.id.substring(0, 5)}`;
                                            return (
                                                <option key={trip.id} value={tripName}>
                                                    {tripName}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Total de la Factura (MXN/USD)</label>
                                    <input required type="number" step="0.01" className={inputClass} placeholder="Ej. 5046.00" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} />
                                </div>
                            </div>
                            
                            <div><label className={labelClass}>Proveedor / Razón Social</label><input required type="text" className={inputClass} placeholder="Ej. INMOBILIARIA JUGAS S.A. DE C.V." value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})} /></div>
                            <div><label className={labelClass}>Concepto Operativo</label><textarea required className={`${inputClass} h-20 text-xs`} placeholder="Ej. SERVICIOS DE BODEGA MANIOBRA..." value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} /></div>

                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={labelClass}>Folio de Factura</label><input required type="text" className={inputClass} placeholder="Ej. MB-8864" value={formData.folioFactura} onChange={e => setFormData({...formData, folioFactura: e.target.value})} /></div>
                                <div><label className={labelClass}>UUID Fiscal</label><input required type="text" className={`${inputClass} font-mono text-[10px]`} placeholder="AD366F28-..." value={formData.uuid} onChange={e => setFormData({...formData, uuid: e.target.value})} /></div>
                            </div>

                            <div className="pt-4 border-t border-border">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={isConsolidated} onChange={(e) => setIsConsolidated(e.target.checked)} className="w-5 h-5 rounded text-primary focus:ring-primary" />
                                        <span className="text-xs font-black uppercase text-primary">Es un Viaje Consolidado (Requiere Desglose)</span>
                                    </label>
                                </div>

                                {isConsolidated && (
                                    <div className="bg-gray-50 p-4 rounded-2xl border border-border animate-fade-in">
                                        <div className="flex justify-between items-center mb-3">
                                            <h5 className="text-[10px] font-black text-text-muted uppercase tracking-widest">Partidas Internas Autocompletadas</h5>
                                            <div className="text-right">
                                                <span className="block text-[8px] font-bold text-text-muted uppercase">Suma del Desglose</span>
                                                <span className={`text-sm font-black ${Math.abs(totalDesglose - Number(formData.monto)) < 0.01 ? 'text-emerald-600' : 'text-danger'}`}>
                                                    ${totalDesglose.toLocaleString('en-US', { minimumFractionDigits: 2 })} / ${Number(formData.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {desglose.map((item) => (
                                                <div key={item.id} className="flex items-center gap-2">
                                                    <input type="text" required className={`${inputClass} flex-1 text-[11px]`} placeholder="Cliente / Lote / Producto" value={item.descripcion} onChange={(e) => handleUpdateDesglose(item.id, 'descripcion', e.target.value)} />
                                                    <div className="relative w-32">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-xs">$</span>
                                                        <input type="number" step="0.01" required className={`${inputClass} pl-6 text-xs`} placeholder="0.00" value={item.monto} onChange={(e) => handleUpdateDesglose(item.id, 'monto', e.target.value)} />
                                                    </div>
                                                    <button type="button" onClick={() => handleRemoveDesgloseRow(item.id)} disabled={desglose.length === 1} className="p-2 text-text-muted hover:text-danger hover:bg-red-50 rounded-xl transition-all disabled:opacity-50">
                                                        <XIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={handleAddDesgloseRow} className="mt-3 flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest hover:text-primary-focus">
                                            <PlusIcon className="w-3 h-3" /> Agregar Partida Extra
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-border mt-4">
                                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-6 py-3 rounded-xl font-bold text-xs text-text-secondary hover:bg-hover">Cancelar</button>
                                <button type="submit" className="bg-primary text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-primary-focus">Guardar Registro</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComplementaryServicesPage;