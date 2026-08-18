import React, { useState, useEffect, Suspense, lazy } from 'react';
import { View, User, UserRole } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { NotificationProvider } from './components/NotificationProvider';
import { TiveMonitoringProvider } from './components/TiveMonitoringProvider';
import NotificationsContainer from './components/NotificationsContainer';
import Login from './components/Login';
import Portal from './components/Portal';
import ChatMessenger from './components/ChatMessenger';
import { subscribeUserToPush } from './pushService';
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

const INSECURE_ROLE_PICKER_ENABLED = import.meta.env.VITE_ENABLE_INSECURE_ROLE_PICKER === 'true';

const ROLE_MAP: Record<string, UserRole> = Object.values(UserRole).reduce((acc, role) => {
  acc[role] = role;
  return acc;
}, {} as Record<string, UserRole>);

const getRoleFromAuthUser = (authUser: any): UserRole | null => {
  const rawRole = authUser?.app_metadata?.role || authUser?.user_metadata?.role;
  if (typeof rawRole !== 'string') return null;
  const normalizedRole = rawRole.trim().toUpperCase();
  return ROLE_MAP[normalizedRole] ?? null;
};

const getStoredAuthProfile = (): User | null => {
  try {
    const saved = localStorage.getItem('ng_auth_profile');
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed.name !== 'string' || typeof parsed.role !== 'string') return null;

    const normalizedRole = parsed.role.trim().toUpperCase();
    const role = ROLE_MAP[normalizedRole];
    if (!role) return null;

    return {
      name: parsed.name,
      role,
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : undefined,
    };
  } catch {
    return null;
  }
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
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthUser(session?.user || null);
      if (!session?.user) {
        setUser(null);
        localStorage.removeItem('ng_selected_role');
        localStorage.removeItem('ng_auth_profile');
      }
    });

    // Si el usuario es INSPECTOR y su vista actual no es de inspecciones, redirigir a Inspección Calidad 
    useEffect(() => {
    if (user?.role === UserRole.INSPECTOR) {
      if (![View.INSPECTION_QUALITY, View.INSPECTION_DASHBOARD, View.INSPECTION_INCIDENTS].includes(currentView)) {
        setCurrentView(View.INSPECTION_QUALITY);
      }
    }
  }, [user, currentView]);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user || null);
      if (!session?.user) {
        setUser(null);
        localStorage.removeItem('ng_selected_role');
        localStorage.removeItem('ng_auth_profile');
      }
      setAuthVerified(true);
    });

    // Detect /politicas route
    if (window.location.pathname === '/politicas') {
      setCurrentView(View.POLICIES);
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.documentElement.classList.add('dark');

    return () => subscription.unsubscribe();
  }, []);

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
    if (!authUser) return;

    const secureUser = buildUserFromAuth(authUser);
    if (secureUser) {
      setUser(secureUser);
      localStorage.setItem('ng_auth_profile', JSON.stringify(secureUser));
      localStorage.removeItem('ng_selected_role');
      return;
    }

    const storedProfile = getStoredAuthProfile();
    if (storedProfile) {
      setUser(storedProfile);
      return;
    }

    if (INSECURE_ROLE_PICKER_ENABLED) {
      try {
        const saved = localStorage.getItem('ng_selected_role');
        const legacyUser = saved ? JSON.parse(saved) : null;
        setUser(legacyUser);
        if (legacyUser) {
          localStorage.setItem('ng_auth_profile', JSON.stringify(legacyUser));
        }
      } catch {
        setUser(null);
      }
      return;
    }

    setUser(null);
    localStorage.removeItem('ng_selected_role');
    localStorage.removeItem('ng_auth_profile');
  }, [authUser]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };


  const handleLogout = async () => {
    setUser(null);
    localStorage.removeItem('ng_selected_role');
    localStorage.removeItem('ng_auth_profile');
  };

  const handleRoleSelection = (u: User) => {
    if (!INSECURE_ROLE_PICKER_ENABLED) return;
    setUser(u);
    localStorage.setItem('ng_selected_role', JSON.stringify(u));
    localStorage.setItem('ng_auth_profile', JSON.stringify(u));
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleChat = () => setIsChatOpen(!isChatOpen);

  const renderContent = () => {
  if (!user) return null;

  // 1. Matriz estricta de permisos
  const canAccess = (view: View) => {
    // Las 3 vistas de Inspección SOLO pueden ser vistas por ADMINISTRADOR e INSPECTOR
    if ([View.INSPECTION_QUALITY, View.INSPECTION_DASHBOARD, View.INSPECTION_INCIDENTS].includes(view)) {
      return [UserRole.ADMINISTRADOR, UserRole.INSPECTOR].includes(user.role);
    }

    // El rol INSPECTOR NO puede ver ninguna otra vista del sistema
    if (user.role === UserRole.INSPECTOR) {
      return false;
    }

    // Permisos existentes para los demás roles
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

  let component;
  
  // 2. Redirección de respaldo si no tiene acceso a la vista solicitada
  if (!canAccess(currentView)) {
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
      component = <Dashboard onViewChange={setCurrentView} />;
    }
  } else {
    // 3. Renderizado de la vista solicitada
    switch (currentView) {
      case View.DASHBOARD: component = <Dashboard onViewChange={setCurrentView} />; break;
      case View.DATABASE: component = <BaseDeDatosPage user={user} />; break;
      case View.USA_SHIPMENTS: component = <UsaShipmentReportPage initialView="active" user={user} />; break;
      case View.LIDER_PROGRAMACION_USA: component = <LiderProgramacionUsaPage user={user} />; break;
      case View.FRUIT_QUALITY: component = <FruitQualityChecker />; break;
      case View.STRATEGIC_PLANNING: component = <StrategicPlanningPage user={user} />; break;
      case View.EXEC_REPORT: component = <ClientReportDashboard />; break;
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

      default: component = <Dashboard onViewChange={setCurrentView} />;
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
    if (!INSECURE_ROLE_PICKER_ENABLED) {
      return (
        <NotificationProvider>
          <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
            <div className="max-w-xl w-full bg-white rounded-[2rem] border border-border shadow-xl p-8 text-center">
              <h2 className="text-2xl font-black text-primary uppercase tracking-tight">Rol no configurado</h2>
              <p className="mt-4 text-sm text-text-secondary font-medium">
                La cuenta autenticada no tiene un rol válido en `app_metadata.role` o `user_metadata.role`.
              </p>
              <p className="mt-2 text-xs text-text-muted font-bold uppercase tracking-widest">
                El selector manual de roles fue deshabilitado por seguridad.
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

    return (
      <NotificationProvider>
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
           <button 
             onClick={() => supabase.auth.signOut()} 
             className="text-[10px] font-black uppercase tracking-widest bg-white/80 backdrop-blur text-danger px-4 py-3 border border-danger/20 rounded-xl shadow-lg hover:bg-danger hover:text-white transition-all flex items-center gap-2"
           >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Cerrar Sesión
           </button>
        </div>
        <Portal onLogin={handleRoleSelection} />
        <NotificationsContainer />
      </NotificationProvider>
    );
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
