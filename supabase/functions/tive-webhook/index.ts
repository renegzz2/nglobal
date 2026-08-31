import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // --- 1. VERIFICACIÓN DE META ---
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return new Response(url.searchParams.get('hub.challenge'), { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // --- 2. PROCESAMIENTO TIVE ---
  try {
    const payload = await req.json();
    const alertType = payload.alert?.type; 
    
    if (!alertType || (alertType !== 'route_deviation' && alertType !== 'temperature')) {
        return new Response(JSON.stringify({ success: true, message: "Ignorado" }), { status: 200 });
    }

    const shipmentId = payload.shipment?.id || 'Desconocido';
    const trackerNumber = payload.tracker?.id || 'Desconocido';
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: recipients, error: dbError } = await supabase.from('alert_recipients').select('*');
    if (dbError) console.log("❌ Error BD:", dbError);

    // Calculamos Fecha y Hora exactas en la CDMX
    const mxDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
    const mxDate = new Date(mxDateStr);
    const diaActual = mxDate.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab
    const horaActual = mxDate.getHours(); // 0 a 23 hrs
    
    console.log(`⏱️ Tiempo CDMX -> Día: ${diaActual}, Hora: ${horaActual}:00 hrs`);

    const phonesToNotify: string[] = [];

    // --- EL FILTRO MAESTRO (PAUSA, DÍAS Y HORARIOS) ---
    if (recipients) {
        for (const person of recipients) {
            // 1. ¿Está en pausa manual?
            if (person.activo === false) {
                console.log(`⏸️ ${person.nombre} ignorado (Cuenta en PAUSA)`);
                continue;
            }

            // 2. ¿Es su día de descanso?
            if (person.dias_activos) {
                const diasPermitidos = person.dias_activos.split(',').map((d: string) => parseInt(d.trim(), 10));
                if (!diasPermitidos.includes(diaActual)) {
                    console.log(`🛌 ${person.nombre} ignorado (Día de descanso)`);
                    continue; // Brincamos a la siguiente persona
                }
            }

            // 3. ¿Está dentro de su horario laboral?
            if (person.hora_inicio !== null && person.hora_fin !== null) {
                if (horaActual >= person.hora_inicio && horaActual < person.hora_fin) {
                    phonesToNotify.push(person.telefono); // Está en turno
                } else {
                    console.log(`🔕 ${person.nombre} ignorado (Fuera de horario. Turno: ${person.hora_inicio}:00 a ${person.hora_fin}:00)`);
                }
            } else {
                // 4. Si no tiene horario específico, pasa directo
                phonesToNotify.push(person.telefono);
            }
        }
    }

    if (phonesToNotify.length === 0) {
        console.log("⚠️ Nadie disponible para recibir la alerta.");
        return new Response(JSON.stringify({ success: true, message: "Sin destinatarios activos" }), { status: 200 });
    }

    // --- ENVÍO A META ---
    let motivoTexto = alertType === 'temperature' ? "Alerta de Temperatura 🌡️" : "Desvío de Ruta 📍";
    let detallesTexto = alertType === 'route_deviation' ? `${payload.location?.address || 'Sin ub.'}. Mapa: https://maps.google.com/?q=${payload.location?.latitude},${payload.location?.longitude}` : "Revisar plataforma.";

    const phoneId = Deno.env.get('phone_number_id_wpp');
    const accessToken = Deno.env.get('whatsapp_token_');

    const sendPromises = phonesToNotify.map(async phone => {
      const cleanPhone = phone.replace(/\D/g, ''); 
      console.log(`Enviando alerta a: ${cleanPhone}`);
      
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
            components: [{ type: "body", parameters: [{ type: "text", text: shipmentId }, { type: "text", text: trackerNumber }, { type: "text", text: motivoTexto }, { type: "text", text: detallesTexto }] }]
          }
        })
      });
      return await response.json();
    });

    await Promise.all(sendPromises);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});