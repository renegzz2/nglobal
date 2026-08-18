
import { TiveEvent } from '../types';
import { supabase } from '../lib/supabase';

export interface TiveAlertTranslation {
    alert_key: string;
    display_name: string;
    severity: string;
}

/**
 * Obtiene el diccionario de traducciones para alertas de Tive.
 */
export const getAlertDictionary = async (): Promise<Record<string, TiveAlertTranslation>> => {
    const { data, error } = await supabase
        .from('tive_alert_dictionary')
        .select('*');
    
    if (error) {
        console.error("Error al obtener diccionario de alertas:", error);
        return {};
    }

    return (data || []).reduce((acc: any, curr: TiveAlertTranslation) => {
        acc[curr.alert_key] = curr;
        return acc;
    }, {});
};

/**
 * Obtiene el historial real de eventos desde la base de datos Supabase.
 */
export const getTiveHistory = async (trackerId: string): Promise<TiveEvent[]> => {
    const { data, error } = await supabase
        .from('tive_events')
        .select('*')
        .eq('tracker_id', trackerId)
        .order('timestamp', { ascending: false })
        .limit(50);

    if (error) {
        console.error("Error al obtener datos reales de Tive:", error.message);
        throw error;
    }

    return data as TiveEvent[];
};

/**
 * Inserta un evento de prueba para verificar la conexión en la interfaz.
 */
export const sendTestSignal = async (trackerId: string) => {
    // MI DIOS: Generamos valores en Fahrenheit realistas para la prueba (75°F - 78°F)
    const { error } = await supabase.from('tive_events').insert({
        tracker_id: trackerId,
        temperature: parseFloat((75 + Math.random() * 3).toFixed(2)),
        humidity: Math.floor(40 + Math.random() * 20),
        location: 'Ubicación de Prueba, TX',
        lat: 19.4326 + (Math.random() * 0.01),
        lng: -99.1332 + (Math.random() * 0.01),
        battery: Math.floor(80 + Math.random() * 20),
        timestamp: new Date().toISOString(),
        alert_type: 'STOP_DETECTED' 
    });
    
    if (error) throw error;
};
