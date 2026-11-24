import type { Incident } from '../../types';
import { supabase } from '../../lib/supabase';
import { initOfflineDB } from '../../utils/offlineStorage';

interface IncidentRow {
    id: string;
    shipment_id: string;
    occurred_at: string;
    kind: string;
    location: string;
    description: string;
}

interface PendingIncident {
    ownerId: string;
    row: IncidentRow;
    rejected?: boolean;
}

export interface ListedIncident extends Incident {
    id?: string;
    pending?: boolean;
    rejected?: boolean;
}

export const incidentsChanged = 'ng:incidents-changed';

function fromRow(row: IncidentRow): ListedIncident {
    return { id: row.id, timestamp: row.occurred_at, type: row.kind, location: row.location, description: row.description };
}

async function withQueue<T>(
    mode: IDBTransactionMode,
    request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await initOfflineDB();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction('shipment_incidents', mode);
            const operation = request(transaction.objectStore('shipment_incidents'));
            transaction.oncomplete = () => resolve(operation.result);
            transaction.onabort = () => reject(transaction.error ?? operation.error);
        });
    } finally {
        db.close();
    }
}

function pendingIncidents(ownerId: string): Promise<PendingIncident[]> {
    return withQueue('readonly', store => store.index('ownerId').getAll(ownerId));
}

export async function listIncidents(ownerId: string, shipmentId: string): Promise<ListedIncident[]> {
    const [localResult, remoteResult] = await Promise.allSettled([
        pendingIncidents(ownerId),
        navigator.onLine
            ? supabase.from('usa_shipment_incidents').select('id,shipment_id,occurred_at,kind,location,description')
                .eq('shipment_id', shipmentId).order('occurred_at')
            : Promise.resolve(null),
    ]);
    const local = localResult.status === 'fulfilled' ? localResult.value : [];
    const remote = remoteResult.status === 'fulfilled' ? remoteResult.value : null;
    if (remote?.error && remote.error.code) throw remote.error;
    const incidents = new Map<string, ListedIncident>(
        ((remote?.data || []) as IncidentRow[]).map(row => [row.id, fromRow(row)]),
    );
    for (const item of local) {
        if (item.row.shipment_id !== shipmentId || incidents.has(item.row.id)) continue;
        incidents.set(item.row.id, { ...fromRow(item.row), pending: !item.rejected, rejected: item.rejected });
    }
    return [...incidents.values()];
}

export async function queueIncident(ownerId: string, shipmentId: string, incident: Incident) {
    const row: IncidentRow = {
        id: crypto.randomUUID(),
        shipment_id: shipmentId,
        occurred_at: incident.timestamp,
        kind: incident.type,
        location: incident.location.trim(),
        description: incident.description.trim(),
    };
    await withQueue('readwrite', store => store.put({ ownerId, row } satisfies PendingIncident));
    return row.id;
}

export async function syncIncidents(ownerId: string, signal?: AbortSignal) {
    if (signal?.aborted || !navigator.onLine) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== ownerId) return;

    let changed = false;
    for (const item of await pendingIncidents(ownerId)) {
        if (signal?.aborted || !navigator.onLine) return;
        if (item.rejected) continue;
        const { error } = await supabase.from('usa_shipment_incidents')
            .upsert({ ...item.row, reported_by: ownerId }, { onConflict: 'id', ignoreDuplicates: true });
        if (error) {
            if (['22001', '22P02', '23503', '23514'].includes(error.code)) {
                await withQueue('readwrite', store => store.put({ ...item, rejected: true }));
                changed = true;
            }
            continue;
        }
        await withQueue('readwrite', store => store.delete(item.row.id));
        changed = true;
    }
    if (changed) window.dispatchEvent(new Event(incidentsChanged));
}
