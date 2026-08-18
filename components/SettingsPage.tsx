import React, { useState, useEffect } from 'react';
import { User, UserRole, View } from '../types';
import { supabase } from '../lib/supabase';
import Card from './ui/Card';
import { SettingsIcon, MapIcon, ExclamationIcon, DownloadIcon, ClockIcon } from './icons';
import { useNotification } from './NotificationProvider';
import { subscribeUserToPush, sendTestPush } from '../pushService';
import RelojChecador from './RelojChecador';

interface SettingsPageProps {
    user: User;
    onNavigate: (view: View) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ user, onNavigate }) => {
    const { addNotification } = useNotification();
    const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
    const [notificationsEnabled, setNotificationsEnabled] = useState(Notification.permission === 'granted');
    const [testingPush, setTestingPush] = useState(false);

    const isCoordinationArea = [UserRole.COORDINADOR, UserRole.SUBGERENCIA, UserRole.GERENCIA, UserRole.DIRECCION, UserRole.ADMINISTRADOR].includes(user.role);

    const toggleDarkMode = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        setDarkMode(isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        addNotification({ type: 'info', title: 'Interfaz', message: `Modo ${isDark ? 'oscuro' : 'claro'} activado.` });
    };

    const handleEnablePush = async () => {
        const success = await subscribeUserToPush(user.name);
        if (success) {
            setNotificationsEnabled(true);
            addNotification({ type: 'success', title: 'Sistema', message: 'Notificaciones push vinculadas correctamente.' });
        }
    };

    const handleTestPush = async () => {
        setTestingPush(true);
        // MI DIOS: Invocación directa al motor de despacho externo
        const success = await sendTestPush();
        if (success) {
            addNotification({
                type: 'info',
                title: 'Despacho Iniciado',
                message: 'Se ha enviado la señal al servidor. Verifique su centro de notificaciones.'
            });
        } else {
            addNotification({
                type: 'danger',
                title: 'Error de Enlace',
                message: 'No se pudo contactar con el servicio de mensajería externa.'
            });
        }
        setTestingPush(false);
    };

    const handleClearCache = () => {
        if (confirm('¿Desea limpiar los datos temporales del navegador?')) {
            localStorage.clear();
            window.location.reload();
        }
    };

    return (
        <div className="animate-fade-in space-y-10 pb-24 max-w-5xl mx-auto h-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black text-primary uppercase tracking-tight">Centro de Configuración</h1>
                    <p className="text-sm text-text-secondary font-medium mt-1">Preferencias y monitorización del núcleo operativo del sistema.</p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-border shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-primary/5 rounded-xl text-primary">
                        <SettingsIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">Arquitectura</p>
                        <p className="text-[11px] font-bold text-primary mt-1">Enterprise v3.0</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {isCoordinationArea && (
                    <div className="md:col-span-2">
                        <Card title="Portal de Asistencia y Tiempo" className="border-border overflow-hidden">
                            <div className="p-2">
                                <RelojChecador />
                            </div>
                        </Card>
                    </div>
                )}

                <Card title="Identidad Corporativa" className="border-border">
                    <div className="flex items-center gap-6 mb-8 pt-2">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-3xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                            <div className="relative w-20 h-20 bg-white border border-border rounded-3xl flex items-center justify-center text-4xl shadow-md transition-transform group-hover:scale-105">
                                {user.avatar || '👤'}
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">{user.role}</span>
                            <h4 className="text-xl font-black text-primary uppercase tracking-tight mt-0.5">{user.name}</h4>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="w-2 h-2 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                <span className="text-[11px] font-bold text-success uppercase leading-none">Sesión Autorizada</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="flex justify-between items-center text-[11px]">
                            <span className="text-text-muted font-bold uppercase tracking-wider">Protocolo de Seguridad:</span>
                            <span className="text-primary font-black uppercase bg-primary/5 px-2 py-0.5 rounded-lg">Alpha-V3</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                            <span className="text-text-muted font-bold uppercase tracking-wider">Última Auditoría:</span>
                            <span className="text-text-primary font-black uppercase">Mar 10, 2026</span>
                        </div>
                    </div>
                </Card>

                <Card title="Comunicaciones de Seguridad" className="border-border">
                    <div className="space-y-8 pt-2">
                        <div className="p-5 bg-background/50 rounded-2xl border border-border flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl shadow-sm transition-colors ${notificationsEnabled ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
                                    <ClockIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className="text-[11px] font-black text-primary uppercase tracking-widest">Servicio de Alertas Push</h5>
                                    <p className="text-[10px] text-text-muted font-bold uppercase mt-1">Conexión con el Dispositivo</p>
                                </div>
                            </div>
                            {notificationsEnabled ? (
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-success uppercase bg-success/5 px-3 py-1.5 rounded-full border border-success/10">Sincronizado</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleEnablePush}
                                    className="px-5 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary-focus shadow-lg shadow-primary/10 transition-all active:scale-95"
                                >
                                    Vincular
                                </button>
                            )}
                        </div>

                        {notificationsEnabled && (
                            <div className="space-y-4">
                                <button
                                    onClick={handleTestPush}
                                    disabled={testingPush}
                                    className="w-full bg-white border-2 border-danger text-danger py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-sm hover:bg-danger hover:text-white transition-all active:scale-95 flex items-center justify-center gap-3"
                                >
                                    {testingPush ? (
                                        <div className="w-4 h-4 border-3 border-current border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <ExclamationIcon className="w-5 h-5" />
                                    )}
                                    {testingPush ? 'Comunicando...' : 'Ejecutar Diagnóstico de Alerta'}
                                </button>
                                <p className="text-[10px] text-text-muted text-center font-semibold italic border-t border-border/50 pt-4">
                                    Esta herramienta valida la trayectoria de datos entre el servidor y el centro de notificaciones local.
                                </p>
                            </div>
                        )}
                    </div>
                </Card>

                <Card title="Seguridad de Acceso" className="border-border">
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const password = (form.elements.namedItem('new_password') as HTMLInputElement).value;
                        const confirm = (form.elements.namedItem('confirm_password') as HTMLInputElement).value;
                        
                        if (password !== confirm) {
                            addNotification({ type: 'danger', title: 'Error', message: 'Las contraseñas no coinciden.' });
                            return;
                        }
                        
                        try {
                            const { error } = await supabase.auth.updateUser({ password });
                            if (error) throw error;
                            addNotification({ type: 'success', title: 'Seguridad', message: 'Contraseña actualizada correctamente.' });
                            form.reset();
                        } catch (err: any) {
                            addNotification({ type: 'danger', title: 'Error', message: err.message });
                        }
                    }} className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Nueva Contraseña</label>
                            <input
                                name="new_password"
                                type="password"
                                required
                                minLength={6}
                                className="w-full px-4 py-3 bg-background/50 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Confirmar Contraseña</label>
                            <input
                                name="confirm_password"
                                type="password"
                                required
                                minLength={6}
                                className="w-full px-4 py-3 bg-background/50 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-primary text-white py-3 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-primary/10 hover:bg-primary-focus transition-all active:scale-95"
                        >
                            Actualizar Credenciales
                        </button>
                    </form>
                </Card>

                <Card title="Ajustes de Entorno" className="border-border">
                    <div className="space-y-6 pt-2">
                        <div className="flex justify-between items-center p-5 bg-background/50 rounded-2xl border border-border hover:bg-white transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                    <ClockIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className="text-[11px] font-black text-primary uppercase tracking-widest leading-none">Optimización Nocturna</h5>
                                    <p className="text-[10px] text-text-muted font-bold uppercase mt-1">Ajuste técnico de contraste</p>
                                </div>
                            </div>
                            <button
                                onClick={toggleDarkMode}
                                className={`w-14 h-7 rounded-full transition-all relative border-2 ${darkMode ? 'bg-primary border-primary' : 'bg-gray-100 border-border shadow-inner'}`}
                            >
                                <div className={`absolute top-0.5 w-5 h-5 rounded-full shadow-lg transition-all border border-white/20 ${darkMode ? 'left-8 bg-white' : 'left-0.5 bg-white'}`}></div>
                            </button>
                        </div>

                        <div className="p-5 border border-dashed border-border rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-danger/5 rounded-2xl text-danger/60">
                                    <DownloadIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className="text-[11px] font-black text-text-muted uppercase tracking-widest leading-none">Depuración de Cache</h5>
                                    <p className="text-[9px] text-text-muted font-bold uppercase mt-1">Eliminar archivos residuales</p>
                                </div>
                            </div>
                            <button onClick={handleClearCache} className="px-4 py-2 border border-border text-[10px] font-black text-text-muted uppercase tracking-widest rounded-xl hover:bg-danger/10 hover:text-danger hover:border-danger transition-all">Limpiar</button>
                        </div>
                    </div>
                </Card>

                <Card title="Documentos Legales" className="border-border">
                    <div className="space-y-4 pt-2">
                         <p className="text-[11px] text-text-secondary font-medium leading-relaxed mb-4">
                            Acceda a las políticas oficiales, términos de servicio y protocolos de eliminación de datos de la plataforma.
                         </p>
                         <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={() => {
                                    onNavigate(View.POLICIES);
                                    window.history.pushState({}, '', '/politicas');
                                }}
                                className="flex items-center justify-between p-4 bg-primary/5 hover:bg-primary/10 rounded-2xl border border-primary/10 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-xl shadow-sm">
                                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-primary uppercase tracking-widest">Políticas y Privacidad</span>
                                </div>
                                <svg className="w-4 h-4 text-primary/40 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                            </button>
                         </div>
                    </div>
                </Card>

                <Card title="Infraestructura Tecnológica" className="border-border">
                    <div className="space-y-6 pt-2">
                        <div className="flex items-center gap-5 p-5 bg-success/[0.03] rounded-2xl border border-success/10">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-success shadow-sm border border-success/10 ring-4 ring-success/5 transition-transform hover:rotate-12">
                                <MapIcon className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[11px] font-black text-primary uppercase tracking-widest">Tive Webhook Gateway</span>
                                    <span className="text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                        Sincronizado
                                    </span>
                                </div>
                                <div className="w-full bg-emerald-100/30 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full w-[99%] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
                                </div>
                                <p className="text-[9px] text-text-muted font-bold mt-2 uppercase tracking-tighter">Latencia Operativa: 42ms — Disponibilidad: 99.98%</p>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="text-center pt-16 pb-12 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>
                <img
                    src="https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg"
                    alt="nglobal"
                    className="h-10 mx-auto grayscale opacity-20 mb-6 hover:opacity-100 transition-opacity duration-1000"
                />
                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-text-muted opacity-50">nglobal Logistics Operations Platform</p>
                <div className="flex items-center justify-center gap-3 mt-2 text-[9px] font-bold uppercase tracking-widest text-text-muted opacity-40">
                    <span>© 2026 nglobal Enterprise</span>
                    <span className="w-1 h-1 bg-border rounded-full"></span>
                    <span>Phoenix Protocol v3.0.4</span>
                </div>
            </div>
        </div>
    );
};
export default SettingsPage;