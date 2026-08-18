
import React, { useState, useEffect } from 'react';
import StaffOnDuty from './StaffOnDuty';

const TiveMapPage: React.FC = () => {
  // MI DIOS: Recuperar zoom guardado o usar 1 por defecto
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('tive_global_zoom');
    return saved ? parseFloat(saved) : 1;
  });

  // Guardar zoom cuando cambie
  useEffect(() => {
    localStorage.setItem('tive_global_zoom', zoom.toString());
  }, [zoom]);

  return (
    <div className="h-full animate-fade-in flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mb-6">
        <div className="lg:col-span-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Consola de Tráfico Global</h1>
            <p className="text-sm text-text-secondary">Monitoreo satelital de flota en tiempo real mediante Tive Portal.</p>
          </div>
          
          {/* MI DIOS: Control de Ajuste de Tamaño con Memoria */}
          <div className="bg-white px-4 py-2 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Ajustar Tamaño:</span>
            <input 
              type="range" 
              min="0.5" 
              max="1.5" 
              step="0.1" 
              value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-32 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-xs font-black text-primary min-w-[40px]">{Math.round(zoom * 100)}%</span>
            <button 
              onClick={() => setZoom(1)}
              className="text-[9px] font-black text-text-muted hover:text-primary uppercase underline"
            >
              Reset
            </button>
          </div>
        </div>
        <StaffOnDuty />
      </div>

      <div className="flex-1 bg-surface rounded-2xl border border-border shadow-xl overflow-hidden relative min-h-[600px]">
        <div className="w-full h-full relative overflow-hidden bg-[#f4f7f9]">
          <iframe 
            title="Tive Tracking Portal"
            src="https://platform.tive.com/devicetracking/Nglobal"
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              border: 'none'
            }}
            allow="geolocation"
          />
        </div>
        
        <div className="absolute top-4 right-4 bg-primary/90 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-sm pointer-events-none z-10">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          Conexión Satelital Activa
        </div>
      </div>
    </div>
  );
};

export default TiveMapPage;
