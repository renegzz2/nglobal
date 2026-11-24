import { supabase } from './supabase';
import type { PartidaCarga } from './usaEmbarquesImport';

const bucket = 'usa-embarques-evidencias';
const maxBytes = 8 * 1024 * 1024;
const extensions: Readonly<Record<string, string>> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
};

export const tiposFotoEmbarque = [
    ['remision', 'Remisión firmada'],
    ['termografo', 'Termógrafo'],
    ['diesel', 'Nivel de diésel'],
    ['refacciones', 'Refacciones'],
    ['temperatura', 'Display del termo'],
] as const;

export type TipoFotoEmbarque = typeof tiposFotoEmbarque[number][0];
export type FotosEmbarque = Record<TipoFotoEmbarque, File | null>;
type RutasFotos = Record<TipoFotoEmbarque, string>;

export interface IntentoEmbarque {
    id: string;
    propietario?: string;
    cargas: Partial<Record<TipoFotoEmbarque, { archivo: File; ruta: string; confirmada: boolean }>>;
}

interface DatosEmbarque {
    cliente_id: string;
    proyecto_id: string;
    sucursal_id: string | null;
    transportista_id: string | null;
    transportista_manual: string;
    fecha_salida: string;
    operador: string;
    placas_caja: string;
    placas_tractor: string;
    economico: string;
    pies: string;
    termografo: string;
    temperatura: number;
    termo_continuo: string;
    discrepancias: string[];
}

export function extensionFotoEmbarque(archivo: Pick<File, 'type' | 'size'>): string {
    if (!Object.hasOwn(extensions, archivo.type)) throw new Error('Usa fotos JPG, PNG, WebP, HEIC o HEIF.');
    if (archivo.size <= 0 || archivo.size > maxBytes) throw new Error('Cada foto debe ocupar entre 1 byte y 8 MB.');
    return extensions[archivo.type];
}

export async function finalizarEmbarqueUsa(
    intento: IntentoEmbarque, datos: DatosEmbarque, partidas: PartidaCarga[], fotos: FotosEmbarque,
): Promise<{ folio: string }> {
    const { data: { user }, error: errorSesion } = await supabase.auth.getUser();
    if (errorSesion) throw errorSesion;
    if (!user || (intento.propietario && intento.propietario !== user.id)) {
        throw new Error('Vuelve a iniciar sesión con la cuenta que inició este embarque.');
    }
    intento.propietario = user.id;

    const pendientes = tiposFotoEmbarque.map(([tipo, etiqueta]) => {
        const archivo = fotos[tipo];
        if (!archivo) throw new Error(`Falta la foto de ${etiqueta}.`);
        return { tipo, etiqueta, archivo, extension: extensionFotoEmbarque(archivo) };
    });

    const resultados = await Promise.allSettled(pendientes.map(async ({ tipo, etiqueta, archivo, extension }) => {
        let carga = intento.cargas[tipo];
        if (carga?.archivo !== archivo) {
            carga = { archivo, ruta: `${user.id}/${intento.id}/${tipo}-${crypto.randomUUID()}.${extension}`, confirmada: false };
            intento.cargas[tipo] = carga;
        }
        if (!carga.confirmada) {
            const { error } = await supabase.storage.from(bucket).upload(carga.ruta, archivo, { contentType: archivo.type, upsert: false });
            // The upload may have succeeded even if the first response was lost.
            if (error) {
                const { data } = await supabase.storage.from(bucket).exists(carga.ruta);
                if (!data) throw new Error(`No se pudo subir la foto de ${etiqueta}. ${error.message}`);
            }
            carga.confirmada = true;
        }
        return [tipo, carga.ruta] as const;
    }));

    const rutas: Partial<RutasFotos> = {};
    for (const resultado of resultados) {
        if (resultado.status === 'rejected') throw resultado.reason;
        const [tipo, ruta] = resultado.value;
        rutas[tipo] = ruta;
    }

    const { data, error } = await supabase.rpc('ng_finalizar_embarque_usa', {
        p_solicitud: intento.id,
        p_datos: datos,
        p_partidas: partidas.map(({ numero_pallet, producto_id, remision, mid, lote_pt, cantidad_cajas }) => ({
            numero_pallet, producto_id, remision, mid, lote_pt, cantidad_cajas,
        })),
        p_fotos: rutas,
    });
    if (error) throw error;
    if (typeof data?.folio !== 'string') throw new Error('Supabase no confirmó el folio del despacho. Reintenta esta misma captura.');
    return { folio: data.folio };
}

export async function obtenerFotosDespacho(despachoId: string): Promise<{ etiqueta: string; url: string }[]> {
    const { data, error } = await supabase.rpc('ng_fotos_despacho_usa', { p_despacho_id: despachoId });
    if (error) throw error;
    const rutas: Partial<RutasFotos> = data ?? {};
    const fotos = tiposFotoEmbarque.flatMap(([tipo, etiqueta]) => {
        const ruta = rutas[tipo];
        return ruta ? [{ etiqueta, ruta }] : [];
    });
    if (!fotos.length) return [];
    const { data: enlaces, error: errorEnlaces } = await supabase.storage.from(bucket)
        .createSignedUrls(fotos.map(foto => foto.ruta), 300);
    if (errorEnlaces) throw errorEnlaces;
    const porRuta = new Map(enlaces.map(enlace => [enlace.path, enlace.signedUrl]));
    return fotos.map(({ etiqueta, ruta }) => {
        const url = porRuta.get(ruta);
        if (!url) throw new Error(`No se pudo abrir la evidencia de ${etiqueta}.`);
        return { etiqueta, url };
    });
}
