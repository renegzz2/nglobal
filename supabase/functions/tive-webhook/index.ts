import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const trackerId = payload.DeviceName || payload.EntityName || payload.tracker?.id;
    const alertType = (payload.alert?.type || 'NORMAL').toLowerCase();
    const isAlert = !!payload.alert;

    if (!trackerId) {
        return new Response(JSON.stringify({ success: true, message: "Sin Tracker ID" }), { status: 200 });
    }

    // --- 1. BUSCAR VIAJE ACTIVO ---
    const { data: activeUsa } = await supabase.from('usa_shipment_reports').select('id, trip_id, real_departure_date').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').limit(1);
    const { data: activeNac } = await supabase.from('nacional_shipment_reports').select('id, trip_id, real_departure_date').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').limit(1);

    let activeTrip = null;
    let tripTableName = null;

    if (activeUsa && activeUsa.length > 0) {
        activeTrip = activeUsa[0];
        tripTableName = 'usa_shipment_reports';
    } else if (activeNac && activeNac.length > 0) {
        activeTrip = activeNac[0];
        tripTableName = 'nacional_shipment_reports';
    }

    if (!activeTrip) {
        console.log(`🛑 IGNORADO: El rastreador ${trackerId} NO tiene viajes activos.`);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Variables de telemetría comunes
    const tempF = payload.Temperature?.Fahrenheit ?? payload.temperature ?? null;
    const hum = payload.Humidity?.Percentage ?? null;
    const lat = payload.Location?.Latitude ?? payload.location?.latitude ?? null;
    const lng = payload.Location?.Longitude ?? payload.location?.longitude ?? null;
    const locName = payload.Location?.FormattedAddress ?? payload.location?.address ?? 'Ubicación Desconocida';
    const bat = payload.Battery?.Percentage ?? null;
    const time = payload.EntryTimeUtc || new Date().toISOString();

    // --- 2. EVALUAR INICIO DE VIAJE AUTOMÁTICO ---
    let isFirstPing = false;
    if (!activeTrip.real_departure_date && lat !== null) {
        isFirstPing = true;
        console.log(`🚀 INICIO DE VIAJE DETECTADO para folio ${activeTrip.trip_id}`);
        // Actualizamos BD: Ya salió y está en tránsito
        await supabase.from(tripTableName).update({ 
            real_departure_date: time, 
            logistic_status: 'En Tránsito' 
        }).eq('id', activeTrip.id);
    }

    // --- 3. GUARDAR TELEMETRÍA (Siempre) ---
    if (tempF !== null || lat !== null) {
        await supabase.from('tive_events').insert({
            tracker_id: trackerId, temperature: tempF, humidity: hum, lat: lat, lng: lng, location: locName, battery: bat, timestamp: time, alert_type: alertType
        });
    }

    // --- 4. DECIDIR SI REQUIERE WHATSAPP ---
    const requiresNotification = isFirstPing || alertType === 'route_deviation' || alertType === 'temperature';

    if (!requiresNotification) {
        console.log("🔵 Telemetría guardada sin requerir notificación.");
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // --- 5. PREPARAR MENSAJE DE WHATSAPP ---
    let motivoTexto = "Notificación de Sistema";
    let detallesTexto = "Revisar plataforma.";

    if (isFirstPing) {
        motivoTexto = "🟢 INICIO DE VIAJE";
        detallesTexto = `El sensor inició transmisión. El viaje cambió a 'En Tránsito' automáticamente.`;
    } else if (alertType === 'temperature') {
        motivoTexto = "🌡️ ALERTA: TEMPERATURA";
        detallesTexto = `Temperatura actual: ${tempF ? tempF.toFixed(1) : 'N/D'}°F. Valores fuera de los parámetros configurados.`;
    } else if (alertType === 'route_deviation') {
        motivoTexto = "📍 ALERTA: DESVÍO";
        detallesTexto = `Posible desvío detectado. Mapa: https://maps.google.com/?q=${lat},${lng}`;
    }

    console.log(`🚨 DISPARANDO WHATSAPP: ${motivoTexto}`);

    // --- 6. ENVÍO DE WHATSAPP A PERSONAL EN TURNO ---
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
        const folioViaje = activeTrip.trip_id || 'Sin Folio';

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

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("❌ Error General:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});