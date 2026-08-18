import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ResponsableDB } from '../types';
import { toCamelCase } from '../utils/formatters';
import { ClockIcon, UserIcon, PhoneIcon, MailIcon } from './icons';

const RelojChecador: React.FC = () => {
    const [responsables, setResponsables] = useState<ResponsableDB[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const fetchResponsables = async () => {
            const { data, error } = await supabase.from('usa_responsables').select('*');
            if (data) {
                setResponsables(toCamelCase(data) as ResponsableDB[]);
            }
            setLoading(false);
        };

        fetchResponsables();
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const isCurrentlyOnDuty = (horario?: string) => {
        if (!horario) return false;
        try {
            // Formato esperado: "HH:mm - HH:mm"
            const [start, end] = horario.split('-').map(s => s.trim());
            const now = currentTime.getHours() * 60 + currentTime.getMinutes();
            
            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);
            
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;

            if (startTotal <= endTotal) {
                return now >= startTotal && now <= endTotal;
            } else {
                // Horario nocturno (ej: 22:00 - 06:00)
                return now >= startTotal || now <= endTotal;
            }
        } catch (e) {
            return false;
        }
    };

    if (loading) return <div className="animate-pulse space-y-4"><div className="h-20 bg-surface-secondary rounded-xl"></div></div>;

    const onDuty = responsables.filter(r => isCurrentlyOnDuty(r.horarioAtencion));
    const offDuty = responsables.filter(r => !isCurrentlyOnDuty(r.horarioAtencion));

    return (
        <div className="space-y-6">
            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-center justify-between">
                <div>
                    <h4 className="text-xs font-black text-primary uppercase tracking-widest">Reloj Checador Digital</h4>
                    <p className="text-[10px] text-text-muted font-bold uppercase">Estado de Turnos en Tiempo Real</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-black text-primary font-mono">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[9px] text-text-muted font-bold uppercase">{currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <h5 className="text-[10px] font-black text-success uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                    Personal en Turno ({onDuty.length})
                </h5>
                {onDuty.length === 0 ? (
                    <div className="p-4 bg-surface-secondary/20 rounded-xl border border-dashed border-border text-center text-[10px] text-text-muted font-bold uppercase">No hay personal activo en este horario</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {onDuty.map(r => (
                            <div key={r.id} className="bg-white p-4 rounded-2xl border border-success/30 shadow-sm flex items-start gap-4 ring-1 ring-success/5">
                                <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center text-success shrink-0">
                                    <UserIcon className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h6 className="text-sm font-black text-primary uppercase truncate">{r.nombre}</h6>
                                    <p className="text-[10px] font-bold text-text-muted uppercase mb-2">{r.puesto}</p>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-[9px] text-text-secondary font-bold">
                                            <ClockIcon className="w-3 h-3" /> {r.horarioAtencion}
                                        </div>
                                        {r.numeroWhatsapp && (
                                            <a href={`https://wa.me/${r.numeroWhatsapp.replace(/\D/g,'')}`} target="_blank" rel="noopener" className="flex items-center gap-2 text-[9px] text-success font-black hover:underline">
                                                <PhoneIcon className="w-3 h-3" /> {r.numeroWhatsapp}
                                            </a>
                                        )}
                                        {r.correo && (
                                            <div className="flex items-center gap-2 text-[9px] text-text-muted font-medium truncate">
                                                <MailIcon className="w-3 h-3" /> {r.correo}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <h5 className="text-[10px] font-black text-text-muted uppercase tracking-widest mt-4">Fuera de Turno ({offDuty.length})</h5>
                <div className="flex flex-wrap gap-2">
                    {offDuty.map(r => (
                        <div key={r.id} className="bg-surface-secondary/30 px-3 py-2 rounded-xl border border-border flex items-center gap-2 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                            <div className="w-6 h-6 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                                <UserIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-primary uppercase">{r.nombre}</p>
                                <p className="text-[7px] font-bold text-text-muted uppercase">{r.horarioAtencion || 'Sin Horario'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default RelojChecador;
