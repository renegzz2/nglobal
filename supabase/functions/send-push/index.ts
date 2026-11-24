import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import webpush from "npm:web-push@3.6.7";
import { createJsonResponse, createOptionsResponse } from "../_shared/cors.ts";
import { isTrustedPushEndpoint, readBody } from "../_shared/webhook.ts";

const VAPID_PUBLIC_KEY = 'BN1TAYTDSoyi5zln7KKxZ4Va_QnzNF7H8cajpm0DQoWNrGRyZN38DcK-wGIGucS9nlWunUkkF4sgCFng2KreEZ0';

serve(async (req) => {
  if (req.method === 'OPTIONS') return createOptionsResponse(req);
  const respond = (body: unknown, status = 200) => createJsonResponse(req, body, { status });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  try {
    const jwt = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1];
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!jwt) return respond({ error: 'Unauthorized' }, 401);
    if (!url || !anonKey || !privateKey) return respond({ error: 'Push unavailable' }, 503);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: 'Bearer ' + jwt } },
    });
    const { data: auth, error } = await userClient.auth.getUser(jwt);
    if (error || !auth.user) return respond({ error: 'Unauthorized' }, 401);

    const raw = await readBody(req, 2048);
    if (raw === null) return respond({ error: 'Payload too large' }, 413);
    let payload;
    try { payload = JSON.parse(raw); } catch { return respond({ error: 'Invalid JSON' }, 400); }
    if (!payload?.action || !['test', 'broadcast'].includes(payload.action)) {
      return respond({ error: 'Unsupported push action' }, 400);
    }

    const broadcast = payload.action === 'broadcast';
    let title = 'Prueba de notificaciones nGlobal';
    let body = 'Este dispositivo tiene activo el canal de notificaciones.';
    let audience = userClient.from('push_subscriptions').select('subscription').eq('user_id', auth.user.id);

    if (broadcast) {
      const role = String(auth.user.app_metadata?.role ?? '').trim().toUpperCase();
      const { data: claims, error: claimsError } = await userClient.auth.getClaims(jwt);
      if (claimsError || role !== 'ADMINISTRADOR' || claims?.claims.aal !== 'aal2') {
        return respond({ error: 'Forbidden' }, 403);
      }
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceKey) return respond({ error: 'Push unavailable' }, 503);
      if (typeof payload.title !== 'string' || typeof payload.body !== 'string' ||
          !payload.title.trim() || payload.title.length > 100 || !payload.body.trim() || payload.body.length > 500) {
        return respond({ error: 'Invalid notification' }, 400);
      }
      title = payload.title.trim();
      body = payload.body.trim();
      audience = createClient(url, serviceKey).from('push_subscriptions').select('subscription').not('user_id', 'is', null);
    }

    const { data: allowed, error: rateError } = await userClient.rpc('ng_consume_rate_limit', { operation: 'push' });
    if (rateError) throw rateError;
    if (!allowed) return respond({ error: 'Too many requests' }, 429);
    const { data: subscribers, error: readError } = await audience;
    if (readError) throw readError;
    if (!subscribers?.length) return respond({ success: false, accepted: 0, failed: 0, reason: 'no_subscribers' });

    webpush.setVapidDetails('mailto:soporte@nglobal.com', VAPID_PUBLIC_KEY, privateKey);
    const delivery = await Promise.allSettled(subscribers.map(row => {
      if (!isTrustedPushEndpoint(row.subscription?.endpoint)) return Promise.reject(new Error('Unsupported push endpoint'));
      return webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url: '/' }), { timeout: 12_000 });
    }));
    const accepted = delivery.filter(result => result.status === 'fulfilled').length;
    const failed = delivery.length - accepted;
    console.info('Push delivery', { broadcast, accepted, failed });
    return respond({ success: accepted > 0 && failed === 0, accepted, failed }, accepted === 0 ? 502 : 200);
  } catch (error) {
    console.error('Push processing failed', error instanceof Error ? error.message : 'unknown');
    return respond({ error: 'Push failed' }, 500);
  }
});
