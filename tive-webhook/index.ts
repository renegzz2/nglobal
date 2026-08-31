import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // --- 1. VERIFICACIÓN DE META (WEBHOOK) ---
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('hub.challenge');
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // --- 2. PROCESAMIENTO DE TIVE ---
  try {
    const payload = await req.json();
    console.log("Payload recibido:", JSON.stringify(payload));
    
    const alertType = payload.alert?.type; 
    const shipmentId = payload.shipment?.id || 'Desconocido';
    const trackerNumber = payload.tracker?.id || 'Desconocido';
    
    // Conectar a Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settings, error: dbError } = await supabase.from('alert_settings').select('*').single();
    if (dbError) console.log("❌ Error BD:", dbError);

    const phones = [settings?.phone_number_1, settings?.phone_number_2].filter(Boolean);
    console.log("📱 Teléfonos obtenidos de la BD:", phones);

    if (phones.length === 0) {
        console.log("⚠️ No hay teléfonos configurados en la BD.");
        return new Response(JSON.stringify({ success: true, message: "Sin teléfonos para enviar" }), { status: 200 });
    }

    let motivoTexto = alertType === 'temperature' ? "Desvío de Temperatura 🌡️" : (alertType === 'route_deviation' ? "Desvío de Ruta 📍" : `Alerta general (${alertType})`);
    let detallesTexto = alertType === 'route_deviation' ? `${payload.location?.address || 'Ubicación no especificada'}. Mapa: https://maps.google.com/?q=${payload.location?.latitude},${payload.location?.longitude}` : "Revisar plataforma para más detalles.";

    const phoneId = Deno.env.get('phone_number_id_wpp');
    const accessToken = Deno.env.get('whatsapp_token_');
    
    if (!phoneId || !accessToken) {
        console.log("❌ FALTAN SECRETOS DE META EN SUPABASE");
    }

    const sendPromises = phones.map(async phone => {
      const cleanPhone = phone.replace(/\D/g, ''); 
      console.log(`Enviando a Meta para el número: ${cleanPhone}`);
      
      const response = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "template",
          template: {
            name: "alerta_tive_desvio", 
            language: { code: "es_MX" }, 
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: shipmentId },
                  { type: "text", text: trackerNumber },
                  { type: "text", text: motivoTexto },
                  { type: "text", text: detallesTexto }
                ]
              }
            ]
          }
        })
      });

      const responseData = await response.json();
      console.log(`Respuesta de Meta para ${cleanPhone}:`, JSON.stringify(responseData));
      return responseData;
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error general:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});