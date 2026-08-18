
// ==============================================================================
// SUPABASE EDGE FUNCTION: gemini-chat
// ==============================================================================
// Despliegue: supabase functions deploy gemini-chat
// Requiere: GEMINI_API_KEY en los secretos de Supabase.
// ==============================================================================

// Declare Deno global for TypeScript
declare const Deno: any;

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai";
import { createJsonResponse, createOptionsResponse } from "../_shared/cors.ts";

const ALLOWED_CONTEXT_ROLES = new Set([
  'COORDINADOR',
  'SUBGERENCIA',
  'GERENCIA',
  'DIRECCION',
  'SUBDIRECCION',
  'ADMINISTRADOR',
]);

serve(async (req) => {
  // Manejo de CORS preflight
  if (req.method === 'OPTIONS') {
    return createOptionsResponse(req);
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!jwt || !supabaseUrl || !supabaseAnonKey) {
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

    if (authError || !authData.user) {
      return createJsonResponse(req, { error: 'Unauthorized' }, {
        status: 401,
      });
    }

    const { message, image } = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en las variables de entorno.");
    }

    // Inicializar cliente Gemini
    const ai = new GoogleGenAI({ apiKey });

    // ---------------------------------------------------------
    // CASO 1: ANÁLISIS DE IMAGEN (Quality Checker)
    // ---------------------------------------------------------
    if (image) {
      // Usamos el modelo específico para tareas de imagen
      const model = 'gemini-2.5-flash-image';
      
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { text: message || "Analiza esta imagen." },
            { 
              inlineData: { 
                mimeType: 'image/jpeg', 
                data: image 
              } 
            }
          ]
        }
      });

      return createJsonResponse(req, { text: response.text }, {
        status: 200,
      });
    } 
    
    // ---------------------------------------------------------
    // CASO 2: CHAT CONTEXTUAL (Asistente Logístico)
    // ---------------------------------------------------------
    else {
      // 1. Obtener contexto de la Base de Datos
      let contextData = "[]";

      if (ALLOWED_CONTEXT_ROLES.has(normalizedRole)) {
        const supabaseClient = createClient(
          supabaseUrl,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Obtenemos los últimos envíos activos para dar contexto solo a roles autorizados.
        const { data: shipments, error } = await supabaseClient
          .from('usa_shipment_reports')
          .select('trip_id, project, logistic_status, arrival_date_time, comments, departure_date_time, temperature')
          .neq('logistic_status', 'Finalizado')
          .order('created_at', { ascending: false })
          .limit(15);

        if (error) {
          console.error("Error obteniendo contexto de DB:", error);
        } else {
          contextData = shipments ? JSON.stringify(shipments) : "[]";
        }
      }
      
      // 2. Configurar System Instruction
      const systemInstruction = `
        Eres el Asistente Operativo de nglobal Logistics.
        
        CONTEXTO ACTUAL DE ENVÍOS (Base de Datos en Tiempo Real):
        ${contextData}

        INSTRUCCIONES:
        1. Usa la información proporcionada para responder preguntas sobre el estado de los envíos, ubicaciones o retrasos.
        2. Si te preguntan por un ID de viaje (trip_id) específico que está en la lista, da los detalles.
        3. Si la información no está en el contexto o el usuario no tiene permisos suficientes, indica amablemente que no tienes acceso a ese dato específico actualmente.
        4. Sé conciso y profesional. Respuestas cortas y directas.
        5. La fecha actual es: ${new Date().toLocaleString()}.
      `;

      // 3. Generar respuesta con Gemini 3 Flash (Optimizado para texto)
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: message,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      return createJsonResponse(req, { text: response.text }, {
        status: 200,
      });
    }

  } catch (error: any) {
    console.error("Error en Edge Function:", error);
    return createJsonResponse(req, { error: error.message }, {
      status: 500,
    });
  }
});
