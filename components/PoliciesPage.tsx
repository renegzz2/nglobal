import React, { useState } from 'react';
import { View } from '../types';

interface PoliciesPageProps {
  onBack?: () => void;
  isExternal?: boolean;
}

const PoliciesPage: React.FC<PoliciesPageProps> = ({ onBack, isExternal = false }) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'deletion' | 'security'>('privacy');

  const tabs = [
    { id: 'privacy', label: 'Privacidad', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { id: 'terms', label: 'Términos', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'deletion', label: 'Eliminar Datos', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
    { id: 'security', label: 'Seguridad', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'privacy':
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-primary">Política de Privacidad</h2>
            <p className="text-text-secondary leading-relaxed">
              En <strong>nglobal Logistics</strong>, la privacidad de sus datos es nuestra prioridad. Esta política detalla cómo recopilamos, usamos y protegemos su información personal y operativa.
            </p>
            <div className="space-y-4">
              <h3 className="font-bold text-primary">1. Recopilación de Información</h3>
              <p className="text-sm text-text-secondary">
                Recopilamos datos necesarios para la operación logística, incluyendo nombres de usuario, roles, coordenadas de ubicación (vía Tive) y detalles de embarques USA/MX.
              </p>
              <h3 className="font-bold text-primary">2. Uso de Datos</h3>
              <p className="text-sm text-text-secondary">
                Su información se utiliza exclusivamente para la coordinación de transporte, generación de reportes de cumplimiento y notificaciones automáticas vía WhatsApp.
              </p>
              <h3 className="font-bold text-primary">3. Protección de Datos</h3>
              <p className="text-sm text-text-secondary">
                Utilizamos encriptación de extremo a extremo y protocolos de seguridad de Supabase para garantizar que solo el personal autorizado tenga acceso a la información sensible.
              </p>
            </div>
          </div>
        );
      case 'terms':
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-primary">Términos y Condiciones de Uso</h2>
            <p className="text-text-secondary leading-relaxed">
              Al acceder a esta plataforma, usted acepta cumplir con los siguientes términos operativos y de seguridad.
            </p>
            <div className="space-y-4 text-sm text-text-secondary">
              <ul className="list-disc pl-5 space-y-2">
                <li>El acceso es estrictamente personal e intransferible.</li>
                <li>La información contenida en la plataforma es confidencial y propiedad de nglobal.</li>
                <li>El uso de la API de WhatsApp está sujeto a las políticas comerciales de Meta.</li>
                <li>Toda acción realizada dentro de la plataforma queda registrada para auditoría de seguridad.</li>
              </ul>
            </div>
          </div>
        );
      case 'deletion':
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-primary text-danger">Política de Eliminación de Datos</h2>
            <p className="text-text-secondary leading-relaxed">
              Usted tiene derecho a solicitar la eliminación de sus datos personales de nuestros sistemas.
            </p>
            <div className="bg-danger/5 border border-danger/20 p-4 rounded-xl">
              <h4 className="font-bold text-danger mb-2">Procedimiento de Solicitud:</h4>
              <p className="text-sm text-text-secondary mb-4">
                Para eliminar su cuenta o borrar datos específicos, por favor envíe un correo a:
                <br />
                <strong className="text-primary">sistemas@nglobal.com.mx</strong>
              </p>
              <p className="text-xs text-text-muted italic">
                Nota: La eliminación de datos operativos (embarques, logs de transporte) puede estar sujeta a retención legal por un periodo de hasta 5 años según la normativa de comercio exterior.
              </p>
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-primary">Estándares de Seguridad</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-secondary rounded-xl">
                <h4 className="font-bold text-primary text-sm mb-1">Cifrado AES-256</h4>
                <p className="text-xs text-text-secondary">Todos los datos en reposo y tránsito están protegidos con estándares bancarios.</p>
              </div>
              <div className="p-4 bg-secondary rounded-xl">
                <h4 className="font-bold text-primary text-sm mb-1">Row Level Security</h4>
                <p className="text-xs text-text-secondary">Políticas granulares que aseguran que cada rol solo vea la información permitida.</p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`min-h-screen ${isExternal ? 'bg-[#FAF9F6]' : 'bg-transparent'} p-4 md:p-8 flex items-center justify-center font-sans`}>
      <div className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl border border-primary/5 overflow-hidden flex flex-col md:flex-row h-auto md:h-[600px]">
        
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 bg-primary p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="text-white font-black tracking-tighter text-xl">Center</span>
            </div>

            <nav className="space-y-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === tab.id 
                    ? 'bg-white text-primary shadow-lg scale-105' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {!isExternal && onBack && (
            <button 
              onClick={onBack}
              className="mt-6 flex items-center gap-2 text-white/50 hover:text-white text-xs font-black uppercase tracking-widest transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              Volver
            </button>
          )}

          {isExternal && (
            <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <p className="text-[10px] text-white/40 uppercase font-black tracking-[0.2em]">Soporte Técnico</p>
              <p className="text-xs text-white/80 font-bold mt-1">it@nglobal.com.mx</p>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 md:p-12 overflow-y-auto custom-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default PoliciesPage;
