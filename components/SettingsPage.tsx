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

// Interfaz para la nueva tabla
interface AlertRecipient {
    id?: number;
    nombre: string;
    telefono: string;
    activo: boolean;
    hora_inicio: number | string;
    hora_fin: number | string;
    dias_activos: string;
}

const DIAS_SEMANA = [
    { label: 'D', val: '0' }, { label: 'L', val: '1' }, { label: 'M', val: '2' },
    { label: 'M', val: '3' }, { label: 'J', val: '4' }, { label: 'V', val: '5' }, { label: 'S', val: '6' }
];

const SettingsPage: React.FC<SettingsPageProps> = ({ user, onNavigate }) => {
    const { addNotification } = useNotification();
    const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
    const [notificationsEnabled, setNotificationsEnabled] = useState(Notification.permission === 'granted');
    const [testingPush, setTestingPush] = useState(false);

    // --- LÓGICA NUEVA DE ALERTAS TIVE / WHATSAPP ---
    const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
    const [deletedIds, setDeletedIds] = useState<number[]>([]);
    const [savingPhones, setSavingPhones] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            const { data, error } = await supabase.from('alert_recipients').select('*').order('id', { ascending: true });
            if (data) {
                setRecipients(data.map(r => ({
                    ...r,
                    hora_inicio: r.hora_inicio ?? '',
                    hora_fin: r.hora_fin ?? ''
                })));
            }
        };
        fetchSettings();
    }, []);

    const addRecipient = () => {
        setRecipients([...recipients, { nombre: '', telefono: '', activo: true, hora_inicio: '', hora_fin: '', dias_activos: '1,2,3,4,5' }]);
    };

    const updateRecipient = (index: number, field: keyof AlertRecipient, value: any) => {
        const newRecipients = [...recipients];
        newRecipients[index] = { ...newRecipients[index], [field]: value };
        setRecipients(newRecipients);
    };

    const toggleDay = (index: number, val: string) => {
        const current = recipients[index].dias_activos ? recipients[index].dias_activos.split(',') : [];
        const newDays = current.includes(val) ? current.filter(d => d !== val) : [...current, val];
        updateRecipient(index, 'dias_activos', newDays.join(','));
    };

    const removeRecipient = (index: number) => {
        const rec = recipients[index];
        if (rec.id) setDeletedIds([...deletedIds, rec.id]);
        setRecipients(recipients.filter((_, i) => i !== index));
    };

    const handleSavePhones = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingPhones(true);

        try {
            // Eliminar los borrados
            if (deletedIds.length > 0) {
                await supabase.from('alert_recipients').delete().in('id', deletedIds);
            }

            // Upsert (Crear nuevos o actualizar existentes)
            const toUpsert = recipients.map(r => ({
                id: r.id,
                nombre: r.nombre,
                telefono: r.telefono,
                activo: r.activo,
                hora_inicio: r.hora_inicio === '' ? null : parseInt(r.hora_inicio as string),
                hora_fin: r.hora_fin === '' ? null : parseInt(r.hora_fin as string),
                dias_activos: r.dias_activos
            }));

            if (toUpsert.length > 0) {
                const { error } = await supabase.from('alert_recipients').upsert(toUpsert);
                if (error) throw error;
            }

            setDeletedIds([]);
            addNotification({ type: 'success', title: 'Actualizado', message: 'Configuración de turnos guardada exitosamente.' });
            
            // Recargar datos para obtener IDs nuevos
            const { data } = await supabase.from('alert_recipients').select('*').order('id', { ascending: true });
            if (data) setRecipients(data.map(r => ({ ...r, hora_inicio: r.hora_inicio ?? '', hora_fin: r.hora_fin ?? '' })));

        } catch (err: any) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudieron guardar los cambios.' });
        } finally {
            setSavingPhones(false);
        }
    };
    // -----------------------------------------

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
        const success = await sendTestPush();
        if (success) {
            addNotification({ type: 'info', title: 'Despacho Iniciado', message: 'Se ha enviado la señal al servidor.' });
        } else {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo contactar con el servicio.' });
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
                                <button onClick={handleEnablePush} className="px-5 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary-focus shadow-lg shadow-primary/10 transition-all active:scale-95">
                                    Vincular
                                </button>
                            )}
                        </div>

                        {notificationsEnabled && (
                            <div className="space-y-4">
                                <button onClick={handleTestPush} disabled={testingPush} className="w-full bg-white border-2 border-danger text-danger py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-sm hover:bg-danger hover:text-white transition-all flex items-center justify-center gap-3">
                                    {testingPush ? <div className="w-4 h-4 border-3 border-current border-t-transparent rounded-full animate-spin"></div> : <ExclamationIcon className="w-5 h-5" />}
                                    {testingPush ? 'Comunicando...' : 'Ejecutar Diagnóstico de Alerta'}
                                </button>
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
                        if (password !== confirm) return addNotification({ type: 'danger', title: 'Error', message: 'Las contraseñas no coinciden.' });
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
                            <input name="new_password" type="password" required minLength={6} className="w-full px-4 py-3 bg-background/50 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none" placeholder="••••••••" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Confirmar Contraseña</label>
                            <input name="confirm_password" type="password" required minLength={6} className="w-full px-4 py-3 bg-background/50 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none" placeholder="••••••••" />
                        </div>
                        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-primary-focus transition-all active:scale-95">Actualizar Credenciales</button>
                    </form>
                </Card>

                <Card title="Ajustes de Entorno" className="border-border">
                    <div className="space-y-6 pt-2">
                        <div className="flex justify-between items-center p-5 bg-background/50 rounded-2xl border border-border hover:bg-white transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-2xl text-primary"><ClockIcon className="w-5 h-5" /></div>
                                <div>
                                    <h5 className="text-[11px] font-black text-primary uppercase tracking-widest leading-none">Optimización Nocturna</h5>
                                    <p className="text-[10px] text-text-muted font-bold uppercase mt-1">Ajuste técnico de contraste</p>
                                </div>
                            </div>
                            <button onClick={toggleDarkMode} className={`w-14 h-7 rounded-full transition-all relative border-2 ${darkMode ? 'bg-primary border-primary' : 'bg-gray-100 border-border shadow-inner'}`}>
                                <div className={`absolute top-0.5 w-5 h-5 rounded-full shadow-lg transition-all border border-white/20 ${darkMode ? 'left-8 bg-white' : 'left-0.5 bg-white'}`}></div>
                            </button>
                        </div>
                        <div className="p-5 border border-dashed border-border rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-danger/5 rounded-2xl text-danger/60"><DownloadIcon className="w-5 h-5" /></div>
                                <div>
                                    <h5 className="text-[11px] font-black text-text-muted uppercase tracking-widest leading-none">Depuración de Cache</h5>
                                </div>
                            </div>
                            <button onClick={handleClearCache} className="px-4 py-2 border border-border text-[10px] font-black text-text-muted uppercase tracking-widest rounded-xl hover:bg-danger/10 hover:text-danger hover:border-danger transition-all">Limpiar</button>
                        </div>
                    </div>
                </Card>

                <div className="md:col-span-2">
                    <Card title="Alertas de WhatsApp (Personal y Turnos)" className="border-border">
                        <form onSubmit={handleSavePhones} className="space-y-4 pt-2">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-[11px] text-text-secondary font-medium leading-relaxed">
                                    Configure el personal que recibirá alertas de desvíos o temperatura, así como sus días y horarios laborales.
                                </p>
                                <button type="button" onClick={addRecipient} className="px-4 py-2 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/20 transition-all">
                                    + Añadir Persona
                                </button>
                            </div>

                            <div className="space-y-4">
                                {recipients.map((rec, idx) => (
                                    <div key={idx} className="p-4 bg-background/50 border border-border rounded-2xl flex flex-col lg:flex-row items-start lg:items-center gap-4 transition-all">
                                        {/* Activo Toggle */}
                                        <div className="flex-shrink-0 flex flex-col items-center gap-1">
                                            <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Estado</span>
                                            <button type="button" onClick={() => updateRecipient(idx, 'activo', !rec.activo)} className={`w-10 h-5 rounded-full transition-all relative border-2 ${rec.activo ? 'bg-success border-success' : 'bg-gray-300 border-gray-300'}`}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${rec.activo ? 'left-5' : 'left-0.5'}`}></div>
                                            </button>
                                        </div>

                                        {/* Datos Personales */}
                                        <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                                            <div>
                                                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1 block">Nombre</label>
                                                <input type="text" required value={rec.nombre} onChange={(e) => updateRecipient(idx, 'nombre', e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Ej: Juan Pérez" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1 block">WhatsApp (Con país)</label>
                                                <input type="text" required value={rec.telefono} onChange={(e) => updateRecipient(idx, 'telefono', e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Ej: 528115775781" />
                                            </div>
                                        </div>

                                        {/* Configuración de Días */}
                                        <div className="flex-shrink-0">
                                            <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1 block">Días Laborales</label>
                                            <div className="flex gap-1">
                                                {DIAS_SEMANA.map((dia) => {
                                                    const isActive = (rec.dias_activos || '').split(',').includes(dia.val);
                                                    return (
                                                        <button key={dia.val} type="button" onClick={() => toggleDay(idx, dia.val)} className={`w-6 h-6 rounded-md text-[9px] font-black transition-colors ${isActive ? 'bg-primary text-white shadow-md' : 'bg-white border border-border text-text-muted hover:bg-gray-50'}`}>
                                                            {dia.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Configuración de Horario */}
                                        <div className="flex-shrink-0 flex items-center gap-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1 block">Inicio</label>
                                                <select value={rec.hora_inicio} onChange={(e) => updateRecipient(idx, 'hora_inicio', e.target.value)} className="px-2 py-1.5 bg-white border border-border rounded-lg text-xs font-bold outline-none cursor-pointer">
                                                    <option value="">24 hrs</option>
                                                    {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
                                                </select>
                                            </div>
                                            <span className="text-border font-bold mt-4">-</span>
                                            <div>
                                                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1 block">Fin</label>
                                                <select value={rec.hora_fin} onChange={(e) => updateRecipient(idx, 'hora_fin', e.target.value)} className="px-2 py-1.5 bg-white border border-border rounded-lg text-xs font-bold outline-none cursor-pointer">
                                                    <option value="">24 hrs</option>
                                                    {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Botón Eliminar */}
                                        <div className="flex-shrink-0 pt-4 lg:pt-0">
                                            <button type="button" onClick={() => removeRecipient(idx)} className="p-2 bg-danger/10 text-danger hover:bg-danger hover:text-white rounded-lg transition-colors">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                
                                {recipients.length === 0 && (
                                    <div className="text-center p-8 bg-background/30 border border-dashed border-border rounded-2xl">
                                        <p className="text-sm font-bold text-text-muted">No hay destinatarios configurados.</p>
                                    </div>
                                )}
                            </div>

                            <button type="submit" disabled={savingPhones} className="w-full bg-primary text-white py-3 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-primary/10 hover:bg-primary-focus transition-all mt-6 disabled:opacity-50">
                                {savingPhones ? 'Sincronizando Base de Datos...' : 'Guardar Configuración de Turnos'}
                            </button>
                        </form>
                    </Card>
                </div>
            </div>
            {/* Footer mantenido idéntico */}
            <div className="text-center pt-16 pb-12 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>
                <img src="https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg" alt="nglobal" className="h-10 mx-auto grayscale opacity-20 mb-6 hover:opacity-100 transition-opacity duration-1000" />
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