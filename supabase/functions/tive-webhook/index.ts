// ==============================================================================
// SUPABASE EDGE FUNCTION: tive-webhook (v9.2 - RESILIENT MAPPING)
// ==============================================================================
declare const Deno: any;

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createJsonResponse, createOptionsResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return createOptionsResponse(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("Payload recibido:", JSON.stringify(payload));

    const events = Array.isArray(payload) ? payload : [payload];

    for (const data of events) {
      const trackerId = (data.DeviceName || data.device_id || data.EntityName || data.trackerId || "UNKNOWN").toString().trim();
      const alertType = (data.alert_type || data.eventType || data.AlertType || "TELEMETRY").toString();
      const currentTemp = data.Temperature?.Fahrenheit || data.temp_f || data.temperature || null;

      await supabaseClient.from("tive_events").insert({
        tracker_id: trackerId,
        temperature: currentTemp,
        location: data.Location?.FormattedAddress || data.address || "En ruta",
        lat: data.Location?.Latitude || data.latitude || data.location?.lat,
        lng: data.Location?.Longitude || data.longitude || data.location?.lon,
        speed: data.Speed || data.velocity?.value || 0,
        alert_type: alertType,
        raw_data: data,
        timestamp: data.AlertDate || data.EntryTimeUtc || data.timestamp || new Date().toISOString(),
      });

      const { data: shipment } = await supabaseClient
        .from("usa_shipment_reports")
        .select("id, trip_id, products")
        .eq("tive_tracker_id", trackerId)
        .neq("logistic_status", "Finalizado")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (alertType !== "TELEMETRY" && alertType !== "PERIODIC_REPORT") {
        await supabaseClient.from("usa_shipment_alerts").insert({
          shipment_id: shipment?.id || null,
          trip_id: shipment?.trip_id || `TRACKER: ${trackerId}`,
          alert_type: alertType,
          message: data.Message || `Alerta detectada por sensor Tive: ${alertType}`,
          severity: alertType.includes("TEMP") || alertType.includes("LIGHT") ? "danger" : "warning",
        });
      }
    }

    return createJsonResponse(req, { success: true });
  } catch (error: any) {
    console.error("[ERROR WEBHOOK]:", error.message);
    return createJsonResponse(req, { error: error.message }, { status: 500 });
  }
});
