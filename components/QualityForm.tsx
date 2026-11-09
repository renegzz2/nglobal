import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Interfaces adaptadas
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

    // Estados Generales
    const [tipoInspeccion, setTipoInspeccion] = useState<'ORIGEN' | 'PT'>('ORIGEN');
    const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string>('');
    const [productorId, setProductorId] = useState('');
    const [zona, setZona] = useState('');
    const [inspector, setInspector] = useState('');
    const [campoMallas, setCampoMallas] = useState('');
    const [tamanoMuestra, setTamanoMuestra] = useState<number>(100);
    const [fotos, setFotos] = useState<FileList | null>(null);
    const [pesosDanos, setPesosDanos] = useState<Record<string, number>>({});

    // Nuevos Estados de Resolución
    const [estatus, setEstatus] = useState('');
    const [accionCorrectiva, setAccionCorrectiva] = useState('');
    const [canalVenta, setCanalVenta] = useState('');
    const [observaciones, setObservaciones] = useState('');

    // Estados ORIGEN
    const [huertaId, setHuertaId] = useState('');
    const [loteOrigen, setLoteOrigen] = useState('');
    const [pesoNeto, setPesoNeto] = useState<number | ''>('');

    // Estados PT
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

    // Estados para IA Multimodal
    const [isIaModalOpen, setIsIaModalOpen] = useState(false);
    const [iaAnalyzing, setIaAnalyzing] = useState(false);
    const [fotoIa, setFotoIa] = useState<File | null>(null);

    // Cálculo automático peso sin caja (PT)
    const pesoCajaSinCaja = useMemo(() => {
        if (pesoMuestraConCaja !== '' && pesoCaja !== '') {
            return Number((pesoMuestraConCaja - pesoCaja).toFixed(2));
        }
        return '';
    }, [pesoMuestraConCaja, pesoCaja]);

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
                console.error("Error catálogos:", err);
            } finally {
                setLoadingData(false);
            }
        };
        fetchCatalogos();
    }, []);

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
                return { ...p, displayLabel: `${p.nombre}${alias}${config}` };
            });
        }
    }, [productos, tipoInspeccion]);

    useEffect(() => {
        if (productosOptions.length > 0) {
            setProductoSeleccionadoId(productosOptions[0].id);
            setPesosDanos({});
        }
    }, [tipoInspeccion, productosOptions]);

    useEffect(() => {
        if (!productorId) {
            setHuertas([]);
            setHuertaId('');
            return;
        }
        const fetchHuertas = async () => {
            const { data } = await supabase.from('usa_huertas').select('*').eq('productor_id', productorId).eq('condicion', true).order('nombre_huerta');
            if (data) setHuertas(data);
        };
        fetchHuertas();
    }, [productorId]);

    const productoActual = useMemo(() => productos.find(p => p.id === productoSeleccionadoId), [productos, productoSeleccionadoId]);
    const danosFiltrados = useMemo(() => {
        if (!productoActual) return [];
        return catalogoDanos.filter(d => d.categoria === productoActual.categoria);
    }, [catalogoDanos, productoActual]);

    // Detector dinámico de tipo de muestra según la categoría
    const tipoMuestra = useMemo(() => {
        if (!productoActual) return { tipo: 'PESO', label: 'Kg' };

        // Normalizamos el texto a mayúsculas para evitar errores de tipeo
        const categoria = productoActual.categoria.toUpperCase();

        // Lista estricta de productos que se evalúan por PIEZAS
        const categoriasPorPieza = [
            'CEBOLLAS', 
            'SABILA',
            'ALOE', 
            'JICAMA', 
            'LITCHI', 
            'LYCHEE', // Agregado como alias por si acaso
            'ELOTES', 
            'PEPINO',
            'SANDIA'
        ];

        if (categoriasPorPieza.includes(categoria)) {
            return { tipo: 'PIEZAS', label: 'Piezas' };
        }
        
        // Todo lo demás (Chiles, Tomate, Tomatillo, Calabaza) se va a PESO (Kg)
        return { tipo: 'PESO', label: 'Kg' };
    }, [productoActual]);

    const isWeightBased = tipoMuestra.tipo === 'PESO';

    const handleDanoChange = (key: string, valor: string) => {
        const numVal = Math.max(0, parseFloat(valor) || 0);
        setPesosDanos(prev => ({ ...prev, [key]: numVal }));
    };
    
    const handleFotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 15) {
            alert("Máximo 15 fotografías permitidas.");
            e.target.value = '';
            setFotos(null);
        } else {
            setFotos(e.target.files);
        }
    };

    // Cálculos de Calidad
    const { detallesDanosJSON, totalPorcentajeDano, calidadScore } = useMemo(() => {
        const detalles: Record<string, { piezas: number; porcentaje: number }> = {};
        let sumaPorcentajes = 0;
        const baseMuestra = tamanoMuestra > 0 ? tamanoMuestra : 1;

        danosFiltrados.forEach(dano => {
            const piezas = pesosDanos[dano.key_dano] || 0;
            const porcentaje = Number(((piezas / baseMuestra) * 100).toFixed(2));

            if (piezas > 0) {
                detalles[dano.key_dano] = { piezas, porcentaje };
                sumaPorcentajes += porcentaje;
            }
        });

        const scoreCalculado = Math.max(0, Number((100 - sumaPorcentajes).toFixed(2)));
        return { detallesDanosJSON: detalles, totalPorcentajeDano: Number(sumaPorcentajes.toFixed(2)), calidadScore: scoreCalculado };
    }, [pesosDanos, tamanoMuestra, danosFiltrados]);

    // Semáforo Estatus
    let estatusFinal = "EVALUANDO...";
    let calidadColor = "text-slate-800";
    if (calidadScore >= 95) {
        calidadColor = "text-green-600";
        estatusFinal = "BUENO";
    } else if (calidadScore >= 85) {
        calidadColor = "text-yellow-500";
        estatusFinal = "TOLERABLE";
    } else {
        calidadColor = "text-red-600";
        estatusFinal = "NO TOLERABLE";
    }

    const handleIaAnalysis = async () => {
        if (!fotoIa) {
            alert('Por favor, selecciona o toma una foto primero.');
            return;
        }
        setIaAnalyzing(true);
        setTimeout(() => {
            const simulatedResponse: Record<string, number> = {};
            danosFiltrados.slice(0, 3).forEach(dano => {
                const isWeight = isWeightBased;
                simulatedResponse[dano.key_dano] = isWeight ? Number((Math.random() * 2).toFixed(2)) : Math.floor(Math.random() * 5) + 1;
            });
            setPesosDanos(prev => ({ ...prev, ...simulatedResponse }));
            setIaAnalyzing(false);
            setIsIaModalOpen(false);
            setFotoIa(null);
        }, 3000);
    };

    // --- FUNCIÓN PARA GENERAR EL PDF ---
    const generarPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        
        // Colores corporativos (nglobal usa azul oscuro)
        const primaryColor = [10, 37, 88] as [number, number, number];

        // 1. Encabezado
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("nglobal", 14, 14);
        
        doc.setFontSize(12);
        doc.text(`INSPECCIÓN DE PRODUCTO ${productoActual?.nombre.toUpperCase() || ''} ${tipoInspeccion}`, pageWidth / 2, 14, { align: 'center' });

        // 2. Datos Generales (Cuadrícula superior)
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(9);
        
        const productorName = productores.find(p => p.id === productorId)?.nombre_productor || '';
        const huertaName = huertas.find(h => h.id === huertaId)?.nombre_huerta || '';
        const currentDate = new Date().toISOString().split('T')[0];
        const horaFin = new Date().toLocaleTimeString();

        // Primera columna
        doc.setFont("helvetica", "bold"); doc.text("ZONA:", 14, 30);
        doc.setFont("helvetica", "normal"); doc.text(zona, 45, 30);
        
        doc.setFont("helvetica", "bold"); doc.text("PRODUCTO:", 14, 36);
        doc.setFont("helvetica", "normal"); doc.text(productoActual?.nombre || '', 45, 36);
        
        doc.setFont("helvetica", "bold"); doc.text("LOTE DE ORIGEN:", 14, 42);
        doc.setFont("helvetica", "normal"); doc.text(loteOrigen || loteProduccion || 'S/D', 45, 42);
        
        doc.setFont("helvetica", "bold"); doc.text("CAMPO/MALLA:", 14, 48);
        doc.setFont("helvetica", "normal"); doc.text(campoMallas || huertaName || 'S/D', 45, 48);

        // Segunda columna
        doc.setFont("helvetica", "bold"); doc.text("PRODUCTOR:", 110, 30);
        doc.setFont("helvetica", "normal"); doc.text(productorName, 150, 30);
        
        doc.setFont("helvetica", "bold"); doc.text("FECHA DE INSPECCIÓN:", 110, 36);
        doc.setFont("helvetica", "normal"); doc.text(currentDate, 155, 36);
        
        doc.setFont("helvetica", "bold"); doc.text("PESO NETO:", 110, 42);
        doc.setFont("helvetica", "normal"); doc.text(String(pesoNeto || tamanoMuestra), 150, 42);
        
        doc.setFont("helvetica", "bold"); doc.text("INSPECTOR:", 110, 48);
        doc.setFont("helvetica", "normal"); doc.text(inspector, 150, 48);

        doc.setFont("helvetica", "bold"); doc.text("HORA FIN:", 110, 54);
        doc.setFont("helvetica", "normal"); doc.text(horaFin, 150, 54);

        // 3. Tabla de Daños
        const tableData: any[] = [];
        const baseMuestra = tamanoMuestra > 0 ? tamanoMuestra : 1;

        (['MENOR', 'MAYOR', 'CRITICO'] as const).forEach(grado => {
            const deGrado = danosFiltrados.filter(d => d.grado === grado);
            if (deGrado.length > 0) {
                deGrado.forEach((dano, index) => {
                    const piezas = pesosDanos[dano.key_dano] || 0;
                    const porcentaje = ((piezas / baseMuestra) * 100).toFixed(3);
                    tableData.push([
                        index === 0 ? grado : '', 
                        dano.label.toUpperCase(), 
                        piezas > 0 ? piezas.toFixed(3) : '0.000', 
                        porcentaje === '0.000' ? '0.000' : porcentaje
                    ]);
                });
            }
        });

        autoTable(doc, {
            startY: 65,
            head: [['GRADO', 'DAÑO', 'DAÑOS', '%']],
            body: tableData,
            theme: 'plain',
            headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
            styles: { fontSize: 8, cellPadding: 1.5, textColor: [50, 50, 50] },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 35 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 30, halign: 'right' },
                3: { cellWidth: 30, halign: 'right' }
            },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            drawRow: function (row: any, data: any) {
                if (row.raw[0] !== '') { // Línea divisoria si cambia el grado
                    doc.setDrawColor(200, 200, 200);
                    doc.line(data.settings.margin.left, row.y, pageWidth - data.settings.margin.right, row.y);
                }
            }
        });

        // 4. Resultados y Resolución
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        
        doc.setFillColor(...primaryColor);
        doc.rect(14, finalY, pageWidth - 28, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("CALIDAD DE INSPECCIÓN:", 16, finalY + 5.5);
        doc.text(estatusFinal, 80, finalY + 5.5);
        doc.text(`${totalPorcentajeDano.toFixed(3)}%`, pageWidth - 16, finalY + 5.5, { align: 'right' });

        doc.setTextColor(50, 50, 50);
        let currY = finalY + 15;
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold"); doc.text("ESTATUS", 14, currY);
        doc.setFont("helvetica", "normal"); doc.text(estatus, 14, currY + 5);
        
        currY += 15;
        doc.setFont("helvetica", "bold"); doc.text("ACCIÓN CORRECTIVA", 14, currY);
        doc.setFont("helvetica", "normal"); doc.text(accionCorrectiva || 'N/A', 14, currY + 5);
        
        currY += 15;
        doc.setFont("helvetica", "bold"); doc.text("CANAL DE VENTA", 14, currY);
        doc.setFont("helvetica", "normal"); doc.text(canalVenta, 14, currY + 5);
        
        currY += 15;
        doc.setFont("helvetica", "bold"); doc.text("OBSERVACIONES", 14, currY);
        const splitObs = doc.splitTextToSize(observaciones || 'Sin observaciones.', pageWidth - 28);
        doc.setFont("helvetica", "normal"); doc.text(splitObs, 14, currY + 5);

        // Guardar el PDF con nombre dinámico
        const nombreArchivo = `Inspeccion_${tipoInspeccion}_${productoActual?.nombre || 'Producto'}_${loteOrigen || loteProduccion || currentDate}.pdf`;
        doc.save(nombreArchivo);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!productorId || !productoSeleccionadoId || !zona || !inspector || !estatus || !canalVenta) {
            alert('Completa los campos obligatorios (Productor, Producto, Zona, Inspector, Estatus y Canal de Venta).');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                tipo_inspeccion: tipoInspeccion,
                producto_id: productoSeleccionadoId,
                productor_id: productorId,
                huerta_id: tipoInspeccion === 'ORIGEN' ? (huertaId || null) : null,
                zona: zona,
                inspector: inspector,
                campo_mallas: campoMallas || null,
                tamano_muestra: tamanoMuestra,
                detalles_danos: detallesDanosJSON,
                calidad_score: calidadScore,
                
                resultado_calidad: estatusFinal, 
                estatus: estatus,                
                accion_correctiva: accionCorrectiva || null,
                canal_venta: canalVenta || null,
                observaciones: observaciones || null,
                
                lote_origen: tipoInspeccion === 'ORIGEN' ? (loteOrigen.trim() || null) : null,
                peso_neto: tipoInspeccion === 'ORIGEN' && pesoNeto !== '' ? pesoNeto : null,
                
                maquina: tipoInspeccion === 'PT' ? (maquina || null) : null,
                lote_produccion: tipoInspeccion === 'PT' ? (loteProduccion.trim() || null) : null,
                fecha_cosecha: tipoInspeccion === 'PT' && fechaCosecha ? fechaCosecha : null,
                peso_muestra_con_caja: tipoInspeccion === 'PT' && pesoMuestraConCaja !== '' ? pesoMuestraConCaja : null,
                peso_caja: tipoInspeccion === 'PT' && pesoCaja !== '' ? pesoCaja : null,
                peso_caja_sin_caja: tipoInspeccion === 'PT' && pesoCajaSinCaja !== '' ? pesoCajaSinCaja : null,
                destino: tipoInspeccion === 'PT' ? (destino || null) : null,
                numero_tarima: tipoInspeccion === 'PT' ? (numeroTarima || null) : null,
                tarima_reprocesada: tipoInspeccion === 'PT' ? (tarimaReprocesada || null) : null,
                tarima_remuestreada: tipoInspeccion === 'PT' ? (tarimaRemuestreada || null) : null,
                etiqueta_azul: tipoInspeccion === 'PT' ? (etiquetaAzul || null) : null,
                peso_bascula: tipoInspeccion === 'PT' && pesoBascula !== '' ? pesoBascula : null,
            };

            const { data: insData, error: insError } = await supabase.from('usa_inspecciones').insert([payload]).select('id').single();
            if (insError) throw insError;
            const inspeccionId = insData.id;

            if (fotos && fotos.length > 0) {
                for (let i = 0; i < fotos.length; i++) {
                    const file = fotos[i];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${tipoInspeccion.toLowerCase()}_${inspeccionId}_${Date.now()}_${i}.${fileExt}`;
                    
                    const { error: uploadError } = await supabase.storage.from('usa_inspecciones_fotos').upload(fileName, file);
                    if (!uploadError) {
                        const { data: { publicUrl } } = supabase.storage.from('usa_inspecciones_fotos').getPublicUrl(fileName);
                        await supabase.from('usa_fotos_inspeccion').insert([{ inspeccion_id: inspeccionId, foto_url: publicUrl }]);
                    }
                }
            }

            // --- EJECUCIÓN DE GENERACIÓN DE PDF TRAS GUARDAR EXITOSAMENTE ---
            generarPDF();

            alert(`Inspección guardada y Certificado PDF descargado con Estatus: ${estatus}`);
            if (onSuccess) onSuccess();

            // Limpiar formulario
            setPesosDanos({}); setObservaciones(''); setLoteOrigen(''); setPesoNeto(''); setMaquina('');
            setFechaCosecha(''); setLoteProduccion(''); setPesoMuestraConCaja(''); setPesoCaja('');
            setDestino(''); setNumeroTarima(''); setTarimaReprocesada(''); setTarimaRemuestreada('');
            setEtiquetaAzul(''); setPesoBascula(''); setFotos(null); setEstatus(''); setAccionCorrectiva(''); setCanalVenta('');
            const fileInput = document.getElementById('fotos-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            
        } catch (err: any) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingData) return <div className="p-8 text-center text-slate-500 font-bold uppercase animate-pulse">Cargando catálogos operativos...</div>;

    return (
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-8">
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800 uppercase tracking-tight">Registro de Inspección de Calidad</h2>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Categoría activa: <span className="font-bold text-blue-600">{productoActual?.categoria || 'N/A'}</span></p>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Calidad Calculada: {estatusFinal}</span>
                    <span className={`text-3xl font-black ${calidadColor}`}>{calidadScore}%</span>
                </div>
            </div>

            {/* SECCIÓN 1: DATOS COMPARTIDOS */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-l-4 border-blue-600 pl-2">1. Datos Generales</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Tipo Inspección *</label>
                        <select value={tipoInspeccion} onChange={(e) => setTipoInspeccion(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
                            <option value="ORIGEN">ORIGEN (Materia Prima)</option>
                            <option value="PT">PRODUCTO TERMINADO</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Producto *</label>
                        <select value={productoSeleccionadoId} onChange={(e) => setProductoSeleccionadoId(e.target.value)} className="w-full bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs font-bold text-blue-900 outline-none focus:border-blue-500">
                            {productosOptions.map(p => <option key={p.id} value={p.id}>{p.displayLabel}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Productor *</label>
                        <select value={productorId} onChange={(e) => setProductorId(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
                            <option value="">-- Seleccionar --</option>
                            {productores.map(p => <option key={p.id} value={p.id}>{p.nombre_productor}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Zona *</label>
                        <select value={zona} onChange={(e) => setZona(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
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
                        <input type="text" value={inspector} onChange={(e) => setInspector(e.target.value.toUpperCase())} required placeholder="Nombre del inspector" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Campo / Mallas</label>
                        <input type="text" value={campoMallas} onChange={(e) => setCampoMallas(e.target.value.toUpperCase())} placeholder="Especificar" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500" />
                    </div>
                </div>
            </div>

            {/* SECCIÓN 2: DATOS CONDICIONALES */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-l-4 border-emerald-500 pl-2 mb-4">
                    2. Identificación de Lotes ({tipoInspeccion})
                </h3>
                
                {tipoInspeccion === 'ORIGEN' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Huerta (MID) *</label>
                            <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)} disabled={!productorId} required={tipoInspeccion === 'ORIGEN'} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-50">
                                <option value="">-- Seleccionar --</option>
                                {huertas.map(h => <option key={h.id} value={h.id}>{h.nombre_huerta} {h.mid ? `(${h.mid})` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Lote de Origen *</label>
                            <input type="text" value={loteOrigen} onChange={(e) => setLoteOrigen(e.target.value.toUpperCase())} required={tipoInspeccion === 'ORIGEN'} placeholder="Ej: LOTE-ORG-001" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso Neto</label>
                            <input type="number" value={pesoNeto} onChange={(e) => setPesoNeto(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                        </div>
                    </div>
                )}

                {tipoInspeccion === 'PT' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Máquina *</label>
                                <input type="text" required value={maquina} onChange={(e) => setMaquina(e.target.value.toUpperCase())} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1 text-emerald-700">Lote de Producción PT *</label>
                                <input type="text" required value={loteProduccion} onChange={(e) => setLoteProduccion(e.target.value.toUpperCase())} placeholder="Ej: CH24V261" className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2.5 text-xs font-black text-emerald-900 outline-none focus:border-emerald-500 shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Fecha de Cosecha *</label>
                                <input type="date" required value={fechaCosecha} onChange={(e) => setFechaCosecha(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso muestra con caja *</label>
                                <input type="number" required value={pesoMuestraConCaja} onChange={(e) => setPesoMuestraConCaja(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso de caja *</label>
                                <input type="number" required value={pesoCaja} onChange={(e) => setPesoCaja(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso muestra sin caja</label>
                                <input type="number" value={pesoCajaSinCaja} disabled className="w-full bg-slate-200/60 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Destino *</label>
                                <select required value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500">
                                    <option value="">-- SELECCIONA --</option>
                                    <option value="SWEET SEASONS">SWEET SEASONS</option>
                                    <option value="NACIONAL">NACIONAL</option>
                                    <option value="EXPORTACION">EXPORTACIÓN</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">No. Tarima *</label>
                                <input type="text" required value={numeroTarima} onChange={(e) => setNumeroTarima(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Etiqueta Azul *</label>
                                <input type="text" required value={etiquetaAzul} onChange={(e) => setEtiquetaAzul(e.target.value.toUpperCase())} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Peso Báscula *</label>
                                <input type="number" required value={pesoBascula} onChange={(e) => setPesoBascula(e.target.value ? parseFloat(e.target.value) : '')} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SECCIÓN 3: MATRIZ DE DAÑOS Y EVIDENCIA */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-inner gap-4">
                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1.5">Tamaño de Muestra Evaluada ({tipoMuestra.label}) * *</label>
                    <div className="flex items-center gap-3">
                        <input type="number" min="1" required value={tamanoMuestra} onChange={(e) => setTamanoMuestra(parseFloat(e.target.value) || 1)} className="border border-slate-300 px-4 py-2 rounded-xl text-sm font-black w-32 outline-none focus:border-blue-500" />
                        
                        <button type="button" onClick={() => setIsIaModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Analizar Muestra con IA
                        </button>
                    </div>
                </div>
                <div className="text-right w-full sm:w-auto">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Tasa de Defectos:</span>
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
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${badgeColor}`}>Severidad: {grado}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{deGrado.length} Factores</span>
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {deGrado.map(dano => (
                                    <div key={dano.key_dano} className="bg-white p-3 border border-slate-200 rounded-xl flex flex-col justify-between hover:border-blue-300 transition-colors">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 leading-tight">{dano.label}</label>
                                        <input type="number" step="0.01" placeholder="0" value={pesosDanos[dano.key_dano] ?? ''} onChange={(e) => handleDanoChange(dano.key_dano, e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-right px-3 py-1.5 text-sm font-bold text-slate-800 rounded-lg outline-none focus:border-blue-500" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* SECCIÓN 4: RESOLUCIÓN Y COMENTARIOS */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-l-4 border-indigo-500 pl-2 mb-4">
                    4. Resolución Operativa
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Estatus *</label>
                        <select value={estatus} onChange={(e) => setEstatus(e.target.value)} required className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500">
                            <option value="">-- SELECCIONAR --</option>
                            <option value="LIBERADO">LIBERADO</option>
                            <option value="PENDIENTE SEGUNDA REVISION">PENDIENTE SEGUNDA REVISIÓN</option>
                            <option value="RETENIDO">RETENIDO</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Canal de Venta *</label>
                        <select value={canalVenta} onChange={(e) => setCanalVenta(e.target.value)} required className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500">
                            <option value="">-- SELECCIONAR --</option>
                            <option value="EXPORTACION - SUPERMERCADOS">EXPORTACIÓN - SUPERMERCADOS</option>
                            <option value="CADENAS REGIONALES">CADENAS REGIONALES</option>
                            <option value="LOCAL">LOCAL</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Acción Correctiva</label>
                        <input type="text" value={accionCorrectiva} onChange={(e) => setAccionCorrectiva(e.target.value.toUpperCase())} placeholder="Ej. Se informa al líder de corte" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500" />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Observaciones</label>
                    <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value.toUpperCase())} rows={3} placeholder="Añade observaciones adicionales del lote..." className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"></textarea>
                </div>
            </div>

            {/* SECCIÓN 5: EVIDENCIA FOTOGRÁFICA */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2">5. Evidencia Fotográfica del Lote (Máx. 15 fotos)</label>
                <input id="fotos-input" type="file" multiple accept="image/*" onChange={handleFotosChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-widest file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer" />
            </div>

            <div className="pt-4 border-t border-slate-200">
                <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest p-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2">
                    {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : `GUARDAR Y EMITIR CERTIFICADO PDF`}
                </button>
            </div>

            {/* MODAL DE IA MULTIMODAL */}
            {isIaModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-slide-up">
                        <div className="flex justify-between items-center border-b pb-4 mb-4">
                            <h3 className="text-lg font-black text-indigo-900 uppercase tracking-tight flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                Análisis Inteligente
                            </h3>
                            <button type="button" onClick={() => setIsIaModalOpen(false)} className="text-slate-400 hover:text-rose-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <p className="text-xs font-bold text-slate-600">
                                Captura una fotografía clara de la muestra completa ({tamanoMuestra} {tipoMuestra.label}) esparcida en la mesa de contraste.
                            </p>
                            
                            <div className="border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-2xl p-6 text-center">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    onChange={(e) => setFotoIa(e.target.files ? e.target.files[0] : null)}
                                    className="block w-full text-sm text-indigo-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                                />
                                {fotoIa && (
                                    <p className="mt-3 text-xs font-bold text-emerald-600">✓ Fotografía capturada: {fotoIa.name}</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsIaModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                            <button 
                                type="button" 
                                onClick={handleIaAnalysis}
                                disabled={!fotoIa || iaAnalyzing}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase px-6 py-2 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {iaAnalyzing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
                                        Procesando...
                                    </>
                                ) : 'Iniciar Análisis'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
};