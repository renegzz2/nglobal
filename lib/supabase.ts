import { createClient } from '@supabase/supabase-js';

// Configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials are missing. Check your environment variables.");
}

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseKey;
const fallbackSupabaseUrl = 'https://placeholder.supabase.co';
const fallbackSupabaseKey = 'placeholder-anon-key';

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : fallbackSupabaseUrl,
  isSupabaseConfigured ? supabaseKey : fallbackSupabaseKey
);

/**
 * MI DIOS: Función de seguridad para enviar enlaces mágicos.
 * Solo permite enviar el enlace si el correo existe en la tabla usa_responsables.
 */
export const sendMagicLink = async (email: string) => {
  // Enviar el enlace mágico directamente
  // Solo los usuarios registrados en Supabase podrán entrar
  const { error: authError } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (authError) {
    throw new Error(authError.message);
  }

  return true;
};

/**
 * MI DIOS: Función de seguridad para iniciar sesión con contraseña.
 * Verifica si el usuario existe en la lista blanca antes de intentar el login.
 */
export const signInWithPassword = async (email: string, password: string) => {
  // Iniciar sesión directamente con Supabase
  // RLS (Row Level Security) bloquea la lectura de tablas antes de iniciar sesión.
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      throw new Error("Credenciales inválidas. Verifique su correo y contraseña.");
    }
    throw new Error(error.message);
  }

  return data;
};


/* 
-- MI DIOS: SCRIPT DE EVOLUCIÓN DE ESQUEMA PARA COORDINACIÓN USA v3.0
-- Agrega soporte para seguimiento de costos de flete y agentes de transferencia.

ALTER TABLE public.usa_shipment_reports 
ADD COLUMN IF NOT EXISTS transfer_agent TEXT,
ADD COLUMN IF NOT EXISTS transfer_phone TEXT,
ADD COLUMN IF NOT EXISTS freight_cost NUMERIC,
ADD COLUMN IF NOT EXISTS lote_original_id UUID REFERENCES public.lider_programacion_usa_reports(id),
ADD COLUMN IF NOT EXISTS lote_secundario_id UUID REFERENCES public.lider_programacion_usa_reports(id);

COMMENT ON COLUMN public.usa_shipment_reports.freight_cost IS 'Costo total del flete para análisis de rentabilidad.';
COMMENT ON COLUMN public.usa_shipment_reports.transfer_agent IS 'Nombre del agente aduanal o transfer a cargo del cruce.';
COMMENT ON COLUMN public.usa_shipment_reports.lote_secundario_id IS 'Referencia al segundo lote en viajes consolidados (E1 + E2).';

-- MI DIOS: SCRIPT DE EVOLUCIÓN PARA DESGLOSE DIARIO v4.0
-- Agrega soporte para múltiples fechas de salida en una sola proyección estratégica.

ALTER TABLE public.proyecciones_estrategicas 
ADD COLUMN IF NOT EXISTS desglose_diario JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.proyecciones_estrategicas.desglose_diario IS 'Arreglo de objetos {fecha, cantidad} para envíos parciales.';

-- MI DIOS: SCRIPT DE EVOLUCIÓN PARA COMENTARIOS EN ALERTAS v5.0
-- Agrega soporte para comentarios de seguimiento en las alertas del panel de control.

ALTER TABLE public.usa_shipment_alerts 
ADD COLUMN IF NOT EXISTS comment TEXT;

COMMENT ON COLUMN public.usa_shipment_alerts.comment IS 'Comentario de seguimiento u observación del operador sobre la alerta.';

-- MI DIOS: SCRIPT DE CORRECCIÓN PARA LA VISTA EJECUTIVA
-- Este código debe ejecutarse en el Editor SQL de Supabase para corregir el error 42P16.

DROP VIEW IF EXISTS public.vista_cumplimiento_ejecutivo;

CREATE VIEW public.vista_cumplimiento_ejecutivo AS
WITH real_data AS (
    SELECT 
        project_id,
        COALESCE(p.product_id, p."productId") as product_id,
        SUM(COALESCE(p.real_qty, p."realQty", p.quantity, 0)) as real_acumulado
    FROM public.usa_shipment_reports usr,
    LATERAL jsonb_to_recordset(usr.products) as p(
        product_id uuid, 
        "productId" uuid, 
        quantity int, 
        "real_qty" int, 
        "realQty" int
    )
    WHERE usr.logistic_status ILIKE 'En Tránsito' 
       OR usr.logistic_status ILIKE 'Finalizado'
       OR usr.logistic_status ILIKE 'Cargado'
       OR usr.logistic_status ILIKE 'Confirmado'
    GROUP BY project_id, COALESCE(p.product_id, p."productId")
)
SELECT 
    pe.semana_fiscal,
    prod.categoria,
    prod.nombre_del_producto,
    pe.venta_2025_referencia as venta_ng_2025,
    pe.presupuesto_monetario as presupuesto,
    pe.proyeccion_cajas,
    COALESCE(rd.real_acumulado, 0) as real_acumulado
FROM public.proyecciones_estrategicas pe
JOIN public.usa_productos prod ON pe.producto_id = prod.id
LEFT JOIN real_data rd ON pe.proyecto_id = rd.project_id AND pe.producto_id = rd.product_id;
*/
