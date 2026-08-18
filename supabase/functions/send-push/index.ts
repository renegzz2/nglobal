// ==============================================================================
// SUPABASE EDGE FUNCTION: send-push (v9.0 - MULTI-ALERT SUPPORT)
// ==============================================================================
declare const Deno: any;

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { createJsonResponse, createOptionsResponse } from "../_shared/cors.ts";

const ALLOWED_PUSH_ROLES = new Set([
  'COORDINADOR',
  'SUBGERENCIA',
  'GERENCIA',
  'DIRECCION',
  'SUBDIRECCION',
  'ADMINISTRADOR',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') return createOptionsResponse(req);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!jwt || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return createJsonResponse(req, { error: 'Unauthorized' }, {
        status: 401,
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    const rawRole = authData.user?.app_metadata?.role || authData.user?.user_metadata?.role;
    const normalizedRole = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';

    if (authError || !authData.user || !ALLOWED_PUSH_ROLES.has(normalizedRole)) {
      return createJsonResponse(req, { error: 'Forbidden' }, {
        status: 403,
      });
    }

    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const payload = await req.json();
    
    // JEFE: Normalizamos el payload venga de Trigger o de Alerta Directa
    const title = payload.title || `nglobal: Alerta de Sistema`;
    const body = payload.body || `Se ha detectado una actividad relevante en sus envíos.`;
    const trip_id = payload.trip_id || 'S/D';

    console.log(`🚀 Despachando notificación para: ${trip_id}`);

    const { data: subs } = await supabaseClient.from('push_subscriptions').select('subscription');

    if (!subs || subs.length === 0) {
        return createJsonResponse(req, { success: false, info: "no_subscribers" });
    }

    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    webpush.setVapidDetails(
        'mailto:soporte@nglobal.com', 
        'BN1TAYTDSoyi5zln7KKxZ4Va_QnzNF7H8cajpm0DQoWNrGRyZN38DcK-wGIGucS9nlWunUkkF4sgCFng2KreEZ0', 
        privateKey
    );

    const notifications = subs.map(s => 
        webpush.sendNotification(s.subscription, JSON.stringify({ title, body, url: '/' }))
        .catch(e => console.error("Fallo envío individual:", e))
    );

    await Promise.all(notifications);

    return createJsonResponse(req, { success: true });

  } catch (error: any) {
    console.error("🔥 Error crítico en Push:", error.message);
    return createJsonResponse(req, { error: error.message }, { status: 200 });
  }
});
