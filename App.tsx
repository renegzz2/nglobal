import React, { useState, useEffect, Suspense, lazy } from 'react';
import { View, User, UserRole } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { NotificationProvider } from './components/NotificationProvider';
import { TiveMonitoringProvider } from './components/TiveMonitoringProvider';
import NotificationsContainer from './components/NotificationsContainer';
import Login from './components/Login';
import { syncIncidents } from './features/shipments/incidents';
import type { Session } from '@supabase/supabase-js';
import { AdminMfa } from './features/auth/AdminMfa';
import { canAccessView } from './features/auth/access';
import ChatMessenger from './components/ChatMessenger';
import { TableSkeleton } from './components/ui/Skeleton';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Geolocation } from '@capacitor/geolocation';
import { Camera } from '@capacitor/camera';
import { PushNotifications } from '@capacitor/push-notifications';
import { QualityForm } from './components/QualityForm';

// CODE SPLITTING: Lazy load pages to optimize initial bundle size.
// This ensures that complex mapping and charting libraries are only loaded when needed.
const Dashboard = lazy(() => import('./components/Dashboard'));
const BaseDeDatosPage = lazy(() => import('./components/BaseDeDatosPage'));
const UsaShipmentReportPage = lazy(() => import('./components/UsaShipmentReportPage'));
const LiderProgramacionUsaPage = lazy(() => import('./components/LiderProgramacionUsaPage'));
const FruitQualityChecker = lazy(() => import('./components/FruitQualityChecker'));
const StrategicPlanningPage = lazy(() => import('./components/StrategicPlanningPage'));
const ClientReportDashboard = lazy(() => import('./components/ClientReportDashboard'));
const TiveMapPage = lazy(() => import('./components/TiveMapPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const FreightPaymentPage = lazy(() => import('./components/FreightPaymentPage'));
const InventoryPage = lazy(() => import('./components/InventoryPage'));
const PoliciesPage = lazy(() => import('./components/PoliciesPage'));

const ROLE_MAP: Record<string, UserRole> = Object.values(UserRole).reduce((acc, role) => {
  acc[role] = role;
  return acc;
}, {} as Record<string, UserRole>);

const getRoleFromAuthUser = (authUser: any): UserRole | null => {
  const rawRole = authUser?.app_metadata?.role;
  if (typeof rawRole !== 'string') return null;
  const normalizedRole = rawRole.trim().toUpperCase();
  return Object.hasOwn(ROLE_MAP, normalizedRole) ? ROLE_MAP[normalizedRole] : null;
};

const buildUserFromAuth = (authUser: any): User | null => {
  const role = getRoleFromAuthUser(authUser);
  if (!role) return null;

  const displayName =
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split('@')[0] ||
    'Usuario';

  return {
    name: displayName,
    role,
    avatar: authUser?.user_metadata?.avatar || authUser?.user_metadata?.avatar_url
  };
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const authUser = session?.user;
  const [mfaVerifiedToken, setMfaVerifiedToken] = useState<string>();
  const user = buildUserFromAuth(authUser);
  const [authVerified, setAuthVerified] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isChatOpen, setIsChatOpen] = useState(window.innerWidth > 1200);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  if (!isSupabaseConfigured) {
    return (
      <NotificationProvider>
        <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white rounded-[2rem] border border-border shadow-xl p-8 text-center">
            <h2 className="text-2xl font-black text-primary uppercase tracking-tight">Configuracion incompleta</h2>
            <p className="mt-4 text-sm text-text-secondary font-medium">
              Faltan las variables <code>VITE_SUPABASE_URL</code> y/o <code>VITE_SUPABASE_ANON_KEY</code> en tu entorno.
            </p>
            <p className="mt-2 text-xs text-text-muted font-bold uppercase tracking-widest">
              La aplicacion no puede iniciar autenticacion ni cargar datos sin Supabase.
            </p>
          </div>
        </div>
        <NotificationsContainer />
      </NotificationProvider>
    );
  }

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(console.error);
      StatusBar.setStyle({ style: Style.Light }).catch(console.error);
      StatusBar.setBackgroundColor({ color: '#FAF9F6' }).catch(console.error);

      const requestPermissions = async () => {
        try {
          await Geolocation.requestPermissions();
          await Camera.requestPermissions();
          await PushNotifications.requestPermissions();
        } catch (error) {
          console.error("Error al solicitar permisos:", error);
        }
      };
      
      requestPermissions();
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthVerified(true);
    });
    localStorage.removeItem('ng_selected_role');
    localStorage.removeItem('ng_auth_profile');

    if (window.location.pathname === '/politicas') setCurrentView(View.POLICIES);
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.role === UserRole.INSPECTOR && !canAccessView(user.role, currentView)) {
      setCurrentView(View.INSPECTION_QUALITY);
    }
  }, [user?.role, currentView]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!authUser?.id) return;
    const controller = new AbortController();
    const sync = () => void syncIncidents(authUser.id, controller.signal).catch(console.error);
    window.addEventListener('online', sync);
    const retry = window.setInterval(sync, 60_000);
    sync();
    return () => {
      controller.abort();
      window.removeEventListener('online', sync);
      window.clearInterval(retry);
    };
  }, [authUser?.id]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || user?.role !== UserRole.ADMINISTRADOR) return;
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel(token).then(({ data }) => {
      if (active && data?.currentLevel === 'aal2') setMfaVerifiedToken(token);
    });
    return () => { active = false; };
  }, [session?.access_token, user?.role]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };


  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error al cerrar sesión:', error.message);
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleChat = () => setIsChatOpen(!isChatOpen);

  const renderContent = () => {
  if (!user) return null;

  let component;
  
  // 2. Redirección de respaldo si no tiene acceso a la vista solicitada
  if (!canAccessView(user.role, currentView)) {
    if (user.role === UserRole.INSPECTOR) {
      // Placeholder temporal mientras creamos los componentes de inspección
      component = (
        <div className="p-8 text-center bg-white rounded-3xl border border-border shadow-sm">
          <h2 className="text-xl font-black text-primary uppercase">Módulo Inspecciones de Campo</h2>
          <p className="text-sm text-text-secondary mt-2">Selecciona un submenú del panel izquierdo para comenzar.</p>
        </div>
      );
    } else if ([UserRole.COORDINADOR, UserRole.SUBGERENCIA, UserRole.ADMINISTRATIVO].includes(user.role)) {
      component = <UsaShipmentReportPage initialView="active" user={user} />;
    } else if (user.role === UserRole.LIDER_PROYECTO) {
      component = <StrategicPlanningPage user={user} />;
    } else {
      component = <Dashboard onViewChange={setCurrentView} userRole={user.role} />;
    }
  } else {
    // 3. Renderizado de la vista solicitada
    switch (currentView) {
      case View.DASHBOARD: component = <Dashboard onViewChange={setCurrentView} userRole={user.role} />; break;
      case View.DATABASE: component = <BaseDeDatosPage user={user} />; break;
      case View.USA_SHIPMENTS: component = <UsaShipmentReportPage initialView="active" user={user} />; break;
      case View.LIDER_PROGRAMACION_USA: component = <LiderProgramacionUsaPage user={user} />; break;
      case View.FRUIT_QUALITY: component = <FruitQualityChecker />; break;
      case View.STRATEGIC_PLANNING: component = <StrategicPlanningPage user={user} />; break;
      case View.EXEC_REPORT: component = <ClientReportDashboard userRole={user.role} />; break;
      case View.TIVE_MAP: component = <TiveMapPage />; break;
      case View.SETTINGS: component = <SettingsPage user={user} onNavigate={setCurrentView} />; break;
      case View.FREIGHT_PAYMENTS: component = <FreightPaymentPage />; break;
      case View.INVENTORY: component = <InventoryPage />; break;
      case View.POLICIES: component = <PoliciesPage onBack={() => {
        setCurrentView(View.DASHBOARD);
        window.history.pushState({}, '', '/');
      }} />; break;

      // Casos para las nuevas vistas (aquí se cargarán los componentes cuando los creemos)
      // Vista principal de Inspección de Calidad con el nuevo formulario
      case View.INSPECTION_QUALITY:
        component = <QualityForm onSuccess={() => setCurrentView(View.DASHBOARD)} />;
        break;

      // Resto de submódulos en desarrollo
      case View.INSPECTION_DASHBOARD:
      case View.INSPECTION_INCIDENTS:
        component = (
          <div className="p-8 text-center bg-white rounded-3xl border border-border shadow-sm">
            <h2 className="text-xl font-black text-primary uppercase">Módulo Inspecciones de Campo</h2>
            <p className="text-sm text-text-secondary mt-2">Vista activa: <b>{currentView}</b></p>
          </div>
        );
        break;

      default: component = <Dashboard onViewChange={setCurrentView} userRole={user.role} />;
    }
  }

  return (
    <Suspense fallback={<TableSkeleton />}>
      {component}
    </Suspense>
  );
};

  const getTitle = () => {
    switch (currentView) {
      case View.DASHBOARD: return 'Panel de Control';
      case View.DATABASE: return 'Base de Datos';
      case View.USA_SHIPMENTS: return 'Reporte USA';
      case View.LIDER_PROGRAMACION_USA: return 'Programación Líder';
      case View.FRUIT_QUALITY: return 'Calidad IA';
      case View.STRATEGIC_PLANNING: return 'Alcance y Metas';
      case View.EXEC_REPORT: return 'Matriz Cumplimiento';
      case View.TIVE_MAP: return 'Consola Mapas';
      case View.SETTINGS: return 'Configuraciones';
      case View.FREIGHT_PAYMENTS: return 'Pago de Fletes';
      case View.INVENTORY: return 'Gestión de Inventarios';
      case View.POLICIES: return 'Políticas y Privacidad';
      case View.INSPECTION_QUALITY: return 'Inspección de Calidad';
      case View.INSPECTION_DASHBOARD: return 'Dashboard de Inspecciones';
      case View.INSPECTION_INCIDENTS: return 'Reporte de Incidencias';
      default: return 'nglobal Logistics';
    }
  }

  if (!authVerified) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FAF9F6]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
          </div>
        </div>
        <p className="mt-6 text-[10px] font-black text-primary uppercase tracking-[0.3em] animate-pulse">Verificando Credenciales</p>
      </div>
    );
  }

  if (!authUser) {
    if (currentView === View.POLICIES || window.location.pathname === '/politicas') {
      return (
        <Suspense fallback={<TableSkeleton />}>
          <PoliciesPage isExternal onBack={() => {
            window.history.pushState({}, '', '/');
            window.location.reload(); // Force reload to show login
          }} />
        </Suspense>
      );
    }
    return (
      <NotificationProvider>
        <Login 
          onLogin={() => {}} 
          onShowPolicies={() => {
            setCurrentView(View.POLICIES);
            window.history.pushState({}, '', '/politicas');
          }}
        />
        <NotificationsContainer />
      </NotificationProvider>
    );
  }

  // MI DIOS: Portal de acceso unificado por áreas
  if (!user) {
    return (
        <NotificationProvider>
          <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
            <div className="max-w-xl w-full bg-white rounded-[2rem] border border-border shadow-xl p-8 text-center">
              <h2 className="text-2xl font-black text-primary uppercase tracking-tight">Rol no configurado</h2>
              <p className="mt-4 text-sm text-text-secondary font-medium">
                Solicita a administración que asigne un rol a tu cuenta.
              </p>
              <button
                onClick={() => supabase.auth.signOut()}
                className="mt-6 px-6 py-3 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
          <NotificationsContainer />
        </NotificationProvider>
    );
  }

  if (user.role === UserRole.ADMINISTRADOR && mfaVerifiedToken !== session?.access_token) {
    return <AdminMfa />;
  }

  return (
    <NotificationProvider>
      <TiveMonitoringProvider>
        <div className="flex h-screen bg-background text-text-primary overflow-hidden">
          {isSidebarOpen && (
            <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />
          )}

          {isChatOpen && (
            <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setIsChatOpen(false)} />
          )}

          <div className={`fixed inset-y-0 left-0 z-30 bg-primary text-white transform transition-all duration-300 ease-in-out md:relative overflow-hidden ${isSidebarOpen ? 'w-64 translate-x-0 opacity-100 pointer-events-auto' : 'w-0 -translate-x-full md:translate-x-0 opacity-0 pointer-events-none'}`}>
            <div className="w-64 h-full">
              <Sidebar
                currentView={currentView}
                user={user}
                onNavigate={(view) => { setCurrentView(view); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                onLogout={handleLogout}
                showInstallButton={!!deferredPrompt}
                onInstall={handleInstallClick}
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <Header onMenuClick={toggleSidebar} onChatClick={toggleChat} title={getTitle()} />
            <div className="flex-1 flex overflow-hidden">
              <main className="flex-1 overflow-auto p-4 md:p-6 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6 relative bg-background">
                <div className="max-w-full mx-auto h-full">
                  {renderContent()}
                </div>
              </main>

              {/* Right Chat Sidebar */}
              <div className={`fixed inset-y-0 right-0 z-30 bg-white shadow-2xl transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 ${isChatOpen ? 'w-full sm:w-80 translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0 pointer-events-none'}`}>
                <div className="w-full sm:w-80 h-full">
                  {user && <ChatMessenger user={user} onClose={() => setIsChatOpen(false)} />}
                </div>
              </div>
            </div>
            <NotificationsContainer />
          </div>
        </div>
      </TiveMonitoringProvider>
    </NotificationProvider>
  );
};

export default App;
