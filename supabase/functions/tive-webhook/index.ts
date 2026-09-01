import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return new Response(url.searchParams.get('hub.challenge'), { status: 200 });
  }

  try {
    const payload = await req.json();
    console.log("📦 PAYLOAD RECIBIDO:", JSON.stringify(payload));
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. EXTRAER DATOS (Soporta formato de Alerta y formato Normal)
    const trackerId = payload.DeviceName || payload.EntityName || payload.tracker?.id;
    const alertType = payload.alert?.type || 'NORMAL';
    const isAlert = !!payload.alert;

    if (!trackerId) {
        console.log("🛑 IGNORADO: No se detectó un Tracker ID en el payload.");
        return new Response(JSON.stringify({ success: true, message: "Sin Tracker ID" }), { status: 200 });
    }

    // 2. MODO GRABADORA: Guardar Telemetría si existen los datos
    if (payload.Temperature || payload.Location || payload.location) {
        console.log(`💾 GUARDANDO TELEMETRÍA para Tracker: ${trackerId}`);
        
        // Mapeamos los datos dependiendo de si vienen en formato Normal (Mayúsculas) o Alerta (minúsculas)
        const tempF = payload.Temperature?.Fahrenheit ?? payload.temperature ?? null;
        const hum = payload.Humidity?.Percentage ?? null;
        const lat = payload.Location?.Latitude ?? payload.location?.latitude ?? null;
        const lng = payload.Location?.Longitude ?? payload.location?.longitude ?? null;
        const locName = payload.Location?.FormattedAddress ?? payload.location?.address ?? 'Ubicación Desconocida';
        const bat = payload.Battery?.Percentage ?? null;
        const time = payload.EntryTimeUtc || new Date().toISOString();

        const { error: insertError } = await supabase.from('tive_events').insert({
            tracker_id: trackerId,
            temperature: tempF,
            humidity: hum,
            lat: lat,
            lng: lng,
            location: locName,
            battery: bat,
            timestamp: time,
            alert_type: alertType
        });

        if (insertError) {
            console.error("❌ Error al guardar telemetría en DB:", insertError);
        } else {
            console.log("✅ Telemetría histórica guardada exitosamente.");
        }
    }

    // 3. MODO ALARMA: Si es un reporte normal, terminamos aquí.
    if (!isAlert || (alertType !== 'route_deviation' && alertType !== 'temperature')) {
        console.log("🔵 PROCESO TERMINADO: Reporte de rutina procesado. No requiere WhatsApp.");
        return new Response(JSON.stringify({ success: true, message: "Telemetría guardada sin alerta" }), { status: 200 });
    }

    // 4. FLUJO DE WHATSAPP (Solo pasa si es una Alerta Crítica)
    console.log("🚨 ALERTA CRÍTICA DETECTADA. Analizando turnos para:", alertType);

    const { data: recipients, error: dbError } = await supabase.from('alert_recipients').select('*');
    if (dbError) console.log("❌ Error al leer la BD:", dbError);

    const mxDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
    const mxDate = new Date(mxDateStr);
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
                if (horaActual >= person.hora_inicio && horaActual < person.hora_fin) {
                    phonesToNotify.push(person.telefono);
                }
            } else {
                phonesToNotify.push(person.telefono);
            }
        }
    }

    if (phonesToNotify.length === 0) {
        console.log("⚠️ Nadie en turno para recibir WhatsApp.");
        return new Response(JSON.stringify({ success: true, message: "Sin destinatarios activos" }), { status: 200 });
    }

    let motivoTexto = alertType === 'temperature' ? "Desvío de Temperatura 🌡️" : "Desvío de Ruta 📍";
    let detallesTexto = alertType === 'route_deviation' ? `${payload.Location?.FormattedAddress || payload.location?.address || 'Sin ub.'}. Mapa: https://maps.google.com/?q=${payload.Location?.Latitude || payload.location?.latitude},${payload.Location?.Longitude || payload.location?.longitude}` : "Revisar plataforma.";

    const phoneId = Deno.env.get('phone_number_id_wpp');
    const accessToken = Deno.env.get('whatsapp_token_');

    const sendPromises = phonesToNotify.map(async phone => {
      const cleanPhone = phone.replace(/\D/g, ''); 
      console.log(`🚀 Disparando WhatsApp a: ${cleanPhone}`);
      
      const response = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "template",
          template: {
            name: "alerta_tive_desvio", 
            language: { code: "es_MX" }, 
            components: [{ type: "body", parameters: [{ type: "text", text: payload.ShipmentId || payload.shipment?.id || 'Desc' }, { type: "text", text: trackerId }, { type: "text", text: motivoTexto }, { type: "text", text: detallesTexto }] }]
          }
        })
      });
      const data = await response.json();
      console.log(`📩 Respuesta de Meta para ${cleanPhone}:`, JSON.stringify(data));
      return data;
    });

    await Promise.all(sendPromises);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("❌ Error General:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});