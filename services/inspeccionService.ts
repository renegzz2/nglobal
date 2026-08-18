import { supabase } from '../lib/supabase';

export const getProductoresConHuertas = async () => {
  const { data, error } = await supabase
    .from('productores')
    .select('*, huertas(*)')
    .eq('condicion', true);
    
  if (error) throw error;
  return data;
};

export const crearInspeccion = async (payload: InspeccionPayload) => {
  const { data, error } = await supabase
    .from('inspecciones')
    .insert([payload]);
    
  if (error) throw error;
  return data;
};