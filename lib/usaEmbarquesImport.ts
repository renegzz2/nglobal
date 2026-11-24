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

type FilaExcel = Record<string, unknown>;

const normalizar = (valor: unknown): string =>
    String(valor ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

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
