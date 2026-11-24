import React, { useState } from 'react';
import { obtenerFotosDespacho } from '../lib/usaEmbarquesFinalize';

export function UsaShipmentEvidence({ despachoId }: { despachoId: string }) {
    const [fotos, setFotos] = useState<{ etiqueta: string; url: string }[]>();
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');

    async function cargar() {
        setCargando(true);
        setError('');
        try {
            setFotos(await obtenerFotosDespacho(despachoId));
        } catch {
            setFotos(undefined);
            setError('No se pudieron cargar las fotos. Inténtalo de nuevo.');
        } finally {
            setCargando(false);
        }
    }

    return (
        <section className="rounded-2xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-primary">Evidencias del embarque</h3>
                <button type="button" disabled={cargando} onClick={cargar}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary disabled:opacity-60">
                    {cargando ? 'Cargando…' : fotos?.length ? 'Actualizar enlaces' : 'Ver fotos'}
                </button>
            </div>
            {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
            {fotos?.length === 0 && <p className="mt-2 text-xs text-text-secondary">Este despacho no tiene fotos registradas.</p>}
            {!!fotos?.length && (
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    {fotos.map(foto => (
                        <li key={foto.etiqueta}>
                            <a href={foto.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline">
                                {foto.etiqueta}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
