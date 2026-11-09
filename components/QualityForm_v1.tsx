import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Interfaces adaptadas a tu base de datos
interface ProductoBD {
    id: string;
    nombre: string;
    categoria: string;
    alias_usa: string | null;
    config_usa: string | null;
}

interface DanoBD {
    id: string;
    categoria: string;
    key_dano: string;
    label: string;
    grado: 'MENOR' | 'MAYOR' | 'CRITICO';
}

interface ProductorBD {
    id: string;
    nombre_productor: string;
}

interface HuertaBD {
    id: string;
    nombre_huerta: string;
    mid?: string;
}

export const QualityForm: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
    const [loadingData, setLoadingData] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Listas dinámicas desde Supabase
    const [productos, setProductos] = useState<ProductoBD[]>([]);
    const [catalogoDanos, setCatalogoDanos] = useState<DanoBD[]>([]);
    const [productores, setProductores] = useState<ProductorBD[]>([]);
    const [huertas, setHuertas] = useState<HuertaBD[]>([]);

    // Estados Generales Compartidos
    const [tipoInspeccion, setTipoInspeccion] = useState<'ORIGEN' | 'PT'>('ORIGEN');
    const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string>('');
    const [productorId, setProductorId] = useState('');
    const [zona, setZona] = useState('');
    const [inspector, setInspector] = useState('');
    const [campoMallas, setCampoMallas] = useState('');
    const [tamanoMuestra, setTamanoMuestra] = useState<number>(100);
    const [estatus, setEstatus] = useState('LIBERADO');
    const [observaciones, setObservaciones] = useState('');
    const [fotos, setFotos] = useState<FileList | null>(null);
    const [pesosDanos, setPesosDanos] = useState<Record<string, number>>({});

    // Estados exclusivos de ORIGEN
    const [huertaId, setHuertaId] = useState('');
    const [loteOrigen, setLoteOrigen] = useState('');
    const [pesoNeto, setPesoNeto] = useState<number | ''>('');

    // Estados exclusivos de PT
    const [maquina, setMaquina] = useState('');
    const [fechaCosecha, setFechaCosecha] = useState('');
    const [loteProduccion, setLoteProduccion] = useState('');
    const [pesoMuestraConCaja, setPesoMuestraConCaja] = useState<number | ''>('');
    const [pesoCaja, setPesoCaja] = useState<number | ''>('');
    const [destino, setDestino] = useState('');
    const [numeroTarima, setNumeroTarima] = useState('');
    const [tarimaReprocesada, setTarimaReprocesada] = useState('');
    const [tarimaRemuestreada, setTarimaRemuestreada] = useState('');
    const [etiquetaAzul, setEtiquetaAzul] = useState('');
    const [pesoBascula, setPesoBascula] = useState<number | ''>('');

    // Cálculo automático del peso sin caja (Para PT)
    const pesoCajaSinCaja = useMemo(() => {
        if (pesoMuestraConCaja !== '' && pesoCaja !== '') {
            return Number((pesoMuestraConCaja - pesoCaja).toFixed(2));
        }
        return '';
    }, [pesoMuestraConCaja, pesoCaja]);

    // Cargar Catálogos desde Supabase al iniciar
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const [resProd, resDanos, resProductores] = await Promise.all([
                    supabase.from('usa_productos').select('id, nombre_del_producto, categoria, alias_usa, config_usa').eq('activo', true).order('nombre_del_producto'),
                    supabase.from('usa_catalogo_danos').select('*').eq('condicion', true),
                    supabase.from('usa_productores').select('*').eq('condicion', true).order('nombre_productor')
                ]);

                if (resProd.data) {
                    const mappedProds = resProd.data.map(p => ({
                        id: p.id,
                        nombre: p.nombre_del_producto,
                        categoria: p.categoria,
                        alias_usa: p.alias_usa,
                        config_usa: p.config_usa
                    }));
                    setProductos(mappedProds);
                }
                
                if (resDanos.data) setCatalogoDanos(resDanos.data);
                if (resProductores.data) setProductores(resProductores.data);

            } catch (err) {
                console.error("Error al cargar datos iniciales:", err);
            } finally {
                setLoadingData(false);
            }
        };

        fetchCatalogos();
    }, []);

    // Filtro dinámico de Productos según Tipo de Inspección
    const productosOptions = useMemo(() => {
        if (tipoInspeccion === 'ORIGEN') {
            const unicos: (ProductoBD & { displayLabel: string })[] = [];
            const nombresVistos = new Set<string>();
            for (const p of productos) {
                if (!nombresVistos.has(p.nombre)) {
                    nombresVistos.add(p.nombre);
                    unicos.push({ ...p, displayLabel: `${p.nombre} (${p.categoria})` });
                }
            }
            return unicos;
        } else {
            return productos.map(p => {
                const alias = p.alias_usa ? ` | Calidad: ${p.alias_usa}` : '';
                const config = p.config_usa ? ` | Config: ${p.config_usa}` : '';
                return {
                    ...p,
                    displayLabel: `${p.nombre}${alias}${config}`
                };
            });
        }
    }, [productos, tipoInspeccion]);

    // Autoseleccionar el primer producto al cambiar el filtro
    useEffect(() => {
        if (productosOptions.length > 0) {
            setProductoSeleccionadoId(productosOptions[0].id);
            setPesosDanos({});
        }
    }, [tipoInspeccion, productosOptions]);

    // Cargar Huertas cuando cambia el Productor (Solo relevante si es ORIGEN)
    useEffect(() => {
        if (!productorId) {
            setHuertas([]);
            setHuertaId('');
            return;
        }

        const fetchHuertas = async () => {
            const { data } = await supabase
                .from('usa_huertas')
                .select('*')
                .eq('productor_id', productorId)
                .eq('condicion', true)
                .order('nombre_huerta');

            if (data) setHuertas(data);
        };
        fetchHuertas();
    }, [productorId]);

    const productoActual = useMemo(() => {
        return productos.find(p => p.id === productoSeleccionadoId);
    }, [productos, productoSeleccionadoId]);

    const danosFiltrados = useMemo(() => {
        if (!productoActual) return [];
        return catalogoDanos.filter(d => d.categoria === productoActual.categoria);
    }, [catalogoDanos, productoActual]);

    const handleDanoChange = (key: string, valor: string) => {
        const numVal = Math.max(0, parseFloat(valor) || 0);
        setPesosDanos(prev => ({ ...prev, [key]: numVal }));
    };
    
    // Validación de cantidad de fotos
    const handleFotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 15) {
            alert("Solo puedes adjuntar un máximo de 15 fotografías.");
            e.target.value = '';
            setFotos(null);
        } else {
            setFotos(e.target.files);
        }
    };

    // Cálculos de Calidad
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

    // Semáforo de Calidad
    let calidadColor = "text-slate-800";
    let calidadLabel = "EVALUANDO...";
    if (calidadScore >= 95) {
        calidadColor = "text-green-600";
        calidadLabel = "BUENO";
    } else if (calidadScore >= 85) {
        calidadColor = "text-yellow-500";
        calidadLabel = "TOLERABLE";
    } else {
        calidadColor = "text-red-600";
        calidadLabel = "NO TOLERABLE";
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validación básica
        if (!productorId || !productoSeleccionadoId || !zona || !inspector) {
            alert('Por favor completa los campos obligatorios (Productor, Producto, Zona, Inspector).');
            return;
        }

        if (tipoInspeccion === 'ORIGEN' && !huertaId) {
            alert('En inspecciones de ORIGEN debes seleccionar una Huerta (MID).');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                tipo_inspeccion: tipoInspeccion,
                producto_id: productoSeleccionadoId,
                productor_id: productorId,
                tamano_muestra: tamanoMuestra,
                detalles_danos: detallesDanosJSON,
                calidad_score: calidadScore,
                estatus,
                observaciones,
                zona,
                inspector,
                campo_mallas: campoMallas,
                
                // Campos de ORIGEN (null si es PT)
                huerta_id: tipoInspeccion === 'ORIGEN' ? huertaId : null,
                lote_origen: tipoInspeccion === 'ORIGEN' ? loteOrigen : null,
                peso_neto: tipoInspeccion === 'ORIGEN' && pesoNeto !== '' ? pesoNeto : null,
                
                // Campos de PT (null si es ORIGEN)
                maquina: tipoInspeccion === 'PT' ? maquina : null,
                fecha_cosecha: tipoInspeccion === 'PT' && fechaCosecha ? fechaCosecha : null,
                lote_produccion: tipoInspeccion === 'PT' ? loteProduccion : null,
                peso_muestra_con_caja: tipoInspeccion === 'PT' && pesoMuestraConCaja !== '' ? pesoMuestraConCaja : null,
                peso_caja: tipoInspeccion === 'PT' && pesoCaja !== '' ? pesoCaja : null,
                peso_caja_sin_caja: tipoInspeccion === 'PT' && pesoCajaSinCaja !== '' ? pesoCajaSinCaja : null,
                destino: tipoInspeccion === 'PT' ? destino : null,
                numero_tarima: tipoInspeccion === 'PT' ? numeroTarima : null,
                tarima_reprocesada: tipoInspeccion === 'PT' ? tarimaReprocesada : null,
                tarima_remuestreada: tipoInspeccion === 'PT' ? tarimaRemuestreada : null,
                etiqueta_azul: tipoInspeccion === 'PT' ? etiquetaAzul : null,
                peso_bascula: tipoInspeccion === 'PT' && pesoBascula !== '' ? pesoBascula : null,
            };

            // 1. Guardar la inspección
            const { data: insData, error: insError } = await supabase
                .from('usa_inspecciones')
                .insert([payload])
                .select('id')
                .single();
                
            if (insError) throw insError;
            
            const inspeccionId = insData.id;

            // 2. Subir fotografías
            if (fotos && fotos.length > 0) {
                for (let i = 0; i < fotos.length; i++) {
                    const file = fotos[i];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `origen_${inspeccionId}_${Date.now()}_${i}.${fileExt}`;
                    
                    const { error: uploadError } = await supabase.storage
                        .from('usa_inspecciones_fotos')
                        .upload(fileName, file);
                        
                    if (uploadError) {
                        console.error("Error subiendo foto:", uploadError);
                        continue; 
                    }
                    
                    const { data: { publicUrl } } = supabase.storage
                        .from('usa_inspecciones_fotos')
                        .getPublicUrl(fileName);

                    await supabase.from('usa_fotos_inspeccion').insert([{
                        inspeccion_id: inspeccionId,
                        foto_url: publicUrl 
                    }]);
                }
            }

            alert('Inspección y fotografías guardadas correctamente');
            if (onSuccess) onSuccess();

            // Limpiar formulario
            setPesosDanos({});
            setObservaciones('');
            setLoteOrigen('');
            setPesoNeto('');
            setMaquina('');
            setFechaCosecha('');
            setLoteProduccion('');
            setPesoMuestraConCaja('');
            setPesoCaja('');
            setDestino('');
            setNumeroTarima('');
            setTarimaReprocesada('');
            setTarimaRemuestreada('');
            setEtiquetaAzul('');
            setPesoBascula('');
            setFotos(null);
            const fileInput = document.getElementById('fotos-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            
        } catch (err: any) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingData) return <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-sm animate-pulse">Cargando catálogos operativos...</div>;

    return (
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-8">
            {/* ENCABEZADO */}
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800 uppercase tracking-tight">Registro de Inspección Dinámico</h2>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Categoría activa: <span className="font-bold text-blue-600">{productoActual?.categoria || 'N/A'}</span></p>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Calidad: {calidadLabel}</span>
                    <span className={`text-3xl font-black ${calidadColor}`}>{calidadScore}%</span>
                </div>
            </div>

            {/* SECCIÓN 1: DATOS COMPARTIDOS */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-l-4 border-blue-600 pl-2">1. Datos Generales</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Tipo Inspección *</label>
                        <select 
                            value={tipoInspeccion} 
                            onChange={(e) => setTipoInspeccion(e.target.value as any)} 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        >
                            <option value="ORIGEN">ORIGEN</option>
                            <option value="PT">PRODUCTO TERMINADO</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Producto *</label>
                        <select 
                            value={productoSeleccionadoId} 
                            onChange={(e) => setProductoSeleccionadoId(e.target.value)}
                            className="w-full bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs font-bold text-blue-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        >
                            {productosOptions.map(p => (
                                <option key={p.id} value={p.id}>{p.displayLabel}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Productor *</label>
                        <select 
                            value={productorId} 
                            onChange={(e) => setProductorId(e.target.value)} 
                            required 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        >
                            <option value="">-- Seleccionar --</option>
                            {productores.map(p => <option key={p.id} value={p.id}>{p.nombre_productor}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Zona *</label>
                        <select 
                            value={zona} 
                            onChange={(e) => setZona(e.target.value)} 
                            required
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        >
                            <option value="">-- Seleccionar --</option>
                            <option value="CHIHUAHUA">CHIHUAHUA</option>
                            <option value="TAMAULIPAS">TAMAULIPAS</option>
                            <option value="YUCATAN">YUCATAN</option>
                            <option value="SINALOA">SINALOA</option>
                            <option value="SONORA">SONORA</option>
                            <option value="DURANGO">DURANGO</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Inspector *</label>
                        <input 
                            type="text" 
                            value={inspector} 
                            onChange={(e) => setInspector(e.target.value.toUpperCase())}
                            required
                            placeholder="Nombre del inspector"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Campo / Mallas</label>
                        <input 
                            type="text" 
                            value={campoMallas} 
                            onChange={(e) => setCampoMallas(e.target.value.toUpperCase())}
                            placeholder="Especificar"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* SECCIÓN 2: DATOS CONDICIONALES */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-l-4 border-emerald-500 pl-2 mb-4">
                    2. Detalles de {tipoInspeccion === 'ORIGEN' ? 'Origen' : 'Proceso (PT)'}
                </h3>
                
                {tipoInspeccion === 'ORIGEN' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Huerta (MID) *</label>
                            <select 
                                value={huertaId} 
                                onChange={(e) => setHuertaId(e.target.value)} 
                                disabled={!productorId} 
                                required={tipoInspeccion === 'ORIGEN'}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all disabled:opacity-50"
                            >
                                <option value="">-- Seleccionar --</option>
                                {huertas.map(h => <option key={h.id} value={h.id}>{h.nombre_huerta} {h.mid ? `(${h.mid})` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Lote de Origen</label>
                            <input 
                                type="text" 
                                value={loteOrigen} 
                                onChange={(e) => setLoteOrigen(e.target.value.toUpperCase())}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso Neto</label>
                            <input 
                                type="number" 
                                value={pesoNeto} 
                                onChange={(e) => setPesoNeto(e.target.value ? parseFloat(e.target.value) : '')}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                            />
                        </div>
                    </div>
                )}

                {tipoInspeccion === 'PT' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Máquina *</label>
                                <input type="text" required value={maquina} onChange={(e) => setMaquina(e.target.value.toUpperCase())} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Lote de Producción *</label>
                                <input type="text" required value={loteProduccion} onChange={(e) => setLoteProduccion(e.target.value.toUpperCase())} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Fecha de Cosecha *</label>
                                <input type="date" required value={fechaCosecha} onChange={(e) => setFechaCosecha(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso muestra con caja *</label>
                                <input type="number" required value={pesoMuestraConCaja} onChange={(e) => setPesoMuestraConCaja(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso de caja *</label>
                                <input type="number" required value={pesoCaja} onChange={(e) => setPesoCaja(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso muestra sin caja</label>
                                <input type="number" value={pesoCajaSinCaja} disabled className="w-full bg-slate-200/60 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Destino *</label>
                                <select required value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all">
                                    <option value="">-- SELECCIONA --</option>
                                    <option value="MERCADO NACIONAL">SWEET SEASONS</option>
                                    <option value="EXPORTACION">NACIONAL</option>
                                    <option value="EXPORTACION">EXPORTACIÓN</option>
                                    <option value="EXPORTACION">POR DEFINIR</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">No. Tarima *</label>
                                <input type="text" required value={numeroTarima} onChange={(e) => setNumeroTarima(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Etiqueta Azul *</label>
                                <input type="text" required value={etiquetaAzul} onChange={(e) => setEtiquetaAzul(e.target.value.toUpperCase())} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso Báscula *</label>
                                <input type="number" required value={pesoBascula} onChange={(e) => setPesoBascula(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Tarima Reprocesada *</label>
                                <select required value={tarimaReprocesada} onChange={(e) => setTarimaReprocesada(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all">
                                    <option value="">-- SELECCIONA --</option>
                                    <option value="SI">SÍ</option>
                                    <option value="NO">NO</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Tarima Remuestreada *</label>
                                <select required value={tarimaRemuestreada} onChange={(e) => setTarimaRemuestreada(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all">
                                    <option value="">-- SELECCIONA --</option>
                                    <option value="SI">SÍ</option>
                                    <option value="NO">NO</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SECCIÓN 3: MUESTRA Y RESULTADOS */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex justify-between items-center shadow-inner">
                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1.5">Tamaño de Muestra Evaluada (Libras/Piezas/Kg) *</label>
                    <input 
                        type="number" 
                        min="1" 
                        required
                        value={tamanoMuestra} 
                        onChange={(e) => setTamanoMuestra(parseFloat(e.target.value) || 1)} 
                        className="border border-slate-300 px-4 py-2 rounded-xl text-sm font-black w-48 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                    />
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Tasa Total de Defectos:</span>
                    <span className="text-2xl font-black text-rose-600">{totalPorcentajeDano}%</span>
                </div>
            </div>

            {/* SECCIÓN 4: MATRIZ DE DAÑOS */}
            <div className="space-y-5">
                {(['MENOR', 'MAYOR', 'CRITICO'] as const).map(grado => {
                    const deGrado = danosFiltrados.filter(d => d.grado === grado);
                    if (deGrado.length === 0) return null;

                    const badgeColor = grado === 'MENOR' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : grado === 'MAYOR' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-red-100 text-red-800 border-red-200';

                    return (
                        <div key={grado} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center gap-3">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${badgeColor}`}>
                                    Severidad: {grado}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{deGrado.length} Factores Evaluables</span>
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {deGrado.map(dano => (
                                    <div key={dano.key_dano} className="bg-white p-3 border border-slate-200 rounded-xl flex flex-col justify-between hover:border-blue-300 transition-colors group">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 leading-tight group-hover:text-blue-700 transition-colors">{dano.label}</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            placeholder="0"
                                            value={pesosDanos[dano.key_dano] ?? ''} 
                                            onChange={(e) => handleDanoChange(dano.key_dano, e.target.value)} 
                                            className="w-full bg-slate-50 border border-slate-200 text-right px-3 py-1.5 text-sm font-bold text-slate-800 rounded-lg outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* SECCIÓN 5: FOTOGRAFÍAS */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2">Evidencia Fotográfica (Máx. 15 fotos)</label>
                <input 
                    id="fotos-input"
                    type="file" 
                    multiple 
                    accept="image/*"
                    onChange={handleFotosChange}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-widest file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer"
                />
                {fotos && fotos.length > 0 && (
                    <p className="text-xs font-bold text-blue-600 mt-3">{fotos.length} archivo(s) seleccionado(s) para subir.</p>
                )}
            </div>

            {/* BOTÓN DE GUARDAR */}
            <div className="pt-4 border-t border-slate-200">
                <button 
                    type="submit" 
                    disabled={submitting} 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest p-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                    {submitting ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
                            <span>Subiendo datos y fotos...</span>
                        </>
                    ) : 'Guardar y Emitir Certificado de Inspección'}
                </button>
            </div>
        </form>
    );
};