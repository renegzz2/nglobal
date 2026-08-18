import React from 'react';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { supabase } from '../lib/supabase';
import { ShipmentStatus } from '../types';

const ShipmentList: React.FC = () => {
  const [shipments, setShipments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchShipments = async () => {
      try {
        const { data, error } = await supabase
          .from('usa_shipment_reports')
          .select('*')
          .order('departure_date_time', { ascending: false })
          .limit(10);
        
        if (data) {
          setShipments(data.map(s => ({
            id: s.id,
            trackingNumber: s.trip_id || s.tripId,
            client: s.project || 'S/D',
            origin: 'Culiacán, SIN', // Default or derived
            destination: 'USA Border', // Default or derived
            weight: 'S/D',
            status: s.logistic_status as ShipmentStatus,
            eta: s.expected_arrival || 'No disp.'
          })));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchShipments();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search bar removed for brevity in diff but kept the rest */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition duration-150 ease-in-out"
            placeholder="Buscar por tracking, origen o destino..."
          />
        </div>
        <div className="flex space-x-2">
            <button className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-hover flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                Filtros
            </button>
            <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-focus flex items-center shadow-sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                Nuevo Envío
            </button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center animate-pulse text-text-muted uppercase font-black text-[10px]">Cargando envíos en tiempo real...</div>
          ) : (
          <table className="w-full responsive-table">
            <thead className="bg-secondary border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Tracking</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Ruta</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Peso</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">Estado</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">ETA</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border">
              {shipments.map((shipment) => (
                <tr key={shipment.id} className="hover:bg-hover transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap" data-label="Tracking">
                    <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                        </div>
                        <div className="ml-3">
                            <div className="text-sm font-medium text-text-primary">{shipment.trackingNumber}</div>
                            <div className="text-xs text-text-muted">ID: {shipment.id}</div>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary" data-label="Cliente">{shipment.client}</td>
                  <td className="px-6 py-4 whitespace-nowrap" data-label="Ruta">
                    <div className="text-sm text-text-primary">{shipment.origin}</div>
                    <div className="text-xs text-text-muted">&darr;</div>
                    <div className="text-sm text-text-primary">{shipment.destination}</div>
                  </td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary" data-label="Peso">{shipment.weight}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center" data-label="Estado">
                    <Badge status={shipment.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary text-right" data-label="ETA">{shipment.eta}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" data-label="Acciones">
                    <button className="text-accent hover:text-blue-900 mr-3">Ver</button>
                    <button className="text-text-muted hover:text-text-primary">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </Card>
      
      <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">Mostrando 5 de 1,284 envíos</p>
          <div className="flex space-x-2">
              <button className="px-3 py-1 border border-border rounded-md text-sm text-text-secondary disabled:opacity-50" disabled>Anterior</button>
              <button className="px-3 py-1 border border-border rounded-md text-sm text-text-secondary hover:bg-hover">Siguiente</button>
          </div>
      </div>
    </div>
  );
};

export default ShipmentList;