import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BaseDeDatosPage from './components/BaseDeDatosPage';
import UsaShipmentReportPage from './components/UsaShipmentReportPage';
import LiderProgramacionUsaPage from './components/LiderProgramacionUsaPage';
import TiveMapPage from './components/TiveMapPage';
import SettingsPage from './components/SettingsPage';
import StrategicPlanningPage from './components/StrategicPlanningPage';
import FreightPaymentPage from './components/FreightPaymentPage';
import InventoryPage from './components/InventoryPage';
import FruitQualityChecker from './components/FruitQualityChecker';
import PoliciesPage from './components/PoliciesPage';
import RelojChecador from './components/RelojChecador';
import NotificationHistoryPanel from './components/NotificationHistoryPanel';
import AIAssistant from './components/AIAssistant';
import TiveMonitoringProvider from './components/TiveMonitoringProvider';
import NotificationProvider from './components/NotificationProvider';
import { View, User, UserRole } from './types';
import SubdireccionView from './roles/Subdireccion/SubdireccionView';
import DireccionView from './roles/DireccionGeneral/DireccionView';
import CoordinadorView from './roles/CoordinadorLogistico/CoordinadorView';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<View>(View.DASHBOARD);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const loggedInUser = localStorage.getItem('user');
    if (loggedInUser) {
      setUser(JSON.parse(loggedInUser));
    }
    
    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    });
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    
    if (loggedInUser.role === UserRole.INSPECTOR) {
      setActiveView(View.INSPECTION_QUALITY);
    } else if (loggedInUser.role === UserRole.LIDER_PROYECTO) {
      setActiveView(View.STRATEGIC_PLANNING);
    } else {
      setActiveView(View.DASHBOARD);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setActiveView(View.DASHBOARD);
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the A2HS prompt');
          setShowInstallButton(false);
        }
        setDeferredPrompt(null);
      });
    }
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // ENRUTADOR CENTRAL DE VISTAS (Aquí habilitamos las pantallas)
  const renderView = () => {
    if (activeView === View.DASHBOARD) {
        if (user.role === UserRole.DIRECCION) return <DireccionView user={user} />;
        if (user.role === UserRole.SUBDIRECCION) return <SubdireccionView user={user} />;
        if (user.role === UserRole.COORDINADOR) return <CoordinadorView user={user} />;
        return <Dashboard user={user} />;
    }
    
    switch (activeView) {
      case View.DATABASE:
        return <BaseDeDatosPage user={user} />;
      case View.USA_SHIPMENTS:
        return <UsaShipmentReportPage user={user} />;
      case View.LIDER_PROGRAMACION_USA:
        return <LiderProgramacionUsaPage user={user} />;
      case View.TIVE_MAP:
        return <TiveMapPage user={user} />;
      case View.SETTINGS:
        return <SettingsPage />;
      case View.STRATEGIC_PLANNING:
        return <StrategicPlanningPage user={user} />;
      case View.EXEC_REPORT:
        return <Dashboard user={user} />;
      case View.FREIGHT_PAYMENTS:
        return <FreightPaymentPage user={user} />;
      case View.INVENTORY:
        return <InventoryPage user={user} />;
      case View.FRUIT_QUALITY:
        return <FruitQualityChecker />;
      case View.POLICIES:
        return <PoliciesPage />;
      default:
        // Evita pantalla en blanco si intentan navegar a un lugar no permitido
        return <Dashboard user={user} />;
    }
  };

  return (
    <NotificationProvider>
      <TiveMonitoringProvider>
        <div className="flex h-screen bg-background overflow-hidden relative">
          <div className="w-[300px] shrink-0 h-full z-20 shadow-2xl relative">
            <Sidebar 
              currentView={activeView} 
              onNavigate={setActiveView} 
              user={user} 
              onLogout={handleLogout}
              showInstallButton={showInstallButton}
              onInstall={handleInstallClick}
            />
          </div>
          <div className="flex-1 flex flex-col h-full w-[calc(100%-300px)] relative overflow-hidden">
            <Header user={user} />
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background/50 relative z-10 h-[calc(100vh-80px)] custom-scrollbar">
              <div className="h-full">
                {renderView()}
              </div>
            </main>
          </div>

          <NotificationHistoryPanel />
          <RelojChecador user={user} />
          <AIAssistant />
        </div>
      </TiveMonitoringProvider>
    </NotificationProvider>
  );
};

export default App;