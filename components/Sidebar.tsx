import React, { useState, useEffect } from 'react';
import { View, User, UserRole } from '../types';
import { DownloadIcon, ChartBarIcon, MapIcon, SettingsIcon, TruckIcon, LayoutGridIcon, DatabaseIcon, TableIcon, BoxIcon, EyeIcon } from './icons';
import { subscribeUserToPush } from '../pushService';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout: () => void;
  showInstallButton?: boolean;
  onInstall?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout, showInstallButton, onInstall }) => {
  const [pushEnabled, setPushEnabled] = useState(true);
  
  // Estado para controlar el menú desplegable de Inspecciones de Campo
  const [inspectionsOpen, setInspectionsOpen] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Abre automáticamente el menú de inspecciones si el usuario está navegando en alguna de sus subsecciones
  useEffect(() => {
    if ([View.INSPECTION_QUALITY, View.INSPECTION_DASHBOARD, View.INSPECTION_INCIDENTS].includes(currentView)) {
      setInspectionsOpen(true);
    }
  }, [currentView]);

  const handleEnableNotifications = async () => {
    const success = await subscribeUserToPush(user.name);
    if (success) setPushEnabled(true);
  };

  const linkClass = (view: View) => `group w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ${currentView === view
    ? 'bg-white/15 text-white shadow-lg backdrop-blur-md border border-white/10'
    : 'text-white/60 hover:bg-white/5 hover:text-white'
    }`;

  const canSee = (view: View) => {
  // 1. Regla especial para la nueva sección de Inspecciones (SOLO Administrador e Inspector)
  if ([View.INSPECTION_QUALITY, View.INSPECTION_DASHBOARD, View.INSPECTION_INCIDENTS].includes(view)) {
    return [UserRole.ADMINISTRADOR, UserRole.INSPECTOR].includes(user.role);
  }

  // 2. Si el rol es INSPECTOR, no debe ver nada más que la sección de inspecciones
  if (user.role === UserRole.INSPECTOR) {
    return false;
  }

  // 3. Reglas existentes para los demás roles
  if ([UserRole.GERENCIA, UserRole.ADMINISTRADOR].includes(user.role)) return true;

  if ([UserRole.DIRECCION, UserRole.SUBDIRECCION].includes(user.role)) {
    return [View.DASHBOARD, View.STRATEGIC_PLANNING, View.EXEC_REPORT, View.TIVE_MAP, View.USA_SHIPMENTS, View.SETTINGS, View.FREIGHT_PAYMENTS].includes(view);
  }
  if (user.role === UserRole.LIDER_PROYECTO) {
    return [View.STRATEGIC_PLANNING, View.LIDER_PROGRAMACION_USA, View.SETTINGS].includes(view);
  }
  if (user.role === UserRole.COORDINADOR) {
    return [View.USA_SHIPMENTS, View.TIVE_MAP, View.INVENTORY, View.SETTINGS].includes(view);
  }
  if ([UserRole.SUBGERENCIA, UserRole.ADMINISTRATIVO].includes(user.role)) {
    return [View.USA_SHIPMENTS, View.DATABASE, View.TIVE_MAP, View.SETTINGS, View.FREIGHT_PAYMENTS, View.INVENTORY].includes(view);
  }
  return false;
};

  // Verifica si el usuario tiene permiso para al menos un submenú de inspecciones
  const canSeeInspections = canSee(View.INSPECTION_QUALITY) || canSee(View.INSPECTION_DASHBOARD) || canSee(View.INSPECTION_INCIDENTS);
  const isInspectionsActive = [View.INSPECTION_QUALITY, View.INSPECTION_DASHBOARD, View.INSPECTION_INCIDENTS].includes(currentView);

  return (
    <div className="flex flex-col h-full bg-[#002D62] text-white border-r border-white/5 shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="p-8 flex flex-col items-center">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-accent to-blue-400 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <img
            src="https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg"
            alt="nglobal logo"
            className="relative h-12 w-auto rounded-lg shadow-2xl transition-transform duration-500 hover:scale-105"
          />
        </div>
        <div className="mt-4 text-center">
          <p className="text-[10px] font-black tracking-[0.3em] text-white/40 uppercase">Logística & Control</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto no-scrollbar">
        {!pushEnabled && (
          <div className="px-2 mb-6">
            <button
              onClick={handleEnableNotifications}
              className="w-full bg-warning/90 hover:bg-warning text-primary font-bold text-[11px] py-2.5 rounded-xl flex items-center justify-center gap-2 transform active:scale-95 transition-all shadow-lg uppercase tracking-wider"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              Notificaciones Push
            </button>
          </div>
        )}

        {canSee(View.DASHBOARD) && (
          <button onClick={() => onNavigate(View.DASHBOARD)} className={linkClass(View.DASHBOARD)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.DASHBOARD ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <LayoutGridIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Ecosistema Global</span>
          </button>
        )}

        {canSee(View.EXEC_REPORT) && (
          <button onClick={() => onNavigate(View.EXEC_REPORT)} className={linkClass(View.EXEC_REPORT)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.EXEC_REPORT ? 'bg-success/20 text-success' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <ChartBarIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Reporte Ejecutivo</span>
          </button>
        )}

        {canSee(View.TIVE_MAP) && (
          <button onClick={() => onNavigate(View.TIVE_MAP)} className={linkClass(View.TIVE_MAP)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.TIVE_MAP ? 'bg-info/20 text-info' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <MapIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Consola Radar</span>
          </button>
        )}

        {[UserRole.ADMINISTRADOR, UserRole.GERENCIA].includes(user.role) && (
          <div className="pt-4 pb-2 px-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Dirección & Estrategia</span>
          </div>
        )}

        {canSee(View.STRATEGIC_PLANNING) && (
          <button onClick={() => onNavigate(View.STRATEGIC_PLANNING)} className={linkClass(View.STRATEGIC_PLANNING)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.STRATEGIC_PLANNING ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <ChartBarIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-amber-400/90 group-hover:text-amber-400">Alcance & Metas</span>
          </button>
        )}

        <button
          onClick={() => setCurrentView(View.QUALITY_INSPECTION)}
          className={`flex items-center gap-3 w-full p-3 rounded-xl font-bold transition-all ${
            currentView === View.QUALITY_INSPECTION 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {/* Puedes usar cualquier ícono de lucide-react como ClipboardCheck */}
          <ClipboardCheck className="w-5 h-5" />
          <span>Inspección Calidad</span>
        </button>        

        {[UserRole.ADMINISTRADOR, UserRole.GERENCIA].includes(user.role) && (
          <div className="pt-4 pb-2 px-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Gestión Operativa</span>
          </div>
        )}

        <div className="py-4 px-2">
          <div className="h-px bg-white/10 w-full"></div>
        </div>

        {canSee(View.LIDER_PROGRAMACION_USA) && (
          <button onClick={() => onNavigate(View.LIDER_PROGRAMACION_USA)} className={linkClass(View.LIDER_PROGRAMACION_USA)}>
            <div className="p-1.5 rounded-lg bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10">
              <TableIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Programación Líder</span>
          </button>
        )}

        {canSee(View.USA_SHIPMENTS) && (
          <button onClick={() => onNavigate(View.USA_SHIPMENTS)} className={linkClass(View.USA_SHIPMENTS)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.USA_SHIPMENTS ? 'bg-white/20' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <TruckIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Operaciones USA</span>
          </button>
        )}

        {/* ======================================================== */}
        {/* SECCIÓN DESPLEGABLE: INSPECCIONES DE CAMPO               */}
        {/* ======================================================== */}
        {canSeeInspections && (
          <div className="space-y-1">
            <button
              onClick={() => setInspectionsOpen(!inspectionsOpen)}
              className={`group w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 ${
                isInspectionsActive
                  ? 'bg-white/15 text-white shadow-lg backdrop-blur-md border border-white/10'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-1.5 rounded-lg ${isInspectionsActive ? 'bg-teal-500/20 text-teal-300' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
                  {/* Ícono de Lista / Portapapeles */}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <span className="text-sm font-semibold tracking-tight">Inspecciones de Campo</span>
              </div>
              <svg
                className={`w-4 h-4 text-white/40 transition-transform duration-300 ${inspectionsOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Submenús desplegables */}
            {inspectionsOpen && (
              <div className="ml-6 pl-3 border-l border-white/10 space-y-1 my-1 transition-all">
                {canSee(View.INSPECTION_QUALITY) && (
                  <button
                    onClick={() => onNavigate(View.INSPECTION_QUALITY)}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      currentView === View.INSPECTION_QUALITY
                        ? 'bg-teal-500/30 text-teal-200 font-bold border border-teal-400/30 shadow-sm'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${currentView === View.INSPECTION_QUALITY ? 'bg-teal-300 animate-pulse' : 'bg-white/30'}`}></div>
                    <span>Inspección calidad</span>
                  </button>
                )}

                {canSee(View.INSPECTION_DASHBOARD) && (
                  <button
                    onClick={() => onNavigate(View.INSPECTION_DASHBOARD)}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      currentView === View.INSPECTION_DASHBOARD
                        ? 'bg-teal-500/30 text-teal-200 font-bold border border-teal-400/30 shadow-sm'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${currentView === View.INSPECTION_DASHBOARD ? 'bg-teal-300 animate-pulse' : 'bg-white/30'}`}></div>
                    <span>Dashboard</span>
                  </button>
                )}

                {canSee(View.INSPECTION_INCIDENTS) && (
                  <button
                    onClick={() => onNavigate(View.INSPECTION_INCIDENTS)}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      currentView === View.INSPECTION_INCIDENTS
                        ? 'bg-amber-500/30 text-amber-200 font-bold border border-amber-400/30 shadow-sm'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${currentView === View.INSPECTION_INCIDENTS ? 'bg-amber-300 animate-pulse' : 'bg-white/30'}`}></div>
                    <span>Reporte de Incidencias</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {[UserRole.ADMINISTRADOR, UserRole.GERENCIA].includes(user.role) && (
          <div className="pt-4 pb-2 px-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Administración & Master</span>
          </div>
        )}

        {canSee(View.FREIGHT_PAYMENTS) && (
          <button onClick={() => onNavigate(View.FREIGHT_PAYMENTS)} className={linkClass(View.FREIGHT_PAYMENTS)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.FREIGHT_PAYMENTS ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-emerald-400/90 group-hover:text-emerald-400">Control Pagos</span>
          </button>
        )}

        {canSee(View.INVENTORY) && (
          <button onClick={() => onNavigate(View.INVENTORY)} className={linkClass(View.INVENTORY)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.INVENTORY ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <BoxIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Inventario Global</span>
          </button>
        )}

        {canSee(View.FRUIT_QUALITY) && (
          <button onClick={() => onNavigate(View.FRUIT_QUALITY)} className={linkClass(View.FRUIT_QUALITY)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.FRUIT_QUALITY ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <EyeIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Calidad IA</span>
          </button>
        )}

        {canSee(View.DATABASE) && (
          <button onClick={() => onNavigate(View.DATABASE)} className={linkClass(View.DATABASE)}>
            <div className="p-1.5 rounded-lg bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10">
              <DatabaseIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white/80">Archivos Maestros</span>
          </button>
        )}

        {canSee(View.SETTINGS) && (
          <button onClick={() => onNavigate(View.SETTINGS)} className={linkClass(View.SETTINGS)}>
            <div className={`p-1.5 rounded-lg ${currentView === View.SETTINGS ? 'bg-primary-focus/20 text-white' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
              <SettingsIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Configuración</span>
          </button>
        )}
      </nav>

      <div className="p-4 space-y-4">
        {showInstallButton && (
          <button
            onClick={onInstall}
            className="w-full flex items-center justify-center gap-2 bg-accent/20 hover:bg-accent/40 text-accent-content py-3 rounded-xl transition-all border border-accent/20 group animate-pulse"
          >
            <DownloadIcon className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-widest">Descargar PWA</span>
          </button>
        )}

        <div className="pt-4 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between border border-white/5">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center text-white text-xl shadow-lg border border-white/20">
                {user.avatar || '👤'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-black text-white truncate w-24 uppercase tracking-tighter">{user.name}</p>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></div>
                  <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">{user.role}</p>
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2.5 rounded-xl text-white/40 hover:text-danger hover:bg-danger/10 transition-all active:scale-95"
              title="Finalizar Sesión"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;