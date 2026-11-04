import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Interfaces adaptadas a tu base de datos
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

    // Estados del formulario
    const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string>('');
    const [tipoInspeccion, setTipoInspeccion] = useState<'ORIGEN' | 'PT'>('ORIGEN');
    const [productorId, setProductorId] = useState('');
    const [huertaId, setHuertaId] = useState('');
    const [tamanoMuestra, setTamanoMuestra] = useState<number>(100);
    const [estatus, setEstatus] = useState('LIBERADO');
    const [observaciones, setObservaciones] = useState('');
    
    // NUEVO: Estado para las fotografías
    const [fotos, setFotos] = useState<FileList | null>(null);

    const [pesosDanos, setPesosDanos] = useState<Record<string, number>>({});

    // Cargar Catálogos desde Supabase al iniciar
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const [resProd, resDanos, resProductores] = await Promise.all([
                    supabase.from('usa_productos').select('id, nombre_del_producto, categoria').eq('activo', true).order('nombre_del_producto'),
                    supabase.from('usa_catalogo_danos').select('*').eq('condicion', true),
                    supabase.from('usa_productores').select('*').eq('condicion', true).order('nombre_productor')
                ]);

                if (resProd.data) {
                    const mappedProds = resProd.data.map(p => ({
                        id: p.id,
                        nombre: p.nombre_del_producto,
                        categoria: p.categoria
                    }));
                    setProductos(mappedProds);
                    if (mappedProds.length > 0) setProductoSeleccionadoId(mappedProds[0].id);
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

    // Cargar Huertas cuando cambia el Productor
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

    const handleProductoChange = (id: string) => {
        setProductoSeleccionadoId(id);
        setPesosDanos({});
    };

    const handleDanoChange = (key: string, valor: string) => {
        const numVal = Math.max(0, parseFloat(valor) || 0);
        setPesosDanos(prev => ({ ...prev, [key]: numVal }));
    };
    
    // Validación de cantidad de fotos (como en tu JS original)
    const handleFotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 15) {
            alert("Solo puedes adjuntar un máximo de 15 fotografías.");
            e.target.value = '';
            setFotos(null);
        } else {
            setFotos(e.target.files);
        }
    };

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
        if (!productorId || !huertaId || !productoSeleccionadoId) {
            alert('Por favor completa los campos obligatorios.');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                tipo_inspeccion: tipoInspeccion,
                producto_id: productoSeleccionadoId,
                productor_id: productorId,
                huerta_id: huertaId,
                tamano_muestra: tamanoMuestra,
                detalles_danos: detallesDanosJSON,
                calidad_score: calidadScore,
                estatus,
                observaciones
            };

            // 1. Guardar la inspección y recuperar el ID generado
            const { data: insData, error: insError } = await supabase
                .from('usa_inspecciones')
                .insert([payload])
                .select('id')
                .single();
                
            if (insError) throw insError;
            
            const inspeccionId = insData.id;

            // 2. Subir fotografías si existen
            if (fotos && fotos.length > 0) {
                for (let i = 0; i < fotos.length; i++) {
                    const file = fotos[i];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `origen_${inspeccionId}_${Date.now()}_${i}.${fileExt}`;
                    
                    // Subir a Storage
                    const { error: uploadError } = await supabase.storage
                        .from('usa_inspecciones_fotos')
                        .upload(fileName, file);
                        
                    if (uploadError) {
                        console.error("Error subiendo foto:", uploadError);
                        continue; // Si falla una foto, que siga con las demás
                    }
                    
                    // Obtener URL pública (opcional, dependiendo de si tu bucket es público)
                    const { data: { publicUrl } } = supabase.storage
                        .from('usa_inspecciones_fotos')
                        .getPublicUrl(fileName);

                    // Guardar registro en la tabla anexa de fotos
                    await supabase.from('usa_fotos_inspeccion').insert([{
                        inspeccion_id: inspeccionId,
                        foto_url: publicUrl // o guardar solo el fileName si el bucket es privado
                    }]);
                }
            }

            alert('Inspección y fotografías guardadas correctamente');
            if (onSuccess) onSuccess();

            setPesosDanos({});
            setObservaciones('');
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
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Producto *</label>
                    <select 
                        value={productoSeleccionadoId} 
                        onChange={(e) => handleProductoChange(e.target.value)}
                        className="w-full bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs font-bold text-blue-900 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                    >
                        {productos.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.nombre} ({p.categoria})
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Tipo Inspección</label>
                    <select 
                        value={tipoInspeccion} 
                        onChange={(e) => setTipoInspeccion(e.target.value as any)} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                    >
                        <option value="ORIGEN">ORIGEN</option>
                        <option value="PT">PRODUCTO TERMINADO</option>
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Productor *</label>
                    <select 
                        value={productorId} 
                        onChange={(e) => setProductorId(e.target.value)} 
                        required 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                    >
                        <option value="">-- Seleccionar --</option>
                        {productores.map(p => <option key={p.id} value={p.id}>{p.nombre_productor}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Huerta *</label>
                    <select 
                        value={huertaId} 
                        onChange={(e) => setHuertaId(e.target.value)} 
                        disabled={!productorId} 
                        required 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all disabled:opacity-50"
                    >
                        <option value="">-- Seleccionar --</option>
                        {huertas.map(h => <option key={h.id} value={h.id}>{h.nombre_huerta} {h.mid ? `(${h.mid})` : ''}</option>)}
                    </select>
                </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1.5">Tamaño de Muestra Evaluada (Libras/Piezas/Kg)</label>
                    <input 
                        type="number" 
                        min="1" 
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
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                placeholder="0"
                                                value={pesosDanos[dano.key_dano] ?? ''} 
                                                onChange={(e) => handleDanoChange(dano.key_dano, e.target.value)} 
                                                className="w-full bg-slate-50 border border-slate-200 text-right px-3 py-1.5 text-sm font-bold text-slate-800 rounded-lg outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* SECCIÓN DE FOTOGRAFÍAS */}
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