import * as XLSX from 'xlsx';

export interface ProductoCatalog {
    id: string;
    nombre_del_producto: string;
    alias_usa?: string | null;
    config_usa?: string | null;
    display_label?: string;
}

export interface PartidaCarga {
    id: string;
    numero_pallet: number | string;
    producto_id: string;
    remision: string;
    mid: string;
    lote_pt: string;
    cantidad_cajas: number;
    calidad?: string;
    lbs?: string;
    incidencia_importacion?: string;
}

export type FilaExcel = Record<string, unknown>;

const normalizar = (valor: unknown): string =>
    String(valor ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizarEtiqueta = (valor: unknown): string =>
    normalizar(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const etiquetasSalida = {
    cliente: ['cliente'],
    salida: ['fecha y hora de salida', 'fecha hora de salida', 'fecha de salida'],
    hora: ['hora de salida'],
    transportista: ['transporte', 'linea transportista', 'linea de transporte', 'transportista'],
    operador: ['operador', 'nombre del operador'],
    celular: ['no telefono', 'numero de telefono', 'telefono del operador', 'telefono operador', 'celular operador', 'celular del operador', 'celular'],
    placasTractor: ['placas tractor', 'placas de tractor', 'placas del tractor'],
    placasCaja: ['placas caja', 'placas de caja', 'placas de la caja'],
    economico: ['economico', 'no economico', 'numero economico'],
    pies: ['pies', 'pies del remolque'],
    temperatura: ['temperatura programada', 'temperatura programada f', 'temp programada', 'temp programada f'],
} as const;

type CampoSalida = keyof typeof etiquetasSalida;
const camposPorEtiqueta = new Map<string, CampoSalida>(
    (Object.keys(etiquetasSalida) as CampoSalida[]).flatMap(campo =>
        etiquetasSalida[campo].map(etiqueta => [etiqueta, campo] as const))
);

const dosDigitos = (valor: number) => String(valor).padStart(2, '0');

function leerHora(celda?: XLSX.CellObject): string | undefined {
    if (typeof celda?.v === 'number' && celda.v >= 0 && celda.v < 1) {
        const segundos = Math.min(86399, Math.floor(celda.v * 86400 + 0.00001));
        return [Math.floor(segundos / 3600), Math.floor(segundos / 60) % 60, segundos % 60].map(dosDigitos).join(':');
    }
    const texto = String(celda?.v ?? '').toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
    const partes = /^(\d{1,2}):(\d{2})(?::(\d{2}))?([ap]m)?$/.exec(texto);
    if (!partes) return;
    let horas = Number(partes[1]);
    const minutos = Number(partes[2]);
    const segundos = Number(partes[3] ?? 0);
    if (minutos >= 60 || segundos >= 60 || (partes[4] ? horas < 1 || horas > 12 : horas >= 24)) return;
    if (partes[4]) horas = horas % 12 + (partes[4] === 'pm' ? 12 : 0);
    return [horas, minutos, segundos].map(dosDigitos).join(':');
}

function leerFechaSalida(fecha: XLSX.CellObject, hora: XLSX.CellObject | undefined, date1904: boolean): string | undefined {
    let anio: number, mes: number, dia: number;
    let reloj = leerHora(hora);
    if (typeof fecha.v === 'number') {
        const dias = Math.floor(fecha.v);
        if (!Number.isFinite(dias) || dias < (date1904 ? 0 : 1) || (!date1904 && dias === 60)) return;
        const origen = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
        // Excel reserva el día 60 para el 29 de febrero de 1900, que no existió.
        const ajuste = !date1904 && dias > 60 ? 1 : 0;
        const calendario = new Date(origen + (dias - ajuste) * 86400000);
        anio = calendario.getUTCFullYear();
        mes = calendario.getUTCMonth() + 1;
        dia = calendario.getUTCDate();
        if (!Number.isInteger(fecha.v) || /\d:\d{2}/.test(fecha.w ?? '')) {
            reloj = leerHora({ t: 'n', v: fecha.v % 1 });
        }
    } else {
        const texto = String(fecha.v ?? '').trim();
        const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.+))?$/.exec(texto);
        const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+(.+))?$/.exec(texto);
        if (!iso && !local) return;
        const [, primero, segundo, tercero, horaEnFecha] = (iso ?? local)!;
        anio = Number(iso ? primero : tercero);
        mes = Number(segundo);
        dia = Number(iso ? tercero : primero);
        if (anio < 100) anio += 2000;
        reloj = leerHora({ t: 's', v: horaEnFecha ?? '' }) ?? reloj;
    }
    const fechaValida = new Date(Date.UTC(anio, mes - 1, dia));
    if (!reloj || anio > 9999 || fechaValida.getUTCFullYear() !== anio || fechaValida.getUTCMonth() !== mes - 1 ||
        fechaValida.getUTCDate() !== dia) return;
    return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}T${reloj}`;
}

export function leerLayoutEmbarque(libro: XLSX.WorkBook) {
    const nombre = libro.SheetNames.find(hoja => hoja.toLowerCase().includes('layout')) ?? libro.SheetNames[0];
    const hoja = libro.Sheets[nombre];
    if (!hoja?.['!ref']) throw new Error('El Excel no contiene una hoja de carga.');
    const rango = XLSX.utils.decode_range(hoja['!ref']);
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1 });
    const encabezados = filas.findIndex(fila =>
        fila.some(celda => normalizarEtiqueta(celda) === 'producto') &&
        fila.some(celda => normalizarEtiqueta(celda).includes('cajas'))
    );
    if (encabezados < 0) throw new Error('No se encontraron las columnas PRODUCTO y CAJAS.');
    const filaEncabezados = rango.s.r + encabezados;
    const datos: Partial<Record<Exclude<CampoSalida, 'hora' | 'temperatura'>, string>> & {
        temperatura?: number;
        termografo?: string;
    } = {};
    let salida: XLSX.CellObject | undefined;
    let hora: XLSX.CellObject | undefined;
    let horaContigua: XLSX.CellObject | undefined;
    const celda = (r: number, c: number): XLSX.CellObject | undefined => hoja[XLSX.utils.encode_cell({ r, c })];

    for (let r = rango.s.r; r < filaEncabezados; r++) {
        for (let c = rango.s.c; c < rango.e.c; c++) {
            const campo = camposPorEtiqueta.get(normalizarEtiqueta(celda(r, c)?.v));
            if (!campo) continue;
            const etiqueta = hoja['!merges']?.find(rango => rango.s.r === r && rango.s.c === c);
            const valorCol = (etiqueta?.e.c ?? c) + 1;
            const valor = celda(r, valorCol);
            if (!valor || valor.t === 'e' || camposPorEtiqueta.has(normalizarEtiqueta(valor.v))) continue;
            if (campo === 'salida') {
                salida ??= valor;
                horaContigua ??= celda(r, valorCol + 1);
            } else if (campo === 'hora') {
                hora ??= valor;
            } else {
                const texto = String(valor.w ?? valor.v ?? '').trim().replace(/\s+/g, ' ');
                if (campo === 'temperatura') {
                    const fahrenheit = /^([+-]?\d+(?:[.,]\d+)?)\s*(?:°\s*)?f?$/i.exec(texto);
                    if (fahrenheit) {
                        const grados = Number(fahrenheit[1].replace(',', '.'));
                        if (Number.isFinite(grados)) datos.temperatura ??= grados;
                    }
                } else if (texto) {
                    datos[campo] ??= texto;
                }
            }
        }
    }
    if (salida) datos.salida = leerFechaSalida(salida, hora ?? horaContigua, Boolean(libro.Workbook?.WBProps?.date1904));

    const detalle = XLSX.utils.sheet_to_json<FilaExcel>(hoja, { range: { s: { r: filaEncabezados, c: rango.s.c }, e: rango.e } })
        .map(fila => Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [clave.trim().toUpperCase(), valor])))
        .filter(fila => fila.PRODUCTO && (fila.CAJAS !== undefined || fila.PALLET !== undefined));
    if (!detalle.length) throw new Error('No se encontraron partidas de carga en el Excel.');
    const termografos = new Set(detalle.map(fila => String(fila.TERMOGRAFO ?? fila['TERMÓGRAFO'] ?? '').trim().toUpperCase())
        .filter(id => id && !['NA', 'N/A', 'ND', 'N/D', 'S/D', '-'].includes(id)));
    if (termografos.size === 1) datos.termografo = [...termografos][0];
    return { datos, filas: detalle, variosTermografos: termografos.size > 1 };
}

export function buscarCatalogoPorNombre<T>(
    nombre: string, catalogo: readonly T[], obtenerNombre: (elemento: T) => string,
): T | undefined {
    const etiqueta = normalizarEtiqueta(nombre);
    if (!etiqueta) return;
    const entradas = catalogo.map(elemento => ({ elemento, etiqueta: normalizarEtiqueta(obtenerNombre(elemento)) }));
    const exactas = entradas.filter(entrada => entrada.etiqueta === etiqueta);
    if (exactas.length) return exactas.length === 1 ? exactas[0].elemento : undefined;

    // Los layouts a veces omiten palabras del nombre comercial o la razón social.
    const sinSufijo = (valor: string) => valor.replace(/ (?:llc|inc|s a de c v|sa de cv)$/, '');
    const palabras = sinSufijo(etiqueta).split(' ');
    const coincidencias = entradas.filter(entrada => {
        const candidatas = sinSufijo(entrada.etiqueta).split(' ');
        let siguiente = 0;
        for (const palabra of candidatas) {
            if (palabra === palabras[siguiente]) siguiente++;
        }
        return siguiente === palabras.length;
    });
    return coincidencias.length === 1 ? coincidencias[0].elemento : undefined;
}

// Solo un peso simple admite la unidad opcional. Las configuraciones compuestas
// se comparan completas: no inferir que "5" equivale a "25" ni a "10 x 5".
const normalizarLibras = (valor: unknown): string => {
    const texto = normalizar(valor);
    const peso = texto.match(/^(\d+(?:\.\d+)?)\s*(?:lbs?\.?)?$/);
    return peso ? String(Number(peso[1])) : texto;
};

export type ConciliacionProducto =
    | { estado: 'unico'; producto: ProductoCatalog }
    | { estado: 'sin_coincidencia' }
    | { estado: 'ambiguo'; candidatos: ProductoCatalog[] };

export function conciliarProductoExcel(
    fila: FilaExcel,
    catalogo: readonly ProductoCatalog[]
): ConciliacionProducto {
    const nombre = normalizar(fila.PRODUCTO);
    const calidad = normalizar(fila.CALIDAD);
    const libras = normalizarLibras(fila.LBS);
    if (!nombre) return { estado: 'sin_coincidencia' };

    // Un dato ausente del Excel no restringe; uno presente debe coincidir,
    // incluso si la variante del catálogo no tiene ese dato capturado.
    const candidatos = catalogo.filter(p =>
        normalizar(p.nombre_del_producto) === nombre &&
        (!calidad || normalizar(p.alias_usa) === calidad) &&
        (!libras || normalizarLibras(p.config_usa) === libras)
    );
    if (candidatos.length === 1) return { estado: 'unico', producto: candidatos[0] };
    if (candidatos.length > 1) return { estado: 'ambiguo', candidatos };
    return { estado: 'sin_coincidencia' };
}

export function crearPartidasDesdeExcel(
    filas: readonly FilaExcel[],
    catalogo: readonly ProductoCatalog[],
    timestamp = Date.now()
): PartidaCarga[] {
    return filas.map((row, index) => {
        const resultado = conciliarProductoExcel(row, catalogo);
        const origen = `Excel: ${String(row.PRODUCTO ?? '')} | Calidad: ${String(row.CALIDAD ?? '') || 'Sin dato'} | Lbs: ${String(row.LBS ?? '') || 'Sin dato'}`;
        return {
            id: `${timestamp}-${index}`,
            numero_pallet: row.PALLET !== undefined ? String(row.PALLET).trim() : index + 1,
            producto_id: resultado.estado === 'unico' ? resultado.producto.id : '',
            remision: String(row.REMISION || '').trim(),
            mid: String(row.MID || '').trim(),
            lote_pt: String(row.LOTE || '').trim(),
            cantidad_cajas: parseFloat(String(row.CAJAS)) || 0,
            calidad: String(row.CALIDAD ?? ''),
            lbs: String(row.LBS ?? ''),
            ...(resultado.estado === 'unico' ? {} : {
                incidencia_importacion: resultado.estado === 'ambiguo'
                    ? `${origen}. Coincidencia ambigua (${resultado.candidatos.length} variantes). Selecciona el producto manualmente.`
                    : `${origen}. Sin coincidencia con todos los datos proporcionados. Selecciona el producto manualmente.`
            })
        };
    });
}
