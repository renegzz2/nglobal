import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.119.2'
import { inRecipientSchedule, matchesSecret, mexicoCityScheduleTime, readBody, sha256, verifyTiveSignature } from '../_shared/webhook.ts';

async function enviarWhatsApp(supabase: SupabaseClient, eventKey: string, templateName: string, params: string[]) {
    const { data: recipients, error } = await supabase.from('alert_recipients').select('*');
    if (error) throw error;

    const { day, minute } = mexicoCityScheduleTime(new Date());
    const phones = [...new Set<string>((recipients ?? [])
        .filter((person: any) => person.activo !== false &&
            inRecipientSchedule(person.dias_activos, person.hora_inicio, person.hora_fin, day, minute))
        .map((person: any) => String(person.telefono ?? '').replace(/\D/g, ''))
        .filter((phone: string) => /^\d{8,15}$/.test(phone)))];
    if (!phones.length) return { accepted: 0, failed: 0, previouslyProcessed: 0, unknown: 0 };
    const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
    const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    if (!phoneId || !token) throw new Error('WhatsApp configuration incomplete');

    const parameters = params.map(text => ({
        type: 'text', text: String(text || 'S/D').replace(/[\t\r\n⦁]/g, ' ').replace(/ {2,}/g, ' ').trim(),
    }));
    const results = await Promise.allSettled(phones.map(async phone => {
        const key = await sha256(eventKey + ':' + phone);
        const { data: claimed, error: claimError } = await supabase.rpc('ng_claim_webhook', {
            channel: 'dispatch', event_key: key,
        });
        if (claimError) throw claimError;
        if (!claimed) return 'previouslyProcessed';

        let response: Response;
        try {
            response = await fetch('https://graph.facebook.com/v22.0/' + phoneId + '/messages', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messaging_product: 'whatsapp', to: phone, type: 'template',
                    template: { name: templateName, language: { code: 'es_MX' }, components: [{ type: 'body', parameters }] },
                }),
                signal: AbortSignal.timeout(12_000),
            });
        } catch {
            console.error('WhatsApp delivery outcome unknown', { key });
            return 'unknown';
        }
        if (!response.ok) {
            console.error('WhatsApp delivery rejected', { status: response.status, key });
            const { error: releaseError } = await supabase.rpc('ng_release_webhook', { channel: 'dispatch', event_key: key });
            if (releaseError) throw releaseError;
            return 'failed';
        }
        console.info('WhatsApp delivery accepted', { key });
        return 'accepted';
    }));
    const totals = { accepted: 0, failed: 0, previouslyProcessed: 0, unknown: 0 };
    for (const result of results) {
        if (result.status === 'fulfilled') totals[result.value]++;
        else {
            console.error('WhatsApp delivery processing failed', { eventKey });
            totals.failed++;
        }
    }
    return totals;
}

function deliveryResponse(outcome: { accepted: number; failed: number; previouslyProcessed: number; unknown: number }) {
    const success = outcome.failed === 0 && outcome.unknown === 0;
    return Response.json({ success, ...outcome }, { status: outcome.failed ? 502 : outcome.unknown ? 202 : 200 });
}

// Función auxiliar para extraer los datos relacionales del viaje
async function getRichData(supabase: any, tripRecord: any) {
    let clientName = 'S/D';
    let carrierName = 'S/D';
    let productDetails = 'S/D';
    let invoiceNumbers = 'S/D';

    // 1. Obtener Nombre del Cliente (Soporte Multicliente)
    if (tripRecord?.client_ids && tripRecord.client_ids.length > 0) {
        const { data } = await supabase.from('usa_clientes').select('nombre').in('id', tripRecord.client_ids);
        if (data && data.length > 0) {
            clientName = data.map((client: { nombre: string }) => client.nombre).join(' | ');
        }
    } else if (tripRecord?.client_id) { // Respaldo para viajes antiguos
        const { data } = await supabase.from('usa_clientes').select('nombre').eq('id', tripRecord.client_id).single();
        if (data) clientName = data.nombre;
    }
    if (tripRecord?.linea_transportista_id) {
        const { data } = await supabase.from('usa_lineas_transporte').select('nombre').eq('id', tripRecord.linea_transportista_id).single();
        if (data) carrierName = data.nombre;
    }
    if (tripRecord?.products && Array.isArray(tripRecord.products)) {
        const productNames: string[] = [];
        const invoices: string[] = [];
        for (const prod of tripRecord.products) {
            let name = prod.manualProductName || prod.manual_product_name;
            if (!name && (prod.productId || prod.product_id)) {
                const { data } = await supabase.from('usa_productos').select('nombre_del_producto').eq('id', prod.productId || prod.product_id).single();
                if (data) name = data.nombre_del_producto;
            }
            if (name) productNames.push(name);
            
            const inv = prod.invoiceNumber || prod.invoice_number;
            if (inv) invoices.push(inv);
        }
        
        // Usamos Set para eliminar valores duplicados antes de unirlos con " | "
        if (productNames.length > 0) {
            productDetails = [...new Set(productNames)].join(' | ');
        }
        if (invoices.length > 0) {
            invoiceNumbers = [...new Set(invoices)].join(' | ');
        }
    }

    return {
        tripId: tripRecord?.trip_id || 'S/D',
        invoiceNumbers,
        clientName,
        productDetails,
        carrierName,
        driverName: tripRecord?.driver_name || 'S/D'
    };
}

serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const internal = await matchesSecret(req.headers.get('x-ng-db-webhook-secret'), Deno.env.get('DB_WEBHOOK_SECRET'));
    const signature = req.headers.get('x-tive-signature');
    if (!internal && !signature) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const raw = await readBody(req, 128_000);
    if (raw === null) return Response.json({ error: 'Payload too large' }, { status: 413 });
    if (!internal && !await verifyTiveSignature(signature, raw, Deno.env.get('TIVE_WEBHOOK_SECRET'))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return Response.json({ error: 'Invalid event' }, { status: 400 });
    }
    const externalId = payload.EventId ?? payload.eventId ?? payload.alert?.id;
    const identity = !internal && typeof externalId === 'string' && externalId.trim()
        ? externalId : raw;
    const eventKey = await sha256((internal ? 'internal:' : 'tive:') + identity);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // =========================================================
    // ESCENARIO 1: CAMBIOS EN PLATAFORMA (REACT)
    // =========================================================
    if (internal) {
        if (payload.table === 'usa_shipment_incidents' && payload.type === 'INSERT' && typeof payload.record?.id === 'string') {
            const { data: incident, error: incidentError } = await supabase.from('usa_shipment_incidents')
                .select('shipment_id,kind,location,description').eq('id', payload.record.id).single();
            if (incidentError) throw incidentError;
            const { data: trip, error: tripError } = await supabase.from('usa_shipment_reports')
                .select('*').eq('id', incident.shipment_id).single();
            if (tripError) throw tripError;
            const rich = await getRichData(supabase, trip);
            return deliveryResponse(await enviarWhatsApp(supabase, await sha256('incident:' + payload.record.id), 'alerta_despacho_v2', [
                rich.tripId, rich.invoiceNumbers, rich.clientName, rich.productDetails, rich.carrierName, rich.driverName,
                'INCIDENCIA: ' + incident.kind,
                ((incident.location ? incident.location + '. ' : '') + incident.description).slice(0, 400),
            ]));
        }
        if (!['UPDATE', 'INSERT'].includes(payload.type) ||
            !['usa_shipment_reports', 'nacional_shipment_reports'].includes(payload.table) ||
            !payload.record || typeof payload.record !== 'object') {
            return Response.json({ error: 'Invalid database event' }, { status: 400 });
        }
        const oldStatus = payload.old_record?.logistic_status;
        const newStatus = payload.record?.logistic_status;
        
        if (payload.type === 'UPDATE' && (!newStatus || oldStatus === newStatus)) {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        
        const trackerId = payload.record.tive_tracker_id;
        let lat = null, lng = null;
        if (trackerId) {
            const { data: lastLocation } = await supabase.from('tive_events').select('lat, lng').eq('tracker_id', trackerId).not('lat', 'is', null).order('timestamp', { ascending: false }).limit(1).single();
            if (lastLocation) { lat = lastLocation.lat; lng = lastLocation.lng; }
        }
        
        const motivoTexto = payload.type === 'INSERT' ? `🚀 NUEVO VIAJE: ${newStatus}` : `🟢 NUEVO ESTATUS: ${newStatus}`;
        const baseDetails = lat !== null && lng !== null ? `Ubicación GPS: https://maps.google.com/?q=${lat},${lng}` : `Actualizado desde plataforma (Sin GPS).`;
        
        const richData = await getRichData(supabase, payload.record);
        
        // Orden exacto de las variables {{1}} a la {{8}} en Meta
        const templateParams = [
            richData.tripId,          // {{1}}
            richData.invoiceNumbers,  // {{2}}
            richData.clientName,      // {{3}}
            richData.productDetails,  // {{4}}
            richData.carrierName,     // {{5}}
            richData.driverName,      // {{6}}
            motivoTexto,              // {{7}}
            baseDetails               // {{8}}
        ];

        // NOTA: Si tu plantilla en Meta se llama distinto, cámbialo aquí abajo
        return deliveryResponse(await enviarWhatsApp(supabase, eventKey, "alerta_despacho_v2", templateParams));
    }

    // =========================================================
    // ESCENARIO 2: PING FÍSICO DESDE EL RASTREADOR TIVE
    // =========================================================
    const trackerId = payload.DeviceName || payload.EntityName || payload.tracker?.id || payload.trackerId || payload.alert?.trackerId || payload.shipment?.trackerId;
    if (typeof trackerId !== 'string' || !trackerId.trim() || trackerId.length > 128) return Response.json({ error: 'Invalid tracker' }, { status: 400 });

    console.log(`📡 Ping recibido de Tive [Tracker: ${trackerId}]`);

    const rawAlertType = payload.alert?.type || payload.type || payload.alertType || 'NORMAL';
    const alertType = String(rawAlertType).toLowerCase();
    const hasAlertObject = !!payload.alert;

    const { data: activeUsa, error: usaError } = await supabase.from('usa_shipment_reports').select('*').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').neq('logistic_status', 'Cancelado').limit(1);
    const { data: activeNac, error: nationalError } = await supabase.from('nacional_shipment_reports').select('*').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').neq('logistic_status', 'Cancelado').limit(1);
    if (usaError || (nationalError && nationalError.code !== 'PGRST205' && nationalError.code !== '42P01')) throw usaError || nationalError;
    const activeTrip = (activeUsa && activeUsa.length > 0) ? activeUsa[0] : ((activeNac && activeNac.length > 0) ? activeNac[0] : null);

    if (!activeTrip) return new Response(JSON.stringify({ success: true }), { status: 200 });

    if ((alertType !== 'normal' && alertType !== 'ping') || hasAlertObject) {
        console.log(`⚠️️ ALERTA DETECTADA [Tracker: ${trackerId}]: ${alertType}`);
    }

    const rawTemp = payload.Temperature?.Fahrenheit ?? payload.temperature;
    const tempF = typeof rawTemp === 'number' && Number.isFinite(rawTemp) ? rawTemp : null;
    const hum = payload.Humidity?.Percentage ?? null;
    const lat = payload.Location?.Latitude ?? payload.location?.latitude ?? null;
    const lng = payload.Location?.Longitude ?? payload.location?.longitude ?? null;
    const locName = payload.Location?.FormattedAddress ?? payload.location?.address ?? 'Ubicación Desconocida';
    const bat = payload.Battery?.Percentage ?? null;
    const time = payload.EntryTimeUtc || new Date().toISOString();

    if (tempF !== null || lat !== null) {
        const { error: eventError } = await supabase.rpc('ng_store_tive_event', {
            event_key: eventKey,
            event: { tracker_id: trackerId, temperature: tempF, humidity: hum, lat, lng, location: locName, battery: bat, timestamp: time, alert_type: alertType },
        });
        if (eventError) throw eventError;
    }

    const isStopAlert = alertType.includes('stop');
    const isDeviation = alertType.includes('route') || alertType.includes('geofence') || alertType.includes('deviation');
    const stringifiedPayload = JSON.stringify(payload).toLowerCase();
    const isTemp = alertType.includes('temperature') || alertType.includes('temp') || stringifiedPayload.includes('"type":"temperature"');

    const requiresNotification = isDeviation || isTemp || isStopAlert;

    if (!requiresNotification) return new Response(JSON.stringify({ success: true }), { status: 200 });

    const currentStatus = String(activeTrip.logistic_status).toUpperCase();
    if (currentStatus === 'HOLD FDA' || currentStatus === 'REVIEW FDA') {
        console.log(`🔇 ALERTA SILENCIADA [Tracker: ${trackerId}]: El viaje ${activeTrip.trip_id} está en ${currentStatus}.`);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    let motivoTexto = "Notificación de Sistema";
    let baseDetails = "Revisar plataforma.";

    if (isTemp) {
        motivoTexto = "🌡️ ALERTA: TEMPERATURA";
        baseDetails = `Temperatura actual: ${tempF !== null ? tempF.toFixed(1) : 'N/D'}°F. Valores fuera de los parámetros.`;
    } else if (isDeviation) {
        motivoTexto = "📍 ALERTA: DESVÍO";
        baseDetails = `Desviación de ruta/geocerca. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    } else if (isStopAlert) {
        motivoTexto = "⏱️ ALERTA: PARADA PROLONGADA";
        baseDetails = `El envío se detuvo más de lo permitido. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    }

    const richData = await getRichData(supabase, activeTrip);
    
    // Orden exacto de las variables {{1}} a la {{8}} en Meta
    const templateParams = [
        richData.tripId,          // {{1}}
        richData.invoiceNumbers,  // {{2}}
        richData.clientName,      // {{3}}
        richData.productDetails,  // {{4}}
        richData.carrierName,     // {{5}}
        richData.driverName,      // {{6}}
        motivoTexto,              // {{7}}
        baseDetails               // {{8}}
    ];

    // NOTA: Si tu plantilla en Meta se llama distinto, cámbialo aquí abajo
    return deliveryResponse(await enviarWhatsApp(supabase, eventKey, "alerta_despacho_v2", templateParams));

  } catch (error) {
    console.error("❌ Error General:", error);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
});