
import React from 'react';
import { UserRole, User } from '../types';

interface PortalProps {
  onLogin: (user: User) => void;
}

const Portal: React.FC<PortalProps> = ({ onLogin }) => {
  const areas = [
    {
      role: UserRole.DIRECCION,
      title: 'Dirección General',
      desc: 'KPIs estratégicos y matriz de cumplimiento.',
      color: 'bg-indigo-600',
      icon: '📊'
    },
    {
      role: UserRole.SUBDIRECCION,
      title: 'Subdirección',
      desc: 'Control financiero, pagos y reportes generales.',
      color: 'bg-blue-600',
      icon: '🏛️'
    },
    {
      role: UserRole.LIDER_PROYECTO,
      title: 'Líder de Proyecto',
      desc: 'Programación de lotes y planeación de siembras.',
      color: 'bg-emerald-600',
      icon: '🌱'
    },
    {
      role: UserRole.GERENCIA,
      title: 'Gerencia Logística',
      desc: 'Supervisión de flota y despacho internacional.',
      color: 'bg-slate-700',
      icon: '🚛'
    },
    {
      role: UserRole.COORDINADOR,
      title: 'Coordinación USA',
      desc: 'Gestión de embarques, radar y aduanas.',
      color: 'bg-amber-600',
      icon: '⏱️'
    },
    {
      role: UserRole.ADMINISTRATIVO,
      title: 'Administrativo',
      desc: 'Bases maestras, productos y registros operativos.',
      color: 'bg-slate-800',
      icon: '📂'
    }
  ];

  const handleAreaClick = (area: typeof areas[0]) => {
    onLogin({
      name: area.title,
      role: area.role,
      avatar: area.icon
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary"></div>
      
      <div className="max-w-5xl w-full space-y-12 relative z-10">
        <div className="text-center space-y-4">
          <div className="mx-auto mb-8 flex justify-center animate-fade-in">
             <img
                src="https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg"
                alt="nglobal logo"
                className="h-20 w-auto rounded-3xl shadow-2xl border-4 border-white transform transition-transform hover:scale-105"
              />
          </div>
          <h2 className="text-4xl font-black text-primary uppercase tracking-tight text-center">Centro de Operaciones Global</h2>
          <p className="max-w-xl mx-auto text-text-secondary font-medium text-sm leading-relaxed uppercase tracking-widest opacity-60">
            Seleccione el área de gestión para iniciar sesión en la plataforma coordinada v4.0.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map(area => (
            <button
              key={area.role}
              onClick={() => handleAreaClick(area)}
              className="group bg-white p-8 rounded-[2.5rem] border border-border shadow-md hover:shadow-2xl transition-all duration-500 text-left relative overflow-hidden active:scale-95"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 ${area.color} opacity-[0.03] rounded-bl-[100px] transition-transform group-hover:scale-150`}></div>
              
              <div className="flex flex-col gap-6 relative z-10">
                <div className={`w-14 h-14 rounded-2xl ${area.color} text-white flex items-center justify-center text-2xl shadow-xl transition-transform group-hover:rotate-6`}>
                  {area.icon}
                </div>
                <div>
                  <h4 className="text-lg font-black text-primary uppercase tracking-tight mb-2 group-hover:text-accent transition-colors">{area.title}</h4>
                  <p className="text-xs text-text-muted font-bold leading-relaxed">{area.desc}</p>
                </div>
                
                <div className="flex items-center gap-2 text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] group-hover:text-primary transition-colors">
                  Acceso Seguro 
                  <svg className="w-4 h-4 translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2 pt-8">
          <div className="h-1 w-12 bg-border rounded-full"></div>
          <p className="text-[10px] text-text-muted uppercase font-black tracking-[0.2em]">
            nglobal Logistics Systems | v4.0 Unified Access
          </p>
        </div>
      </div>
    </div>
  );
};

export default Portal;
