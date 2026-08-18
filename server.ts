import dotenv from "dotenv";
dotenv.config();

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

type ConnectedClient = {
  userId: string;
  name: string;
  role: string;
};

type WsRateLimitEntry = {
  count: number;
  resetAt: number;
};

const isProduction = process.env.NODE_ENV === "production";
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const wsAuthAttempts = new Map<string, WsRateLimitEntry>();

const getClientIp = (req: any) =>
  String(
    req.headers?.["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );

const isWsAuthRateLimited = (key: string) => {
  const now = Date.now();
  const current = wsAuthAttempts.get(key);

  if (!current || current.resetAt <= now) {
    wsAuthAttempts.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > AUTH_RATE_LIMIT_MAX;
};

const WHATSAPP_BROADCAST_ROLES = new Set([
  "COORDINADOR",
  "SUBGERENCIA",
  "GERENCIA",
  "DIRECCION",
  "SUBDIRECCION",
  "ADMINISTRADOR",
]);

const STATUS_KEYWORDS: Array<{ status: string; patterns: RegExp[] }> = [
  { status: "Entregado", patterns: [/\b(entregado|entrega|descargad[oa]|descargando|ya entregue|ya entregu[eé])\b/i] },
  { status: "En Tránsito", patterns: [/\b(en camino|en ruta|en transito|sali|saliendo|ya sali|voy para|circulando)\b/i] },
  { status: "Retrasado", patterns: [/\b(retrasad[oa]|demora|demorado|trafico|tr[aá]fico|aver[ií]a|ponchadura|incidente)\b/i] },
  { status: "Hold", patterns: [/\b(hold|detenido|parado|esperando|en espera|retenido)\b/i] },
  { status: "Pendiente", patterns: [/\b(pendiente|sin salir|aun no salgo|a[uú]n no salgo)\b/i] },
];

const normalizePhone = (value: string | undefined | null) =>
  String(value || "").replace(/\D/g, "");

const getAllowedWhatsAppSenders = () =>
  new Set(
    String(process.env.WHATSAPP_ALLOWED_SENDERS || "")
      .split(",")
      .map((value) => normalizePhone(value).slice(-10))
      .filter(Boolean)
  );

const verifyWhatsAppSignature = (rawBody: Buffer | undefined, signatureHeader: string | undefined) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !rawBody || !signatureHeader?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const detectOperationalStatus = (message: string) => {
  for (const entry of STATUS_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(message))) {
      return entry.status;
    }
  }
  return null;
};

const canTransitionStatus = (currentStatus: string | null | undefined, nextStatus: string) => {
  const current = String(currentStatus || "").trim();
  if (!current) return true;
  if (current === "Finalizado" || current === "Cancelado") return false;
  if (current === nextStatus) return false;

  const allowedTransitions: Record<string, string[]> = {
    Pendiente: ["En Tránsito", "Retrasado", "Hold"],
    Programado: ["Pendiente", "En Tránsito", "Retrasado", "Hold"],
    Confirmado: ["En Tránsito", "Retrasado", "Hold"],
    "Unidad en Empaque": ["En Tránsito", "Retrasado", "Hold"],
    "En Tránsito": ["Entregado", "Retrasado", "Hold"],
    Retrasado: ["En Tránsito", "Entregado", "Hold"],
    Hold: ["Pendiente", "En Tránsito", "Retrasado"],
  };

  return (allowedTransitions[current] || []).includes(nextStatus);
};

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
            fontSrc: ["'self'", "data:"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            imgSrc: ["'self'", "data:", "blob:"],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://esm.sh"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
  }));
  const authRateLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    limit: AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = Buffer.from(buf);
    }
  }));
  const PORT = 3000;
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // WebSocket logic for real-time chat
  const clients = new Map<WebSocket, ConnectedClient>();

  wss.on("connection", (ws, req) => {
    console.log("New client connected");

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle registration
        if (data.type === 'auth') {
          const authKey = getClientIp(req);
          if (isWsAuthRateLimited(authKey)) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Too many authentication attempts' }));
            ws.close();
            return;
          }

          if (!supabase || typeof data.accessToken !== 'string' || !data.accessToken) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Unauthorized' }));
            ws.close();
            return;
          }

          const { data: authData, error } = await supabase.auth.getUser(data.accessToken);
          const authUser = authData.user;
          const rawRole = authUser?.app_metadata?.role || authUser?.user_metadata?.role;
          const normalizedRole = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';

          if (error || !authUser || !normalizedRole) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Unauthorized' }));
            ws.close();
            return;
          }

          const clientInfo: ConnectedClient = {
            userId: authUser.id,
            name:
              authUser.user_metadata?.full_name ||
              authUser.user_metadata?.name ||
              authUser.email?.split('@')[0] ||
              'Usuario',
            role: normalizedRole,
          };

          clients.set(ws, clientInfo);
          ws.send(JSON.stringify({ type: 'auth_success', user: clientInfo }));
          broadcastUserList();
          return;
        }

        // Handle private messaging
        if (data.type === 'message') {
          const senderInfo = clients.get(ws);
          if (!senderInfo) return;

          const broadcastData = JSON.stringify({
            type: 'message',
            id: data.id,
            content: data.content,
            sender: senderInfo.name,
            senderId: senderInfo.userId,
            role: senderInfo.role,
            toUserId: typeof data.toUserId === 'string' ? data.toUserId : null,
            toRole: typeof data.toRole === 'string' ? data.toRole : null,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });

          clients.forEach((info, client) => {
            if (client.readyState === WebSocket.OPEN) {
              const isSender = client === ws;
              const isTargetCoordinator = info.role === 'COORDINADOR' && data.toRole === 'COORDINADOR';
              const isTargetSpecificUser = info.userId === data.toUserId;
              
              if (isSender || isTargetCoordinator || isTargetSpecificUser) {
                client.send(broadcastData);
              }
            }
          });
        }
      } catch (err) {
        console.error("Error processing WS message:", err);
      }
    });

    const broadcastUserList = () => {
      const userList = Array.from(clients.values()).map(u => ({
        userId: u.userId,
        name: u.name,
        role: u.role
      }));
      const data = JSON.stringify({ type: 'users', users: userList });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    };

    ws.on("close", () => {
      clients.delete(ws);
      broadcastUserList();
      console.log("Client disconnected");
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // WhatsApp Webhook Verification
  app.use("/api/webhook/whatsapp", authRateLimiter);

  app.get("/api/webhook/whatsapp", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!VERIFY_TOKEN) {
      res.sendStatus(500);
      return;
    }

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WHATSAPP_WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    }
  });

  // Incoming WhatsApp Messages
  app.post("/api/webhook/whatsapp", async (req, res) => {
    const body = req.body;
    const signature = req.headers["x-hub-signature-256"];

    if (!verifyWhatsAppSignature((req as any).rawBody, typeof signature === "string" ? signature : undefined)) {
      res.sendStatus(403);
      return;
    }

    if (body.object) {
      const messageObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (messageObj) {
        const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = messageObj.from;
        const msg_body = messageObj.text?.body;
        const normalizedSender = normalizePhone(from).slice(-10);
        const allowedSenders = getAllowedWhatsAppSenders();

        console.log(`[WS] Message from ${from} to ${phone_number_id}: ${msg_body}`);
        
        // Broadcast to Dashboard UI via WebSocket
        clients.forEach((info, client) => {
          if (client.readyState === WebSocket.OPEN && WHATSAPP_BROADCAST_ROLES.has(info.role)) {
            client.send(JSON.stringify({
              type: 'whatsapp_message',
              from,
              body: msg_body,
              timestamp: new Date().toISOString()
            }));
          }
        });

        // ============================================
        // LOGISTICS BOT LOGIC (Gemini AI + Supabase)
        // ============================================
        if (msg_body && process.env.WHATSAPP_ACCESS_TOKEN) {
          try {
            // 1. Buscar si el operador tiene viajes activos (transfer_phone puede tener formato distinto, probamos ilike o like)
            if (!supabase) {
              throw new Error("Supabase is not configured on the server.");
            }

            if (allowedSenders.size > 0 && !allowedSenders.has(normalizedSender)) {
              console.warn(`[Bot] Sender ${normalizedSender} is not allowlisted.`);
              res.sendStatus(200);
              return;
            }

            const { data: trips } = await supabase
              .from('usa_shipment_reports')
              .select('id, trip_id, project, logistic_status, arrival_date_time, real_departure_date, comments, transfer_phone')
              .filter('transfer_phone', 'ilike', `%${from.slice(-10)}%`) // Buscamos los últimos 10 dígitos del teléfono
              .neq('logistic_status', 'Finalizado')
              .limit(3);

            const activeTrips = trips || [];
            const matchedStatus = detectOperationalStatus(msg_body);
            let replyText = "Mensaje recibido. Si necesitas actualizar estatus, responde con frases como en camino, entregado, retrasado o hold.";

            if (activeTrips.length === 0) {
              replyText = "No encontre viajes activos asociados a este numero. Contacta a coordinacion para validar el telefono del viaje.";
            } else if (!matchedStatus) {
              const tripSummary = activeTrips.map((trip) => `${trip.trip_id}: ${trip.logistic_status}`).join(" | ");
              replyText = `Viajes activos detectados: ${tripSummary}. Si deseas actualizar estatus, indica claramente en camino, entregado, retrasado o hold.`;
            } else if (activeTrips.length > 1) {
              replyText = "Detecte varios viajes activos asociados a este numero. Envia el folio exacto para que coordinacion actualice el estatus manualmente.";
            } else {
              const trip = activeTrips[0];
              if (!canTransitionStatus(trip.logistic_status, matchedStatus)) {
                replyText = `No pude aplicar el cambio a ${matchedStatus} porque el viaje ${trip.trip_id} esta en ${trip.logistic_status}.`;
              } else {
                const updatePayload: Record<string, string> = { logistic_status: matchedStatus };
                if (matchedStatus === "En Tránsito" && !trip.real_departure_date) {
                  updatePayload.real_departure_date = new Date().toISOString();
                }
                if (matchedStatus === "Entregado" && !trip.arrival_date_time) {
                  updatePayload.arrival_date_time = new Date().toISOString();
                }
                const auditLine = `[BOT ${new Date().toISOString()}] ${normalizedSender}: ${msg_body}`;
                updatePayload.comments = trip.comments ? `${trip.comments}\n${auditLine}` : auditLine;

                const { error: updateError } = await supabase
                  .from('usa_shipment_reports')
                  .update(updatePayload)
                  .eq('id', trip.id)
                  .eq('transfer_phone', trip.transfer_phone);

                if (updateError) {
                  console.error("Error actualizando viaje desde el bot:", updateError);
                  replyText = `Recibi tu actualizacion, pero no pude registrar el cambio del viaje ${trip.trip_id}.`;
                } else {
                  console.log(`[Bot] Viaje ${trip.id} actualizado a ${matchedStatus}`);
                  replyText = `Actualizacion registrada. Viaje ${trip.trip_id} ahora esta en ${matchedStatus}.`;
                }
              }
            }

            if (process.env.GEMINI_API_KEY && activeTrips.length > 0 && !matchedStatus) {
              try {
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const tripSummary = activeTrips
                  .map((trip) => `${trip.trip_id} (${trip.project || "S/D"} - ${trip.logistic_status})`)
                  .join(", ");
                const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: `Viajes activos: ${tripSummary}. Mensaje del operador: "${msg_body}". Responde en texto plano, breve y operativo, sin prometer cambios automaticos ni actualizar estatus.`,
                });
                if (response.text) {
                  replyText = response.text.trim();
                }
              } catch (pErr) {
                console.error("Error generando respuesta de apoyo:", pErr);
              }
            }

            await fetch(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: from,
                type: "text",
                text: { body: replyText }
              })
            });
            console.log(`[Bot] Respondio exitosamente a ${from}`);
            res.sendStatus(200);
            return;

            const contextData = trips && trips.length > 0 
              ? JSON.stringify(trips) 
              : "No se encontraron viajes activos asociados a este número de teléfono.";

            // 2. Procesar con Gemini
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            
            const systemInstruction = `
              Eres el 'Asistente Operativo' de nglobal Logistics. 
              Estás conversando por WhatsApp con el operador (conductor) cuyo número es ${from}.
              
              CONTEXTO ACTUAL DE SUS VIAJES:
              ${contextData}

              INSTRUCCIONES CRÍTICAS DE SALIDA:
              SIEMPRE debes responder ÚNICAMENTE con un objeto JSON válido (sin markdown ni texto extra), usando exactamente este formato:
              {
                "reply": "Tu mensaje amigable, corto y con emojis para el chofer en WhatsApp. Ayúdale a ubicarse con su viaje.",
                "updateDB": true o false (true SOLO si está reportando claramente un nuevo estatus o avance),
                "tripIdToUpdate": "el campo 'id' de la BD del viaje que se va a actualizar (no el trip_id, sino el UUID largo). Null si no aplica",
                "newStatus": "En Tránsito" | "Entregado" | "Retrasado" | "Pendiente" | "Hold" | null
              }
              Si el chofer dice 'En camino', updateDB debe ser true, y newStatus 'En Tránsito'.
            `;

            const prompt = `Operador dice: "${msg_body}"`;

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { 
                systemInstruction,
                responseMimeType: "application/json"
              }
            });

            // Parsear la respuesta JSON de Gemini
            let aiText = "Entendido. Procesando info...";
            try {
              const aiData = JSON.parse(response.text || "{}");
              aiText = aiData.reply || aiText;

              if (aiData.updateDB && aiData.tripIdToUpdate && aiData.newStatus) {
                // Actualizar DB en segundo plano
                const { error: updateError } = await supabase
                  .from('usa_shipment_reports')
                  .update({ logistic_status: aiData.newStatus })
                  .eq('id', aiData.tripIdToUpdate);
                  
                if (updateError) {
                  console.error("Error actualizando viaje desde el bot:", updateError);
                } else {
                  console.log(`[Bot] Viaje ${aiData.tripIdToUpdate} actualizado a ${aiData.newStatus}`);
                }
              }
            } catch (pErr) {
              console.error("Error parseando respuesta JSON de Gemini:", pErr);
              // Fallback si Gemini por alguna razón devolvió texto plano
              aiText = response.text || aiText;
            }

            // 3. Enviar respuesta por WhatsApp
            await fetch(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: from,
                type: "text",
                text: { body: aiText }
              })
            });
            console.log(`[Bot] Respondio exitosamente a ${from}`);
          } catch (error) {
            console.error("[Bot Error] Error en lógica de AI/Respuesta", error);
          }
        }
      }
      // Always return 200 to acknowledge Meta receipt
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: false,
      root: process.cwd(),
      server: { middlewareMode: true },
      appType: "spa",
      plugins: [react()],
      optimizeDeps: {
        noDiscovery: true,
        include: [],
        entries: [],
      },
    });
    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const template = await vite.transformIndexHtml(
          url,
          await import("fs/promises").then((fs) => fs.readFile("index.html", "utf-8"))
        );
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    // Serve static files in production
    app.use(express.static("dist"));
    app.get(/(.*)/, (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
