import { supabase } from '../../lib/supabase';
import { toSnakeCase } from '../../utils/formatters';

type ShipmentInput = { id?: string; tripId: string; logisticStatus?: string; [field: string]: unknown };

export async function saveShipments(items: ShipmentInput[], status: string | null) {
    const { error } = await supabase.rpc('ng_save_shipments', {
        shipments: items.map(item => toSnakeCase({
            ...item,
            logisticStatus: status || item.logisticStatus || 'Confirmado',
        })),
    });
    if (error) throw error;
}

export async function promoteShipment(shipment: ShipmentInput) {
    const { error } = await supabase.rpc('ng_promote_shipment', { shipment: toSnakeCase(shipment) });
    if (error) throw error;
}

export async function deleteShipment(id: string) {
    const { error } = await supabase.from('usa_shipment_reports').delete().eq('id', id).select('id').single();
    if (error) throw error;
}

export async function updateShipment(id: string, fields: Record<string, unknown>) {
    const { error } = await supabase.from('usa_shipment_reports').update(fields).eq('id', id).select('id').single();
    if (error) throw error;
}
