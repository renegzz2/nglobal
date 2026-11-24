const DEFAULT_ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

declare const Deno: {
  env?: {
    get(name: string): string | undefined;
  };
} | undefined;

function getAllowedOrigins() {
  const configured =
    typeof Deno !== "undefined"
      ? Deno.env?.get("EDGE_ALLOWED_ORIGINS") ??
        Deno.env?.get("CORS_ALLOWED_ORIGINS") ??
        Deno.env?.get("SITE_URL") ??
        ""
      : "";

  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function getAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return "";

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.has(origin)) return origin;

  return "";
}

export function buildCorsHeaders(req: Request, extraHeaders: HeadersInit = {}) {
  const allowedOrigin = getAllowedOrigin(req);

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    ...extraHeaders,
  };
}

export function createOptionsResponse(req: Request) {
  return new Response(null, { status: getAllowedOrigin(req) ? 204 : 403, headers: buildCorsHeaders(req) });
}

export function createJsonResponse(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: buildCorsHeaders(req, {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    }),
  });
}
