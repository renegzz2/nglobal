import React, { useState, useEffect, useMemo } from 'react';
import StrategicPlanningPage from '../../components/StrategicPlanningPage';
import { User, LiderProgramacionUsaReport } from '../../types';
import { supabase } from '../../lib/supabase';
import { toCamelCase } from '../../utils/formatters';
import { TruckIcon, ClockIcon } from '../../components/icons';

interface CoordinadorViewProps {
  user: User;
}

/**
 * Orquestador para Coordinador Logístico.
 * Se agrega Fila de Notificaciones de Agenda (Radar de Cargas).
 */
const CoordinadorView: React.FC<CoordinadorViewProps> = ({ user }) => {
  const [pendingLoads, setPendingLoads] = useState<Record<string, number>>({});
  const [loadingRadar, setLoadingRadar] = useState(true);

  // MI DIOS: MOTOR DE RADAR (Fetching de intenciones de carga de Líderes)
  useEffect(() => {
    const fetchRadarData = async () => {
      setLoadingRadar(true);
      try {
        const { data, error } = await supabase
          .from('lider_programacion_usa_reports')
          .select('fecha_salida')
          .eq('usa_logistics_status', 'Programado');
        
        if (error) throw error;

        const counts: Record<string, number> = {};
        data?.forEach(item => {
          const dateStr = String(item.fecha_salida || '').split('T')[0];
          if (dateStr) counts[dateStr] = (counts[dateStr] || 0) + 1;
        });
        setPendingLoads(counts);
      } catch (err) {
        console.error("Error en radar:", err);
      } finally {
        setLoadingRadar(false);
      }
    };

    fetchRadarData();
    
    // Escucha en tiempo real para que el puntito aparezca apenas el líder guarde
    const channel = supabase.channel('radar-coordinacion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lider_programacion_usa_reports' }, () => fetchRadarData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // MI DIOS: Generador de Timeline (12 días de cobertura)
  const radarDays = useMemo(() => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = -1; i < 11; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: i === 0,
        hasCarga: (pendingLoads[dateStr] || 0) > 0,
        count: pendingLoads[dateStr] || 0
      });
    }
    return days;
  }, [pendingLoads]);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-emerald-900">Panel de Despacho y Monitoreo</h2>
          <p className="text-[10px] text-emerald-700 font-black uppercase tracking-widest">Ejecución de Embarques en Tiempo Real</p>
        </div>
        <div className="flex items-center gap-2 bg-white/50 px-3 py-1 rounded-lg border border-emerald-200 shadow-inner">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
           <span className="text-[9px] font-black text-emerald-800 uppercase tracking-tighter">Radar de Cargas Activo</span>
        </div>
      </div>

      {/* MI DIOS: FILA DE NOTIFICACIÓN DE AGUDA (Solicitada por el Jefe) */}
      <div className="bg-white p-4 rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <ClockIcon className="w-3.5 h-3.5 text-primary" />
          <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Radar de Notificación (Lotes Programados)</h4>
        </div>
        
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {radarDays.map((day, idx) => (
            <div 
              key={idx}
              className={`flex flex-col items-center justify-center min-w-[65px] h-16 rounded-xl border transition-all relative ${day.isToday ? 'bg-primary/5 border-primary/20' : 'bg-surface-secondary/30 border-transparent'}`}
            >
              <span className={`text-[8px] font-black uppercase mb-0.5 ${day.isToday ? 'text-primary' : 'text-text-muted'}`}>{day.label}</span>
              <span className={`text-lg font-black ${day.isToday ? 'text-primary' : 'text-text-primary'}`}>{day.dayNum}</span>
              
              {/* JEFE: El "Puntito" de notificación */}
              {day.hasCarga && (
                <div className="absolute -top-1 -right-1 flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white shadow-sm"></span>
                  {day.count > 1 && (
                    <span className="absolute -bottom-4 text-[7px] font-black text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-100">{day.count} Lotes</span>
                  )}
                </div>
              )}
              
              {day.isToday && <div className="absolute -bottom-1 w-4 h-0.5 bg-primary rounded-full"></div>}
            </div>
          ))}
        </div>
        <p className="text-[8px] text-text-muted font-bold uppercase mt-3 italic tracking-tighter">
          * Los indicadores verdes muestran días con cargas registradas por Líderes de Proyecto en espera de asignación de transporte.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-10">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TruckIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-black text-primary uppercase tracking-tight">Gestión de Cargas Semanal</h3>
          </div>
          <StrategicPlanningPage 
            user={user} 
            title=""
            subtitle=""
            hideViewSelector={true} 
            initialViewMode="camiones" 
            showTabs={false}
            showPallets={false}
            defaultTab="daily"
          />
        </section>
      </div>
    </div>
  );
};

export default CoordinadorView;