import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useNotification } from './NotificationProvider';
import { toCamelCase } from '../utils/formatters';
import { ProductoDB, ClienteDB, ProyectoDB } from '../types';

interface TiveData {
    temp: number | null;
    timestamp: string;
    alert?: string;
    battery?: number;
    location?: string;
    speed?: number;
    avgSpeed?: number;
    predictedEta?: string;
    etaLabel?: string;
    isDelayed?: boolean;
    noSignal?: boolean;
}

interface TiveMonitoringContextType {
    latestTiveData: Record<string, TiveData>;
    refreshMonitoring: () => Promise<void>;
}

const TiveMonitoringContext = createContext<TiveMonitoringContextType | undefined>(undefined);

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radio de la tierra en KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const TiveMonitoringProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [latestTiveData, setLatestTiveData] = useState<Record<string, TiveData>>({});
    const [clientes, setClientes] = useState<ClienteDB[]>([]);
    const [proyectos, setProyectos] = useState<ProyectoDB[]>([]);
    const { addNotification } = useNotification();

    const fetchConfigs = useCallback(async () => {
        const [cliRes, projRes] = await Promise.all([
            supabase.from('usa_clientes').select('*'),
            supabase.from('usa_proyectos').select('*')
        ]);
        if (cliRes.data) setClientes(toCamelCase(cliRes.data));
        if (projRes.data) setProyectos(toCamelCase(projRes.data));
    }, []);

    useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

    const autoUpdateStatus = async (shipmentId: string, tripId: string, newStatus: string, eventType: string) => {
        try {
            const updatePayload: any = { logistic_status: newStatus };
            
            // Estampado de tiempos específicos según el hito
            if (eventType === 'ENTRY_E2') updatePayload.arrived_at_stop_over = new Date().toISOString();
            if (eventType === 'EXIT_E2') updatePayload.departed_from_stop_over = new Date().toISOString();
            if (eventType === 'ARRIVAL_CLIENT') {
                updatePayload.arrival_date_time = new Date().toISOString();
                updatePayload.rating_pending = true; // JEFE: Marcamos auditoría pendiente al arribar
            }

            const { error } = await supabase
                .from('usa_shipment_reports')
                .update(updatePayload)
                .eq('id', shipmentId);

            if (!error) {
                addNotification({
                    type: eventType === 'ARRIVAL_CLIENT' ? 'success' : 'info',
                    title: 'IA: Ubicación Detectada',
                    message: `Viaje ${tripId}: Estatus actualizado a "${newStatus}".`
                });
            }
        } catch (err) {
            console.error("Error en auto-update:", err);
        }
    };

    const fetchLiveData = useCallback(async () => {
        try {
            const { data: activeShipments } = await supabase
                .from('usa_shipment_reports')
                .select('id, trip_id, tive_tracker_id, client_id, project_id, stop_over_project_id, arrived_at_stop_over, departed_from_stop_over, expected_arrival, logistic_status')
                .neq('logistic_status', 'Finalizado')
                .neq('logistic_status', 'Cancelado');

            if (!activeShipments) return;

            const newData: Record<string, TiveData> = {};
            const now = Date.now();

            for (const shipment of activeShipments) {
                const trackerId = shipment.tive_tracker_id?.trim();
                if (!trackerId) continue;

                const { data: history } = await supabase
                    .from('tive_events')
                    .select('temperature, timestamp, alert_type, battery, location, lat, lng, speed')
                    .eq('tracker_id', trackerId)
                    .order('timestamp', { ascending: false })
                    .limit(5);

                if (history && history.length > 0) {
                    const latest = history[0];
                    const dataAgeMinutes = (now - new Date(latest.timestamp).getTime()) / 60000;
                    const isRealtime = dataAgeMinutes < 15;
                    
                    const validSpeeds = history.filter(h => h.speed !== null && h.speed > 0);
                    const avgSpeed = validSpeeds.length > 0 
                        ? validSpeeds.reduce((a, b) => a + (b.speed || 0), 0) / validSpeeds.length 
                        : 0;
                    
                    const displaySpeed = (latest.speed === 0 && avgSpeed > 5 && isRealtime) ? avgSpeed : (latest.speed || 0);

                    let predictedEta = null;
                    let isDelayed = false;
                    let etaLabel = 'Arribo a Cliente';
                    
                    const client = clientes.find(c => c.id === shipment.client_id);
                    const project = proyectos.find(p => p.id === shipment.project_id);
                    const stopOver = shipment.stop_over_project_id ? proyectos.find(p => p.id === shipment.stop_over_project_id) : null;

                    // MI DIOS: MOTOR DE DETECCIÓN NOMINAL DE GEOCERCAS
                    if (latest.lat && latest.lng && isRealtime) {
                        const currentStatus = shipment.logistic_status || '';
                        
                        // 1. CHEQUEO EN CLIENTE (DESTINO)
                        if (client?.lat && client?.lng) {
                            const dist = calculateDistance(latest.lat, latest.lng, client.lat, client.lng);
                            const radio = (client.radioGeocercaMetros || 500) / 1000;
                            if (dist <= radio && currentStatus !== `En ${client.nombre}`) {
                                await autoUpdateStatus(shipment.id, shipment.trip_id, `En ${client.nombre}`, 'ARRIVAL_CLIENT');
                            }
                        }

                        // 2. CHEQUEO EN ESCALA TÉCNICA (E2)
                        if (stopOver?.lat && stopOver?.lng) {
                            const dist = calculateDistance(latest.lat, latest.lng, stopOver.lat, stopOver.lng);
                            const radio = (stopOver.radioGeocercaMetros || 500) / 1000;
                            
                            // Entrada a E2
                            if (dist <= radio && currentStatus !== `En ${stopOver.nombre}`) {
                                await autoUpdateStatus(shipment.id, shipment.trip_id, `En ${stopOver.nombre}`, 'ENTRY_E2');
                            }
                            // Salida de E2
                            if (dist > radio && currentStatus === `En ${stopOver.nombre}` && displaySpeed > 10) {
                                await autoUpdateStatus(shipment.id, shipment.trip_id, `En Tránsito`, 'EXIT_E2');
                            }
                        }

                        // 3. CHEQUEO EN EMPAQUE ORIGEN (E1)
                        if (project?.lat && project?.lng) {
                            const dist = calculateDistance(latest.lat, latest.lng, project.lat, project.lng);
                            const radio = (project.radioGeocercaMetros || 500) / 1000;
                            
                            // Si está dentro del origen
                            if (dist <= radio && currentStatus !== `En ${project.nombre}`) {
                                await autoUpdateStatus(shipment.id, shipment.trip_id, `En ${project.nombre}`, 'AT_ORIGIN');
                            }
                            // Detección de salida hacia tránsito
                            if (dist > radio && currentStatus.startsWith('En ') && displaySpeed > 10) {
                                await autoUpdateStatus(shipment.id, shipment.trip_id, `En Tránsito`, 'DEPARTURE');
                            }
                        }
                    }

                    newData[shipment.id] = {
                        temp: latest.temperature,
                        timestamp: latest.timestamp,
                        alert: latest.alert_type,
                        battery: latest.battery,
                        location: latest.location || 'Localizando...',
                        speed: displaySpeed,
                        avgSpeed: avgSpeed,
                        predictedEta: predictedEta || undefined,
                        etaLabel,
                        isDelayed,
                        noSignal: dataAgeMinutes > 40
                    };
                }
            }
            setLatestTiveData(prev => ({ ...prev, ...newData }));
        } catch (error) {
            console.error("Error motor realtime:", error);
        }
    }, [clientes, proyectos, addNotification]);

    useEffect(() => {
        fetchLiveData();
        const interval = setInterval(fetchLiveData, 30000); 
        return () => clearInterval(interval);
    }, [fetchLiveData]);

    return (
        <TiveMonitoringContext.Provider value={{ latestTiveData, refreshMonitoring: fetchLiveData }}>
            {children}
        </TiveMonitoringContext.Provider>
    );
};

export const useTiveMonitoring = () => {
    const context = useContext(TiveMonitoringContext);
    if (context === undefined) throw new Error('useTiveMonitoring error');
    return context;
};