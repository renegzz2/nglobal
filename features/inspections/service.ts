import { supabase } from '../../lib/supabase';

export const getProductoresConHuertas = async () => {
  const { data, error } = await supabase
    .from('productores')
    .select('*, huertas(*)')
    .eq('condicion', true);
    
  if (error) throw error;
  return data;
};

interface InspeccionPayload {
  tipo_inspeccion: string;
  producto: string;
  productor_id: string;
  huerta_id: string;
  tamano_muestra: number;
  detalles_danos: Record<string, { peso: number; porcentaje: number }>;
  calidad_score: number;
  estatus: string;
  observaciones: string;
}

export const crearInspeccion = async (payload: InspeccionPayload) => {
  const { data, error } = await supabase
    .from('inspecciones')
    .insert(payload);
    
  if (error) throw error;
  return data;
};