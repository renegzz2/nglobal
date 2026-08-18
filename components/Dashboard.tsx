import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { View, ProductoDB, UserRole } from '../types';
import Card from './ui/Card';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
// import { CHART_DATA } from '../constants';
import { toCamelCase } from '../utils/formatters';
import { useTiveMonitoring } from './TiveMonitoringProvider';
import { ExclamationIcon, ClockIcon, MapPinIcon, ChartBarIcon, TruckIcon, DatabaseIcon } from './icons';
import StaffOnDuty from './StaffOnDuty';

interface DashboardProps {
  onViewChange: (view: View) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewChange }) => {
  const { latestTiveData } = useTiveMonitoring();
  const [stats, setStats] = useState({ total: 0, inTransit: 0, delayed: 0, completed: 0, efficiencyPercent: 0 });
  const [recentShipments, setRecentShipments] = useState<any[]>([]);
  const [alertComments, setAlertComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<'tendencia' | 'rendimiento'>('tendencia');
  const [chartData, setChartData] = useState<{name: string, value: number}[]>([]);

  useEffect(() => {
    const savedUser = localStorage.getItem('ng_auth_profile');
    if (savedUser) setUserRole(JSON.parse(savedUser).role);
    const fetchStats = async () => {
      try {
        const [shipmentsRes, productsRes] = await Promise.all([
          supabase.from('usa_shipment_reports').select('id, created_at, logistic_status, products, departure_date_time').order('created_at', { ascending: false }).limit(200),
          supabase.from('usa_productos').select('*')
        ]);
        const rawData = shipmentsRes.data || [];
        const products = toCamelCase<ProductoDB[]>(productsRes.data || []);

        const active = rawData.filter(r => r.logistic_status !== 'Finalizado' && r.logistic_status !== 'Cancelado');
        const completed = rawData.filter(r => r.logistic_status === 'Finalizado').length;

        setRecentShipments(rawData.map(r => {
          const reportProducts = Array.isArray(r.products) ? r.products : [];
          const names = reportProducts.map((p: any) => products.find(s => s.id === (p.productId || p.product_id))?.nombreDelProducto || p.manualProductName || p.manual_product_name || 'S/D').join(', ');
          return { ...r, product_names: names };
        }));

        setStats({
          total: rawData.length,
          inTransit: active.length,
          completed,
          delayed: 0,
          efficiencyPercent: Math.round((completed / (rawData.length || 1)) * 100)
        });

        // MI DIOS: CALCULAR TENDENCIA REAL DE SEMANA ACTUAL
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const weekCounts: Record<string, number> = { 'Lun': 0, 'Mar': 0, 'Mie': 0, 'Jue': 0, 'Vie': 0, 'Sab': 0, 'Dom': 0 };
        
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        rawData.forEach(r => {
          const date = new Date(r.departure_date_time || r.created_at);
          if (date >= startOfWeek) {
            const dayLabel = days[date.getDay()];
            weekCounts[dayLabel] = (weekCounts[dayLabel] || 0) + 1;
          }
        });

        const dynamicChartData = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(d => ({
          name: d,
          value: weekCounts[d]
        }));
        setChartData(dynamicChartData);

        // MI DIOS: Cargar comentarios recientes de alertas
        const { data: alertsData } = await supabase
          .from('usa_shipment_alerts')
          .select('shipment_id, comment')
          .order('created_at', { ascending: false });

        if (alertsData) {
          const comments: Record<string, string> = {};
          alertsData.forEach(a => {
            if (!comments[a.shipment_id]) comments[a.shipment_id] = a.comment || '';
          });
          setAlertComments(comments);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  // MI DIOS: MOTOR DE EXCEPCIONES (PRIORIDAD ALTA)
  // Filtra solo viajes que requieren acción humana inmediata
  const priorityAlerts = useMemo(() => {
    return recentShipments.filter(r => {
      const live = latestTiveData[r.id];
      if (!live) return false;

      // 1. Excursión de Temperatura (> 4°F de diferencia)
      const ideal = Number(r.ideal_temp || r.temperature || 35);
      const tempDiff = live.temp ? Math.abs(live.temp - ideal) : 0;
      const hasTempExcursion = tempDiff > 4;

      // 2. Retraso Crítico (> 2 horas sobre ETA)
      const isVeryLate = live.isDelayed && live.predictedEta && r.expected_arrival &&
        (new Date(live.predictedEta).getTime() - new Date(r.expected_arrival).getTime() > 7200000);

      return hasTempExcursion || isVeryLate;
    }).slice(0, 3); // Solo mostrar top 3 problemas críticos
  }, [recentShipments, latestTiveData]);

  const handleSaveComment = async (shipmentId: string, comment: string) => {
    try {
      const { error } = await supabase
        .from('usa_shipment_alerts')
        .insert({
          shipment_id: shipmentId,
          alert_type: 'COMENTARIO_OPERADOR',
          message: 'Seguimiento manual desde Panel de Control',
          severity: 'info',
          comment: comment
        });

      if (error) throw error;
      setAlertComments(prev => ({ ...prev, [shipmentId]: comment }));
    } catch (err) {
      console.error("Error al guardar comentario:", err);
    }
  };

  const adminAreas = [
    {
      id: 'direccion',
      title: 'Zona Dirección',
      icon: <ChartBarIcon className="w-6 h-6" />,
      color: 'bg-indigo-600',
      shadow: 'shadow-indigo-500/20',
      desc: 'Planificación Estratégica y Matriz de Cumplimiento.',
      views: [
        { label: 'Alcance & Metas', view: View.STRATEGIC_PLANNING },
        { label: 'M. Cumplimiento', view: View.EXEC_REPORT }
      ]
    },
    {
      id: 'logistica',
      title: 'Zona Logística',
      icon: <TruckIcon className="w-6 h-6" />,
      color: 'bg-emerald-600',
      shadow: 'shadow-emerald-500/20',
      desc: 'Programación de Líderes y Operaciones en Ruta.',
      views: [
        { label: 'Prog. Líder', view: View.LIDER_PROGRAMACION_USA },
        { label: 'Estatus USA', view: View.USA_SHIPMENTS }
      ]
    },
    {
       id: 'coordinacion',
       title: 'Zona Coordinación',
       icon: <ClockIcon className="w-6 h-6" />,
       color: 'bg-amber-600',
       shadow: 'shadow-amber-500/20',
       desc: 'Control de Inventarios y Monitoreo Satelital.',
       views: [
         { label: 'Inventarios', view: View.INVENTORY },
         { label: 'Consola Radar', view: View.TIVE_MAP }
       ]
    },
    {
        id: 'administracion',
        title: 'Zona Administrativa',
        icon: <DatabaseIcon className="w-6 h-6" />,
        color: 'bg-slate-700',
        shadow: 'shadow-slate-500/20',
        desc: 'Pagos de Fletes, Costos y Bases Maestras.',
        views: [
          { label: 'Pago Fletes', view: View.FREIGHT_PAYMENTS },
          { label: 'Archivos Maestros', view: View.DATABASE }
        ]
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      {/* SECCIÓN: CENTRO DE MANDO ADMINISTRATIVO */}
      {userRole === UserRole.ADMINISTRADOR && (
        <div className="animate-slide-up">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.4em] mb-1 opacity-80">
                Centro de Mando Administrativo
              </h3>
              <p className="text-xs text-text-muted font-medium italic">Acceso rápido a zonas operativas por rol de gestión.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {adminAreas.map(area => (
              <div key={area.id} className="bg-white p-5 rounded-3xl border border-border shadow-sm hover:shadow-xl transition-all duration-300 group relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-20 h-20 ${area.color} opacity-[0.03] rounded-bl-[100px] transition-transform group-hover:scale-150`}></div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-2xl ${area.color} text-white shadow-lg ${area.shadow} group-hover:scale-110 transition-transform`}>
                    {area.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-primary uppercase tracking-tight">{area.title}</h4>
                    <p className="text-[10px] text-text-muted font-bold leading-tight mt-0.5">{area.desc}</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 mt-2">
                  {area.views.map((v, i) => (
                    <button 
                      key={i}
                      onClick={() => onViewChange(v.view)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-background hover:bg-primary hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all group/btn border border-border/50"
                    >
                      {v.label}
                      <svg className="w-3 h-3 translate-x-1 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* SECCIÓN DE ALERTAS POR EXCEPCIÓN */}
      {priorityAlerts.length > 0 && (
        <div className="animate-slide-up">
          <h3 className="text-[11px] font-black text-danger uppercase tracking-[0.4em] mb-4 flex items-center gap-2 opacity-80">
            <div className="w-2 h-2 bg-danger rounded-full animate-ping"></div> Intervención Crítica Requerida
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {priorityAlerts.map(alert => {
              const live = latestTiveData[alert.id];
              const ideal = alert.ideal_temp || 35;
              const isTempIssue = live.temp && Math.abs(live.temp - ideal) > 4;

              return (
                <Card key={alert.id} className="border-l-4 border-l-danger bg-danger/[0.02] relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-500" onClick={() => onViewChange(View.USA_SHIPMENTS)}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] font-black text-danger/60 uppercase tracking-widest">{alert.trip_id}</span>
                      <h4 className="text-base font-bold text-primary mt-1 uppercase truncate w-40 leading-tight">{alert.project}</h4>
                    </div>
                    <div className="bg-danger text-white p-2 rounded-xl shadow-lg ring-4 ring-danger/10"><ExclamationIcon className="w-4 h-4" /></div>
                  </div>
                  <div className="space-y-3">
                    {isTempIssue && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px] font-black text-white bg-danger p-2.5 rounded-lg shadow-lg shadow-danger/30 animate-pulse border border-danger-focus">
                          <ExclamationIcon className="w-4 h-4" />
                          ALERTA DE TEMPERATURA CRÍTICA
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-danger bg-danger/5 p-2 rounded-lg border border-danger/10">
                          <div className="w-1.5 h-1.5 bg-danger rounded-full"></div>
                          Registrado: {live.temp?.toFixed(1)}°F (Ideal: {ideal}°F)
                        </div>
                      </div>
                    )}
                    {live.isDelayed && (
                      <div className="flex items-center gap-2 text-[11px] font-bold text-warning-focus bg-warning/5 p-2 rounded-lg border border-warning/10">
                        <ClockIcon className="w-3 h-3" /> Desviación de ETA Crítica
                      </div>
                    )}

                    <div className="pt-3 mt-1 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Agregar nota de seguimiento..."
                        className="w-full bg-white border border-border focus:border-danger/30 rounded-xl px-3 py-2 text-[10px] font-semibold text-primary outline-none focus:ring-4 focus:ring-danger/5 transition-all"
                        value={alertComments[alert.id] || ''}
                        onChange={(e) => setAlertComments(prev => ({ ...prev, [alert.id]: e.target.value }))}
                        onBlur={(e) => handleSaveComment(alert.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveComment(alert.id, (e.target as HTMLInputElement).value)}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-border shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="p-2 rounded-xl bg-success/5 text-success group-hover:scale-110 transition-transform shadow-sm"><ChartBarIcon className="w-5 h-5" /></div>
            <span className="text-[9px] font-black text-success uppercase tracking-widest px-2 py-1 bg-success/5 rounded-md border border-success/10">Performance</span>
          </div>
          <div className="mt-4 relative z-10">
            <h4 className="text-4xl font-black text-[#002D62] tracking-tighter leading-none">{stats.efficiencyPercent}%</h4>
            <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-2">Nivel de Cumplimiento</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-info/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="p-2 rounded-xl bg-info/5 text-info group-hover:scale-110 transition-transform shadow-sm"><TruckIcon className="w-5 h-5" /></div>
            <span className="text-[9px] font-black text-info uppercase tracking-widest px-2 py-1 bg-info/5 rounded-md border border-info/10">Live Track</span>
          </div>
          <div className="mt-4 relative z-10">
            <h4 className="text-4xl font-black text-[#002D62] tracking-tighter leading-none">{stats.inTransit}</h4>
            <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-2">Unidades en Ruta</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="p-2 rounded-xl bg-primary/5 text-primary group-hover:scale-110 transition-transform shadow-sm"><DatabaseIcon className="w-5 h-5" /></div>
            <span className="text-[9px] font-black text-primary uppercase tracking-widest px-2 py-1 bg-primary/5 rounded-md border border-primary/10">History</span>
          </div>
          <div className="mt-4 relative z-10">
            <h4 className="text-4xl font-black text-[#002D62] tracking-tighter leading-none">{stats.total}</h4>
            <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-2">Despachos Totales 2025</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-danger/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="p-2 rounded-xl bg-danger/5 text-danger group-hover:scale-110 transition-transform shadow-sm"><ExclamationIcon className="w-5 h-5" /></div>
            <span className="text-[9px] font-black text-danger uppercase tracking-widest px-2 py-1 bg-danger/5 rounded-md border border-danger/10">Alerts</span>
          </div>
          <div className="mt-4 relative z-10">
            <h4 className="text-4xl font-black text-danger tracking-tighter leading-none">{priorityAlerts.length}</h4>
            <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-2">Atención Inmediata</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border border-border overflow-hidden relative shadow-sm" title={selectedWidget === 'tendencia' ? "Fluctuación Semanal de Envíos" : "Rendimiento Operativo 2025"}>
          
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {[UserRole.DIRECCION, UserRole.SUBDIRECCION, UserRole.ADMINISTRADOR].includes(userRole as UserRole) && (
              <select 
                value={selectedWidget} 
                onChange={e => setSelectedWidget(e.target.value as any)}
                className="text-[9px] font-black uppercase tracking-widest text-[#002D62] bg-[#002D62]/5 px-3 py-1.5 rounded-lg border border-[#002D62]/10 outline-none cursor-pointer hover:bg-[#002D62]/10 transition-colors"
                title="Selector de Inteligencia de Negocios"
              >
                <option value="tendencia">Widget: Tendencia Semanal</option>
                <option value="rendimiento">Widget: Rendimiento General</option>
              </select>
            )}
            <div className="text-[9px] font-black uppercase tracking-widest text-[#002D62] bg-[#002D62]/5 px-3 py-1.5 rounded-lg border border-[#002D62]/10 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
              Estable
            </div>
          </div>

          <div className="h-64 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              {selectedWidget === 'tendencia' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#002D62" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#002D62" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} dy={15} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold', padding: '12px' }}
                    itemStyle={{ color: '#002D62' }}
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#002D62" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" activeDot={{ r: 6, fill: '#002D62', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} dy={15} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold', padding: '12px' }}
                    cursor={{ fill: '#f1f5f9' }}
                  />
                  <Bar dataKey="value" name="Volumen Operativo" fill="#002D62" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>

        <StaffOnDuty />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card title="Distribución Operativa" className="relative flex flex-col justify-center items-center py-6 shadow-sm border border-border">
          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'En Ruta', value: stats.inTransit, color: '#3b82f6' },
                    { name: 'Finalizados', value: stats.completed, color: '#10b981' },
                    { name: 'Alertas', value: priorityAlerts.length, color: '#ef4444' }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <button onClick={() => onViewChange(View.TIVE_MAP)} className="mt-4 px-6 py-2.5 bg-[#002D62] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-[#001F44] shadow-lg transition-all flex items-center gap-2 relative overflow-hidden group">
            <span className="relative z-10">Radar de Flota &rarr;</span>
            <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
          </button>
        </Card>

        <div className="lg:col-span-2">
          <Card title="Monitor Operativo (Tiempo Real)" className="overflow-hidden">
            <div className="overflow-x-auto -mx-5 -mb-5 mt-4">
              <table className="w-full responsive-table premium-table">
                <thead>
                  <tr className="bg-surface-secondary/30 text-left text-[9px] font-black uppercase tracking-[0.15em] text-text-muted">
                    <th className="pl-6">Identificador</th>
                    <th>Estado Origen</th>
                    <th>Cargamento</th>
                    <th className="text-center">Status Logístico</th>
                    <th className="text-right pr-6">Conexión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {recentShipments.slice(0, 8).map((s) => {
                    const live = latestTiveData[s.id];
                    return (
                      <tr key={s.id} className="hover:bg-hover/50 transition-colors group cursor-pointer" onClick={() => onViewChange(View.USA_SHIPMENTS)}>
                        <td data-label="Viaje" className="pl-6 py-4">
                          <span className="text-xs font-black text-primary group-hover:text-accent transition-colors">{s.trip_id}</span>
                        </td>
                        <td data-label="Sede" className="text-[11px] font-bold text-text-primary uppercase">{s.project}</td>
                        <td data-label="Producto" className="text-[10px] font-medium text-text-muted uppercase max-w-[140px] truncate">{s.product_names}</td>
                        <td data-label="Estatus" className="text-center">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${s.logistic_status === 'Finalizado' ? 'bg-success/10 text-success border border-success/20' : 'bg-info/10 text-info border border-info/20'}`}>
                            {s.logistic_status}
                          </span>
                        </td>
                        <td data-label="Señal" className="text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            <div className={`w-2 h-2 rounded-full shadow-sm ${live ? 'bg-success shadow-success/50 animate-pulse' : 'bg-gray-200'}`}></div>
                            <span className="text-[10px] font-bold text-text-muted">{live ? 'ACTIVE' : 'OFFLINE'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
