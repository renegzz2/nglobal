import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const formatTransitTime = (departureStr?: string) => {
    if (!departureStr) return 'S/D';
    const start = new Date(departureStr).getTime();
    const now = new Date().getTime(); 
    const diffMs = now - start;

    if (diffMs < 0) return '0 h';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 0) {
        return `${diffDays} día${diffDays > 1 ? 's' : ''}, ${diffHrs} h`;
    }
    return `${diffHrs} h`;
};

async function enviarWhatsApp(supabase: any, templateName: string, params: string[]) {
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

        const limpiarTexto = (texto: string) => String(texto || 'S/D').replace(/[\t\r\n⦁]/g, ' ').replace(/ {2,}/g, ' ').trim();
        const cleanParams = params.map(p => ({ type: "text", text: limpiarTexto(p) }));

        const sendPromises = phonesToNotify.map(async phone => {
            const cleanPhone = phone.replace(/\D/g, ''); 
            const metaPayload = {
                messaging_product: "whatsapp",
                to: cleanPhone,
                type: "template",
                template: {
                    name: templateName, 
                    language: { code: "es_MX" }, 
                    components: [{ 
                        type: "body", 
                        parameters: cleanParams 
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
                    console.error(`❌ RECHAZO META (${cleanPhone}):`, result.error.message);
                } else {
                    console.log(`✅ WHATSAPP ENVIADO (${cleanPhone}) usando plantilla ${templateName}`);
                }
            } catch (err) {
                console.error(`❌ ERROR DE RED (${cleanPhone}):`, err);
            }
        });
        await Promise.all(sendPromises);
    } else {
        console.log(`⚠️ HORARIOS CERRADOS: Nadie fue notificado.`);
    }
}

async function getRichData(supabase: any, tripRecord: any) {
    let clientName = 'S/D';
    let carrierName = 'S/D';
    let productDetails = 'S/D';
    let invoiceNumbers = 'S/D';

    if (tripRecord?.client_ids && tripRecord.client_ids.length > 0) {
        const { data } = await supabase.from('usa_clientes').select('nombre').in('id', tripRecord.client_ids);
        if (data && data.length > 0) {
            clientName = data.map(c => c.nombre).join(' | ');
        }
    } else if (tripRecord?.client_id) { 
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
        driverName: tripRecord?.driver_name || 'S/D',
        driverPhone: tripRecord?.driver_phone || 'S/D',
        realDeparture: tripRecord?.real_departure_date || tripRecord?.departure_date_time
    };
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
    // ESCENARIO 1: CAMBIOS EN PLATAFORMA (REACT)
    // =========================================================
    if ((payload.type === 'UPDATE' || payload.type === 'INSERT') && (payload.table === 'usa_shipment_reports' || payload.table === 'nacional_shipment_reports')) {
        const oldStatus = payload.old_record?.logistic_status;
        const newStatus = payload.record?.logistic_status;
        
        if (payload.type === 'UPDATE' && (!newStatus || oldStatus === newStatus)) {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        
        const trackerId = payload.record.tive_tracker_id || 'S/D';
        let lat = null, lng = null, lastTemp = null;
        if (trackerId !== 'S/D') {
            const { data: lastLocation } = await supabase.from('tive_events').select('lat, lng, temperature').eq('tracker_id', trackerId).not('lat', 'is', null).order('timestamp', { ascending: false }).limit(1).single();
            if (lastLocation) { lat = lastLocation.lat; lng = lastLocation.lng; lastTemp = lastLocation.temperature; }
        }
        
        const motivoTexto = payload.type === 'INSERT' ? `🚀 NUEVO VIAJE: ${newStatus}` : `🟢 NUEVO ESTATUS: ${newStatus}`;
        const richData = await getRichData(supabase, payload.record);
        
        const transitTime = formatTransitTime(richData.realDeparture);
        const mapUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : 'Sin GPS actual';
        const tempText = lastTemp ? `${lastTemp.toFixed(1)}°F` : 'S/D';
        
        // El detalle extra (param 8) ahora solo muestra la info adicional (como el GPS)
        const baseDetails = `Ubicación GPS: ${mapUrl}`;
        
        const templateParams = [
            richData.tripId,          // {{1}}
            richData.invoiceNumbers,  // {{2}}
            richData.clientName,      // {{3}}
            richData.productDetails,  // {{4}}
            richData.carrierName,     // {{5}}
            richData.driverName,      // {{6}}
            motivoTexto,              // {{7}}
            baseDetails,              // {{8}}
            richData.driverPhone,     // {{9}}
            trackerId,                // {{10}}
            transitTime,              // {{11}}
            tempText                  // {{12}}
        ];

        await enviarWhatsApp(supabase, "alerta_despacho_v2", templateParams);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // =========================================================
    // ESCENARIO 2: PING FÍSICO DESDE EL RASTREADOR TIVE
    // =========================================================
    const trackerId = payload.DeviceName || payload.EntityName || payload.tracker?.id || payload.trackerId || payload.alert?.trackerId || payload.shipment?.trackerId;
    if (!trackerId) return new Response(JSON.stringify({ success: true }), { status: 200 });

    const rawAlertType = payload.alert?.type || payload.type || payload.alertType || 'NORMAL';
    const alertType = String(rawAlertType).toLowerCase();
    const hasAlertObject = !!payload.alert;

    const { data: activeUsa } = await supabase.from('usa_shipment_reports').select('*').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').neq('logistic_status', 'Cancelado').limit(1);
    const { data: activeNac } = await supabase.from('nacional_shipment_reports').select('*').eq('tive_tracker_id', trackerId).neq('logistic_status', 'Finalizado').neq('logistic_status', 'Cancelado').limit(1);
    const activeTrip = (activeUsa && activeUsa.length > 0) ? activeUsa[0] : ((activeNac && activeNac.length > 0) ? activeNac[0] : null);

    if (!activeTrip) return new Response(JSON.stringify({ success: true }), { status: 200 });

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
    const stringifiedPayload = JSON.stringify(payload).toLowerCase();
    const isTemp = alertType.includes('temperature') || alertType.includes('temp') || stringifiedPayload.includes('"type":"temperature"');

    const requiresNotification = isDeviation || isTemp || isStopAlert;
    if (!requiresNotification) return new Response(JSON.stringify({ success: true }), { status: 200 });

    const currentStatus = String(activeTrip.logistic_status).toUpperCase();
    if (currentStatus === 'HOLD FDA' || currentStatus === 'REVIEW FDA') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    const richData = await getRichData(supabase, activeTrip);
    const transitTime = formatTransitTime(richData.realDeparture);
    const gpsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : 'Sin GPS';
    const currentTempStr = tempF !== null ? `${tempF.toFixed(1)}°F` : 'S/D';

    let motivoTexto = "Notificación de Sistema";
    let baseDetails = `Revisar plataforma para más detalles.`;

    if (isTemp) {
        motivoTexto = "🌡️ ALERTA: TEMPERATURA";
        baseDetails = `La temperatura se encuentra fuera de los parámetros permitidos.`;
    } else if (isDeviation) {
        motivoTexto = "📍 ALERTA: DESVÍO";
        baseDetails = `Desviación de ruta/geocerca registrada. Mapa: ${gpsUrl}`;
    } else if (isStopAlert) {
        motivoTexto = "⏱️ ALERTA: PARADA PROLONGADA";
        baseDetails = `El envío se detuvo más de lo permitido. Mapa: ${gpsUrl}`;
    }
    
    const templateParams = [
        richData.tripId,          // {{1}}
        richData.invoiceNumbers,  // {{2}}
        richData.clientName,      // {{3}}
        richData.productDetails,  // {{4}}
        richData.carrierName,     // {{5}}
        richData.driverName,      // {{6}}
        motivoTexto,              // {{7}}
        baseDetails,              // {{8}}
        richData.driverPhone,     // {{9}}
        trackerId,                // {{10}}
        transitTime,              // {{11}}
        currentTempStr            // {{12}}
    ];

    await enviarWhatsApp(supabase, "alerta_despacho_v2", templateParams);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("❌ Error General:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});