// ==========================================
// SUPABASE EDGE FUNCTION: tive-webhook
// ==========================================
// Despliegue este codigo en Supabase para recibir datos reales de Tive.
// Comando: supabase functions deploy tive-webhook

declare const Deno: any;

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createJsonResponse, createOptionsResponse } from "./supabase/functions/_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return createOptionsResponse(req);
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("Webhook recibido de Tive:", JSON.stringify(payload));

    if (!payload) {
      throw new Error("Payload vacio");
    }

    const events = Array.isArray(payload) ? payload : [payload];

    const eventsToInsert = events.map((data: any) => ({
      tracker_id: data.device_id || data.trackerId || "UNKNOWN",
      temperature: data.temperature || data.temp || null,
      humidity: data.humidity || null,
      location: data.location || (data.address ? data.address.formatted : null),
      lat: data.latitude || (data.location ? data.location.lat : null),
      lng: data.longitude || (data.location ? data.location.lon : null),
      battery: data.battery_level || data.battery || null,
      alert_type: data.alert_type || data.eventType || null,
      timestamp: data.timestamp || new Date().toISOString(),
    }));

    const { error } = await supabaseClient
      .from("tive_events")
      .insert(eventsToInsert);

    if (error) {
      console.error("Error insertando en DB:", error);
      return createJsonResponse(req, { error: error.message }, {
        status: 500,
      });
    }

    return createJsonResponse(req, { message: `${eventsToInsert.length} eventos procesados` }, {
      status: 200,
    });
  } catch (error: any) {
    console.error("Error procesando webhook:", error);
    return createJsonResponse(req, { error: error.message }, {
      status: 400,
    });
  }
});
