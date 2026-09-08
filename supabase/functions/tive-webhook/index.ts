import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Función auxiliar para enviar el WhatsApp y evitar repetir código
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
            if (person.hora_inicio !== null && person.hora_fin !== null) {
                if (horaActual >= person.hora_inicio && horaActual < person.hora_fin) phonesToNotify.push(person.telefono);
            } else {
                phonesToNotify.push(person.telefono);
            }
        }
    }

    if (phonesToNotify.length > 0) {
        const phoneId = Deno.env.get('phone_number_id_wpp');
        const accessToken = Deno.env.get('whatsapp_token_');

        const sendPromises = phonesToNotify.map(async phone => {
            const cleanPhone = phone.replace(/\D/g, ''); 
            await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: cleanPhone,
                    type: "template",
                    template: {
                        name: "alerta_tive_desvio", 
                        language: { code: "es_MX" }, 
                        components: [{ type: "body", parameters: [{ type: "text", text: folioViaje }, { type: "text", text: trackerId }, { type: "text", text: motivoTexto }, { type: "text", text: detallesTexto }] }]
                    }
                })
            });
        });
        await Promise.all(sendPromises);
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

    // =========================================================
    // ESCENARIO 1: CAMBIO MANUAL DE ESTATUS EN TU PLATAFORMA (REACT)
    // =========================================================
    if (payload.type === 'UPDATE' && (payload.table === 'usa_shipment_reports' || payload.table === 'nacional_shipment_reports')) {
        const oldStatus = payload.old_record?.logistic_status;
        const newStatus = payload.record?.logistic_status;
        
        // Si actualizaron otra cosa pero el estatus logístico NO cambió, ignoramos.
        if (!newStatus || oldStatus === newStatus) {
            return new Response(JSON.stringify({ success: true, message: "Estatus sin cambios" }), { status: 200 });
        }

        const tripId = payload.record.trip_id;
        const trackerId = payload.record.tive_tracker_id;
        let lat = null;
        let lng = null;

        // Extraer la última coordenada guardada de ese camión
        if (trackerId) {
            const { data: lastLocation } = await supabase
                .from('tive_events')
                .select('lat, lng')
                .eq('tracker_id', trackerId)
                .not('lat', 'is', null)
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();
            
            if (lastLocation) {
                lat = lastLocation.lat;
                lng = lastLocation.lng;
            }
        }

        const motivoTexto = `🟢 NUEVO ESTATUS: ${newStatus}`;
        const detallesTexto = lat && lng 
            ? `Estatus actualizado manualmente. Ubicación actual: https://maps.google.com/?q=${lat},${lng}`
            : `Estatus actualizado manualmente. (Aún sin enlace satelital GPS).`;

        await enviarWhatsApp(supabase, tripId || 'Sin Folio', trackerId || 'N/A', motivoTexto, detallesTexto);
        return new Response(JSON.stringify({ success: true, message: "Alerta de estatus enviada" }), { status: 200 });
    }

    // =========================================================
    // ESCENARIO 2: PING FÍSICO DESDE EL RASTREADOR TIVE
    // =========================================================
    const trackerId = payload.DeviceName || payload.EntityName || payload.tracker?.id;
    const alertType = (payload.alert?.type || 'NORMAL').toLowerCase();

    if (!trackerId) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Guardar Telemetría (Siempre)
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

    // Evaluamos SOLO emergencias (Temperatura, Desvío, Parada)
    const isStopAlert = alertType.includes('stop');
    const requiresNotification = alertType === 'route_deviation' || alertType === 'temperature' || isStopAlert;

    if (!requiresNotification) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Buscar viaje asociado para sacar el Folio
    const { data: activeUsa } = await supabase.from('usa_shipment_reports').select('trip_id').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').limit(1);
    const { data: activeNac } = await supabase.from('nacional_shipment_reports').select('trip_id').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').limit(1);
    const activeTrip = (activeUsa && activeUsa.length > 0) ? activeUsa[0] : ((activeNac && activeNac.length > 0) ? activeNac[0] : null);

    if (!activeTrip) return new Response(JSON.stringify({ success: true }), { status: 200 });

    let motivoTexto = "Notificación de Sistema";
    let detallesTexto = "Revisar plataforma.";

    if (alertType === 'temperature') {
        motivoTexto = "🌡️ ALERTA: TEMPERATURA";
        detallesTexto = `Temperatura actual: ${tempF ? tempF.toFixed(1) : 'N/D'}°F. Valores fuera de los parámetros.`;
    } else if (alertType === 'route_deviation') {
        motivoTexto = "📍 ALERTA: DESVÍO";
        detallesTexto = `Posible desvío de ruta detectado. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    } else if (isStopAlert) {
        motivoTexto = "⏱️ ALERTA: PARADA PROLONGADA";
        detallesTexto = `El envío se detuvo más de 1 hora. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    }

    await enviarWhatsApp(supabase, activeTrip.trip_id, trackerId, motivoTexto, detallesTexto);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("❌ Error General:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});