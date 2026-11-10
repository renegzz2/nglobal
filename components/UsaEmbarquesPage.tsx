import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface PartidaCarga {
    id: string;
    numero_pallet: number | string;
    producto_id: string;
    remision: string;
    mid: string;
    lote_pt: string;
    cantidad_cajas: number;
    calidad?: string;
    lbs?: string;
}

interface Cliente {
    id: string;
    nombre_cliente?: string;
    nombre?: string;
    razon_social?: string;
    cliente?: string;
}

interface Transportista {
    id: string;
    nombre_linea?: string;
    nombre?: string;
    razon_social?: string;
    linea?: string;
}

interface ProductoCatalog {
    id: string;
    nombre_del_producto: string;
    alias_usa?: string | null;
    config_usa?: string | null;
    display_label?: string;
}

export const UsaEmbarquesPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);

    // --- CATÁLOGOS DESDE SUPABASE ---
    const [clientesList, setClientesList] = useState<Cliente[]>([]);
    const [transportistasList, setTransportistasList] = useState<Transportista[]>([]);
    const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalog[]>([]);

    // --- ESTADOS GENERALES (Pestaña 1) ---
    const [clienteId, setClienteId] = useState('');
    const [lineaTransporte, setLineaTransporte] = useState('');
    const [fechaSalida, setFechaSalida] = useState('');
    const [nombreOperador, setNombreOperador] = useState('');
    const [placasTractor, setPlacasTractor] = useState('');
    const [placasCaja, setPlacasCaja] = useState('');
    const [economico, setEconomico] = useState('');
    const [pies, setPies] = useState('');
    const [termografo, setTermografo] = useState('');
    const [temperaturaViaje, setTemperaturaViaje] = useState<number | ''>('');
    const [termoContinuo, setTermoContinuo] = useState('Sí');

    // --- ESTADOS DE CARGA (Pestaña 2) ---
    const [cargaPartidas, setCargaPartidas] = useState<PartidaCarga[]>([]);
    const [datosExcel, setDatosExcel] = useState<any[]>([]);

    // --- ESTADOS DE FOTOS (Pestaña 3) ---
    const [fotos, setFotos] = useState({
        remision: null as File | null,
        termografo: null as File | null,
        diesel: null as File | null,
        refacciones: null as File | null,
        temperatura: null as File | null,
    });

    const [discrepancias, setDiscrepancias] = useState<string[]>([]);
    const [mostrarModalAuditoria, setMostrarModalAuditoria] = useState(false);
    const [guardando, setGuardando] = useState(false);

    // 1. Carga de Catálogos al montar
    useEffect(() => {
        const cargarCatalogos = async () => {
            // Clientes
            const { data: dataClientes } = await supabase
                .from('usa_clientes')
                .select('*')
                .order('nombre', { ascending: true });
            if (dataClientes && dataClientes.length > 0) {
                setClientesList(dataClientes);
                setClienteId(dataClientes[0].id);
            }

            // Transportistas
            const { data: dataTrans } = await supabase
                .from('usa_lineas_transporte')
                .select('*');
            if (dataTrans && dataTrans.length > 0) {
                setTransportistasList(dataTrans);
                const firstLabel = dataTrans[0].nombre_linea || dataTrans[0].nombre || dataTrans[0].razon_social || '';
                setLineaTransporte(firstLabel);
            }

            // Productos consolidando: nombre_del_producto, alias_usa (calidad) y config_usa (lbs)
            const { data: dataProd } = await supabase
                .from('usa_productos')
                .select('id, nombre_del_producto, alias_usa, config_usa')
                .order('nombre_del_producto', { ascending: true });

            if (dataProd) {
                const formateados: ProductoCatalog[] = dataProd.map(p => {
                    const partes = [p.nombre_del_producto];
                    if (p.alias_usa && p.alias_usa.trim() !== '') partes.push(`Cal: ${p.alias_usa.trim()}`);
                    if (p.config_usa && p.config_usa.trim() !== '') partes.push(`${p.config_usa.trim()}`);
                    return {
                        ...p,
                        display_label: partes.join(' | ')
                    };
                });
                setProductosCatalogo(formateados);
            }
        };

        cargarCatalogos();
    }, []);

    // Validación de campos completos en Pestaña 1
    const validarPaso1 = () => {
        if (!clienteId) { alert("Por favor selecciona un Cliente."); return false; }
        if (!fechaSalida) { alert("Por favor ingresa la Fecha y hora de salida."); return false; }
        if (!lineaTransporte.trim()) { alert("Por favor selecciona o escribe la Línea transportista."); return false; }
        if (!nombreOperador.trim()) { alert("Por favor indica el Nombre del operador."); return false; }
        if (!placasTractor.trim()) { alert("Por favor escribe las Placas del tractor."); return false; }
        if (!placasCaja.trim()) { alert("Por favor escribe las Placas de la caja."); return false; }
        if (!economico.trim()) { alert("Por favor indica el No. Económico."); return false; }
        if (!pies.trim()) { alert("Por favor indica la medida en Pies del remolque."); return false; }
        if (!termografo.trim()) { alert("Por favor escribe el Identificador del termógrafo."); return false; }
        if (temperaturaViaje === '' || isNaN(Number(temperaturaViaje))) { 
            alert("Por favor captura la Temperatura programada."); 
            return false; 
        }
        return true;
    };

    const avanzarAPaso2 = () => {
        if (validarPaso1()) {
            setActiveTab(2);
        }
    };

    // Procesamiento del Layout de Excel respetando Pallets y conciliación por 3 criterios
    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });

                const targetSheetName = wb.SheetNames.find(name => name.toLowerCase().includes('layout')) || wb.SheetNames[0];
                const ws = wb.Sheets[targetSheetName];

                const sheetRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                // Ubicar la fila de encabezados
                let headerRowIndex = sheetRows.findIndex(row => 
                    row && row.some((cell: any) => String(cell || '').trim().toUpperCase() === 'PRODUCTO') &&
                    row.some((cell: any) => String(cell || '').trim().toUpperCase().includes('CAJAS'))
                );

                if (headerRowIndex === -1) headerRowIndex = 8;

                const rawData: any[] = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex });

                const cleanData = rawData.map(row => {
                    const normalized: any = {};
                    Object.keys(row).forEach(key => {
                        normalized[key.trim().toUpperCase()] = row[key];
                    });
                    return normalized;
                }).filter(row => row['PRODUCTO'] && (row['CAJAS'] !== undefined || row['PALLET'] !== undefined));

                setDatosExcel(cleanData);

                // Mapear partidas reconociendo la combinación: nombre + calidad + lbs
                const partidasGeneradas: PartidaCarga[] = cleanData.map((row, index) => {
                    const prodExcel = String(row['PRODUCTO'] || '').trim().toLowerCase();
                    const calidadExcel = String(row['CALIDAD'] || '').trim().toLowerCase();
                    const lbsExcel = String(row['LBS'] || '').trim().toLowerCase();

                    // Buscar mejor coincidencia en catálogo
                    const prodEncontrado = productosCatalogo.find(p => {
                        const nombreMatch = prodExcel.includes(p.nombre_del_producto.toLowerCase()) || 
                                           p.nombre_del_producto.toLowerCase().includes(prodExcel);
                        
                        const calMatch = !calidadExcel || !p.alias_usa || 
                                         p.alias_usa.toLowerCase() === calidadExcel;
                        
                        const lbsMatch = !lbsExcel || !p.config_usa || 
                                         p.config_usa.toLowerCase().includes(lbsExcel);

                        return nombreMatch && (calMatch || lbsMatch);
                    }) || productosCatalogo.find(p => 
                        prodExcel.includes(p.nombre_del_producto.toLowerCase()) || 
                        p.nombre_del_producto.toLowerCase().includes(prodExcel)
                    );

                    return {
                        id: `${Date.now()}-${index}`,
                        numero_pallet: row['PALLET'] !== undefined ? String(row['PALLET']).trim() : index + 1,
                        producto_id: prodEncontrado ? prodEncontrado.id : '',
                        remision: String(row['REMISION'] || '').trim(),
                        mid: String(row['MID'] || '').trim(),
                        lote_pt: String(row['LOTE'] || '').trim(),
                        cantidad_cajas: parseFloat(row['CAJAS']) || 0,
                        calidad: String(row['CALIDAD'] || ''),
                        lbs: String(row['LBS'] || '')
                    };
                });

                setCargaPartidas(partidasGeneradas);

                const palletsUnicos = new Set(partidasGeneradas.map(p => p.numero_pallet)).size;
                alert(`Layout procesado: Se cargaron ${partidasGeneradas.length} partidas distribuidas en ${palletsUnicos} pallets.`);
            } catch (err: any) {
                console.error(err);
                alert("Error al leer el archivo Excel: " + err.message);
            }
        };

        reader.readAsBinaryString(file);
    };

    const agregarPartidaManual = () => {
        const ultimoPallet = cargaPartidas.length > 0 ? cargaPartidas[cargaPartidas.length - 1].numero_pallet : 1;
        setCargaPartidas(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                numero_pallet: ultimoPallet,
                producto_id: '',
                remision: '',
                mid: '',
                lote_pt: '',
                cantidad_cajas: 0
            }
        ]);
    };

    const actualizarPartida = (id: string, campo: keyof PartidaCarga, valor: any) => {
        setCargaPartidas(prev => prev.map(p => p.id === id ? { ...p, [campo]: valor } : p));
    };

    const eliminarPartida = (id: string) => {
        setCargaPartidas(prev => prev.filter(p => p.id !== id));
    };

    const handleFotoChange = (tipo: keyof typeof fotos, file: File | null) => {
        setFotos(prev => ({ ...prev, [tipo]: file }));
    };

    const countFotosCargadas = () => Object.values(fotos).filter(f => f !== null).length;

    // Validación y auditoría cruzada contra el Excel
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (countFotosCargadas() < 5) {
            alert("Es obligatorio subir las 5 fotografías para continuar.");
            return;
        }

        if (cargaPartidas.length === 0) {
            alert("Debes capturar al menos un pallet.");
            return;
        }

        const nuevasDiscrepancias: string[] = [];

        cargaPartidas.forEach((partida, index) => {
            const prodObj = productosCatalogo.find(p => p.id === partida.producto_id);
            const nombreProd = prodObj?.nombre_del_producto || 'No asignado';

            const coincidenciaExcel = datosExcel.find(fila => 
                String(fila.REMISION || '').trim().toUpperCase() === partida.remision.toUpperCase() &&
                String(fila.MID || '').trim().toUpperCase() === partida.mid.toUpperCase() &&
                String(fila.PALLET || '').trim() === String(partida.numero_pallet).trim()
            );

            if (!coincidenciaExcel) {
                nuevasDiscrepancias.push(`Pallet #${partida.numero_pallet} (Partida ${index + 1}): La Remisión ${partida.remision} y MID ${partida.mid} no coinciden con este pallet en el Excel.`);
            } else {
                const cajasExcel = parseFloat(coincidenciaExcel.CAJAS || 0);
                if (cajasExcel !== partida.cantidad_cajas) {
                    nuevasDiscrepancias.push(`Pallet #${partida.numero_pallet}: Cajas no coinciden. Físico: ${partida.cantidad_cajas} vs Excel: ${cajasExcel}.`);
                }
            }
        });

        const faltaPT = cargaPartidas.some(p => !p.lote_pt || p.lote_pt.trim() === '');
        if (faltaPT) {
            nuevasDiscrepancias.push("CRÍTICO: Existen partidas sin Lote PT registrado. Inspección de Calidad no verificada.");
        }

        setDiscrepancias(nuevasDiscrepancias);
        setMostrarModalAuditoria(true);
    };

    const confirmarYGuardar = async () => {
        setGuardando(true);
        try {
            const clienteSel = clientesList.find(c => c.id === clienteId);
            const nombreCliente = clienteSel?.nombre_cliente || clienteSel?.nombre || clienteSel?.razon_social || clienteId;

            const payloadEmbarque = {
                folio_embarque: `EMB-${Date.now().toString().slice(-6)}`,
                linea_transporte: lineaTransporte,
                nombre_operador: nombreOperador,
                placas_caja: placasCaja,
                placas_tractor: placasTractor,
                temperatura_viaje: Number(temperaturaViaje) || 0,
                destino: nombreCliente,
                estatus_embarque: 'EN REVISIÓN RI',
                alerta_inspeccion_pt: discrepancias.some(d => d.includes("Lote PT")),
                diferencias_auditoria: discrepancias,
                foto_remision: 'pendiente',
                foto_termografo: 'pendiente',
                foto_diesel: 'pendiente',
                foto_refacciones: 'pendiente',
                foto_temperatura: 'pendiente',
            };

            const { data: emb, error: errEmb } = await supabase
                .from('usa_embarques')
                .insert([payloadEmbarque])
                .select('id')
                .single();

            if (errEmb) throw errEmb;

            const payloadDetalles = cargaPartidas.map(p => ({
                embarque_id: emb.id,
                numero_pallet: p.numero_pallet,
                producto_id: p.producto_id,
                remision: p.remision,
                mid: p.mid,
                lote_pt: p.lote_pt,
                cantidad_cajas: p.cantidad_cajas
            }));

            const { error: errDet } = await supabase
                .from('usa_embarques_detalle')
                .insert(payloadDetalles);

            if (errDet) throw errDet;

            alert("Embarque guardado exitosamente.");
            setMostrarModalAuditoria(false);
            window.location.reload();
        } catch (error: any) {
            alert("Error al registrar: " + error.message);
        } finally {
            setGuardando(false);
        }
    };

    const totalPalletsUnicos = new Set(cargaPartidas.map(p => p.numero_pallet)).size;
    const totalCajas = cargaPartidas.reduce((acc, p) => acc + (Number(p.cantidad_cajas) || 0), 0);

    return (
        <div className="max-w-xl mx-auto bg-[#f8f9fa] text-[#002D62] border border-white/10 rounded-3xl shadow-2xl overflow-hidden my-6">
            {/* ENCABEZADO DE PESTAÑAS */}
            <div className="flex p-3 gap-2 bg-[#001D40] border-b border-white/10">
                <button
                    type="button"
                    onClick={() => setActiveTab(1)}
                    className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                        activeTab === 1 
                            ? 'bg-emerald-500 text-white shadow-md' 
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                >
                    1. Datos
                </button>
                <button
                    type="button"
                    onClick={() => { if (validarPaso1()) setActiveTab(2); }}
                    className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                        activeTab === 2 
                            ? 'bg-emerald-500 text-white shadow-md' 
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                >
                    2. Tarimas
                </button>
                <button
                    type="button"
                    onClick={() => { if (validarPaso1() && cargaPartidas.length > 0) setActiveTab(3); }}
                    className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                        activeTab === 3 
                            ? 'bg-emerald-500 text-white shadow-md' 
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                >
                    3. Fotos
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* PESTAÑA 1: DATOS */}
                {activeTab === 1 && (
                    <div className="space-y-4">
                        <div className="border-b border-white/10 pb-3">
                            <h2 className="text-lg font-black uppercase tracking-wide text-[#002D62]">Datos de Salida</h2>
                            <p className="text-[11px] text-[#002D62]">Todos los campos son obligatorios para continuar.</p>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Cliente *</label>
                            <select
                                value={clienteId}
                                onChange={e => setClienteId(e.target.value)}
                                className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                required
                            >
                                <option value="">Selecciona un cliente...</option>
                                {clientesList.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.nombre_cliente || c.nombre || c.razon_social || c.cliente || c.id}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Fecha y hora de salida *</label>
                            <input
                                type="datetime-local"
                                value={fechaSalida}
                                onChange={e => setFechaSalida(e.target.value)}
                                className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Línea transportista *</label>
                            {transportistasList.length > 0 ? (
                                <select
                                    value={lineaTransporte}
                                    onChange={e => setLineaTransporte(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-200"
                                    required
                                >
                                    <option value="">Selecciona transportista...</option>
                                    {transportistasList.map(t => {
                                        const label = t.nombre_linea || t.nombre || t.razon_social || t.linea || t.id;
                                        return (
                                            <option key={t.id} value={label}>{label}</option>
                                        );
                                    })}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    placeholder="Nombre de la línea de transporte"
                                    value={lineaTransporte}
                                    onChange={e => setLineaTransporte(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            )}
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Operador *</label>
                            <input
                                type="text"
                                placeholder="Nombre completo del chofer"
                                value={nombreOperador}
                                onChange={e => setNombreOperador(e.target.value)}
                                className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Placas tractor *</label>
                                <input
                                    type="text"
                                    placeholder="Ej. TR-8821"
                                    value={placasTractor}
                                    onChange={e => setPlacasTractor(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Placas caja *</label>
                                <input
                                    type="text"
                                    placeholder="Ej. CJ-4011"
                                    value={placasCaja}
                                    onChange={e => setPlacasCaja(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Económico *</label>
                                <input
                                    type="text"
                                    placeholder="No. económico"
                                    value={economico}
                                    onChange={e => setEconomico(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Pies *</label>
                                <input
                                    type="text"
                                    placeholder="Ej. 53"
                                    value={pies}
                                    onChange={e => setPies(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Termógrafo *</label>
                                <input
                                    type="text"
                                    placeholder="ID Termógrafo"
                                    value={termografo}
                                    onChange={e => setTermografo(e.target.value)}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Temp. programada (°F) *</label>
                                <input
                                    type="number"
                                    placeholder="Ej. 45"
                                    value={temperaturaViaje}
                                    onChange={e => setTemperaturaViaje(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                    className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-[#002D62] uppercase tracking-wider mb-1">Termo en continuo *</label>
                            <select
                                value={termoContinuo}
                                onChange={e => setTermoContinuo(e.target.value)}
                                className="w-full bg-[#001D40] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                            >
                                <option>Sí</option>
                                <option>No</option>
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={avanzarAPaso2}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-lg active:scale-98 mt-2"
                        >
                            Siguiente: Capturar Tarimas
                        </button>
                    </div>
                )}

                {/* PESTAÑA 2: TARIMAS / PALLETS */}
                {activeTab === 2 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <div>
                                <h2 className="text-lg font-black uppercase tracking-wide text-[#002D62]">Detalle de Carga</h2>
                                <p className="text-[11px] text-[#002D62]">Pallets con conciliación de Producto, Calidad y Lbs.</p>
                            </div>
                            <button
                                type="button"
                                onClick={agregarPartidaManual}
                                className="bg-sky-950 text-sky-300 hover:bg-sky-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-sky-500/30"
                            >
                                + Agregar Partida
                            </button>
                        </div>

                        <label className="block w-full border-2 border-dashed border-sky-400/40 bg-sky-950 hover:bg-sky-500 text-sky-300 text-center py-3.5 rounded-2xl cursor-pointer transition-all">
                            <span className="text-xs font-black uppercase tracking-wider">Cargar Layout de Excel (.xlsx)</span>
                            <input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} className="hidden" />
                        </label>

                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                            {cargaPartidas.map((partida, idx) => (
                                <div key={partida.id} className="bg-[#001D40] border border-white/10 p-3.5 rounded-2xl relative shadow-md">
                                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                                Partida #{idx + 1}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-white/60 uppercase">Pallet:</span>
                                                <input
                                                    type="text"
                                                    value={partida.numero_pallet}
                                                    onChange={e => actualizarPartida(partida.id, 'numero_pallet', e.target.value)}
                                                    className="w-14 bg-white/10 border border-white/15 rounded px-1.5 py-0.5 text-xs text-white text-center font-bold"
                                                    title="Número de Pallet asignado en el remolque"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => eliminarPartida(partida.id)}
                                            className="text-rose-400 hover:text-rose-300 text-xs font-black p-1"
                                            title="Eliminar partida"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* Fila 1: Producto consolidado y Cajas */}
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        <div className="col-span-2">
                                            <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Producto (Calidad | Lbs)</span>
                                            <select
                                                value={partida.producto_id}
                                                onChange={e => actualizarPartida(partida.id, 'producto_id', e.target.value)}
                                                className="w-full bg-[#002D62] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                                            >
                                                <option value="">Selecciona producto...</option>
                                                {productosCatalogo.map(p => (
                                                    <option key={p.id} value={p.id}>{p.display_label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Cajas</span>
                                            <input
                                                type="number"
                                                placeholder="Cant."
                                                value={partida.cantidad_cajas || ''}
                                                onChange={e => actualizarPartida(partida.id, 'cantidad_cajas', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-[#002D62] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white text-center font-bold focus:outline-none focus:border-emerald-400"
                                            />
                                        </div>
                                    </div>

                                    {/* Fila 2: Lote PT, Remisión y MID */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Lote PT</span>
                                            <input
                                                type="text"
                                                placeholder="Ej. CH294V261"
                                                value={partida.lote_pt}
                                                onChange={e => actualizarPartida(partida.id, 'lote_pt', e.target.value.toUpperCase())}
                                                className="w-full bg-[#002D62] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-emerald-400"
                                            />
                                        </div>
                                        <div>
                                            <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Remisión</span>
                                            <input
                                                type="text"
                                                placeholder="Ej. 132"
                                                value={partida.remision}
                                                onChange={e => actualizarPartida(partida.id, 'remision', e.target.value.toUpperCase())}
                                                className="w-full bg-[#002D62] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-emerald-400"
                                            />
                                        </div>
                                        <div>
                                            <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-0.5">MID</span>
                                            <input
                                                type="text"
                                                placeholder="MID Huerto"
                                                value={partida.mid}
                                                onChange={e => actualizarPartida(partida.id, 'mid', e.target.value.toUpperCase())}
                                                className="w-full bg-[#002D62] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-emerald-400"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* RESUMEN TOTALES */}
                        <div className="bg-[#001D40] p-3.5 rounded-2xl border border-white/10 flex justify-between items-center text-xs">
                            <div>
                                <span className="text-white/50 uppercase tracking-wider block text-[10px]">Total Pallets</span>
                                <span className="font-black text-white text-sm">{totalPalletsUnicos} pallets</span>
                            </div>
                            <div className="text-right">
                                <span className="text-white/50 uppercase tracking-wider block text-[10px]">Total Cajas Físicas</span>
                                <span className="font-black text-emerald-400 text-sm">{totalCajas} cajas</span>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab(1)}
                                className="w-1/3 bg-olive-600 hover:bg-olive-300/15 text-[#002D62] font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all"
                            >
                                Atrás
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (cargaPartidas.length === 0) {
                                        alert("Captura al menos un pallet antes de continuar.");
                                        return;
                                    }
                                    setActiveTab(3);
                                }}
                                className="w-2/3 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg"
                            >
                                Siguiente: Fotos
                            </button>
                        </div>
                    </div>
                )}

                {/* PESTAÑA 3: FOTOS */}
                {activeTab === 3 && (
                    <div className="space-y-4">
                        <div className="border-b border-white/10 pb-3">
                            <h2 className="text-lg font-black uppercase tracking-wide text-[#002D62]">Fotografías Obligatorias</h2>
                            <p className="text-[11px] text-[#002D62]">Debes adjuntar las 5 evidencias para activar el envío.</p>
                        </div>

                        <div className="space-y-2.5">
                            {[
                                { key: 'remision', label: '1. Remisión firmada', desc: 'Evidencia en físico legible' },
                                { key: 'termografo', label: '2. Track del chismógrafo', desc: termografo ? `ID: ${termografo}` : 'Sin ID registrado' },
                                { key: 'diesel', label: '3. Nivel de diésel', desc: 'Marcador del tanque' },
                                { key: 'refacciones', label: '4. Refacciones', desc: 'Condición visual' },
                                { key: 'temperatura', label: '5. Display del termo', desc: temperaturaViaje !== '' ? `${temperaturaViaje} °F - ${termoContinuo}` : 'Sin temp' }
                            ].map(item => (
                                <label
                                    key={item.key}
                                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                                        fotos[item.key as keyof typeof fotos]
                                            ? 'bg-emerald-500/10 border-emerald-500/40'
                                            : 'bg-[#001D40] border-white/15 hover:border-white/30'
                                    }`}
                                >
                                    <div>
                                        <div className="font-bold text-xs text-white">{item.label}</div>
                                        <div className="text-[10px] text-white/50">{item.desc}</div>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                                        fotos[item.key as keyof typeof fotos]
                                            ? 'bg-emerald-500 text-white shadow-sm'
                                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    }`}>
                                        {fotos[item.key as keyof typeof fotos] ? 'Lista ✓' : 'Pendiente'}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={e => handleFotoChange(item.key as keyof typeof fotos, e.target.files?.[0] || null)}
                                    />
                                </label>
                            ))}
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab(2)}
                                className="w-1/3 bg-olive-600 hover:bg-olive-300/15 text-[#002D62] font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all"
                            >
                                Atrás
                            </button>
                            <button
                                type="submit"
                                disabled={countFotosCargadas() < 5}
                                className={`w-2/3 font-black py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-xl ${
                                    countFotosCargadas() === 5
                                        ? 'bg-emerald-500 hover:bg-emerald-600 text-[#002D62] shadow-emerald-500/20 cursor-pointer active:scale-98'
                                        : 'bg-[#002D62]/10 text-[#002D62]/30 border border-[#002D62]/5 cursor-not-allowed'
                                }`}
                            >
                                {countFotosCargadas() === 5 ? 'Enviar a Logística' : `Faltan ${5 - countFotosCargadas()} foto(s)`}
                            </button>
                        </div>
                    </div>
                )}
            </form>

            {/* MODAL DE AUDITORÍA CRUZADA */}
            {mostrarModalAuditoria && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-[#001D40] border border-white/20 rounded-3xl w-full max-w-md p-6 shadow-2xl text-white">
                        <h3 className="text-base font-black uppercase tracking-wide mb-1">Auditoría Cruzada</h3>
                        <p className="text-[11px] text-white/60 mb-4">Resultado del cotejo físico vs archivo Excel.</p>

                        {discrepancias.length === 0 ? (
                            <div className="bg-emerald-500/20 border border-emerald-500/40 p-4 rounded-2xl mb-6">
                                <p className="text-emerald-300 font-bold text-xs leading-relaxed">
                                    ✓ Match Confirmado: Todas las partidas y cajas coinciden con el Layout cargado.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-rose-500/15 border border-rose-500/40 p-4 rounded-2xl mb-6 max-h-56 overflow-y-auto space-y-2">
                                <p className="text-rose-300 font-black text-xs uppercase tracking-wider">Discrepancias Detectadas:</p>
                                <ul className="space-y-1.5">
                                    {discrepancias.map((disc, i) => (
                                        <li key={i} className="text-[11px] text-rose-200 border-b border-rose-500/20 pb-1.5 last:border-0">
                                            • {disc}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setMostrarModalAuditoria(false)}
                                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                            >
                                Regresar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarYGuardar}
                                disabled={guardando}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg active:scale-98"
                            >
                                {guardando ? 'Guardando...' : 'Confirmar Envío'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsaEmbarquesPage;