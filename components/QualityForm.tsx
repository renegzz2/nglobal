import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Productor, Huerta } from '../types';

interface ProductoBD {
    id: string;
    nombre: string;
    categoria: string;
}

interface DanoBD {
    id: string;
    categoria: string;
    key_dano: string;
    label: string;
    grado: 'MENOR' | 'MAYOR' | 'CRITICO';
}

export const QualityForm: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
    const [loadingData, setLoadingData] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Listas dinámicas desde Supabase
    const [productos, setProductos] = useState<ProductoBD[]>([]);
    const [catalogoDanos, setCatalogoDanos] = useState<DanoBD[]>([]);
    const [productores, setProductores] = useState<Productor[]>([]);
    const [huertas, setHuertas] = useState<Huerta[]>([]);

    // Estados del formulario
    const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string>('');
    const [tipoInspeccion, setTipoInspeccion] = useState<'ORIGEN' | 'PT'>('ORIGEN');
    const [productorId, setProductorId] = useState('');
    const [huertaId, setHuertaId] = useState('');
    const [tamanoMuestra, setTamanoMuestra] = useState<number>(100);
    const [estatus, setEstatus] = useState('LIBERADO');
    const [observaciones, setObservaciones] = useState('');

    const [pesosDanos, setPesosDanos] = useState<Record<string, number>>({});

    // Cargar Catálogos desde Supabase al iniciar
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const [resProd, resDanos, resProductores] = await Promise.all([
                    supabase.from('productos').select('*').eq('condicion', true).order('nombre'),
                    supabase.from('catalogo_danos').select('*').eq('condicion', true),
                    supabase.from('productores').select('*').eq('condicion', true).order('nombre_productor')
                ]);

                if (resProd.data) setProductos(resProd.data);
                if (resDanos.data) setCatalogoDanos(resDanos.data);
                if (resProductores.data) setProductores(resProductores.data);

                // Seleccionar el primer producto por defecto si existe
                if (resProd.data && resProd.data.length > 0) {
                    setProductoSeleccionadoId(resProd.data[0].id);
                }
            } catch (err) {
                console.error("Error al cargar datos iniciales:", err);
            } finally {
                setLoadingData(false);
            }
        };

        fetchCatalogos();
    }, []);

    // Cargar Huertas cuando cambia el Productor
    useEffect(() => {
        if (!productorId) {
            setHuertas([]);
            setHuertaId('');
            return;
        }

        const fetchHuertas = async () => {
            const { data } = await supabase
                .from('huertas')
                .select('*')
                .eq('productor_id', productorId)
                .eq('condicion', true)
                .order('nombre_huerta');

            if (data) setHuertas(data);
        };
        fetchHuertas();
    }, [productorId]);

    // Identificar el objeto del producto actual y sus daños filtrados
    const productoActual = useMemo(() => {
        return productos.find(p => p.id === productoSeleccionadoId);
    }, [productos, productoSeleccionadoId]);

    const danosFiltrados = useMemo(() => {
        if (!productoActual) return [];
        return catalogoDanos.filter(d => d.categoria === productoActual.categoria);
    }, [catalogoDanos, productoActual]);

    // Al cambiar de producto, se reinicia la captura de daños
    const handleProductoChange = (id: string) => {
        setProductoSeleccionadoId(id);
        setPesosDanos({});
    };

    const handleDanoChange = (key: string, valor: string) => {
        const numVal = Math.max(0, parseFloat(valor) || 0);
        setPesosDanos(prev => ({ ...prev, [key]: numVal }));
    };

    // Cálculos dinámicos
    const { detallesDanosJSON, totalPorcentajeDano, calidadScore } = useMemo(() => {
        const detalles: Record<string, { peso: number; porcentaje: number }> = {};
        let sumaPorcentajes = 0;
        const baseMuestra = tamanoMuestra > 0 ? tamanoMuestra : 1;

        danosFiltrados.forEach(dano => {
            const peso = pesosDanos[dano.key_dano] || 0;
            const porcentaje = Number(((peso / baseMuestra) * 100).toFixed(2));

            if (peso > 0) {
                detalles[dano.key_dano] = { peso, porcentaje };
            }
            sumaPorcentajes += porcentaje;
        });

        const scoreCalculado = Math.max(0, Number((100 - sumaPorcentajes).toFixed(2)));

        return {
            detallesDanosJSON: detalles,
            totalPorcentajeDano: Number(sumaPorcentajes.toFixed(2)),
            calidadScore: scoreCalculado
        };
    }, [pesosDanos, tamanoMuestra, danosFiltrados]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!productorId || !huertaId || !productoActual) {
            alert('Por favor completa los campos obligatorios.');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                tipo_inspeccion: tipoInspeccion,
                producto: productoActual.nombre,
                productor_id: productorId,
                huerta_id: huertaId,
                tamano_muestra: tamanoMuestra,
                detalles_danos: detallesDanosJSON,
                calidad_score: calidadScore,
                estatus,
                observaciones
            };

            const { error } = await supabase.from('inspecciones').insert([payload]);
            if (error) throw error;

            alert('Inspección guardada correctamente');
            if (onSuccess) onSuccess();

            setPesosDanos({});
            setObservaciones('');
        } catch (err: any) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingData) return <div className="p-8 text-center text-slate-500">Cargando módulos...</div>;

    return (
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">Registro de Inspección Dinámico</h2>
                    <p className="text-xs text-slate-500">Categoría activa: <span className="font-bold text-blue-600">{productoActual?.categoria || 'N/A'}</span></p>
                </div>
                <div className="text-right">
                    <span className="text-xs text-slate-500 block">Calidad:</span>
                    <span className="text-2xl font-black text-slate-800">{calidadScore}%</span>
                </div>
            </div>

            {/* Selector de Producto Dinámico */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Producto *</label>
                    <select 
                        value={productoSeleccionadoId} 
                        onChange={(e) => handleProductoChange(e.target.value)}
                        className="w-full bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-sm font-bold text-blue-900"
                    >
                        {productos.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.nombre} ({p.categoria})
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tipo Inspección</label>
                    <select value={tipoInspeccion} onChange={(e) => setTipoInspeccion(e.target.value as any)} className="w-full border rounded-lg p-2.5 text-sm">
                        <option value="ORIGEN">ORIGEN</option>
                        <option value="PT">PRODUCTO TERMINADO</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Productor *</label>
                    <select value={productorId} onChange={(e) => setProductorId(e.target.value)} required className="w-full border rounded-lg p-2.5 text-sm">
                        <option value="">-- Seleccionar --</option>
                        {productores.map(p => <option key={p.id} value={p.id}>{p.nombre_productor}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Huerta *</label>
                    <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)} disabled={!productorId} required className="w-full border rounded-lg p-2.5 text-sm">
                        <option value="">-- Seleccionar --</option>
                        {huertas.map(h => <option key={h.id} value={h.id}>{h.nombre_huerta}</option>)}
                    </select>
                </div>
            </div>

            {/* Muestra */}
            <div className="bg-slate-50 p-4 rounded-xl border flex justify-between items-center">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tamaño Muestra</label>
                    <input type="number" min="1" value={tamanoMuestra} onChange={(e) => setTamanoMuestra(parseFloat(e.target.value) || 1)} className="border p-2 rounded-lg text-sm font-bold" />
                </div>
                <div className="text-right">
                    <span className="text-xs text-slate-500 block">% Total Daño:</span>
                    <span className="text-xl font-black text-rose-600">{totalPorcentajeDano}%</span>
                </div>
            </div>

            {/* Captura de Daños dinámicos por severidad */}
            <div className="space-y-4">
                {(['MENOR', 'MAYOR', 'CRITICO'] as const).map(grado => {
                    const deGrado = danosFiltrados.filter(d => d.grado === grado);
                    if (deGrado.length === 0) return null;

                    return (
                        <div key={grado} className="border rounded-xl overflow-hidden">
                            <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 uppercase">{grado}S ({deGrado.length})</div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                {deGrado.map(dano => (
                                    <div key={dano.key_dano} className="p-2 border rounded-lg flex justify-between items-center">
                                        <label className="text-xs font-semibold text-slate-700">{dano.label}</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            placeholder="0"
                                            value={pesosDanos[dano.key_dano] ?? ''} 
                                            onChange={(e) => handleDanoChange(dano.key_dano, e.target.value)} 
                                            className="w-20 border text-right p-1 text-sm rounded"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white font-bold p-3 rounded-xl">
                {submitting ? 'Guardando...' : 'Guardar Inspección'}
            </button>
        </form>
    );
};