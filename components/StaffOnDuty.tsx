import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ResponsableDB } from '../types';
import { toCamelCase } from '../utils/formatters';
import { UserIcon, PhoneIcon, ClockIcon, ChevronDownIcon } from './icons';

interface StaffOnDutyProps {
    className?: string;
}

const StaffOnDuty: React.FC<StaffOnDutyProps> = ({ className = "" }) => {
    const [responsables, setResponsables] = useState<ResponsableDB[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(true);

    useEffect(() => {
        const fetchResponsables = async () => {
            try {
                const { data, error } = await supabase
                    .from('usa_responsables')
                    .select('*')
                    .order('nombre');
                if (error) throw error;
                setResponsables(toCamelCase(data || []) as ResponsableDB[]);
            } catch (err) {
                console.error("Error fetching responsables:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchResponsables();
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const isCurrentlyOnDuty = (horario?: string) => {
        if (!horario) return false;
        try {
            const [start, end] = horario.split('-').map(s => s.trim());
            const now = currentTime.getHours() * 60 + currentTime.getMinutes();
            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            
            if (startTotal <= endTotal) {
                return now >= startTotal && now <= endTotal;
            }
            // Caso horario nocturno (ej: 22:00 - 06:00)
            return now >= startTotal || now <= endTotal;
        } catch (e) {
            return false;
        }
    };

    const onDutyResponsables = useMemo(() => {
        const filtered = responsables.filter(r => isCurrentlyOnDuty(r.horarioAtencion));
        // JEFE: Aseguramos que no haya duplicados por ID para evitar errores de React
        return Array.from(new Map(filtered.map(r => [r.id, r])).values());
    }, [responsables, currentTime]);

    if (loading) return (
        <div className={`bg-white p-4 rounded-2xl border border-border shadow-sm animate-pulse ${className}`}>
            <div className="h-4 w-24 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-2">
                <div className="h-10 bg-gray-100 rounded-xl"></div>
                <div className="h-10 bg-gray-100 rounded-xl"></div>
            </div>
        </div>
    );

    return (
        <div className={`bg-white rounded-2xl border border-border shadow-md flex flex-col transition-all duration-500 ease-in-out hover:shadow-lg ${isExpanded ? 'max-h-[500px] p-4' : 'max-h-[56px] p-4 py-3'} overflow-hidden ${className}`}>
            <div 
                className="flex items-center justify-between border-b border-border/50 pb-2 cursor-pointer group/header shrink-0"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary group-hover/header:bg-primary group-hover/header:text-white transition-all duration-300">
                        <UserIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.15em]">Personal en Turno</h4>
                        {!isExpanded && (
                            <span className="text-[8px] font-bold text-success uppercase tracking-tighter animate-pulse">
                                {onDutyResponsables.length} Activos
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 bg-surface-secondary rounded-lg border border-border/50 transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 md:opacity-100'}`}>
                        <ClockIcon className="w-2.5 h-2.5 text-primary/60" />
                        <span className="text-[9px] font-black text-primary font-mono">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <button 
                        className={`p-1 hover:bg-gray-100 rounded-lg transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`}
                        aria-label={isExpanded ? "Contraer" : "Expandir"}
                    >
                        <ChevronDownIcon className="w-4 h-4 text-text-muted" />
                    </button>
                </div>
            </div>
            
            <div className={`flex-1 overflow-y-auto max-h-[120px] no-scrollbar space-y-2 mt-3 transition-all duration-500 ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                {onDutyResponsables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 opacity-40">
                        <UserIcon className="w-6 h-6 mb-1 text-text-muted" />
                        <p className="text-[8px] text-text-muted font-black uppercase tracking-widest">Sin personal activo</p>
                    </div>
                ) : (
                    onDutyResponsables.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-2 bg-primary/[0.02] hover:bg-primary/[0.05] rounded-xl border border-primary/5 transition-colors group">
                            <div className="flex items-center gap-2.5">
                                <div className="relative">
                                    <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-[10px] uppercase">
                                        {r.nombre.charAt(0)}
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success border-2 border-white rounded-full"></div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-primary uppercase leading-tight group-hover:text-primary-focus transition-colors">{r.nombre}</p>
                                    <p className="text-[8px] font-bold text-text-muted uppercase tracking-tighter">{r.puesto}</p>
                                </div>
                            </div>
                            {r.numeroWhatsapp && (
                                <a 
                                    href={`https://wa.me/${r.numeroWhatsapp.replace(/\D/g,'')}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="p-2 bg-success/10 text-success rounded-xl hover:bg-success hover:text-white transition-all shadow-sm active:scale-90"
                                    title="Contactar vía WhatsApp"
                                >
                                    <PhoneIcon className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                    ))
                )}
            </div>
            
            <div className={`mt-3 pt-2 border-t border-border/30 flex items-center justify-between transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                <span className="text-[7px] font-black text-text-muted uppercase tracking-widest">Soporte 24/7 Activo</span>
                <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-success rounded-full animate-pulse"></div>
                    <span className="text-[7px] font-black text-success uppercase">En Línea</span>
                </div>
            </div>
        </div>
    );
};

export default StaffOnDuty;
