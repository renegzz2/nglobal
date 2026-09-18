import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function enviarWhatsApp(supabase: any, folioViaje: string, trackerId: string, motivoTexto: string, detallesTexto: string) {
    const { data: recipients } = await supabase.from('alert_recipients').select('*');
    const mxDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const diaActual = mxDate.getDay(); 
    const horaActual = mxDate.getHours(); 
    
    const phonesToNotify: string[] = [];

    if (recipients) {
        for (const person of recipients) {
            if (person.activo === false) continue;
            
            if (person.dias_activos) {
                const diasPermitidos = person.dias_activos.split(',').map((d: string) => parseInt(d.trim(), 10));
                if (!diasPermitidos.includes(diaActual)) continue; 
            }

            let isWithinHours = false;
            if (person.hora_inicio && person.hora_fin) {
                const startStr = String(person.hora_inicio).toLowerCase();
                const endStr = String(person.hora_fin).toLowerCase();
                
                if (startStr.includes('24') || endStr.includes('24')) {
                    isWithinHours = true; 
                } else {
                    const hInicio = parseInt(startStr.split(':')[0], 10) || 0;
                    const hFin = parseInt(endStr.split(':')[0], 10) || 24;
                    if (horaActual >= hInicio && horaActual < hFin) {
                        isWithinHours = true;
                    }
                }
            } else {
                isWithinHours = true;
            }

            if (isWithinHours) phonesToNotify.push(person.telefono);
        }
    }

    if (phonesToNotify.length > 0) {
        const phoneId = Deno.env.get('phone_number_id_wpp');
        const accessToken = Deno.env.get('whatsapp_token_');

        const limpiarTexto = (texto: string) => {
            return String(texto || '').replace(/[\t\n\r⦁]/g, ' ').replace(/\s+/g, ' ').trim();
        };

        const p1 = limpiarTexto(folioViaje) || 'Sin Folio';
        const p2 = limpiarTexto(trackerId) || 'N/A';
        const p3 = limpiarTexto(motivoTexto) || 'Notificación';
        const p4 = limpiarTexto(detallesTexto) || 'Revisar plataforma';

        const sendPromises = phonesToNotify.map(async phone => {
            const cleanPhone = phone.replace(/\D/g, ''); 
            const metaPayload = {
                messaging_product: "whatsapp",
                to: cleanPhone,
                type: "template",
                template: {
                    name: "alerta_tive_desvio", 
                    language: { code: "es_MX" }, 
                    components: [{ 
                        type: "body", 
                        parameters: [
                            { type: "text", text: p1 }, { type: "text", text: p2 }, 
                            { type: "text", text: p3 }, { type: "text", text: p4 }
                        ] 
                    }]
                }
            };

            try {
                const response = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(metaPayload)
                });
                
                const result = await response.json();
                if (result.error) {
                    console.error(`❌ RECHAZO META [Tracker: ${trackerId}] (${cleanPhone}):`, result.error.message);
                } else {
                    console.log(`✅ WHATSAPP ENVIADO [Tracker: ${trackerId}] (${cleanPhone})`);
                }
            } catch (err) {
                console.error(`❌ ERROR DE RED [Tracker: ${trackerId}] (${cleanPhone}):`, err);
            }
        });
        await Promise.all(sendPromises);
    } else {
        console.log(`⚠️ HORARIOS CERRADOS [Tracker: ${trackerId}]: Nadie fue notificado.`);
    }
}

serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return new Response(url.searchParams.get('hub.challenge'), { status: 200 });
  }

  try {
    const payload = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if ((payload.type === 'UPDATE' || payload.type === 'INSERT') && (payload.table === 'usa_shipment_reports' || payload.table === 'nacional_shipment_reports')) {
        const oldStatus = payload.old_record?.logistic_status;
        const newStatus = payload.record?.logistic_status;
        if (payload.type === 'UPDATE' && (!newStatus || oldStatus === newStatus)) {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        const tripId = payload.record.trip_id;
        const trackerId = payload.record.tive_tracker_id;
        let lat = null, lng = null;
        if (trackerId) {
            const { data: lastLocation } = await supabase.from('tive_events').select('lat, lng').eq('tracker_id', trackerId).not('lat', 'is', null).order('timestamp', { ascending: false }).limit(1).single();
            if (lastLocation) { lat = lastLocation.lat; lng = lastLocation.lng; }
        }
        const motivoTexto = payload.type === 'INSERT' ? `🚀 NUEVO VIAJE: ${newStatus}` : `🟢 NUEVO ESTATUS: ${newStatus}`;
        const detallesTexto = lat && lng ? `Actualizado desde plataforma. Ubicación: https://maps.google.com/?q=${lat},${lng}` : `Actualizado desde plataforma (Sin GPS).`;
        await enviarWhatsApp(supabase, tripId || 'Sin Folio', trackerId || 'N/A', motivoTexto, detallesTexto);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Búsqueda profunda del Tracker ID en cualquier parte del paquete
    const trackerId = payload.DeviceName || payload.EntityName || payload.tracker?.id || payload.trackerId || payload.alert?.trackerId || payload.shipment?.trackerId;
    
    if (!trackerId) return new Response(JSON.stringify({ success: true }), { status: 200 });

    // ESTE LOG ASEGURA QUE SIEMPRE VEAS ACTIVIDAD AL BUSCAR EL TRACKER
    console.log(`📡 Ping recibido de Tive [Tracker: ${trackerId}]`);

    const rawAlertType = payload.alert?.type || payload.type || payload.alertType || 'NORMAL';
    const alertType = String(rawAlertType).toLowerCase();
    const hasAlertObject = !!payload.alert;

    const { data: activeUsa } = await supabase.from('usa_shipment_reports').select('trip_id').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').neq('logistic_status', 'Cancelado').limit(1);
    const { data: activeNac } = await supabase.from('nacional_shipment_reports').select('trip_id').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').neq('logistic_status', 'Cancelado').limit(1);
    const activeTrip = (activeUsa && activeUsa.length > 0) ? activeUsa[0] : ((activeNac && activeNac.length > 0) ? activeNac[0] : null);

    if (!activeTrip) return new Response(JSON.stringify({ success: true }), { status: 200 });

    if (alertType !== 'normal' && alertType !== 'ping' || hasAlertObject) {
        console.log(`⚠️ ALERTA DETECTADA [Tracker: ${trackerId}]: ${alertType}`);
    }

    const tempF = payload.Temperature?.Fahrenheit ?? payload.temperature ?? null;
    const hum = payload.Humidity?.Percentage ?? null;
    const lat = payload.Location?.Latitude ?? payload.location?.latitude ?? null;
    const lng = payload.Location?.Longitude ?? payload.location?.longitude ?? null;
    const locName = payload.Location?.FormattedAddress ?? payload.location?.address ?? 'Ubicación Desconocida';
    const bat = payload.Battery?.Percentage ?? null;
    const time = payload.EntryTimeUtc || new Date().toISOString();

    if (tempF !== null || lat !== null) {
        await supabase.from('tive_events').insert({
            tracker_id: trackerId, temperature: tempF, humidity: hum, lat: lat, lng: lng, location: locName, battery: bat, timestamp: time, alert_type: alertType
        });
    }

    const isStopAlert = alertType.includes('stop');
    const isDeviation = alertType.includes('route') || alertType.includes('geofence') || alertType.includes('deviation');
    
    // Escaneo brutal: Busca la palabra temperatura en todo el paquete JSON de Tive
    const stringifiedPayload = JSON.stringify(payload).toLowerCase();
    const isTemp = alertType.includes('temperature') || alertType.includes('temp') || stringifiedPayload.includes('"type":"temperature"');

    const requiresNotification = isDeviation || isTemp || isStopAlert;

    if (!requiresNotification) return new Response(JSON.stringify({ success: true }), { status: 200 });

    let motivoTexto = "Notificación de Sistema";
    let detallesTexto = "Revisar plataforma.";

    if (isTemp) {
        motivoTexto = "🌡️ ALERTA: TEMPERATURA";
        detallesTexto = `Temperatura actual: ${tempF ? tempF.toFixed(1) : 'N/D'}°F. Valores fuera de los parámetros.`;
    } else if (isDeviation) {
        motivoTexto = "📍 ALERTA: DESVÍO";
        detallesTexto = `Desviación de ruta/geocerca. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    } else if (isStopAlert) {
        motivoTexto = "⏱️ ALERTA: PARADA PROLONGADA";
        detallesTexto = `El envío se detuvo más de lo permitido. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    }

    await enviarWhatsApp(supabase, activeTrip.trip_id, trackerId, motivoTexto, detallesTexto);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("❌ Error General:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});